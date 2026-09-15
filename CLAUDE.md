# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

StreamVibe is a movie platform. **This repo is the backend only.** The frontend is a separate
Next.js 16 repo at `../web` — two independent git repositories, no monorepo root. Keep this file
and `../web/CLAUDE.md` from contradicting each other on the API port, base URL, or who talks to
TMDB.

It is a portfolio project, and its learning goals are part of the point: working with a large
database, seeding and handling large numbers of fake users, and working with Claude across a
long-running multi-session build. It is the largest project this author has taken on, so
**explain architectural reasoning rather than silently making large-scale decisions** — when a
choice is expensive to reverse, surface the trade-off instead of just picking one.

## Commands

| Command                | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `docker compose up -d` | Start local Postgres + Redis — required before `dev`/`start:prod` |
| `npm run dev`          | Watch-mode dev server                                             |
| `npm run build`        | `nest build` → `dist/` (`deleteOutDir` is on, so it wipes first)  |
| `npm run generate`     | `prisma generate` → Prisma Client into `src/generated/prisma`     |
| `npm run migrate`      | `prisma migrate dev` — create + apply a migration (no generate)   |
| `npm run start:prod`   | `node dist/main`                                                  |
| `npm run lint`         | ESLint **with `--fix`** — it rewrites files                       |
| `npx tsc --noEmit`     | Type-check only                                                   |

Bring the containers up first. `PrismaService.onModuleInit` issues a real `SELECT 1` after
`$connect()`, so with no Postgres running the app refuses to boot instead of failing inside the
first request that queries. Postgres is published on host port **5433**, not 5432 — a native
Windows PostgreSQL service owns 5432 on this machine.

`npm run generate` is a standalone command, run deliberately. **Do not wire it into other scripts**
as a `prebuild`/`predev` lifecycle hook — one command, invoked explicitly, beats the same thing
duplicated across hidden hooks. `src/generated` is gitignored, so run it after a fresh clone and
after every `schema.prisma` change; `npm run build` and `npm run dev` both fail on a missing client.

**This project has no tests, by the author's choice.** There is no test suite and none is planned.
Do not add `*.spec.ts` or `*.e2e-spec.ts` files, testing dependencies, or test scripts, and do not
treat test coverage as part of "done" or offer it as a follow-up. Verify work with
`npx tsc --noEmit`, `npm run lint`, and by actually running the app.

`incremental` is on and `rootDir` is set, so **`tsBuildInfoFile` is pinned explicitly inside
`dist/`** in both tsconfigs. Do not remove those pins. With `rootDir` set, TypeScript's default
puts the buildinfo at the repo root, where `deleteOutDir` cannot clear it — a deleted `dist/` then
never gets rebuilt, and `npm run dev` dies with `Cannot find module 'dist/main'`.

## Planned architecture

Prisma ORM over PostgreSQL, with Redis used for exactly two things: **BullMQ background jobs**
(the one-time TMDB import plus housekeeping such as the expired-token purge) and
**response/query caching** (`@nestjs/cache-manager`). Postgres and Redis run in Docker for local
dev. Do not expand Redis's role without saying why.

**Scope of "watching".** This is a catalog and discovery platform. Movie metadata, images and
trailer keys come from TMDB; playback is YouTube trailer embeds rendered by the frontend. **The
backend serves no video files** — no object storage, transcoding, HLS or DRM. Full-film streaming
is explicitly out of scope; treat any request that implies it as a scope change worth flagging.

**TMDB.** This API is the only source of movie data — the frontend never calls TMDB directly.
The catalog is a **bounded, popularity-ranked subset imported once**, never a full mirror and
never re-synced: the import takes the top N non-adult ids from TMDB's daily id export
(N = 150,000 to start, held in config) and fetches details for those only — about an hour of
requests, as resumable BullMQ jobs that run unattended. **After the import finishes the app
makes no further TMDB requests** — no export refresh, no `/changes` polling, no popularity
updates; `popularity` and `vote_*` are a snapshot of import day, and that staleness is accepted.
Do not add sync or freshness machinery. **A multi-hour TMDB backfill is never a prerequisite for
anything** — database scale comes from seeded data. Importing never happens in a request path,
and rate limits must be respected. Store TMDB image _paths_ and serve `image.tmdb.org` URLs
(the frontend already has the matching `remotePatterns` entry) rather than mirroring images.
TMDB attribution is required.

