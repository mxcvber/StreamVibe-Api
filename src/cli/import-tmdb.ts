import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { envSchema } from '../config/env.schema';
import { PrismaModule } from '../prisma/prisma.module';
import { TmdbImportModule } from '../tmdb-import/tmdb-import.module';
import { TmdbImportService } from '../tmdb-import/tmdb-import.service';

/**
 * `npm run import:tmdb` — the one-time TMDB catalog import, run from a
 * terminal against the compiled `dist/` (`npm run build` first, with
 * `npm run dev` stopped: `deleteOutDir` wipes `dist/`; a running import is
 * not affected by later rebuilds). Run it with NODE_ENV=production
 * (`$env:NODE_ENV='production'; npm run import:tmdb`), or PrismaService's
 * development query log prints every bulk INSERT with its parameters.
 * Resumable: run it again after a crash or Ctrl+C.
 *
 * A Nest application context rather than a bare script, so the command uses
 * the same validated ConfigService and the same PrismaService (one pool, the
 * boot-time SELECT 1) as the API. Its root module is deliberately not
 * AppModule: the HTTP app never imports from TMDB, so the import module is
 * wired only here, and no controllers are instantiated for a CLI run.
 *
 * Deliberately not started through `nest start --entryFile`: the Nest CLI
 * forwards Ctrl+C to its child with ChildProcess.kill(), a forced termination
 * on Windows, so the chunk in flight would be lost instead of finished.
 * `npm run` forwards Ctrl+C the same way to the cmd.exe it spawns; the import
 * process gets the console Ctrl+C itself and should still finish its chunk,
 * but that has not been observed — on Windows, run
 * `node dist/cli/import-tmdb` directly when a clean Ctrl+C matters.
 */
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

  // Ctrl+C asks the loop to stop after the current chunk. `on`, not `once`:
  // the terminal delivers SIGINT to the whole process group and `npm run`
  // forwards its own copy to the child, so one Ctrl+C can arrive twice — with
  // `once` the second would fall through to Node's default handler and kill
  // the process mid-chunk. requestStop() is idempotent, so repeats are
  // harmless; a stuck process is killed from outside, and the chunk
  // transaction makes that safe.
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
