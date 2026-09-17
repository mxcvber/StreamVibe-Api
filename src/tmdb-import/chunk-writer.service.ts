import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { MappedMovie } from './map-movie';

export interface ChunkWrite {
  movies: MappedMovie[];
  runId: number;
  /** Cursor after this chunk: candidate ids consumed so far, rejected ones included. */
  processed: number;
  /** Every id of this run whose fetch has failed so far, kept for the retry pass. */
  failedIds: number[];
}

// Prisma's default transaction timeout is 5 s and it applies to batches too
// (verified: P2028 after a 6 s batch). A 500-movie chunk normally writes in a
// few seconds but crossed 5 s once while a checkpoint was flushing; the
// import's transactions block nobody, so give them all the time they need.
const WRITE_TIMEOUT_MS = 5 * 60_000;

/**
 * Persists one fetched chunk. Everything — parents first, then movies, then
 * the rows that reference them, then the cursor and the failed-id list — goes
 * into a single transaction, so a chunk is either fully stored with
 * `processed` moved past it, or not at all. That is what makes `sync_runs` a
 * safe place to resume from.
 *
 * Raw `INSERT … SELECT FROM unnest(...)` rather than Prisma's createMany, and
 * deliberately so: a chunk of 500 popular movies is ~100k rows, and measured
 * against this schema createMany needed 2–9 s per 20k rows across dozens of
 * statements, stalling the event loop (and with it the TMDB fetch workers)
 * for up to half a second per statement — the same 20k rows as one unnest
 * statement took 0.6 s. Each array below is one bind parameter, so a table is
 * one statement no matter how many rows, and the seeder will lean on the same
 * technique. `ON CONFLICT DO NOTHING` is createMany's skipDuplicates: rows an
 * earlier chunk stored (shared people, keywords, collections) are skipped.
 */
