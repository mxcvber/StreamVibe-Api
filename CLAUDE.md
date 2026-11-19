# CLAUDE.md

## Project

StreamVibe is a movie platform. **This repo is the NestJS backend only** (Prisma, PostgreSQL,
Redis planned). The Next.js frontend is the separate repo `../web`, with its own CLAUDE.md. It
calls this API at `http://localhost:4000/api/v1` (its server-only `API_URL`) and never calls
TMDB; here, only the import script does. Stripe (planned) belongs to this repo. Keep this file
and `../web/CLAUDE.md` consistent on the port, the base URL and who talks to TMDB.

It is a portfolio project, and its learning goals are part of the point: working with a large
database, seeding and handling large numbers of fake users, and working with Claude across a
long-running multi-session build. It is the largest project this author has taken on, so
**explain architectural reasoning rather than silently making large-scale decisions**. When a
choice is expensive to reverse, surface the trade-off instead of just picking one.

## Commands

- `docker compose up -d`: Postgres (host port 5433) and Redis; the app won't boot without
  Postgres.
- `npm run dev`: watch mode. `npm run build`: `nest build` → `dist/`, wiping it first.
  `npm run start:prod`: `node dist/main`.
- `npm run generate`: Prisma Client → `src/generated/prisma` (gitignored), after a clone and
  every `schema.prisma` change; `build` and `dev` fail without it.
- `npm run migrate`: create and apply a migration. Run `npm run generate` after it.
- `npm run openapi`: write `openapi.json` from `dist/`, after changing a DTO, a controller's
  return type or a route.
- `npm run import:tmdb`: the one-time, resumable TMDB import, from `dist/`.
- `npm run lint`: ESLint **with `--fix`**, so it rewrites files. `npx tsc --noEmit`: type-check.

## Essentials

- **No tests, by the author's choice.** Don't add `*.spec.ts` or `*.e2e-spec.ts` files, testing
  dependencies or test scripts, and don't treat tests as part of "done" or offer them as a
  follow-up. Verify with `npx tsc --noEmit`, `npm run lint` and by running the app.
- **Code comments are the author's.** Record reasoning in the matching rule or doc, not in a new
  comment. Where a comment and the code disagree, the code wins.
- **Scope:** catalog and discovery; playback is YouTube trailer embeds in the frontend. The
  backend serves no video: flag any request that implies streaming full films.

## Where knowledge lives

- `.claude/rules/*.md` load automatically when you touch matching files: nestjs, queries,
  prisma, tmdb-import, environment, code-style and tooling.
- `.claude/docs/` (read on demand):
  - `architecture.md`: entry points, routes, field meanings, the contract with `../web`, where
    things live. Before cross-cutting work.
  - `data-model.md`: why each table, key and index is shaped as it is. Before changing the
    schema or building on a model.
  - `state.md`: what's built, modeled, planned and broken.
- The author works step by step. Before committing, they say what changed and where: read the
  diff (`git status`, `git diff`, `git diff --staged`) and bring CLAUDE.md, the rules and the
  docs in line. A change that moves or renames something a rule or doc names updates them too.
