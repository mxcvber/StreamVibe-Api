# Data model

Why `prisma/schema.prisma` is shaped as it is. The conventions every model follows (TMDB ids as
keys, snake_case, `timestamptz`, explicit join models, foreign-key indexes) are in
`.claude/rules/prisma.md`.

## Catalog (TMDB-owned)

Written only by the import (`.claude/rules/tmdb-import.md`) and read by every endpoint so far.

- **What's in it.** A snapshot of TMDB's most popular titles, loaded once and never refreshed
  (`architecture.md`). A movie is stored only if TMDB marks it non-adult and it has a poster, at
  least one genre and a YouTube trailer, so every row is browsable and playable, and no
  `is_listed` flag is needed.
- **The trailer trade-off.** Trailer availability falls from ~90% among the top 5k titles to
  ~20% past rank 100k, so the top 150k ids yield ~50k movies rather than ~130k. The trade was
  made knowingly: a title that can't play is worse than no title.
- **No deletes.** The import enforces the invariant once and nothing re-checks it, since no
  later TMDB requests would notice a change, so no code path deletes a movie. The `Cascade`
  actions on its child relations exist so that a manual delete (psql, future admin tooling)
  stays referentially consistent, not because the app deletes movies.
- **"At least one genre"** is an import rule, not a constraint: Postgres can't require a
  minimum number of rows in another table.

### `movies`

- `runtime` (SMALLINT), `budget` and `revenue` are null when unknown, because TMDB's 0 would
  pollute averages and sorts. `budget` and `revenue` are BIGINT, since top revenues exceed 2^31;
  the response converts them with `Number()`.
- `poster_path` (NOT NULL) and `backdrop_path` are TMDB image paths, not URLs.
- `trailer_key` (NOT NULL, `varchar(32)`) is the YouTube id of the one trailer the import picks
  (rule: `tmdb-import.md`). A movie without one isn't imported, so the frontend never needs a
  no-trailer state.
- `origin_country` is a `text[]` of ISO 3166-1 codes. An array rather than a join table: it is
  displayed, never joined through.
- `popularity`, `vote_average` and `vote_count` are TMDB's, frozen on the import day.
- `weighted_rating` is an IMDb-style Bayesian rating, computed once at import. Sorting by raw
  `vote_average` surfaces 10.0 movies with two votes; this pulls low-vote movies toward the
  catalog mean, so a ranking needs neither a vote-count filter nor an extra index. Must-watch
  ranks by it. `sort=top-rated` doesn't, by the author's choice: it orders by `vote_average`.
- `review_count` and `rating_sum` hold StreamVibe's own rating, maintained by the app (see
  `reviews`).
- `synced_at` records when the movie's detail fetch completed; the import skips ids that have
  one. Nothing updates it afterwards.

| Index | Serves |
| --- | --- |
| `(popularity DESC, id DESC)` | `/movies?sort=popular`, a genre's top 10 |
| `(weighted_rating DESC, id DESC)` | the must-watch carousel |
| `(release_date DESC, id DESC) WHERE release_date IS NOT NULL` | new releases, a genre's list, `newest` (scanned backwards), the trending-now carousel's cutoff and window |
| GIN on `title gin_trgm_ops` | search, planned |
| `(collection_id)` | the collection foreign key |

- `(sort DESC, id DESC)` is exactly the keyset a cursor page compares against, so each ordering
  in the table is an index walk with no sort. `sort=top-rated` has no index and sorts the table.
- Only the release-date index is partial, because every stored movie is browsable. A DESC index
  puts NULLs first and can't serve `ORDER BY release_date DESC NULLS LAST`, so the queries carry
  a predicate that implies `IS NOT NULL` (a date bound) and the planner matches the partial index.
- Title search is to be trigram rather than `tsvector`: `ILIKE '%…%'` and `similarity()` are what
  a search box needs, and both use the GIN index.

### The other catalog tables

- `genres`: the 19 rows of TMDB's `/genre/movie/list`, with a unique `name`.
- `movie_genres` and `movie_keywords`: composite primary keys, `(movie_id, genre_id)` and
  `(movie_id, keyword_id)`, plus an index on the second column.
- `collections` and `keywords`: as TMDB sends them.
- `people`: only the people credits reference, with the fields the credits payload carries.
  Biography, birthday and the like need one `/person/{id}` request each, and wait for a person
  page. The GIN trigram index on `name` is for search.
- `credits`: the id is TMDB's `credit_id`. `kind` is CAST or CREW, and `cast_order` the 0-based
  billing position, 0 being the lead. `department` is `varchar(32)`, a short fixed list; `job` is
  `TEXT`, since jobs are open-ended and an unattended import mustn't die on a long one.
  `(movie_id, kind, cast_order)` serves both the top-billed cast and crew by job;
  `(person_id)` serves filmographies.

## Users and auth (modeled, not served)

