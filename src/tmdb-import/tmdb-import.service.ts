import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SyncRun,
  SyncRunStatus,
  SyncRunType,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChunkWriter } from './chunk-writer.service';
import {
  isStorable,
  mapMovie,
  MappedMovie,
  StorableMovieDetails,
} from './map-movie';
import { pickTrailerKey } from './pick-trailer-key';
import { TmdbClient } from './tmdb-client.service';
import { formatExportDate, TmdbExportService } from './tmdb-export.service';
import {
  CHUNK_SIZE,
  CONCURRENCY,
  MAX_CONSECUTIVE_FAILURES,
} from './tmdb-import.constants';
import { describeError, TmdbFatalError } from './tmdb.errors';
import { recomputeWeightedRatings } from './weighted-rating';

// Everything that happened to candidate ids in this process. `processed` in
// sync_runs is the cursor; these are the breakdown behind it.
interface Stats {
  /** Already in `movies` before this process started — never fetched. */
  skipped: number;
  /** Fetched (a response came back, 404 included). */
  examined: number;
  stored: number;
  noPoster: number;
  /** No trailer or teaser in English, untagged or original-language videos. */
  noTrailer: number;
  adult: number;
  /** 404: TMDB no longer has the id. */
  missing: number;
  /** Fetch failed; includes ids carried over from an interrupted earlier process. */
  failed: number;
  /** Second requests for original-language videos, and how many found a trailer. */
  trailerLookups: number;
  trailersRecovered: number;
}

interface FetchedChunk {
  movies: MappedMovie[];
  failedIds: number[];
}

/**
 * The one-time catalog import: genres, then the top-N popularity-ranked
 * non-adult ids from the daily export, fetched at TMDB's pace and written in
 * chunks. Progress lives in sync_runs, so a crash or Ctrl+C is resumed by
 * simply running the command again.
 */
