# State

## Built

- Endpoints (`architecture.md`): the four carousels (`top-in-genres`, `trending-now`,
  `new-releases`, `must-watch`), the cursor-paginated catalog (`/movies` with `sort` and
  `rating`), the movie page (`/movies/:id`, everything but reviews), and a genre's list and top
  10.
- Swagger UI at `/docs`, and `openapi.json` generated from the same document.
- The resumable TMDB import (`npm run import:tmdb`), including the weighted rating.
- Environment validation at boot, and the Docker Compose stack (Postgres 18, Redis 8.2).
- Data: the local database holds 539 movies (1,534 movie–genre rows, 115,203 credits, 73,089
  people; checked 2026-11-25): 15 from a `MOVIE_BACKFILL` run on 2026-11-07, 524 from one on
  2026-11-25 that processed 550 ids. Their `popularity` and votes therefore date from two
  different days; `weighted_rating` was recomputed over all of them. The ~4.5k-movie figures in
  `queries.md` come from a since-removed code comment. The 150k-id default yields ~50k movies.

## Modeled, not served

The init migration already creates users, refresh tokens, OAuth accounts, reviews, watchlist
items, plans, plan prices, subscriptions and Stripe webhook events (`data-model.md`). No module
reads or writes them yet.

## Not built yet

The order is the author's call.
- Auth: password and Google/GitHub sign-in, rotating refresh tokens, and the job that purges
  expired ones.
- Reviews, with the counter maintenance and the account-deletion transaction, and the
  watchlist.
- Stripe: checkout sessions, the webhook (the raw body is already wired), the subscription
  mirror and the entitlement guard.
- Redis: no client is installed, and `REDIS_URL` isn't in the env schema yet. It is planned for
  response and query caching, recently viewed movies per user, and possibly sessions.
- The fake-user seeder (the schema plans for a 20M-row watchlist). It should use the unnest bulk
  writes (`tmdb-import.md`) and the bulk-load Postgres settings (`environment.md`).
- Search (the trigram indexes on `movies.title` and `people.name` exist), person pages, and one
  consistent error envelope; errors are Nest's defaults today.

Requested by the frontend (`../web/.claude/docs/state.md`): a featured-movies endpoint for the
Movies hero, view or play tracking for the trending counts, a support-message endpoint, and the
movie page's reviews.

## Watch at full catalog size

- Genre filters walk an index and check an EXISTS per row, so rare genres read deeper
  (`queries.md`).
- `findTopInGenres` loads every movie_genres row and trims to 4 per genre in memory.
- `findTrendingNowMovies` sorts its release-date window by popularity instead of walking an
  index (`queries.md`).
- `sort=top-rated` sorts the whole table for each page: no index covers
  `(vote_average DESC, id DESC)`. Raw `vote_average` with no vote floor is the author's choice
  (2026-11-25), so on 539 movies two films with 4 votes are in its top 6.
- `PrismaPg`'s pool runs on its defaults (`prisma.md`), and Postgres on stock settings
  (`environment.md`).

## Known issues

- No TMDB attribution is shown anywhere: the OpenAPI description dropped "This product uses the
  TMDB API but is not endorsed or certified by TMDB", and `../web` has no notice either. TMDB's
  API terms ask apps to show it.
- `Env` (`env.schema.ts`) is exported but nothing imports it: `ConfigService` calls type their
  value by hand (`getOrThrow<number>('PORT')`).
- The comment on `weightedRating` in `schema.prisma` says it serves "Top rated", which orders by
  `vote_average`.
- There is no `.env.example`: `.claude/rules/environment.md` lists the variables.
