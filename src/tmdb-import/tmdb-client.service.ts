import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { RateLimiter } from './rate-limiter';
import { describeError, TmdbFatalError, TmdbRequestError } from './tmdb.errors';
import {
  DEFAULT_RETRY_AFTER_MS,
  MAX_ATTEMPTS,
  MAX_RATE_LIMIT_RETRIES,
  REQUESTS_PER_SECOND,
  REQUEST_TIMEOUT_MS,
  TMDB_API_BASE_URL,
} from './tmdb-import.constants';
import type {
  TmdbGenre,
  TmdbGenreListResponse,
  TmdbMovieDetails,
  TmdbVideo,
  TmdbVideosResponse,
} from './tmdb.types';

/**
 * The only thing in the project that talks to api.themoviedb.org. Every call
 * goes through one pacer, so the rate TMDB sees is the constant in
 * tmdb-import.constants.ts no matter how many workers are fetching.
 */
@Injectable()
export class TmdbClient {
  private readonly logger = new Logger(TmdbClient.name);
  private readonly limiter = new RateLimiter(REQUESTS_PER_SECOND);
  private readonly headers: Record<string, string>;
  private requestCount = 0;

  constructor(config: ConfigService) {
    this.headers = {
      // getOrThrow: the schema leaves the token optional so the API can boot
      // without one, so this is where a missing value fails, by name.
      Authorization: `Bearer ${config.getOrThrow<string>('TMDB_ACCESS_TOKEN')}`,
      Accept: 'application/json',
    };
  }

  /** HTTP requests actually sent, retries included — for the req/s readout. */
  get requestsMade(): number {
    return this.requestCount;
  }

  async getGenres(): Promise<TmdbGenre[]> {
    const response = await this.request<TmdbGenreListResponse>(
      '/genre/movie/list',
      { language: 'en-US' },
    );
    if (!response) {
      throw new TmdbFatalError('TMDB returned 404 for /genre/movie/list');
    }
    return response.genres;
  }

  /**
   * Details plus the three sub-resources the catalog needs, in one request.
   * `include_video_language=en,null` widens the appended videos from
   * English-only to English-or-untagged; there is no "every language".
   * Resolves null when TMDB no longer has the id.
   */
  getMovie(id: number): Promise<TmdbMovieDetails | null> {
    return this.request<TmdbMovieDetails>(`/movie/${id}`, {
      language: 'en-US',
      append_to_response: 'videos,credits,keywords',
      include_video_language: 'en,null',
    });
  }

  /**
   * Videos tagged with one ISO 639-1 language — the fallback for a
   * non-English movie whose English/untagged videos hold no trailer or
   * teaser. Empty when the movie is gone.
   */
  async getMovieVideos(id: number, language: string): Promise<TmdbVideo[]> {
    const response = await this.request<TmdbVideosResponse>(
      `/movie/${id}/videos`,
      { include_video_language: language },
    );
    return response?.results ?? [];
  }

  private async request<T>(
    path: string,
    query: Record<string, string>,
  ): Promise<T | null> {
    const url = new URL(`${TMDB_API_BASE_URL}${path}`);
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    let attempts = 0;
    let rateLimited = 0;
    for (;;) {
      await this.limiter.acquire();
      this.requestCount++;

      let response: Response;
      try {
        response = await fetch(url, {
          headers: this.headers,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        // Network failure or timeout: transient until proven otherwise.
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
          throw new TmdbRequestError(
            `${path}: ${describeError(error)} (${attempts} attempts)`,
          );
        }
        await sleep(backoffMs(attempts));
        continue;
      }

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Small error bodies; reading them frees the socket for the pool.
      const body = await response.text();
      const { status } = response;

      if (status === 404) {
        return null;
      }

      if (status === 429) {
        const pauseMs = retryAfterMs(response.headers.get('retry-after'));
        this.limiter.pause(pauseMs);
        this.logger.warn(
          `429 from TMDB — all requests paused for ${pauseMs} ms`,
        );
        if (++rateLimited >= MAX_RATE_LIMIT_RETRIES) {
          throw new TmdbRequestError(
            `${path}: still rate limited after ${rateLimited} pauses`,
          );
        }
        continue;
      }

      if (status === 401 || status === 403) {
        throw new TmdbFatalError(
          `TMDB rejected the access token (HTTP ${status}): ${body.slice(0, 200)}`,
        );
      }

      if (status >= 500) {
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
          throw new TmdbRequestError(
            `${path}: HTTP ${status} (${attempts} attempts)`,
          );
        }
        await sleep(backoffMs(attempts));
        continue;
      }

      // Any other 4xx is about this request, not the connection: no retry.
      throw new TmdbRequestError(
        `${path}: HTTP ${status}: ${body.slice(0, 200)}`,
      );
    }
  }
}

function backoffMs(attempt: number): number {
  return 500 * 2 ** attempt;
}

// TMDB sends Retry-After in seconds; the HTTP-date form is handled in case
// that ever changes.
function retryAfterMs(header: string | null): number {
  if (!header) {
    return DEFAULT_RETRY_AFTER_MS;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) {
    return seconds * 1000;
  }
  const at = Date.parse(header);
  if (!Number.isNaN(at)) {
    return Math.max(at - Date.now(), DEFAULT_RETRY_AFTER_MS);
  }
  return DEFAULT_RETRY_AFTER_MS;
}
