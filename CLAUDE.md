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

| Command              | Purpose                                                          |
| -------------------- | ---------------------------------------------------------------- |
| `npm run dev`        | Watch-mode dev server                                            |
| `npm run build`      | `nest build` → `dist/` (`deleteOutDir` is on, so it wipes first) |
| `npm run generate`   | `prisma generate` → Prisma Client into `src/generated/prisma`    |
| `npm run start:prod` | `node dist/main`                                                 |
| `npm run lint`       | ESLint **with `--fix`** — it rewrites files                      |
| `npx tsc --noEmit`   | Type-check only                                                  |

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

Prisma ORM over PostgreSQL, with Redis used for exactly two things: **BullMQ background jobs** and
**response/query caching** (`@nestjs/cache-manager`). Postgres and Redis run in Docker for local
dev. Do not expand Redis's role without saying why.

**Scope of "watching".** This is a catalog and discovery platform. Movie metadata, images and
trailer keys come from TMDB; playback is YouTube trailer embeds rendered by the frontend. **The
backend serves no video files** — no object storage, transcoding, HLS or DRM. Full-film streaming
is explicitly out of scope; treat any request that implies it as a scope change worth flagging.

**TMDB.** This API is the only source of movie data — the frontend never calls TMDB directly.
Initial backfill, then incremental sync via TMDB's `/changes` endpoint, both as BullMQ jobs;
syncing never happens in a request path, and rate limits must be respected. Store TMDB image
_paths_ and serve `image.tmdb.org` URLs (the frontend already has the matching `remotePatterns`
entry) rather than mirroring images. TMDB attribution is required.

**Stripe is a backend responsibility**, despite appearing under the frontend stack in older notes:
checkout session creation, the webhook endpoint, subscription state and the entitlement guard.
**The webhook needs the raw request body**, so it must be excluded from the global JSON body
parser — decide this when `main.ts` is first modified, because retrofitting it is awkward.

**API conventions.** REST, versioned under `/api/v1`. **Cursor-based pagination** — offset
pagination degrades badly at the row counts this project targets. One consistent error envelope.
`class-validator` with a global `ValidationPipe` (`whitelist`, `transform`). Config through
`@nestjs/config` with env-schema validation at boot.

**Seeding is a first-class deliverable**, not a side quest — it is one of the project's stated
learning goals. Expect batched inserts, deliberate index design and query-plan checks. Concrete
row targets are intentionally unset; choose them alongside the Prisma schema.
