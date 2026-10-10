import { Prisma } from '../generated/prisma/client';

/**
 * TMDB votes a movie needs before the rating filter lists it, so a movie with
 * two 10.0 votes cannot sit among the 5-star ones.
 */
export const MIN_VOTES_FOR_RATING = 30;

/**
 * Movies whose card shows `rating` or `rating` + 0.5 stars.
 *
 * The card shows `Math.round(voteAverage) / 2` stars, and Math.round rounds .5
 * up, so N or N.5 stars is `round(v) ∈ {2N, 2N + 1}`, i.e.
 * `2N − 0.5 <= v < 2N + 1.5`. For 5 the upper bound is above TMDB's 10 and is
 * left out. Cards showing 0 or 0.5 stars fall in no bucket.
 */
export function movieRatingWhere(
  rating: number | undefined,
): Prisma.MovieWhereInput {
  if (rating === undefined) return {};

  return {
    voteCount: { gte: MIN_VOTES_FOR_RATING },
    voteAverage: {
      gte: rating * 2 - 0.5,
      lt: rating < 5 ? rating * 2 + 1.5 : undefined,
    },
  };
}
