# Architecture

How the backend fits together. It names symbols as well as paths, so search for either.

## Entry points

One Nest module graph, three ways in:

- **HTTP API.** `main.ts` → `AppModule`: `ConfigModule` (global, validated by `envSchema`),
  `PrismaModule` (global, one `PrismaService`), `CarouselModule` and `MoviesModule`. Bootstrap:
  `.claude/rules/nestjs.md`.
- **TMDB import.** `src/cli/import-tmdb.ts` → `ImportTmdbCliModule`, an application context with
  no HTTP: `ConfigModule`, `PrismaModule` and `TmdbImportModule`. `.claude/rules/tmdb-import.md`.
- **OpenAPI file.** `src/cli/generate-openapi.ts` creates `AppModule` without initialising it
  and writes `openapi.json`.

## Request flow

```
GET /api/v1/… → ValidationPipe (whitelist, transform → query DTO)
  → *Controller → *Service → PrismaService (PrismaPg pool) → PostgreSQL
  → plain object typed as a response DTO → JSON
```

## The catalog

- A one-time snapshot of TMDB's most popular titles: the top N ids by daily-export popularity at
  import time (`TMDB_IMPORT_TOP_N`, 150k by default). Never a full mirror, which would be a
  multi-hour backfill of rows that mostly can't be rendered, and never refreshed: after the
  import the app makes no TMDB requests, so `popularity` and the vote fields keep that day's
  values.
- Every stored movie is non-adult, with a poster, at least one genre and a YouTube trailer, so
  every row is browsable and playable, and no endpoint needs a "no poster" or "no trailer"
  state. No code path deletes a movie.
- Catalog data therefore changes only when the import runs. The web caches its reads for hours
  on that basis, and the planned Redis caching can too.

## Routes

All under `/api/v1`. Parameters, types, nullability and enums: `openapi.json`, or `/docs` while
the app runs. Query and index details: `.claude/rules/queries.md`.

| Route | Handler | Returns | Order |
| --- | --- | --- | --- |
| `GET /carousel/top-in-genres` | `findTopMoviePosters` | every genre, by name, with its 4 most popular movies (none for an empty genre) | most popular first |
| `GET /carousel/trending-now` | `findTrendingNowMovies` | 20 movies, from the 100 newest released by today | most popular first |
| `GET /carousel/new-releases` | `findNewReleases` | 20 movies released by today | newest first |
| `GET /carousel/must-watch` | `findMustWatchMovies` | 16 movies | highest `weighted_rating` first |
| `GET /movies` | `findAll` | a cursor page of the whole catalog, optionally one star `rating` | `sort`: `popular` (default), `top-rated`, or `newest`, which lists upcoming movies only, soonest first |
| `GET /movies/:id` | `findOne` | one movie's page, minus its reviews; 404 for an unknown id | — |
| `GET /movies/:id/genre` | `findMoviesByGenre` | a cursor page of a genre's released movies; 404 for an unknown genre | newest first |
| `GET /movies/:id/genre/top-10` | `findTopTenMoviesByGenre` | a genre's 10 most popular movies; 404 for an unknown genre | most popular first |

- `:id` is a TMDB **movie** id on `/movies/:id`, but a TMDB **genre** id on `/movies/:id/genre`
  and `/movies/:id/genre/top-10`.
- `/docs` (Swagger UI) and `/docs-json` sit outside the prefix.

## Fields

What values mean, which `openapi.json` doesn't say.

- Every `id` is a TMDB id: a movie's, a genre's or a person's. A genre's `id` is what the genre
  routes take.
- `posterPath`, `backdropPath` and `profilePath` are TMDB image paths (`/abc123.jpg`); the
  frontend builds the image.tmdb.org URLs. `backdropPath` is null for a few movies (use the
  poster then), `profilePath` when TMDB has no photo.
- `releaseDate` is a calendar date, "YYYY-MM-DD", with no timestamp to shift across time zones.
  It is null when TMDB had none, and never null on new releases or a genre's list.
- `runtime` is in minutes. `runtime`, `budget` and `revenue` are null when unknown (TMDB sends
  0).
- `voteAverage` is TMDB's 0–10 average; the web shows `Math.round(voteAverage) / 2` stars.
  `voteCount` is TMDB's raw count, which the web abbreviates ("20K").
- `streamVibeRating` is the average of StreamVibe's own 1–5 reviews, null until the first one.
- `trailerKey` is a YouTube video id, always present. `originCountry` holds ISO 3166-1 codes
  ("IN").