@Injectable()
export class ChunkWriter {
  private readonly logger = new Logger(ChunkWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  async write({
    movies,
    runId,
    processed,
    failedIds,
  }: ChunkWrite): Promise<void> {
    // Shared rows appear once per movie that carries them; collapse them so a
    // statement does not carry the same actor 40 times.
    const collections = dedupeById(
      movies.flatMap((m) => (m.collection ? [m.collection] : [])),
    );
    const people = dedupeById(movies.flatMap((m) => m.people));
    const keywords = dedupeById(movies.flatMap((m) => m.keywords));
    const movieRows = movies.map((m) => m.movie);
    const movieGenres = movies.flatMap((m) =>
      m.genreIds.map((genreId) => ({ movieId: m.movie.id, genreId })),
    );
    const movieKeywords = movies.flatMap((m) =>
      m.keywords.map((keyword) => ({
        movieId: m.movie.id,
        keywordId: keyword.id,
      })),
    );
    const credits = movies.flatMap((m) => m.credits);

    const startedAt = Date.now();
    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          INSERT INTO collections (id, name, poster_path, backdrop_path)
          SELECT * FROM unnest(
            ${collections.map((c) => c.id)}::int[],
            ${collections.map((c) => c.name)}::text[],
            ${collections.map((c) => c.posterPath)}::text[],
            ${collections.map((c) => c.backdropPath)}::text[]
          )
          ON CONFLICT DO NOTHING`;

        await tx.$executeRaw`
          INSERT INTO people (id, name, gender, known_for_department, profile_path, popularity)
          SELECT * FROM unnest(
            ${people.map((p) => p.id)}::int[],
            ${people.map((p) => p.name)}::text[],
            ${people.map((p) => p.gender)}::gender[],
            ${people.map((p) => p.knownForDepartment)}::text[],
            ${people.map((p) => p.profilePath)}::text[],
            ${people.map((p) => p.popularity)}::float8[]
          )
          ON CONFLICT DO NOTHING`;

        await tx.$executeRaw`
          INSERT INTO keywords (id, name)
          SELECT * FROM unnest(
            ${keywords.map((k) => k.id)}::int[],
            ${keywords.map((k) => k.name)}::text[]
          )
          ON CONFLICT DO NOTHING`;

        // origin_country is text[] per row, and unnest cannot carry an array
        // of arrays, so it travels as "US,GB" and is split back inside
        // Postgres (string_to_array('', ',') is the empty array, not null).
        await tx.$executeRaw`
          INSERT INTO movies (
            id, title, overview, tagline, release_date, runtime, budget, revenue,
            homepage, poster_path, backdrop_path, trailer_key, origin_country,
            popularity, vote_average, vote_count, collection_id, synced_at
          )
          SELECT
            id, title, overview, tagline, release_date, runtime, budget, revenue,
            homepage, poster_path, backdrop_path, trailer_key,
            string_to_array(origin_country, ','),
            popularity, vote_average, vote_count, collection_id, synced_at
          FROM unnest(
            ${movieRows.map((m) => m.id)}::int[],
            ${movieRows.map((m) => m.title)}::text[],
            ${movieRows.map((m) => m.overview)}::text[],
            ${movieRows.map((m) => m.tagline)}::text[],
            ${movieRows.map((m) => m.releaseDate)}::date[],
            ${movieRows.map((m) => m.runtime)}::smallint[],
            ${movieRows.map((m) => bigIntText(m.budget))}::bigint[],
            ${movieRows.map((m) => bigIntText(m.revenue))}::bigint[],
            ${movieRows.map((m) => m.homepage)}::text[],
            ${movieRows.map((m) => m.posterPath)}::text[],
            ${movieRows.map((m) => m.backdropPath)}::text[],
            ${movieRows.map((m) => m.trailerKey)}::text[],
            ${movieRows.map((m) => m.originCountry.join(','))}::text[],
            ${movieRows.map((m) => m.popularity)}::float8[],
            ${movieRows.map((m) => m.voteAverage)}::float8[],
            ${movieRows.map((m) => m.voteCount)}::int[],
            ${movieRows.map((m) => m.collectionId)}::int[],
            ${movieRows.map((m) => m.syncedAt.toISOString())}::timestamptz[]
          ) AS t(
            id, title, overview, tagline, release_date, runtime, budget, revenue,
            homepage, poster_path, backdrop_path, trailer_key, origin_country,
            popularity, vote_average, vote_count, collection_id, synced_at
          )
          ON CONFLICT DO NOTHING`;

        await tx.$executeRaw`
          INSERT INTO movie_genres (movie_id, genre_id)
          SELECT * FROM unnest(
            ${movieGenres.map((mg) => mg.movieId)}::int[],
            ${movieGenres.map((mg) => mg.genreId)}::int[]
          )
          ON CONFLICT DO NOTHING`;

        await tx.$executeRaw`
          INSERT INTO movie_keywords (movie_id, keyword_id)
          SELECT * FROM unnest(
            ${movieKeywords.map((mk) => mk.movieId)}::int[],
            ${movieKeywords.map((mk) => mk.keywordId)}::int[]
          )
          ON CONFLICT DO NOTHING`;

        await tx.$executeRaw`
          INSERT INTO credits (id, movie_id, person_id, kind, character, cast_order, department, job)
          SELECT * FROM unnest(
            ${credits.map((c) => c.id)}::text[],
            ${credits.map((c) => c.movieId)}::int[],
            ${credits.map((c) => c.personId)}::int[],
            ${credits.map((c) => c.kind)}::credit_kind[],
            ${credits.map((c) => c.character)}::text[],
            ${credits.map((c) => c.order)}::smallint[],
            ${credits.map((c) => c.department)}::text[],
            ${credits.map((c) => c.job)}::text[]
          )
          ON CONFLICT DO NOTHING`;

        await tx.syncRun.update({
          where: { id: runId },
          data: { processed, failed: failedIds.length, failedIds },
        });
      },
      { timeout: WRITE_TIMEOUT_MS },
    );

    // Skipped-only chunks (a rerun over stored ids) still commit the cursor
    // but are not worth a line.
    if (movieRows.length > 0) {
      const rows =
        collections.length +
        people.length +
        keywords.length +
        movieRows.length +
        movieGenres.length +
        movieKeywords.length +
        credits.length;
      this.logger.debug(
        `wrote ${movieRows.length} movies (${rows} rows) in ${Date.now() - startedAt} ms`,
      );
    }
  }
}

function dedupeById<T extends { id: number }>(rows: T[]): T[] {
  const byId = new Map<number, T>();
  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

// bigint travels as text and is cast on the Postgres side; the pg driver has
// no native bigint[] parameter encoding.
function bigIntText(value: bigint | null): string | null {
  return value === null ? null : value.toString();
}
