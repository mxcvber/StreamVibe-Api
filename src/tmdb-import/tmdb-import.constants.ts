export const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_EXPORT_BASE_URL = 'https://files.tmdb.org/p/exports';

// Where downloaded daily exports are cached, relative to the working directory.
// `.tmp` is gitignored. A resumed run re-reads the same file from here.
export const EXPORT_CACHE_DIR = '.tmp';

// TMDB's stated ceiling is "around 40 requests per second" and they ask
// clients to respect it and back off on 429. 35 leaves headroom for their
// measurement jitter rather than running exactly at the limit; lower it here
// if 429s start showing up in the log.
export const REQUESTS_PER_SECOND = 35;

// Workers fetching at once. The pacer above bounds the rate; this only needs
// to be enough to keep it busy under TMDB's latency, which runs 0.4–0.9 s
// per request under sustained load: 16 workers measured ~25 req/s, 24 ~29,
// 32 ~32–34 against the 35 cap. It also bounds how many sockets pile up when
// latency spikes.
export const CONCURRENCY = 32;

// Ids fetched together and then written in one transaction. ~15 s of requests
// at the paced rate, so a Ctrl+C or crash loses at most that much work, and
// ~100k rows per write (~3 s), which overlaps the next chunk's fetch. The
// write is one unnest INSERT per table (array parameters, not one bind per
// value), so chunk size is not bounded by Postgres's 65535-parameter limit.
export const CHUNK_SIZE = 500;

export const REQUEST_TIMEOUT_MS = 15_000;

// Attempts per request on 5xx / network errors / timeouts, with exponential
// backoff between them. 429s are handled separately and do not count.
export const MAX_ATTEMPTS = 4;

// Wait applied when a 429 carries no Retry-After header.
export const DEFAULT_RETRY_AFTER_MS = 2_000;

// 429s one request may absorb before it is given up as failed. Each one pauses
// every worker, so hitting this means TMDB is throttling hard, not flickering.
export const MAX_RATE_LIMIT_RETRIES = 10;

// This many ids failing back to back means TMDB or the network is down, not a
// handful of bad ids; the run stops as FAILED rather than burning through the
// candidate list recording failures.
export const MAX_CONSECUTIVE_FAILURES = 25;

// Column limits from schema.prisma, applied defensively so an unattended run
// cannot die on one unexpectedly long value.
export const DEPARTMENT_MAX_LENGTH = 32;
export const KEYWORD_NAME_MAX_LENGTH = 255;
export const IMAGE_PATH_MAX_LENGTH = 64;
export const TRAILER_KEY_MAX_LENGTH = 32;