**Stripe is a backend responsibility**, despite appearing under the frontend stack in older notes:
checkout session creation, the webhook endpoint, subscription state and the entitlement guard.
**The webhook needs the raw request body — this is already decided and wired.** `main.ts` calls
`NestFactory.create(AppModule, { rawBody: true })`, which keeps the global JSON parser and
preserves the unparsed buffer alongside it; the webhook controller reads it with `@RawBody()`.
Do not add a second mechanism: setting `bodyParser: false` or mounting a route-scoped
`express.raw()` would change `req.body` for every other route in the app.

**API conventions.** REST, versioned under `/api/v1`. **Cursor-based pagination** — offset
pagination degrades badly at the row counts this project targets. One consistent error envelope.
`class-validator` with a global `ValidationPipe` (`whitelist`, `transform`). Config through
`@nestjs/config` with env-schema validation at boot.

**Seeding is a first-class deliverable**, not a side quest — it is one of the project's stated
learning goals. Expect batched inserts, deliberate index design and query-plan checks. Row
targets: **150k movies** (fixed at import, see TMDB above), **1M users**, **5M reviews** and
**20M watchlist items** (both Zipf-skewed toward popular movies), ~250k subscriptions with fake
Stripe ids, plus whatever credits, people and keywords the imported movies carry (rough guess:
several million credits and 1–2M people — measured at backfill, not assumed; trailers are a
single `trailer_key` column on `movies`, not a table). All fake users share one precomputed
password hash; `review_count`/`rating_sum` are back-filled with a single grouped
`UPDATE … FROM` after the reviews load. Every `updated_at` has a database default, so raw
inserts may omit it; a bulk load that supplies explicit `users.id`/`reviews.id` must `setval`
those sequences afterwards (`pg_get_serial_sequence`) or the first real signup fails on a
duplicate key. A smoke-size profile (~5k movies, ~10k users) is for day-to-day dev.

## Data model

`prisma/schema.prisma` carries its reasoning as comments; these are the rules other code must
respect.

- **Catalog primary keys are TMDB ids** (`movies.id`, `people.id`, `credits.id` = TMDB
  `credit_id`, …). No local surrogate, no `tmdb_id` column: child rows are written straight
  from TMDB payloads with no id lookups.
- **No slug column.** Movie URLs are `/{id}-{slugified-title}`; the API resolves by id and the
  slug is decorative.
- **snake_case tables and columns via `@@map`/`@map`; every timestamp is `timestamptz`;** join
  tables are explicit models, never Prisma's implicit many-to-many.
- **Every stored movie is browsable** — the importer stores a movie only if TMDB marks it
  non-adult and it has a poster, so there is no `is_listed` flag and the browse indexes on
  `popularity` and `weighted_rating` are full. Only the `release_date` index is partial
  (`release_date IS NOT NULL`, via the `partialIndexes` preview feature): new-releases
  queries must carry that predicate or the planner cannot use it. The invariant is enforced
  by the import script and never re-checked — nothing in the app deletes a movie after
  import. The child relations still cascade so a manual delete stays consistent, and
  `watchlist_items` deliberately has no `movie_id` index.
- **`weighted_rating`** is the IMDb-style Bayesian score computed once at import; sort
  "Top rated" by it, never by raw `vote_average`.
- **StreamVibe ratings are `review_count` + `rating_sum`** on `movies`, incremented atomically
  on review write; compute the average on read. Never store a float average. Account deletion
  is one explicit transaction — grouped decrement of the counters, delete the reviews, delete
  the user — and `Review.user` is `onDelete: Restrict` so a bare `user.delete` fails instead
  of drifting the counters. `reviews.rating` is CHECK-constrained to 1–5 in the migration
  (hand-written; Prisma cannot declare CHECK constraints).
- **Emails are stored lowercase.** The auth layer normalizes before every lookup and write and
  the seed generates lowercase; the unique index on `users.email` is case-sensitive by design.
- **`budget`/`revenue` are `BigInt`.** Prisma returns `bigint`, which `JSON.stringify` rejects;
  convert in the response layer (`Number()` is exact below 2^53).
- **Title and person search is `pg_trgm`** (GIN trigram indexes), declared through the
  `postgresqlExtensions` preview feature so migrations own `CREATE EXTENSION`.
- **Migrations:** `npm run migrate` (`prisma migrate dev`) and then `npm run generate` — Prisma
  7's `migrate dev` no longer generates the client. Both explicit, no hooks. SQL Prisma cannot
  express (CHECK constraints) goes in by hand: `npx prisma migrate dev --create-only --name x`,
  edit the file, then `npm run migrate`. Never edit a migration after it has been applied —
  the checksum mismatch forces a reset.
