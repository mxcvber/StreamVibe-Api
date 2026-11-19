# State

## Built

- Endpoints (`architecture.md`): the four carousels (`top-in-genres`, `popular`, `new-releases`,
  `must-watch`), the cursor-paginated catalog (`/movies` with `sort` and `rating`), the movie
  page (`/movies/:id`, everything but reviews), and a genre's list and top 10.
- Swagger UI at `/docs`, and `openapi.json` generated from the same document.
- The resumable TMDB import (`npm run import:tmdb`), including the weighted rating.
- Environment validation at boot, and the Docker Compose stack (Postgres 18, Redis 8.2).
- Data: the code's comments put the local catalog at ~4.5k movies (~12k movie–genre rows), a
  partial import of the 150k-id default (~50k movies). Not re-checked on 2026-11-19: Docker
  wasn't running.

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
  writes (`tmdb-import.md`) and the Compose seeding profile (`environment.md`).
- Search (the trigram indexes on `movies.title` and `people.name` exist), person pages, and one
  consistent error envelope; errors are Nest's defaults today.

Requested by the frontend (`../web/.claude/docs/state.md`): a featured-movies endpoint for the
Movies hero, view or play tracking for the trending counts, a support-message endpoint, and the
movie page's reviews.

## Watch at full catalog size

- Genre filters walk an index and check an EXISTS per row, so rare genres read deeper
  (`queries.md`).
- `findTopMoviePosters` loads every movie_genres row and trims to 4 per genre in memory.
- `PrismaPg`'s pool runs on its defaults (`prisma.md`), and Postgres on stock settings until the
  seeding profile is enabled (`environment.md`).

## Known issues

- `sort=top-rated` orders by raw `vote_average`, not `weighted_rating`. `movieSortQuery` has done
  so since it was written (`7ca69a0`), although its comment says weighted_rating, and `findAll`
  selects `voteAverage` for the cursor to match. No index covers `(vote_average DESC, id DESC)`,
  so each page sorts instead of walking an index, and movies with a handful of 10.0 votes can
  lead the list. Fixing it changes what the API returns to the web, so ask first.
- `GET /api/v1` returns Nest's scaffold "Hello World!" (`AppController`, `AppService`), and
  `openapi.json` documents it.
- Ids outside Postgres `integer` pass `ParseIntPipe`, fail in Postgres and come back as 500.
  `../web`'s `data-fetching.md` records this and guards with `parseMovieId`; not re-checked here.
- There is no `.env.example`: `.claude/rules/environment.md` lists the variables.
