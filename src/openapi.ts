import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
} from '@nestjs/swagger';

/** Prefix of every route; the web repo's API_URL ends in it. */
export const API_PREFIX = 'api/v1';

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('StreamVibe API')
    .setDescription('Movie catalog and discovery API.')
    .setVersion('1.0')
    .build();

  return SwaggerModule.createDocument(app, config);
}