@Injectable()
export class TmdbImportService {
  private readonly logger = new Logger(TmdbImportService.name);
  private stopRequested = false;
  private consecutiveFailures = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly client: TmdbClient,
    private readonly exportService: TmdbExportService,
    private readonly writer: ChunkWriter,
  ) {}

  /** Ctrl+C: finish the chunk in flight, commit it, leave the run resumable. */
  requestStop(): void {
    if (!this.stopRequested) {
      this.stopRequested = true;
      this.logger.warn(
        'Stop requested — finishing the current chunk, then exiting. Run the command again to resume.',
      );
    }
  }

  async run(): Promise<void> {
    const topN = this.config.getOrThrow<number>('TMDB_IMPORT_TOP_N');
    const genreIds = await this.syncGenres();
    const run = await this.startOrResumeRun();

    try {
      const completed = await this.backfill(run, topN, genreIds);
      if (!completed) {
        // Stopped on request; the run stays RUNNING with its cursor intact.
        return;
      }

      const rating = await recomputeWeightedRatings(this.prisma);
      this.logger.log(
        `weighted_rating recomputed for ${rating.updated} movies ` +
          `(C = ${rating.catalogMean.toFixed(3)}, m = ${rating.minimumVotes.toFixed(1)})`,
      );

      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: { status: SyncRunStatus.SUCCEEDED, finishedAt: new Date() },
      });
      await this.logCatalogSize();
    } catch (error) {
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: SyncRunStatus.FAILED,
          error: describeError(error),
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  // /genre/movie/list is 19 rows; done on every start so a fresh database has
  // its genres before the first movie_genres row references one.
  private async syncGenres(): Promise<Set<number>> {
    const run = await this.prisma.syncRun.create({
      data: { type: SyncRunType.GENRE_SYNC },
    });
    try {
      const genres = await this.client.getGenres();
      await this.prisma.genre.createMany({
        data: genres.map((genre) => ({
          id: genre.id,
          name: genre.name.slice(0, 64),
        })),
        skipDuplicates: true,
      });
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: SyncRunStatus.SUCCEEDED,
          processed: genres.length,
          finishedAt: new Date(),
        },
      });
      this.logger.log(`Genres: ${genres.length} synced`);
      return new Set(genres.map((genre) => genre.id));
    } catch (error) {
      await this.prisma.syncRun.update({
        where: { id: run.id },
        data: {
          status: SyncRunStatus.FAILED,
          error: describeError(error),
          finishedAt: new Date(),
        },
      });
      throw error;
    }
  }

  // The newest MOVIE_BACKFILL run is resumed unless it succeeded: RUNNING means
  // a crash or Ctrl+C, FAILED means an error worth retrying from where it was.
  private async startOrResumeRun(): Promise<SyncRun> {
    const previous = await this.prisma.syncRun.findFirst({
      where: { type: SyncRunType.MOVIE_BACKFILL },
      orderBy: { startedAt: 'desc' },
    });

    if (
      previous &&
      previous.status !== SyncRunStatus.SUCCEEDED &&
      previous.exportDate
    ) {
      this.logger.log(
        `Resuming run #${previous.id} (${previous.status}) at cursor ` +
          `${previous.processed}, export ${formatExportDate(previous.exportDate)}, ` +
          `${previous.failedIds.length} failed ids to retry`,
      );
      return this.prisma.syncRun.update({
        where: { id: previous.id },
        data: { status: SyncRunStatus.RUNNING, error: null, finishedAt: null },
      });
    }

    const exportDate = await this.exportService.resolveLatestExportDate();
    const run = await this.prisma.syncRun.create({
      data: { type: SyncRunType.MOVIE_BACKFILL, exportDate },
    });
    this.logger.log(
      `Started run #${run.id}, export ${formatExportDate(exportDate)}`,
    );
    return run;
  }

  /** Resolves true when the candidate list was exhausted, false when stopped. */
  private async backfill(
    run: SyncRun,
    topN: number,
    genreIds: Set<number>,
  ): Promise<boolean> {
    if (!run.exportDate) {
      throw new Error(`Run #${run.id} has no export date`);
    }
    const ids = await this.exportService.loadCandidateIds(run.exportDate, topN);

    // Ids already imported are never fetched again, whatever the cursor says:
    // a fresh run after a partial one only spends requests on new and
    // previously rejected ids.
    const stored = new Set(
      (await this.prisma.movie.findMany({ select: { id: true } })).map(
        (movie) => movie.id,
      ),
    );

    const stats: Stats = {
      skipped: 0,
      examined: 0,
      stored: 0,
      noPoster: 0,
      noTrailer: 0,
      adult: 0,
      missing: 0,
      failed: run.failedIds.length,
      trailerLookups: 0,
      trailersRecovered: 0,
    };
    // Carried over from the earlier process of a resumed run, and written back
    // with every chunk so an interruption cannot lose them before the retry
    // pass. Copied on each write: the next chunk's fetch pushes into this
    // array while the write is still running.
    const failedIds = [...run.failedIds];
    const startedAt = Date.now();
    const requestsAtStart = this.client.requestsMade;

    // TMDB_IMPORT_TOP_N may have been lowered since the run started.
    let cursor = Math.min(run.processed, ids.length);
    const startCursor = cursor;
    const totalChunks = Math.ceil((ids.length - cursor) / CHUNK_SIZE);
    let chunkNumber = 0;

    // The write of chunk k overlaps the fetch of chunk k+1: writes stay
    // serialized (the cursor only moves forward), and fetching — the slow
    // part — never waits on Postgres. `.catch` on the side chain keeps a
    // failed write from surfacing as an unhandled rejection before the loop
    // awaits it; the await below still rethrows it.
    let pendingWrite: Promise<void> = Promise.resolve();

    while (cursor < ids.length && !this.stopRequested) {
      const chunkIds = ids.slice(cursor, cursor + CHUNK_SIZE);
      const chunk = await this.fetchChunk(chunkIds, stored, stats, genreIds);
      failedIds.push(...chunk.failedIds);

      await pendingWrite;
      cursor += chunkIds.length;
      pendingWrite = this.writer.write({
        movies: chunk.movies,
        runId: run.id,
        processed: cursor,
        failedIds: [...failedIds],
      });
      pendingWrite.catch(() => undefined);

      chunkNumber++;
      this.logProgress({
        chunkNumber,
        totalChunks,
        cursor,
        startCursor,
        total: ids.length,
        stats,
        startedAt,
        requestsAtStart,
      });
    }
    await pendingWrite;

    if (cursor < ids.length) {
      this.logger.warn(
        `Stopped at cursor ${cursor}/${ids.length}; run #${run.id} left RUNNING for resume`,
      );
      return false;
    }

    // Transient failures get one more attempt now that the list is done.
    if (failedIds.length > 0) {
      this.logger.log(`Retrying ${failedIds.length} failed ids`);
      stats.failed -= failedIds.length;
      // The abort counter guards against an outage mid-list; the retry pass is
      // a fresh attempt and starts from zero, however the main loop ended.
      this.consecutiveFailures = 0;
      const retry = await this.fetchChunk(failedIds, stored, stats, genreIds);
      await this.writer.write({
        movies: retry.movies,
        runId: run.id,
        processed: cursor,
        failedIds: retry.failedIds,
      });
      if (retry.failedIds.length > 0) {
        this.logger.warn(
          `${retry.failedIds.length} ids still failing, not imported: ${retry.failedIds.join(', ')}`,
        );
      }
    }

    this.logger.log(
      `Done in ${formatDuration((Date.now() - startedAt) / 1000)}: ` +
        `${stats.examined} fetched, ${stats.stored} stored, ` +
        `${stats.noPoster} without poster, ${stats.noTrailer} without trailer, ` +
        `${stats.adult} adult, ` +
        `${stats.missing} missing, ${stats.failed} failed, ` +
        `${stats.skipped} already imported; ` +
        `${stats.trailerLookups} original-language trailer lookups, ` +
        `${stats.trailersRecovered} found`,
    );
    return true;
  }

  // A small worker pool over one chunk's ids. Each worker takes the next id,
  // waits for its slot from the client's pacer, and classifies the response.
  private async fetchChunk(
    ids: number[],
    stored: Set<number>,
    stats: Stats,
    genreIds: Set<number>,
  ): Promise<FetchedChunk> {
    const movies: MappedMovie[] = [];
    const failedIds: number[] = [];
    const syncedAt = new Date();
    let next = 0;
    let aborted = false;

    const worker = async (): Promise<void> => {
      while (next < ids.length && !aborted) {
        const id = ids[next++];
        if (stored.has(id)) {
          stats.skipped++;
          continue;
        }
        try {
          const mapped = await this.fetchOne(id, stats, syncedAt);
          if (mapped) {
            mapped.genreIds = mapped.genreIds.filter((genreId) =>
              genreIds.has(genreId),
            );
            movies.push(mapped);
            stored.add(id);
          }
        } catch (error) {
          if (error instanceof TmdbFatalError) {
            aborted = true;
            throw error;
          }
          failedIds.push(id);
          stats.failed++;
          this.logger.warn(`Movie ${id}: ${describeError(error)}`);
          if (++this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            aborted = true;
            throw new TmdbFatalError(
              `${MAX_CONSECUTIVE_FAILURES} requests failed back to back — is TMDB reachable?`,
            );
          }
        }
      }
    };

    // allSettled rather than all: on a fatal error the other workers finish
    // their in-flight request and stop, so nothing is left running when the
    // error reaches run() and the app shuts down.
    const outcomes = await Promise.allSettled(
      Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker),
    );
    const failure = outcomes.find(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    );
    if (failure) {
      throw failure.reason;
    }

    return { movies, failedIds };
  }

  // Null when the id is rejected (gone, adult, no poster, no trailer); throws
  // on failure.
  private async fetchOne(
    id: number,
    stats: Stats,
    syncedAt: Date,
  ): Promise<MappedMovie | null> {
    const details = await this.client.getMovie(id);
    this.consecutiveFailures = 0;
    stats.examined++;

    if (!details) {
      stats.missing++;
      return null;
    }
    if (details.adult) {
      stats.adult++;
      return null;
    }
    if (!isStorable(details)) {
      stats.noPoster++;
      return null;
    }

    // The third leg of the import invariant, checked last because it may
    // cost a second request: no playable trailer, no row.
    const trailerKey = await this.resolveTrailerKey(details, stats);
    if (!trailerKey) {
      stats.noTrailer++;
      return null;
    }

    stats.stored++;
    return mapMovie(details, trailerKey, syncedAt);
  }

  // The English-tagged and untagged videos came with the details. When they
  // hold no trailer or teaser and the film is not English, one more request
  // fetches its original-language videos and applies the same rule. Measured
  // on the top 1,200: ~7.7% of movies get here and about one in five of those
  // has an original-language trailer — the rest have no video on TMDB at all.
  private async resolveTrailerKey(
    details: StorableMovieDetails,
    stats: Stats,
  ): Promise<string | null> {
    const fromEnglish = pickTrailerKey(details.videos?.results ?? []);
    const language = details.original_language;
    // 'xx' is TMDB's "no language"; its videos are the untagged ones already seen.
    if (
      fromEnglish ||
      !/^[a-z]{2}$/.test(language) ||
      language === 'en' ||
      language === 'xx'
    ) {
      return fromEnglish;
    }

    // A failed lookup propagates like a failed details request — the worker
    // records the id and the retry pass fetches it again. Swallowing it as
    // "no trailer" would drop a storable movie for the whole run.
    stats.trailerLookups++;
    const videos = await this.client.getMovieVideos(details.id, language);
    const key = pickTrailerKey(videos);
    if (key) {
      stats.trailersRecovered++;
    }
    return key;
  }

  private logProgress(progress: {
    chunkNumber: number;
    totalChunks: number;
    cursor: number;
    startCursor: number;
    total: number;
    stats: Stats;
    startedAt: number;
    requestsAtStart: number;
  }): void {
    const { stats } = progress;
    const elapsedSeconds = (Date.now() - progress.startedAt) / 1000;
    const requestsPerSecond =
      (this.client.requestsMade - progress.requestsAtStart) / elapsedSeconds;
    const idsPerSecond =
      (progress.cursor - progress.startCursor) / elapsedSeconds;
    const remaining = progress.total - progress.cursor;
    const eta = idsPerSecond > 0 ? remaining / idsPerSecond : Number.NaN;

    this.logger.log(
      `chunk ${progress.chunkNumber}/${progress.totalChunks} · ` +
        `cursor ${progress.cursor}/${progress.total} · ` +
        `stored ${stats.stored} · no poster ${stats.noPoster} · ` +
        `no trailer ${stats.noTrailer} · ` +
        `adult ${stats.adult} · missing ${stats.missing} · ` +
        `failed ${stats.failed} · skipped ${stats.skipped} · ` +
        `${requestsPerSecond.toFixed(1)} req/s · ETA ${formatDuration(eta)}`,
    );
  }

  private async logCatalogSize(): Promise<void> {
    const [movies, collections, people, credits, keywords] = await Promise.all([
      this.prisma.movie.count(),
      this.prisma.collection.count(),
      this.prisma.person.count(),
      this.prisma.credit.count(),
      this.prisma.keyword.count(),
    ]);
    this.logger.log(
      `Catalog: ${movies} movies, ${collections} collections, ` +
        `${people} people, ${credits} credits, ${keywords} keywords`,
    );
  }
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return '?';
  }
  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${whole % 60}s`;
}
