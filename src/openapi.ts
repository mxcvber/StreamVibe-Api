import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

/** Prefix of every route; the web repo's API_URL ends in it. */
export const API_PREFIX = 'api/v1';

/**
 * The OpenAPI document of every route in `app`. main.ts serves it at /docs
 * and /docs-json, and `npm run openapi` writes it to openapi.json; both build
 * it here so the two cannot drift apart.
 *
 * Call it after `app.setGlobalPrefix(API_PREFIX)`: createDocument reads the
 * prefix when it builds the documented paths.
 *
 * The schemas come from the @nestjs/swagger CLI plugin (nest-cli.json), which
 * writes the metadata into the compiled DTOs and controllers during
 * `nest build`. With `introspectComments` on, their JSDoc becomes the
 * descriptions. Uncompiled code, run through ts-node, has none of that
 * metadata, and every DTO would come out as an empty object.
 */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('StreamVibe API')
    .setDescription(
      'Movie catalog and discovery API. Movie data and images are provided by ' +
        'TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.',
    )
    .setVersion('1.0')
    .build();

  return SwaggerModule.createDocument(app, config);
}
