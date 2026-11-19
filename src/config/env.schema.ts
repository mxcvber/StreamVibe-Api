import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url().startsWith('postgresql://'),
  TMDB_ACCESS_TOKEN: z.string().min(1).optional(),
  TMDB_IMPORT_TOP_N: z.coerce.number().int().min(1).default(150_000),
});

export type Env = z.infer<typeof envSchema>;
