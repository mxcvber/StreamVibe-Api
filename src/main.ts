import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  // Stripe verifies webhook signatures against the unparsed body, so the raw
  // buffer has to be preserved before the JSON parser touches it. Enabling it
  // at creation costs nothing here and is awkward to retrofit later.
  const app = await NestFactory.create(AppModule, { rawBody: true });

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
