---
paths:
  - src/tmdb-import/**
  - src/cli/import-tmdb.ts
---

# TMDB import

`npm run import:tmdb` (`src/cli/import-tmdb.ts` → `TmdbImportService`) is the one-time catalog
import and the only code that calls TMDB. What it stores: `.claude/docs/data-model.md`.

## Shape and running

- A resumable terminal command on a Nest application context, deliberately not a BullMQ job. It
  shares the API's validated `ConfigService` and its `PrismaService` (one pool, the boot-time
  `SELECT 1`). Its root is `ImportTmdbCliModule`, not `AppModule`: the HTTP app never imports
  from TMDB, so `TmdbImportModule` is wired only there, and a CLI run creates no controllers.
- It runs from `dist/`: `npm run build` first, with `npm run dev` stopped (both write `dist/`,
  and `deleteOutDir` wipes it). Later rebuilds don't affect a running import.
- Run it as `NODE_ENV=production npm run import:tmdb` (PowerShell:
  `$env:NODE_ENV='production'; npm run import:tmdb`), or the development query log prints every
  bulk INSERT with its parameters.
- Ctrl+C finishes and commits the chunk in flight; run the command again to resume. The handler
  is `process.on('SIGINT')`, not `once`: the terminal signals the whole process group and
  `npm run` forwards its own copy, so one Ctrl+C can arrive twice, and with `once` the second
  would kill the process mid-chunk. `requestStop()` is idempotent. A stuck process can be killed
  from outside; the chunk transaction makes that safe.
- Not started through `nest start --entryFile`: the Nest CLI stops its child with
  `ChildProcess.kill()`, a forced termination on Windows, which loses the chunk in flight. On
  Windows `npm run` also passes Ctrl+C through the `cmd.exe` it spawns; the import should still
  finish its chunk, but that hasn't been observed, so run `node dist/cli/import-tmdb` directly
  when a clean stop matters.

## Flow (`TmdbImportService.run`)

1. `syncGenres`: the 19 genres of `/genre/movie/list`, on every start, as its own `GENRE_SYNC`
   run, so a fresh database has its genres before a movie_genres row references one.
2. `startOrResumeRun`: the newest `MOVIE_BACKFILL` run is resumed unless it succeeded. RUNNING
   means a crash or Ctrl+C, FAILED an error worth retrying from where it stopped. Otherwise a
   new run starts on the newest export.
3. `backfill`: the top `TMDB_IMPORT_TOP_N` candidates from the cursor on, in chunks. Ids already
   in `movies`, loaded up front, are never fetched again whatever the cursor says, so a fresh run
   after a partial one spends requests only on new and previously rejected ids. The cursor is
   clamped to the list, since `TMDB_IMPORT_TOP_N` may have been lowered since the run started.
4. One retry pass over the run's failed ids once the list is done, with the consecutive-failure
   counter reset. Ids still failing are logged and left out.
5. `recomputeWeightedRatings`, then SUCCEEDED, then the catalog's row counts.

## The daily export (`TmdbExportService`)

- `files.tmdb.org/p/exports/movie_ids_MM_DD_YYYY.json.gz`: one gzipped JSON line per movie
  (~1.2M), with its id, adult flag and a popularity snapshot. It needs no token, and it is the
  only way to rank the whole catalog without paging through the API.
- TMDB publishes each day's file by ~08:00 UTC, so a new run tries today's file and the two
  before it. Their storage answers 403 for a missing file, not only 404.
- Files are cached in `.tmp/` (gitignored), streamed to a `.part` file and renamed when
  complete, so a cut-short download is never mistaken for an export. A resumed run must rank
  against the same file (`sync_runs.export_date`), or the cursor points into a different
  ordering. TMDB keeps exports about three months; past that, delete the unfinished `sync_runs`
  row to start over from a current export.
- Candidates sort by popularity desc, then id asc, so the order is identical on every resume.
- Adult lines are dropped before any request is spent on them. That is belt and braces: TMDB
  publishes adult ids as a separate export (the 09/2026 file had no adult lines), and the detail
  payload is the real guard.
- The file is streamed through gunzip and readline; uncompressed it is well over 100 MB.
  readline doesn't surface errors from its input, so the pipeline callback records the error and
  closes the interface to end the loop.

## The import invariant (`fetchOne`)

A movie is stored only if it is non-adult, with a poster, at least one genre and a YouTube
trailer. The checks run cheapest first: 404 (TMDB no longer has the id), adult, no poster
(`isStorable`), no genre, no trailer. Only genres from `/genre/movie/list` count, because
movie_genres references `genres`; they are checked before the trailer, so a rejected movie never
costs the second request. Nothing re-checks a movie later, and nothing deletes one.

## Trailers (`pickTrailerKey`, `resolveTrailerKey`)

- Only YouTube videos with a key of at most 32 characters qualify. Rank: official Trailer, any
  Trailer, official Teaser, any Teaser; clips, featurettes and the rest never qualify. Within a
  rank the newest `published_at` wins.
- The details request asks for `include_video_language=en,null`, English or untagged videos.
  TMDB has no "every language" option.
- When those hold no trailer or teaser and the film isn't English, one more request,
  `/movie/{id}/videos?include_video_language=<original_language>`, applies the same rule. It is
  skipped for anything but a two-letter code, and for `xx`, TMDB's "no language", whose videos
  are the untagged ones already seen. Measured on the top 1,200: ~7.7% of movies need it, and
  about one in five of those has an original-language trailer.
- A failed lookup fails the id like a failed details request, so the retry pass fetches it
  again. Swallowing it as "no trailer" would drop a storable movie for the whole run.

## Pacing and errors (`TmdbClient`, `RateLimiter`, `tmdb-import.constants.ts`)

- Every request waits on one `RateLimiter`, so the rate TMDB sees is the constant however many
  workers fetch. It spaces requests a fixed `1000 / rps` ms apart with no burst allowance: a
  token bucket would let an idle pool fire exactly the burst TMDB asks clients not to send.
  `pause()` (on a 429) puts a barrier in front of every caller, including those already sleeping
  toward a slot they were handed before the 429.
- `REQUESTS_PER_SECOND` 35: TMDB's stated ceiling is about 40, and they ask clients to back off
  on 429. Lower it if 429s show up in the log.
- `CONCURRENCY` 32: enough workers to keep the pacer busy under TMDB's 0.4–0.9 s latency under
  load (16 measured ~25 req/s, 24 ~29, 32 ~32–34). It also bounds the sockets that pile up when
  latency spikes.
- `CHUNK_SIZE` 500 ids: ~15 s of requests, so a crash loses at most that, and ~100k rows per
  write (~3 s), which overlaps the next chunk's fetch.
- A request times out after 15 s. 5xx, network errors and timeouts get up to `MAX_ATTEMPTS` (4),
  with `500 · 2^attempt` ms between them. A 429 pauses every worker for its Retry-After (seconds,
  or an HTTP date; 2 s without one) and isn't counted as an attempt; 10 of them fail the request.
  401 and 403 throw `TmdbFatalError` and stop the run: the token is bad. Any other 4xx fails
  without a retry, and a 404 means the id is gone. Error bodies are read to free the socket.
- A failed id (`TmdbRequestError`) is recorded and the run carries on, but 25 consecutive
  failures (`MAX_CONSECUTIVE_FAILURES`) mean TMDB or the network is down, and the run stops as
  FAILED instead of recording failures down the whole list.
- Chunk k's write overlaps chunk k+1's fetch, and writes stay serialized, because the cursor
  only moves forward. The pending write gets `.catch(() => undefined)` so a failure isn't an
  unhandled rejection before the loop awaits it; that await still rethrows. The failed-id list
  is copied for each write, since the next fetch keeps pushing to it.
- Workers run under `Promise.allSettled`: on a fatal error the others finish their in-flight
  request and stop, so nothing is still running when the error reaches `run()` and the app
  shuts down.

## Writing chunks (`ChunkWriter`)

- One transaction per chunk: collections, people and keywords, then movies, then movie_genres,
  movie_keywords and credits, then the run's `processed`, `failed` and `failed_ids`. A chunk is
  either stored with the cursor moved past it or not at all, which is what makes `sync_runs` a
  safe place to resume from.
- Each table is one raw `INSERT … SELECT FROM unnest(...) ON CONFLICT DO NOTHING` statement.
  Each array is a single bind parameter, so a statement takes any number of rows and the
  65,535-parameter limit never applies. Measured: `createMany` needed 2–9 s per 20k rows over
  dozens of statements, and stalled the event loop (and with it the fetch workers) for up to half
  a second per statement; the same 20k rows as one unnest statement took 0.6 s. The seeder
  should use the same technique.
- `ON CONFLICT DO NOTHING` plays `createMany`'s `skipDuplicates`: people, keywords and
  collections an earlier chunk stored are skipped. Within a chunk they are de-duplicated first,
  so a statement doesn't carry the same actor 40 times.
- The transaction timeout is 5 minutes. Prisma's 5 s default applies to these too (verified:
  P2028 after a 6 s batch), and a chunk crossed 5 s once while a checkpoint was flushing. The
  import's transactions block nobody.
- `bigint` travels as text and is cast in Postgres: `pg` has no `bigint[]` parameter encoding.
  `origin_country` is a `text[]` per row, and unnest can't carry an array of arrays, so it
  travels as `"US,GB"` and `string_to_array` splits it (`''` gives the empty array, not null).

## Mapping (`mapMovie`, `tmdb.types.ts`)

- `mapMovie` is a pure translation. Every catalog key is a TMDB id, so it looks nothing up, and
  the trailer key and genre ids arrive already resolved.
- TMDB sends 0 for an unknown runtime, budget or revenue; they are stored as null. A runtime
  above SMALLINT (a few multi-day experimental films) is stored as unknown too. `cast_order` is
  the 0-based billing position, so 0 is the lead, not "unknown".
- A release date must be a real calendar date: one bad `::date` cast fails the whole chunk, and
  V8 turns `2023-02-30` into March 2 instead of rejecting it, hence the round-trip check.
- Strings are clipped to their column limits (department 32, genre name 64, keyword name 255,
  image paths 64; the `*_MAX_LENGTH` constants), so an unattended run can't die on one long value.
  A trailer key is never clipped, which would break it: a longer one doesn't qualify (Trailers).
- A person in both cast and crew is stored once: the first occurrence wins, since the person
  fields are the same either way. An empty title falls back to `original_title`. TMDB's gender
  0–3 maps to unknown, female, male and non-binary.
- `tmdb.types.ts` lists only the fields the import reads, so a field TMDB adds or renames
  elsewhere can't break it. Sub-resources requested with `append_to_response` arrive as extra
  top-level keys.

## Weighted rating (`recomputeWeightedRatings`)

- `weighted_rating = (v / (v + m)) · R + (m / (v + m)) · C`, IMDb's Bayesian estimate. R and v
  are the movie's own average and vote count, C the mean `vote_average` of movies with votes,
  and m the 0.9 quantile of `vote_count`: high enough that only well-voted movies escape the pull
  toward the mean, and self-calibrating, so a 300-movie smoke import and the full catalog both
  get a sensible ranking. Movies with no votes land exactly on C.
- m is at least 1, or the formula divides by zero for unvoted movies on an empty catalog.
  Parameters are cast `::float8`: an untyped parameter next to an integer column would be
  inferred as integer, and the division would truncate to 0 or 1.
- It is one UPDATE with no TMDB involvement, run once after the import, so it can be re-run from
  psql whenever the constants change.
