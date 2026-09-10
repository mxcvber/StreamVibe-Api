import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client';

/**
 * The single Prisma Client for the application, owned by Nest's DI container so
 * there is exactly one connection pool no matter how many modules query.
 *
 * It extends PrismaClient rather than wrapping one, so call sites read
 * `this.prisma.movie.findMany()` with no extra hop. The cost of that choice is
 * documented on `log` below.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  // `config` is a plain parameter, not a `private readonly` parameter property:
  // parameter properties are only assigned after super() returns, so the URL has
  // to be read off the argument itself. Nothing here needs it after construction.
  constructor(config: ConfigService) {
    super({
      // Prisma 7 dropped the query-engine binary — the WASM query compiler emits
      // SQL and hands it to a real Node driver, so an adapter is required and
      // `new PrismaClient()` no longer type-checks. PrismaPg owns the underlying
      // `pg` Pool, which makes this constructor the place to tune pool size and
      // timeouts when the seeding work starts pushing them.
      adapter: new PrismaPg({
        // getOrThrow, not process.env: the value has already been validated and
        // coerced by env.schema.ts, and a missing one fails at boot with a name.
        connectionString: config.getOrThrow<string>('DATABASE_URL'),
      }),

      // Logged straight to stdout instead of through Nest's Logger. Routing it
      // would need `$on('query', ...)`, which extending PrismaClient rules out:
      // the generated constructor derives its event union from the options type,
      // and an `extends` clause instantiates that generic with its defaults, so
      // the inherited method is `$on<V extends never>` and accepts no event name.
      log:
        config.getOrThrow<string>('NODE_ENV') === 'development'
          ? (['query', 'warn', 'error'] satisfies Prisma.LogLevel[])
          : (['warn', 'error'] satisfies Prisma.LogLevel[]),
    });
  }

  // $connect() on its own proves nothing here: PrismaPg wraps a lazy `pg` Pool,
  // so it resolves happily against a host with nothing listening on it (verified
  // against a dead port — it logged success). The SELECT 1 forces a real
  // round-trip, which is what turns a wrong DATABASE_URL or a stopped container
  // into a failed boot instead of a mystery inside the first request to query.
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
