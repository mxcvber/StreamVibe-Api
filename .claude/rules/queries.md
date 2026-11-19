---
paths:
  - src/movies/**
  - src/carousel/**
  - src/common/**
  - src/**/*.service.ts
---

# Catalog queries

## Orderings and indexes

- Every list ordering ends in `id`. It breaks ties, it lets the cursor be a plain movie id for
  any sort, and it makes the ordering match a movies browse index exactly, so Postgres walks the
  index with no sort:
  - `(popularity DESC, id DESC)`: the popular carousel, `/movies?sort=popular`, a genre's top 10.
  - `(weighted_rating DESC, id DESC)`: the must-watch carousel.
  - `(release_date DESC, id DESC) WHERE release_date IS NOT NULL`: new releases, a genre's list,
    and `newest`, which scans it backwards for its ascending order.
- A query on the release-date index must carry a predicate that implies `IS NOT NULL`, or the
  planner can't match the partial index; `lte` and `gt` on `releaseDate` do. Why the index is
  partial: `.claude/docs/data-model.md`.
- Rank "best" lists by `weighted_rating`, never raw `vote_average`, or a movie with two 10.0
  votes tops them. `top-rated` doesn't yet (`.claude/docs/state.md`).

## Cursor pagination

Reference: `findAll` with `movieSortQuery`, and `findMoviesByGenre`.

- The cursor is the last item's id, returned as `nextCursor` (null on the last page).
- Look the cursor movie up first, for its sort values. An id that isn't a movie, or a movie the
  ordering can't hold (an undated one in a release-date list), returns an empty page
  (`{ items: [], nextCursor: null }`), not an error.
- Then `cursor: { id }, skip: 1`, which leaves out the previous page's last item, and
  `take: limit + 1`: the extra row says whether a next page exists, with no count query.
- Also bound the sort column by the cursor movie's value (`lte` for a descending sort, `gte` for
  ascending). It is redundant with Prisma's cursor predicate, an OR
  (`(col = v AND id <= c) OR col < v`) that Postgres can only apply as a Filter, so without the
  bound it walks the index from the top: measured 20 ms and 4,400 rows removed at depth 4,400.
  The bound becomes the Index Cond and starts the walk at the cursor (0.08 ms), so a deep page
  costs what the first does. Keep it non-strict: movies tied with the cursor on that column
  still have to come through for Prisma to sort out by id.

## Dates and numbers

- "Today" is `new Date()`, per request. The pg adapter sends a Date for a DATE column through
  its UTC getters, so it is the UTC date (TMDB release dates carry no time zone), and a movie
  dated today counts as released. The catalog holds announced movies up to a year out: released
  lists filter `lte: today`, `newest` filters `gt: today`.
- DATE comes back as UTC midnight. Send `toISOString().slice(0, 10)` ("YYYY-MM-DD") so a browser
  west of UTC doesn't show the day before. `lte` and `gt` exclude null, hence the `!` in those
  lists' mapping.
- BIGINT (`budget`, `revenue`) comes back as `bigint`, which `JSON.stringify` throws on. Convert
  with `Number()`, which is exact below 2^53, far above any budget.

## Relations

- Prisma applies a nested relation `take` in memory: `findTopMoviePosters` loads every
  movie_genres row (~12k for ~4.5k movies) and keeps 4 per genre. For a big relation, filter
  with a `where` so Postgres trims instead, as `movieCreditsWhere` does (TMDB lists up to ~400
  cast and ~1,000 crew per movie).
- A join-row relation (`genres` on a movie, `movies` on a genre) sorts by the row it points to
  (`{ movie: { popularity: 'desc' } }`), with the foreign key as the tie-break.
- A genre filter is an EXISTS on movie_genres, checked per row of the index walk, so a rare
  genre reads further down the index per page. Negligible at ~4.5k movies; check EXPLAIN at full
  size. An unknown genre is a 404 (`assertGenreExists`), not an empty list.

## Ratings and the movie page

- The `rating` filter (`movieRatingWhere`) matches the web's star display,
  `Math.round(voteAverage) / 2`. N or N.5 stars is `round(v) ∈ {2N, 2N + 1}`, so
  `2N − 0.5 <= v < 2N + 1.5`, with no upper bound for 5 (TMDB's maximum is 10). It also needs
  `voteCount >= MIN_VOTES_FOR_RATING` (30), so a movie with two 10.0 votes can't sit among the
  5-star ones. Cards showing 0 or 0.5 stars fall in no bucket. Change it together with the web.
- `movieCreditsWhere`: cast with `order < CAST_LIMIT`, a range on the
  `(movie_id, kind, cast_order)` index, and crew whose `job` is in `KEY_CREW_JOBS`. Those jobs
  average ~10 credits a movie; the rest are mostly stunts, makeup and effects.
- Credits order by `cast_order`, then person popularity: crew has no `cast_order`, and NULLs
  sort last. `toCastAndCrew` keeps the cast in billing order, ranks crew by `KEY_CREW_JOBS`
  (a stable sort, so popularity order holds within a job) and merges each person's jobs: a
  director who wrote the screenplay is one card with both jobs, not two cards of the same face.
  `CAST_LIMIT` and `CREW_LIMIT` are 20.
- `streamVibeRating` is `ratingSum / reviewCount`, null before the first review. Reviews will
  page separately, so the movie page response leaves them out.
