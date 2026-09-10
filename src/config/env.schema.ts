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
});

export type Env = z.infer<typeof envSchema>;
