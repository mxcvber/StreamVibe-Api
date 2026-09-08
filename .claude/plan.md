<goal> 
You’re a Senior Backend developer with extensive experience designing large-scale web applications. Help me develop the back-end for a movie platform.
</goal>

<audience-notes>

WHAT - I'm building a website for watching movies.

WHO - I need a strong project for my portfolio.

WHY - I want to add this project to my portfolio, learn how to work with a large database and a large number of fake users, and also learn how to work with Claude.

HOW - This app is different from my other projects in that I've never worked on such huge projects before.

</audience-notes>

#### Scope of this repo

**This repo is the backend only.** The frontend is a separate Next.js 16 repo at `../web` — two
independent git repositories, no monorepo root.

#### What "watching" means here

A catalog and discovery platform. Movie metadata, images and trailer keys come from TMDB;
playback is YouTube trailer embeds rendered by the frontend. **The backend serves no video
files** — no object storage, transcoding, HLS or DRM. Full-film streaming is explicitly out of
scope.

#### Tech Involved For Backend

NestJS 11, Prisma ORM, PostgreSQL. Redis for two specific jobs: **BullMQ background jobs** and
**response/query caching** (`@nestjs/cache-manager`). Postgres and Redis run in Docker for local
dev. Stripe subscriptions are a **backend** responsibility.

#### Tech Involved For Frontend

For context only, not built in this repo: TypeScript, React, Next.js, Tailwind CSS, shadcn/ui.

#### Ports

The API listens on **3001**. `next dev` already owns 3000.

#### TMDB integration

- This API is the only source of movie data; the frontend never calls TMDB directly.
- Initial backfill, then incremental sync via TMDB's `/changes` endpoint, both as BullMQ jobs.
- Respect TMDB rate limits. Syncing never happens in a request path.
- Store TMDB image _paths_; serve `image.tmdb.org` URLs (the frontend has the matching
  `remotePatterns` entry). Do not mirror images.
- TMDB attribution is required.

#### Stripe

The backend owns checkout session creation, the webhook endpoint, subscription state and the
entitlement guard. **The webhook needs the raw request body**, so it must be excluded from the
global JSON body parser.

#### API conventions

REST, versioned under `/api/v1`. **Cursor-based pagination** — offset pagination degrades badly at
the row counts this project is aiming for. One consistent error envelope. `class-validator` with a
global `ValidationPipe` (`whitelist`, `transform`). Config through `@nestjs/config` with
env-schema validation at boot; no secrets in code.

#### Seeding and scale — a first-class deliverable

Working with a large database and large numbers of fake users is a stated learning goal, not a
side quest. Expect batched inserts, deliberate index design and query-plan checks. Concrete row
targets are set alongside the Prisma schema.

#### Open decision — authentication (flag it, do not silently pick)

Settled: this API issues its own tokens (no hosted provider), supporting email/password plus
Google and GitHub sign-in.

Still open, and expensive to reverse — surface the trade-off rather than choosing:

- Library split: `@nestjs/jwt` + `arctic` (hand-rolled) vs `@nestjs/passport` strategies. Note
  `passport-google-oauth20` and `passport-github2` are thinly maintained.
- How OAuth callback credentials cross from the API (3001) to the frontend (3000): httpOnly
  refresh cookie with `SameSite=None` and exact-origin CORS, vs a one-time code exchange. Tokens
  in the redirect URL are rejected — they leak into history and `Referer`.