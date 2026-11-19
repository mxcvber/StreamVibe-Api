---
paths:
  - src/config/**
  - docker-compose.yml
  - prisma7.config.ts
  - .env*
---

# Environment and local services

## Variables

`src/config/env.schema.ts` (zod) is the contract, validated by `ConfigModule` once at boot. Its
coercions apply to the values `ConfigService` serves, so `getOrThrow<number>('PORT')` really
returns a number. Read config with `getOrThrow`, never `get` or `process.env`: a missing value
then fails by name instead of turning into `undefined` further downstream. There is no
`.env.example`; this list is the template.

- `NODE_ENV`, required, no default on purpose: `PrismaService` logs every SQL query in
  `development`, so a silent fallback would make `start:prod` print every statement it runs.
  Each environment declares itself: `production` wherever `dist/main` runs, and for the import.
- `PORT`, default 4000: clear of 3000, which `next dev` owns in `../web`. The web's `API_URL` is
  `http://localhost:4000/api/v1`, so change both together.
- `DATABASE_URL`: `postgresql://…` on host port 5433. Its credentials must match
  `POSTGRES_USER`, `POSTGRES_PASSWORD` and `POSTGRES_DB`, which only Compose reads.
- `TMDB_ACCESS_TOKEN`, optional: only the import reads it, so the API boots without one, and
  `TmdbClient` reads it with `getOrThrow`, which still fails by name at import time. It is TMDB's
  long "API Read Access Token" (themoviedb.org → Settings → API), sent as a Bearer header, not
  the 32-character v3 key that only works as a query parameter. Leave the line out rather than
  empty: an empty value fails validation and stops the API booting.
- `TMDB_IMPORT_TOP_N`, default 150,000: how many popularity-ranked, non-adult export ids the
  import examines. Examined, not stored: ids without a poster, genre or trailer are rejected, and
  trailers get scarce down the list, so 150k ids store ~50k movies in about 80 minutes of
  requests. A few hundred makes a smoke import.
- `REDIS_URL` is in `.env` but not in the schema: no Redis client is installed yet, and a
  required key would stop the app booting. Its schema entry lands with the package that reads it
  (BullMQ or cache-manager).

## Docker Compose

Only Postgres and Redis run in containers; the API runs on the host and reaches both on
localhost. `docker compose ps` should say "Up (healthy)", not just "Up". `docker compose down`
keeps the data; `down -v` destroys the volumes.

- Postgres is `postgres:18.6-trixie`, Debian rather than Alpine on purpose: Alpine's musl sorts
  text differently from glibc, and every managed Postgres worth deploying to (RDS, Neon,
  Supabase) is glibc. Matching production collation matters for a large catalog and its indexes,
  and switching bases after seeding means a REINDEX. 19 was in beta in September 2026; moving to
  it costs a `down -v` and a re-migrate.
- Its volume mounts at `/var/lib/postgresql`. Never change it to `/var/lib/postgresql/data`:
  Postgres 18 moved PGDATA to `/var/lib/postgresql/18/docker`, and the old mount most tutorials
  show silently fails to persist (docker-library/postgres#1370).
- It is published on `127.0.0.1:5433`: loopback only, since the LAN has no business with the dev
  database, and 5433 because a native PostgreSQL 18 service owned 5432 on the author's Windows
  machine. Inside the container it still listens on 5432.
- The credentials are `${VAR:?…}` with no defaults: Compose aborts naming the missing variable
  instead of passing a blank one for the Postgres entrypoint to die on later.
- The healthcheck's 30 s `start_period` covers initdb on a cold volume.
- A seeding profile is commented out (`shared_buffers=512MB`, `work_mem=32MB`,
  `maintenance_work_mem=512MB`). Stock settings give honest EXPLAIN output while the data is
  small but are slow for bulk inserts and index builds: uncomment it when the seeder pushes real
  row counts.
- Redis is `redis:8.2.9-alpine`. 8.2 is the LTS line, supported to about September 2030; 8.10 is
  short-term, and nothing BullMQ or `@nestjs/cache-manager` needs is newer than 8.2. Alpine is
  fine here, since Redis has no collation. The image persists nothing by default, so it runs with
  `--appendonly yes`; otherwise `down` would drop queued BullMQ jobs.
