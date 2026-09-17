import { Injectable, Logger } from '@nestjs/common';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable, pipeline } from 'node:stream';
import { pipeline as pipelineAsync } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import {
  EXPORT_CACHE_DIR,
  TMDB_EXPORT_BASE_URL,
} from './tmdb-import.constants';
import type { TmdbExportLine } from './tmdb.types';

// How many days back to look for an export when starting a new run. TMDB
// publishes each day's file by ~08:00 UTC, so "today" may not exist yet.
const EXPORT_LOOKBACK_DAYS = 3;

/**
 * TMDB's daily id export: one gzipped file of JSON lines, ~1.2M movies, each
 * line carrying the id, the adult flag and a popularity snapshot. It is the
 * only way to rank the whole catalog without paging through the API, and it
 * needs no token.
 *
 * Files are cached under .tmp/ so a resumed run ranks against exactly the
 * file its cursor was computed from.
 */
@Injectable()
export class TmdbExportService {
  private readonly logger = new Logger(TmdbExportService.name);

  /** Fetches (or reuses) the newest export TMDB has published; returns its date. */
  async resolveLatestExportDate(): Promise<Date> {
    for (let daysBack = 0; daysBack < EXPORT_LOOKBACK_DAYS; daysBack++) {
      const date = utcDateDaysAgo(daysBack);
      if (await this.ensureCached(date)) {
        return date;
      }
    }
    throw new Error(
      `No TMDB movie export found for the last ${EXPORT_LOOKBACK_DAYS} days`,
    );
  }

  /**
   * Ids of the `topN` most popular non-adult movies in the export of
   * `exportDate`, most popular first. Adult titles are dropped here, before
   * any API request is spent on them — in practice TMDB already publishes
   * them as a separate adult_movie_ids export (the 09/2026 file had zero
   * adult lines), so this is a belt-and-braces check and the detail payload
   * is the real guard. The poster check has to wait for that payload.
   */
  async loadCandidateIds(exportDate: Date, topN: number): Promise<number[]> {
    if (!(await this.ensureCached(exportDate))) {
      throw new Error(
        `TMDB export for ${formatExportDate(exportDate)} is neither cached in ` +
          `${EXPORT_CACHE_DIR}/ nor downloadable any more (TMDB keeps exports ` +
          `for about three months). Delete the unfinished sync_runs row to ` +
          `start over from a current export.`,
      );
    }

    const candidates: { id: number; popularity: number }[] = [];
    let total = 0;
    for await (const line of this.readLines(this.cachePath(exportDate))) {
      if (line.length === 0) {
        continue;
      }
      total++;
      const entry = JSON.parse(line) as TmdbExportLine;
      if (entry.adult) {
        continue;
      }
      candidates.push({ id: entry.id, popularity: entry.popularity });
    }

    // Popularity desc, id asc as a deterministic tie-break — the order has to
    // be identical on every resume.
    candidates.sort((a, b) => b.popularity - a.popularity || a.id - b.id);
    const top = candidates.slice(0, topN);

    this.logger.log(
      `Export ${formatExportDate(exportDate)}: ${total} ids, ` +
        `${candidates.length} non-adult; taking the top ${top.length} ` +
        `(popularity ≥ ${top.at(-1)?.popularity ?? 0})`,
    );
    return top.map((candidate) => candidate.id);
  }

  /**
   * True once the file is on disk. False when TMDB has no file for that date
   * (their storage answers 403 for a missing object, not only 404).
   */
  private async ensureCached(date: Date): Promise<boolean> {
    const file = this.cachePath(date);
    if (await exists(file)) {
      return true;
    }

    const url = `${TMDB_EXPORT_BASE_URL}/movie_ids_${formatExportDate(date)}.json.gz`;
    const response = await fetch(url);
    if (response.status === 403 || response.status === 404) {
      await response.body?.cancel();
      return false;
    }
    if (!response.ok || !response.body) {
      throw new Error(
        `Export download failed: HTTP ${response.status} for ${url}`,
      );
    }

    // Stream to a .part file and rename at the end, so a download cut short
    // by Ctrl+C is never mistaken for a complete export on the next run.
    await mkdir(EXPORT_CACHE_DIR, { recursive: true });
    const partFile = `${file}.part`;
    await pipelineAsync(
      Readable.fromWeb(response.body as WebReadableStream),
      createWriteStream(partFile),
    );
    await rename(partFile, file);
    this.logger.log(`Downloaded ${url}`);
    return true;
  }

  private cachePath(date: Date): string {
    return join(
      EXPORT_CACHE_DIR,
      `movie_ids_${formatExportDate(date)}.json.gz`,
    );
  }

  // Streams the gzipped file line by line — the uncompressed export is well
  // over 100 MB, and only two numbers per line are kept.
  private async *readLines(file: string): AsyncGenerator<string> {
    const gunzip = createGunzip();
    let streamError: Error | undefined;
    const lines = createInterface({ input: gunzip, crlfDelay: Infinity });

    // readline does not surface errors from its input, so the pipeline
    // callback records the error and closes the interface to end the loop.
    pipeline(createReadStream(file), gunzip, (error) => {
      if (error) {
        streamError = error;
        lines.close();
      }
    });

    for await (const line of lines) {
      yield line;
    }
    if (streamError) {
      throw streamError;
    }
  }
}

// TMDB names the files MM_DD_YYYY.
export function formatExportDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}_${day}_${date.getUTCFullYear()}`;
}

function utcDateDaysAgo(days: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days),
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
