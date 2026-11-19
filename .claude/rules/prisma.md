---
paths:
  - prisma/**
  - prisma7.config.ts
  - src/prisma/**
---

# Prisma 7

## Client and config

- Prisma 7.10: generator `prisma-client` with `moduleFormat = "cjs"`, output
  `src/generated/prisma` (gitignored; `npm run generate`). Import from
  `../generated/prisma/client`.
- The datasource URL is in `prisma7.config.ts`, because Prisma 7 deprecated `url` in the
  schema's datasource block. The file name is Prisma 7's own (the CLI looks for
  `prisma7.config.*` before the legacy `prisma.config.*`), so don't rename it. The CLI loads it
  in its own process, with no Nest and so no `ConfigService`: env comes through Prisma's typed
  `env()`. Prisma doesn't read `.env` itself; `import 'dotenv/config'` does.
- Prisma 7 has no query-engine binary: a WASM compiler emits the SQL and hands it to a real Node
  driver, so an adapter is required and `new PrismaClient()` without one doesn't type-check.
  `PrismaPg` owns the `pg` Pool, so its options in `PrismaService` are where pool size and
  timeouts get tuned once seeding pushes them.
- Preview features, both preview in 7.x: `postgresqlExtensions`, so the datasource declares
  `pg_trgm` and migrations own `CREATE EXTENSION`; and `partialIndexes`, for `where: raw(…)` on
  `@@index`. If `partialIndexes` misbehaves, dropping the `where:` arguments leaves working full
  indexes.

## `PrismaService`

- It extends `PrismaClient` rather than wrapping one, so call sites read
  `this.prisma.movie.findMany()` with no extra hop. One instance, provided by the global
  `PrismaModule`, means one pool however many modules query.
- What extending costs: `$on('query', …)` is unusable. The generated constructor derives its
  event union from the options type, an `extends` clause instantiates that generic with its
  defaults, and the inherited method becomes `$on<V extends never>`, which accepts no event. So
  queries log straight to stdout through the `log` option rather than Nest's `Logger`, and only
  when `NODE_ENV` is `development`.
- `config` is a plain constructor parameter, not a `private readonly` one: parameter properties
  are assigned only after `super()` returns, and the URL is needed inside that call.
- `onModuleInit` runs `SELECT 1` after `$connect()`. `PrismaPg` wraps a lazy pool, so
  `$connect()` on its own resolves even against a dead port (verified: it logged success). The
  query forces a round trip, which turns a wrong `DATABASE_URL` or a stopped container into a
  failed boot instead of a mystery in the first request.
- `onModuleDestroy` (`$disconnect()`) runs only because `main.ts` calls
  `app.enableShutdownHooks()`.

## Schema conventions

Why each table, column and index is shaped as it is: `.claude/docs/data-model.md`. Read it
before changing a model, an index or an `onDelete`.

- Catalog tables (movies, people, genres, keywords, collections, credits) use the TMDB id as
  their primary key. TMDB is the only catalog source, and every child row in a TMDB payload
  already carries its parent's TMDB id, so the import writes millions of credit rows with no id
  lookups. Id spaces would collide if a second catalog source ever appeared; accepted, because
  that is out of scope.
- Tables and columns are snake_case through `@@map` and `@map`. Raw SQL, EXPLAIN output and psql
  are learning goals, and `release_date` reads better than `"releaseDate"` in all of them. The
  Postgres enums are snake_case too (`gender`, `credit_kind`, …), and raw SQL casts to those
  names.
- Every timestamp is `@db.Timestamptz(3)`. Prisma's default `DateTime` is `timestamp` without
  time zone, which misbehaves the first time a seed script or `now()` in raw SQL meets a non-UTC
  session.
- Join tables are explicit models. Prisma's implicit many-to-many creates `_GenreToMovie(A, B)`,
  which is unreadable in SQL and can't take columns.
- Prisma creates no indexes on foreign keys for PostgreSQL, so every foreign key that is queried
  gets an explicit `@@index`. One that isn't queried deliberately has none
  (`watchlist_items.movie_id`).

## Migrations

- `npm run migrate`, then `npm run generate`: Prisma 7's `migrate dev` no longer generates the
  client.
- SQL that Prisma can't express, such as CHECK constraints, goes in by hand:
  `npx prisma migrate dev --create-only --name x`, edit the file, then `npm run migrate`. The
  precedent is `reviews_rating_check` at the end of the init migration.
- Never edit a migration after it has been applied, comments included: the checksum no longer
  matches, and `migrate dev` forces a database reset.
