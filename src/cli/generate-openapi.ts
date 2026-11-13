import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { API_PREFIX, createOpenApiDocument } from '../openapi';

/**
 * `npm run openapi` writes the API's OpenAPI document to `openapi.json` at the
 * repo root. It is the API contract, for the web repo to generate its response
 * types from, and it is the same document /docs-json serves.
 *
 * Runs against the compiled `dist/`: `npm run dev` running, or `npm run build`
 * first. The schemas come from the @nestjs/swagger CLI plugin, which only runs
 * inside `nest build` (see createOpenApiDocument).
 *
 * AppModule itself, unlike import-tmdb's CLI module: the document describes
 * the HTTP app's controllers, so it has to come from the module tree main.ts
 * serves. The app is created but never initialised (no init(), no listen()),
 * so no lifecycle hook runs. PrismaService never sends its boot-time SELECT 1,
 * and Postgres does not have to be up. ConfigModule still validates the
 * environment as AppModule loads, so `.env` has to be in place.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix(API_PREFIX);

  try {
    // From dist/cli/ up to the repo root, whichever directory npm runs from.
    const outFile = join(__dirname, '..', '..', 'openapi.json');

    // Pretty-printed, with a trailing newline, so a DTO change reads as a
    // small diff.
    const document = createOpenApiDocument(app);
    writeFileSync(outFile, JSON.stringify(document, null, 2) + '\n');

    console.log(`Wrote ${outFile}`);
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
