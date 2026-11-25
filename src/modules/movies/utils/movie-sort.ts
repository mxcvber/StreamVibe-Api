import { Prisma } from '../../../generated/prisma/client';

export const MOVIE_SORTS = ['popular', 'top-rated', 'newest'] as const;

export type MovieSort = (typeof MOVIE_SORTS)[number];

export type MovieOrder = MovieSort | 'released';

export const movieCursorSelect = {
  id: true,
  popularity: true,
  voteAverage: true,
  releaseDate: true,
} satisfies Prisma.MovieSelect;

type MovieCursor = Prisma.MovieGetPayload<{ select: typeof movieCursorSelect }>;

type MovieSortQuery = {
  where: Prisma.MovieWhereInput;
  orderBy: Prisma.MovieOrderByWithRelationInput[];
};

export function movieSortQuery(
  order: MovieOrder,
  cursor: MovieCursor | undefined,
): MovieSortQuery | null {
  const releaseDate = cursor?.releaseDate;

  switch (order) {
    case 'popular':
      return {
        where: {
          popularity: { lte: cursor?.popularity },
          OR: cursor && [
            { popularity: { lt: cursor.popularity } },
            { id: { lt: cursor.id } },
          ],
        },
        orderBy: [{ popularity: 'desc' }, { id: 'desc' }],
      };

    case 'top-rated':
      return {
        where: {
          voteAverage: { lte: cursor?.voteAverage },
          OR: cursor && [
            { voteAverage: { lt: cursor.voteAverage } },
            { id: { lt: cursor.id } },
          ],
        },
        orderBy: [{ voteAverage: 'desc' }, { id: 'desc' }],
      };

    case 'newest':
      // Without a release date a movie is never upcoming.
      if (releaseDate === null) return null;
      return {
        // Upcoming only, soonest first.
        where: {
          releaseDate: { gt: new Date(), gte: releaseDate },
          OR: cursor && [
            { releaseDate: { gt: releaseDate } },
            { id: { gt: cursor.id } },
          ],
        },
        orderBy: [{ releaseDate: 'asc' }, { id: 'asc' }],
      };

    case 'released':
      if (releaseDate === null) return null;
      return {
        where: {
          AND: [
            { releaseDate: { lte: new Date() } },
            { releaseDate: { lte: releaseDate } },
          ],
          OR: cursor && [
            { releaseDate: { lt: releaseDate } },
            { id: { lt: cursor.id } },
          ],
        },
        orderBy: [{ releaseDate: 'desc' }, { id: 'desc' }],
      };
  }
}
