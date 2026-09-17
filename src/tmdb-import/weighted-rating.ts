import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface WeightedRatingResult {
  /** Catalog mean vote_average over movies that have votes. */
  catalogMean: number;
  /** Vote count at which a movie's own average and the catalog mean weigh equally. */
  minimumVotes: number;
  updated: number;
}

// Which vote-count quantile becomes m. High enough that only well-voted
// movies escape the pull toward the mean; self-calibrating, so a 300-movie
// smoke import and the full catalog both get a sensible "Top rated".
const MINIMUM_VOTES_QUANTILE = 0.9;

/**
 * movies.weighted_rating = (v / (v + m)) · R + (m / (v + m)) · C — the IMDb
 * Bayesian estimate, where R/v are the movie's own average and count, C the
 * catalog mean and m the quantile above. Runs once after the import; it is a
 * single UPDATE with no TMDB involvement, so it can be re-run from psql
 * whenever the constants change.
 *
 * Movies with no votes land exactly on C: no evidence, so the prior.
 */
export async function recomputeWeightedRatings(
  prisma: PrismaService,
): Promise<WeightedRatingResult> {
  const [stats] = await prisma.$queryRaw<
    { catalog_mean: number | null; minimum_votes: number | null }[]
  >`
    SELECT avg(vote_average) AS catalog_mean,
           percentile_cont(${Prisma.raw(String(MINIMUM_VOTES_QUANTILE))})
             WITHIN GROUP (ORDER BY vote_count) AS minimum_votes
    FROM movies
    WHERE vote_count > 0
  `;

  // Both are null on an empty catalog; m must stay positive or the formula
  // divides by zero for unvoted movies.
  const catalogMean = stats?.catalog_mean ?? 0;
  const minimumVotes = Math.max(stats?.minimum_votes ?? 0, 1);

  // Explicit float8 casts: an untyped parameter next to an integer column
  // would be inferred as integer, and the division would truncate to 0 or 1.
  const updated = await prisma.$executeRaw`
    UPDATE movies
    SET weighted_rating =
      (vote_count::float8 / (vote_count + ${minimumVotes}::float8)) * vote_average
      + (${minimumVotes}::float8 / (vote_count + ${minimumVotes}::float8)) * ${catalogMean}::float8
  `;

  return { catalogMean, minimumVotes, updated };
}
