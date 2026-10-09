import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  // Stripe verifies webhook signatures against the unparsed body, so the raw
  // buffer has to be preserved before the JSON parser touches it. Enabling it
  // at creation costs nothing here and is awkward to retrofit later.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // The web repo's API_URL points here. A plain prefix rather than
  // enableVersioning(): the URLs are the same, and switching to URI versioning
  // later would not change them. It has to be set before createDocument below,
  // which reads it when building the documented paths; SwaggerModule.setup is
  // not prefixed, so the docs stay at /docs.
  app.setGlobalPrefix('api/v1');

  // whitelist drops properties no DTO declares. transform hands handlers the
  // DTO instance instead of the raw object — without it, query params arrive
  // as strings and DTO defaults never apply.
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = app.get(ConfigService);

  const swaggerConfig = new DocumentBuilder()
    .setTitle('StreamVibe API')
    .setDescription(
      'Movie catalog and discovery API. Movie data and images are provided by ' +
        'TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.',
    )
    .setVersion('1.0')
    .build();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  // Lets Nest react to SIGINT/SIGTERM, which is what invokes onModuleDestroy and
  // therefore PrismaService's $disconnect(). Off by default.
  app.enableShutdownHooks();

  // getOrThrow, not get: a missing variable should stop the process here rather
  // than become undefined somewhere further downstream.
  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
