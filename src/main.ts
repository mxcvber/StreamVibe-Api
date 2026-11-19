import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { API_PREFIX, createOpenApiDocument } from './openapi';

async function bootstrap() {
  // Stripe verifies webhook signatures against the unparsed body, so the raw
  // buffer has to be preserved before the JSON parser touches it. Enabling it
  // at creation costs nothing here and is awkward to retrofit later.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // The web repo's API_URL points here. A plain prefix rather than
  // enableVersioning(): the URLs are the same, and switching to URI versioning
  // later would not change them. It has to be set before createOpenApiDocument
  // below, which reads it when building the documented paths; SwaggerModule.setup
  // is not prefixed, so the docs stay at /docs.
  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = app.get(ConfigService);

  SwaggerModule.setup('docs', app, createOpenApiDocument(app));

  // Lets Nest react to SIGINT/SIGTERM, which is what invokes onModuleDestroy and
  // therefore PrismaService's $disconnect(). Off by default.
  app.enableShutdownHooks();

  await app.listen(config.getOrThrow<number>('PORT'));
}

void bootstrap();
