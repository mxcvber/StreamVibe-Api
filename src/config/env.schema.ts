import { z } from 'zod';

/**
 * Environment contract, validated once at boot by ConfigModule.
 *
 * Coercions declared here are applied to the values ConfigService serves, so
 * `getOrThrow<number>('PORT')` really does return a number.
 */
export const envSchema = z.object({
  // No default on purpose. PrismaService branches its query logging on this, so a
  // silent fallback to 'development' would make `start:prod` print every SQL
  // statement it emits. Each environment declares itself, and a missing value
  // fails at boot with a name — the same contract as DATABASE_URL below.
  NODE_ENV: z.enum(['development', 'production', 'test']),

  // 4000, kept clear of 3000, which `next dev` in the sibling ../web repo owns.
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  // Nothing in the app reads this yet — PrismaService will. Validating it now
  // turns a confusing runtime failure into a named failure at startup.
  DATABASE_URL: z.url().startsWith('postgresql://'),

  // Read only by `npm run import:tmdb`; the running API never calls TMDB.
  // Optional so the API boots without a token — the import itself reads it with
  // getOrThrow, so a missing value still fails with a name, just at import time.
  // This is TMDB's "API Read Access Token" (the long one), sent as a Bearer
  // header, not the 32-character v3 key that only works as a query parameter.
  TMDB_ACCESS_TOKEN: z.string().min(1).optional(),

  // How many ids from TMDB's daily export the import examines, taken in
  // popularity order after dropping adult titles. Examined, not stored: ids
  // whose details turn out to lack a poster or a trailer are rejected, and
  // trailers get scarce down the list, so 150k ids store ~50k movies. ~150k is
  // about 80 minutes of requests at the paced rate; a few hundred is a smoke
  // import.
  TMDB_IMPORT_TOP_N: z.coerce.number().int().min(1).default(150_000),
});

export type Env = z.infer<typeof envSchema>;
