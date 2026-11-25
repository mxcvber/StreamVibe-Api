---
paths:
  - src/modules/movies/**
  - src/modules/carousel/**
  - src/common/**
  - src/**/*.service.ts
---

# Catalog queries

## Orderings and indexes

- Every list ordering ends in `id`. It breaks ties, it lets the cursor be a plain movie id for
  any sort, and it makes the ordering match a movies browse index exactly, so Postgres walks the
  index with no sort:
  - `(popularity DESC, id DESC)`: `/movies?sort=popular`, a genre's top 10.
  - `(weighted_rating DESC, id DESC)`: the must-watch carousel.
  - `(release_date DESC, id DESC) WHERE release_date IS NOT NULL`: new releases, a genre's list,
    and `newest`, which scans it backwards for its ascending order.
- `sort=top-rated` is the exception, by the author's choice (2026-11-25): raw `vote_average` with
  no vote floor, so a movie averaging 9.0 over four votes ranks near the top. No index covers
  `(vote_average DESC, id DESC)`, so Postgres sorts the table for each page. Rank any other
  "best" list by `weighted_rating`, as must-watch does.
- The trending-now carousel ranks by popularity only within the `TRENDING_NOW_WINDOW` (100)
  newest released movies, which drops unreleased films and older ones trending on import day.
  One query reads the Nth newest release date from the release-date index, a second takes the
  top 20 by popularity between it and today (a few more than N when movies share the cutoff
  date; no lower bound when fewer than N are released). A count window, not a date window: the
  catalog is a frozen snapshot, so "the last 12 months" would empty out as time passes.
- That second query is the one carousel ordering no index walk serves: no index orders a
  release-date range by popularity, so Postgres reads the window as a range of the release-date
  index (both bounds in the Index Cond) and sorts its ~N rows. EXPLAIN shows exactly that on the
  539-movie catalog (2026-11-25): a bitmap scan of 100 rows and a top-N sort. Re-check at full
  size.
- A query on the release-date index must carry a predicate that implies `IS NOT NULL`, or the
  planner can't match the partial index; `lte` and `gt` on `releaseDate` do. Why the index is
  partial: `.claude/docs/data-model.md`.

## Cursor pagination

Every paginated movie list goes through `MoviesService.findPage`: an ordering from
`movieSortQuery`, a filter, and the page built by `toMovieList`. A new list adds its ordering (and
the column to `movieCursorSelect`) and calls it, as `findMoviesByGenre` does with `released`, an
ordering that `sort` doesn't accept.

- The cursor is the last item's id, returned as `nextCursor` (null on the last page).
- `findPage` looks the cursor movie up first, for its sort values (`movieCursorSelect`). An id
  that isn't a movie, or a movie the ordering can't place (an undated one in a release-date list),
  returns an empty page (`{ items: [], nextCursor: null }`), not an error.
- `movieSortQuery` then selects the rows past it: `col <= v AND (col < v OR id < c)`, mirrored for
  an ascending order. The first bound is the Index Cond, which starts the walk at the cursor, so a
  deep page costs what the first does. The OR is a Filter that only drops the cursor movie and
  the ties before it, so the bound has to stay non-strict. With no cursor both are `undefined`,
  which Prisma ignores. Each ordering spells the predicate out, rather than sharing a helper with
  computed keys, so that it reads plainly and stays type-checked (the author's choice).
- `take: limit + 1`: the extra row says whether a next page exists, with no count query.
- Don't replace it with Prisma's `cursor` and `skip: 1`, which it took over from (2026-11-25):
  - Prisma 7.10 sends no LIMIT when a cursor meets a nullable order column, or an ordering with
    no unique tie-break: it loads every remaining row and pages in memory. `release_date` is
    nullable, and neither `nulls: 'last'` nor a not-null filter helps (all seen in the query log).
    Page 2 of Drama loaded 113 rows to return 50, from a 539-movie catalog.
  - `skip: 1` assumes the cursor movie is still in the list. When the filter excludes it, a row is
    lost, or, paging in memory, the whole page: a movie leaves `newest` on its release day.
  - Its predicate, `(col = v AND id <= c) OR col < v`, is an OR that Postgres can only apply as a
    Filter, so on its own it walks the index from the top: measured 20 ms and 4,400 rows removed
    at depth 4,400, against 0.08 ms with the bound.

## Dates and numbers

- "Today" is `new Date()`, per request. The pg adapter sends a Date for a DATE column through
  its UTC getters, so it is the UTC date (TMDB release dates carry no time zone), and a movie
  dated today counts as released. The catalog holds announced movies up to a year out: released
  lists filter `lte: today`, `newest` filters `gt: today`.
- DATE comes back as UTC midnight. Send it through `toCalendarDate` ("YYYY-MM-DD") so a browser
  west of UTC doesn't show the day before. `lte` excludes null, hence the `!` in
  `findNewReleases`.
- BIGINT (`budget`, `revenue`) comes back as `bigint`, which `JSON.stringify` throws on. Convert
  with `Number()`, which is exact below 2^53, far above any budget.

## Relations

- Prisma applies a nested relation `take` in memory: `findTopInGenres` loads every movie_genres
  row (1,534 for 539 movies, ~12k for ~4.5k) and keeps 4 per genre. For a big relation, filter
  with a `where` so Postgres trims instead, as `movieCreditsWhere` does (TMDB lists up to ~400
  cast and ~1,000 crew per movie).
- A join-row relation (`genres` on a movie, `movies` on a genre) sorts by the row it points to
  (`{ movie: { popularity: 'desc' } }`), with the foreign key as the tie-break.
- A genre filter is an EXISTS on movie_genres, checked per row of the index walk, so a rare
  genre reads further down the index per page. Negligible at ~4.5k movies; check EXPLAIN at full
  size (on 539 movies the planner still prefers a join and a sort for a genre's list). An unknown
  genre is a 404 (`assertGenreExists`), not an empty list.

## Ratings and the movie page

- The `rating` filter (`movieRatingWhere`) matches the web's star display,
  `Math.round(voteAverage) / 2`. N − 0.5 or N stars is `round(v) ∈ {2N − 1, 2N}`, so
  `2N − 1.5 <= v < 2N + 0.5`, with no lower bound for 1, which also takes 0 stars. Every star
  value falls in exactly one rating. Change the formula together with the web.
- The filter also needs `voteCount >= MIN_VOTES_FOR_RATING` (100), so a movie with two 10.0 votes
  can't sit among the 5-star ones, and `rating=1` doesn't list unrated movies (0 stars on the
  card). The floor comes only with `rating`: `sort=top-rated` on its own has none.
- `movieCreditsWhere`: cast with `order < CAST_LIMIT`, a range on the
  `(movie_id, kind, cast_order)` index, and crew whose `job` is in `KEY_CREW_JOBS`. Those jobs
  average ~10 credits a movie; the rest are mostly stunts, makeup and effects.
- Credits order by `cast_order`, then person popularity: crew has no `cast_order`, and NULLs
  sort last. `toCastAndCrew` gives each person one card per side. It keeps the cast in billing
  order and joins the characters of someone TMDB credits more than once ("Aventi / Averil", with
  the separator TMDB uses inside one credit). It ranks crew by `KEY_CREW_JOBS` (a stable sort, so
  popularity order holds within a job) and merges each person's jobs: a director who wrote the
  screenplay is one card with both jobs, not two cards of the same face.
- `CAST_LIMIT` and `CREW_LIMIT` are 20. Cast is limited in the query, before merging, and crew
  after it.
- `streamVibeRating` is `ratingSum / reviewCount`, null before the first review. Reviews will
  page separately, so the movie page response leaves them out.
