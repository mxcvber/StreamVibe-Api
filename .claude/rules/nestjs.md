---
paths:
  - src/main.ts
  - src/app.module.ts
  - src/openapi.ts
  - src/cli/generate-openapi.ts
  - src/**/*.controller.ts
  - src/**/*.module.ts
  - src/**/dto/**
  - nest-cli.json
---

# NestJS and the API contract

## Bootstrap (`main.ts`)

- `NestFactory.create(AppModule, { rawBody: true })` keeps the global JSON parser and keeps the
  unparsed buffer beside it, because Stripe verifies webhook signatures against the raw body.
  The webhook controller (planned) reads it with `@RawBody()`. Don't add a second mechanism:
  `bodyParser: false` or a route-scoped `express.raw()` would change `req.body` for every other
  route.
- `app.setGlobalPrefix(API_PREFIX)` (`api/v1`, exported by `src/openapi.ts`), not
  `enableVersioning()`: the URLs are the same, and switching to URI versioning later wouldn't
  change them. It must run before `createOpenApiDocument`, which reads the prefix to build the
  documented paths. `SwaggerModule.setup` isn't prefixed, so the docs stay at `/docs` and
  `/docs-json`.
- The global `ValidationPipe({ whitelist: true, transform: true })`: `whitelist` drops
  properties no DTO declares, and `transform` hands handlers the DTO instance. Without it,
  query params arrive as strings and DTO defaults never apply.
- `app.enableShutdownHooks()` makes SIGINT and SIGTERM run `onModuleDestroy`, and with it
  `PrismaService`'s `$disconnect()`. Nest leaves it off by default.
- `ConfigModule.forRoot({ isGlobal: true, validationSchema: envSchema })`: global, so feature
  modules inject `ConfigService` without importing it, and a failing schema throws before the
  app listens. The variables: `environment.md`.

## Conventions

- REST under `/api/v1`. A list that pages uses a cursor, never an offset: offset pagination
  degrades badly at the row counts this project targets. How: `queries.md`.
- A paginated list wraps its rows in `items`, beside `nextCursor`. A fixed-size list that will
  never page (the carousels) returns a bare array.
- An unknown id is a 404 from `NotFoundException` (`Movie ${id} not found`), an unknown genre
  on the genre routes too. One consistent error envelope is planned but not built; errors are
  Nest's default responses for now.

## DTOs

- DTOs are classes only so the Swagger plugin can read them at runtime. Nothing constructs
  them: services return plain objects typed as them.
- Response properties use `!`, not `?`: the plugin derives `required` from `?`.
- An optional query field with a default (`limit`, `sort`) gets `@ApiPropertyOptional()`: the
  plugin marks any property without `?` required, and `?` would make the type `| undefined`
  past the default. A string-union field passes `{ enum: … }` there (`MOVIE_SORTS`), because
  the plugin can't read the values off a union.
- A numeric query param needs `@Type(() => Number)`: the pipe transforms but doesn't convert
  implicitly, so `@IsInt` would reject the string.
- **DTO class names are contract names.** `openapi.json` names its schemas after the classes,
  and `../web/src/api/types.ts` aliases those schemas (`MovieDetailDto`, `MovieListDto`,
  `CarouselTopInGenresDto`, …). Renaming a DTO breaks the web's types.

## OpenAPI (`openapi.json`, `/docs`)

- `createOpenApiDocument` builds the document for both `/docs` and `npm run openapi`, so the two
  can't drift.
- The schemas come from the `@nestjs/swagger` plugin in `nest-cli.json`, which only runs inside
  `nest build`. Code run through ts-node has none of that metadata, and every DTO would come out
  as an empty object.
- `introspectComments` copies JSDoc on a DTO property into its schema description, and JSDoc on
  a controller method into the operation summary. Class-level JSDoc and `//` comments don't
  reach the document. The author is removing most of that JSDoc: don't add new JSDoc there.
- `openapi.json` is the reference for structure: routes, params, types, nullability,
  `required`, min/max/default (read off the class-validator decorators) and enums. Look there,
  or at `/docs` while the app runs, rather than restating it. What values mean is in
  `.claude/docs/architecture.md` ("Fields"); a new field whose meaning its type doesn't carry
  gets a line there.
- It is generated: never edit it by hand. `npm run openapi` writes it from `dist/`, with
  `npm run dev` running or after `npm run build`. It builds `AppModule`, because the document
  describes the HTTP controllers, but never initialises it, so no lifecycle hook runs and
  Postgres needn't be up. `.env` still has to be valid: `ConfigModule` validates it as the
  module loads. The output path is resolved from the compiled script's directory
  (`dist/cli/`), not the working directory, so moving the script to another depth changes its
  `'..', '..'`. The output is pretty-printed with a trailing newline, so a DTO change reads as a
  small diff.
- Regenerate after any DTO, return-type or route change, and after adding or removing JSDoc on
  DTOs or controllers. Then the web runs `npm run api:types`.
- After changing the plugin's options, restart `npm run dev` (or run `npm run build`): the
  watcher doesn't re-emit files whose source hasn't changed, so `dist/` keeps DTOs compiled with
  the old options.
