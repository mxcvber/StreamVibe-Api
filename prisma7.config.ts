// Configuration for the Prisma CLI (generate, migrate, validate). This file is
// loaded by the CLI in its own process — there is no Nest application here, so
// no ConfigService: env vars are read with Prisma's own typed `env()` helper.
//
// Prisma does not read .env on its own; "dotenv/config" is what loads it.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
