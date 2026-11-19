import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { envSchema } from '../config/env.schema';
import { PrismaModule } from '../prisma/prisma.module';
import { TmdbImportModule } from '../tmdb-import/tmdb-import.module';
import { TmdbImportService } from '../tmdb-import/tmdb-import.service';

// `npm run import:tmdb` — the one-time TMDB catalog import.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema }),
    PrismaModule,
    TmdbImportModule,
  ],
})
class ImportTmdbCliModule {}

async function main(): Promise<void> {
  const logger = new Logger('import-tmdb');
  const app = await NestFactory.createApplicationContext(ImportTmdbCliModule);
  const importer = app.get(TmdbImportService);

  process.on('SIGINT', () => importer.requestStop());

  try {
    await importer.run();
  } catch (error) {
    logger.error(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
