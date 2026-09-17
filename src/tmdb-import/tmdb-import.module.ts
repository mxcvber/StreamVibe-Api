import { Module } from '@nestjs/common';
import { ChunkWriter } from './chunk-writer.service';
import { TmdbClient } from './tmdb-client.service';
import { TmdbExportService } from './tmdb-export.service';
import { TmdbImportService } from './tmdb-import.service';

/**
 * Wired only by the import command (src/cli/import-tmdb.ts), never by
 * AppModule: the running API makes no TMDB requests. ConfigService and
 * PrismaService come from the global modules the command's root registers.
 */
@Module({
  providers: [TmdbClient, TmdbExportService, ChunkWriter, TmdbImportService],
  exports: [TmdbImportService],
})
export class TmdbImportModule {}
