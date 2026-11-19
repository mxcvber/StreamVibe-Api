import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { API_PREFIX, createOpenApiDocument } from '../openapi';

/**
 * `npm run openapi` writes the API's OpenAPI document to `openapi.json` at the
 * repo root. It is the API contract, for the web repo to generate its response
 * types from, and it is the same document /docs-json serves.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix(API_PREFIX);

  try {
    const outFile = join(__dirname, '..', '..', 'openapi.json');

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