- On the movie page, `genres` are by name, `cast` is top-billed with the lead first (at most
  20), and `crew` holds key jobs only, one entry per person, whose `jobs` come highest-ranked
  first (at most 20). A cast member's `character` is null when TMDB names no role.
- Rows (a carousel's array, or a page's `items`) follow the route's order (the table above).
  `nextCursor` is the last item's id: pass it back as `cursor` for the next page, and omit
  `cursor` for the first. It is null on the last page. `limit` is movies per page.
- `rating` keeps the movies whose card shows that many stars or half a star more, from at least
  30 TMDB votes.

## Contract with `../web`

- `openapi.json`, committed, → `npm run api:types` in `../web` → `src/api/schema.d.ts`, whose
  schemas `src/api/types.ts` aliases by DTO class name (`.claude/rules/nestjs.md`).
- The web keeps its own table of the 19 TMDB genres (ids and slugs) and resolves a genre slug to
  the id the genre routes take.
- The web parses input before calling: `parseMovieFilters` falls back to the defaults rather
  than send what the API would reject with 400, and `parseMovieId` rejects anything but a
  positive Postgres integer (`state.md`).
- The web's star display and the `rating` filter share one formula (`queries.md`).

## Patterns

- **DTO classes as types.** Services return plain objects; the classes exist for the Swagger
  plugin (`nestjs.md`).
- **Index-matched keyset paging.** Orderings end in `id` and match a browse index, and a deep
  page costs what the first does (`queries.md`).
- **Calendar dates as strings, bigint as numbers** at the response edge (`queries.md`).
- **Bulk writes through unnest.** One `INSERT … SELECT FROM unnest(arrays)` per table, in one
  transaction: the import's technique, meant for the seeder too (`tmdb-import.md`).
- **Fail at boot.** Validated config read with `getOrThrow`, and a `SELECT 1` at startup, so a
  bad environment stops the app with a name (`environment.md`, `prisma.md`).
- **Stripe as a mirror.** Stripe is the source of truth; the subscription tables mirror it so
  the entitlement guard and the pricing page never call Stripe on the request path
  (`data-model.md`).

## Planned

- **Redis**, for performance: response and query caching, a per-user cache of recently viewed
  movies, and possibly user sessions so login stays fast. The Compose setup anticipates BullMQ
  and `@nestjs/cache-manager` as its clients (`environment.md`).
- **Stripe**, owned by this backend despite older notes listing it under the frontend: checkout
  session creation, the webhook endpoint (raw body, `nestjs.md`), subscription state and the
  entitlement guard.
- What is and isn't built: `state.md`.

## Where things live

- `src/main.ts`, `src/app.module.ts`; `src/openapi.ts` (`API_PREFIX`, `createOpenApiDocument`).
- `src/config/env.schema.ts`: `envSchema` and `Env`.
- `src/prisma/`: `PrismaModule`, `PrismaService`. The generated client is in
  `src/generated/prisma/`.
- `src/common/dto/`: `CursorPageQueryDto`, `MoviePosterDto`, `MovieListDto`,
  `MovieListItemDto`.
- `src/modules/carousel/`: `CarouselController`, `CarouselService` (`TRENDING_NOW_WINDOW`) and
  `dto/`.
- `src/modules/movies/`: `MoviesController`, `MoviesService`, `movie-sort.ts` (`MOVIE_SORTS`,
  `movieSortQuery`), `movie-rating-filter.ts` (`movieRatingWhere`, `MIN_VOTES_FOR_RATING`),
  `movie-credits.ts` (`movieCreditsWhere`, `toCastAndCrew`, `CAST_LIMIT`, `CREW_LIMIT`,
  `KEY_CREW_JOBS`) and `dto/`.
- `src/tmdb-import/`: `TmdbImportModule`, `TmdbImportService`, `TmdbClient`,
  `TmdbExportService`, `ChunkWriter`, `RateLimiter`, `mapMovie`, `pickTrailerKey`,
  `recomputeWeightedRatings`, and the constants, errors and TMDB types.
- `src/cli/`: `import-tmdb.ts` (`ImportTmdbCliModule`) and `generate-openapi.ts`.
- `prisma/schema.prisma`, `prisma/migrations/` and `prisma7.config.ts`.
- `openapi.json`, generated and committed. `.tmp/` holds the cached TMDB exports (gitignored).
