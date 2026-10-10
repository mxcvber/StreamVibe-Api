import { Prisma } from '../generated/prisma/client';

/** The `sort` values GET /api/v1/movies accepts; the web repo sends these. */
export const MOVIE_SORTS = ['popular', 'top-rated', 'newest'] as const;

export type MovieSort = (typeof MOVIE_SORTS)[number];

/** The cursor movie's value for every column a sort can order by. */
export type MovieSortCursor = {
  popularity: number;
  voteAverage: number;
  releaseDate: Date | null;
};

type MovieSortQuery = {
  where: Prisma.MovieWhereInput;
  orderBy: Prisma.MovieOrderByWithRelationInput[];
};

/**
 * The where and orderBy of one sort. Every ordering ends in id, the
 * tie-breaker that lets the cursor be a plain movie id for any sort, and
 * matches a browse index on movies exactly.
 *
 * With a cursor, each case also bounds its sort column by the cursor movie's
 * value. Prisma's own cursor predicate is an OR — `(col = v AND id <= c) OR
 * col < v` — which Postgres can only apply as a filter, so it walks the index
 * from the top and discards every earlier row (EXPLAIN: 20 ms and 4,400 rows
 * removed at depth 4,400). The redundant bound becomes the Index Cond and
 * starts the walk at the cursor (0.08 ms), so a deep page costs the same as
 * the first. It is `<=`/`>=`, not strict: movies tied with the cursor on that
 * column still have to come through for Prisma's predicate to sort out by id.
 *
 * Null when the cursor movie cannot sit in this ordering at all.
 */
export function movieSortQuery(
  sort: MovieSort,
  cursor: MovieSortCursor | undefined,
): MovieSortQuery | null {
  switch (sort) {
    case 'popular':
      return {
        where: { popularity: { lte: cursor?.popularity } },
        orderBy: [{ popularity: 'desc' }, { id: 'desc' }],
      };

    case 'top-rated':
      return {
        // weighted_rating, not vote_average: a movie with two 10.0 votes
        // would otherwise top the list.
        where: { voteAverage: { lte: cursor?.voteAverage } },
        orderBy: [{ voteAverage: 'desc' }, { id: 'desc' }],
      };

    case 'newest':
      // Without a release date a movie is never upcoming.
      if (cursor && !cursor.releaseDate) return null;
      return {
        // Upcoming only, soonest first. "Today" is the UTC date, as in the
        // New Releases carousel, so a movie out today counts as released.
        // `gt` implies NOT NULL, which lets the planner use the partial
        // (release_date DESC, id DESC) index, scanned backwards for ASC.
        where: {
          releaseDate: {
            gt: new Date(),
            gte: cursor?.releaseDate ?? undefined,
          },
        },
        orderBy: [{ releaseDate: 'asc' }, { id: 'asc' }],
      };
  }
}