- `users` have `Int` autoincrement ids, not UUIDs. Four-byte keys keep the 20M-row watchlist and
  its indexes small, seeding needs no id generation, and there are no public user pages where
  enumerable ids would matter: the API only ever serves `/me/…`.
- `email` is stored lowercase. The auth layer normalizes before every lookup and write, and the
  seed generates lowercase, so the unique index can stay case-sensitive (no citext).
- `password_hash` is null for OAuth-only accounts. `email_verified_at` is set at signup for
  OAuth accounts, whose provider has verified the address, and by the email-verification flow for
  password accounts. `stripe_customer_id` is unique.
- `refresh_tokens` rotate. The client holds an opaque random token, and only its SHA-256 is
  stored, as the primary key, so a database leak reveals nothing usable. Every token in one login
  chain shares a `family_id`: presenting an already-rotated (revoked) token is treated as theft
  and revokes the family. `user_agent` is `TEXT`, because in-app browsers exceed 255 characters,
  and `ip_address` is `varchar(45)` for IPv6. The `expires_at` index is for the job that will
  purge expired rows.
- `oauth_accounts` link a Google or GitHub identity, keyed `(provider, provider_account_id)`.
  Provider access tokens aren't stored: the providers are for sign-in only, never for calling
  their APIs.

## User activity (to be seeded at scale)

- `reviews`: one per `(user_id, movie_id)`. `rating` is 1–5 stars (TMDB's 0–10 stays in
  `vote_average`), enforced by the request DTO and by the hand-written CHECK
  `reviews_rating_check` in the init migration, because a raw-SQL seed would bypass the DTO.
  `(movie_id, created_at DESC, id DESC)` serves a movie's reviews, newest first, cursor-paged on
  `(created_at, id)`.
- The user side of `reviews` is `Restrict`, not `Cascade`. `movies.review_count` and
  `rating_sum` are maintained by the app, and a cascade would delete reviews inside Postgres
  without touching them. Deleting an account is therefore one explicit transaction: a grouped
  decrement of the counters, `deleteMany` on the reviews, then the user. `Restrict` makes a
  `user.delete` that skipped that fail loudly instead of drifting the averages. The movie side
  stays `Cascade`: the row whose counters would drift is the one being deleted.
- `watchlist_items` are keyed `(user_id, movie_id)`, with no `movie_id` index on purpose. Nothing
  queries watchlists by movie, and no code deletes movies, so that side of the foreign key is
  never walked. A one-off manual delete would seq-scan the table once, which is acceptable; a
  second B-tree over 20M rows isn't worth paying for that. Add the index together with a
  watchlist counter on movies if a "most wanted" row is ever built.

## Subscriptions (Stripe mirror)

Stripe is the source of truth. These rows mirror it so the entitlement guard and the pricing
page never call Stripe on the request path.

- `plans`: one per Stripe Product (basic, standard, premium). `features` holds the pricing
  page's bullet points.
- `plan_prices`: one per Stripe Price. Stripe prices are immutable, so a price change is a new
  row with the old one deactivated, which is why `(plan_id, interval)` isn't unique.
  `unit_amount` is in minor units (cents) and `currency` is lowercase ISO 4217, exactly as Stripe
  reports them.
- `subscriptions` are written by the webhook handler, and `status` holds Stripe's statuses
  verbatim. "At most one live subscription per user" is enforced in the checkout flow,
  deliberately not as a partial unique index: the webhook must always be able to record whatever
  Stripe says happened. `(user_id, status)` is the entitlement guard's lookup.
- `stripe_webhook_events` make webhooks idempotent: Stripe retries deliveries, and the event id,
  the primary key, turns a redelivery into a no-op. The payload is kept for replay and debugging;
  the volume is small.

## Import bookkeeping (`sync_runs`)

There is no recurring sync, so a run records progress, for resuming after a crash, and what
failed, nothing more. The import is its only writer.

- `type` is `GENRE_SYNC` (`/genre/movie/list` → `genres`) or `MOVIE_BACKFILL` (the detail fetch
  for the top-N ids, run once). The export is streamed and sorted in-process and cached in
  `.tmp/`, so the schema has no staging table.
- For `MOVIE_BACKFILL`, `processed` is the resume cursor: how many ids of the popularity-ordered
  candidate list have been consumed, rejected ones included. It advances in the same transaction
  that writes a chunk, so a crash can never leave it ahead of the data.
- `failed_ids` are the ids behind the cursor whose fetch failed (network, retries exhausted),
  written in that same transaction, so a resumed run still retries them once the list is done.
  After that pass they hold what is still failing, and those movies are simply absent. `failed`
  is their count.
- `export_date` is the daily export a `MOVIE_BACKFILL` run ranked its candidates from: a resumed
  run must re-read the same file, or the cursor points into a different ordering. Null for
  `GENRE_SYNC`.
- `(type, started_at DESC)` finds the newest run of a type.
