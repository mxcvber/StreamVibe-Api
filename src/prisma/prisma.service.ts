import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),
      log:
        config.getOrThrow<string>('NODE_ENV') === 'development'
          ? (['query', 'warn', 'error'] satisfies Prisma.LogLevel[])
          : (['warn', 'error'] satisfies Prisma.LogLevel[]),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.$queryRaw`SELECT 1`;
    this.logger.log('Connected to PostgreSQL');
  }

  // Only runs if main.ts calls app.enableShutdownHooks() — without that, Nest
  // never reacts to SIGINT/SIGTERM and the pool is torn down by process exit.
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
