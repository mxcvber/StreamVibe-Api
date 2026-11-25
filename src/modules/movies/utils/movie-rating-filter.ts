import { Prisma } from '../../../generated/prisma/client';

/**
 * TMDB votes a movie needs before the rating filter lists it, so a movie with
 * two 10.0 votes cannot sit among the 5-star ones.
 */
const MIN_VOTES_FOR_RATING = 100;

export function movieRatingWhere(
  rating: number | undefined,
): Prisma.MovieWhereInput {
  if (rating === undefined) return {};

  return {
    voteCount: { gte: MIN_VOTES_FOR_RATING },
    voteAverage: {
      gte: rating > 1 ? rating * 2 - 1.5 : undefined,
      lt: rating * 2 + 0.5,
    },
  };
}
