---
paths:
  - src/**
---

# Code style

- Prettier from `.prettierrc`: single quotes, semicolons, trailing commas, 80 columns. That is
  not `../web`'s style (double quotes, no semicolons, 120 columns). `npm run lint` applies it.
- Nest's layout: HTTP feature modules live in `src/modules/<feature>/`: `<feature>.module.ts`,
  `.controller.ts` and `.service.ts`, DTOs in `dto/*.dto.ts`, and query helpers as plain
  function modules beside the service (`movie-sort.ts`). Shared code and infrastructure stay at
  the top of `src/`: `common/` (shared DTOs in `common/dto/`), `config/`, `prisma/`,
  `tmdb-import/` and `cli/`. Imports are relative; there is no path alias.
- **`import type` only for pure types** (`tmdb.types.ts`, `INestApplication`), never for a
  class, DTOs included. In a decorated signature (an injected constructor parameter, or a
  `@Query()`, `@Body()` or `@Param()` DTO), `emitDecoratorMetadata` then records a `Function`
  placeholder in `design:paramtypes` instead of the class (verified). Nest fails at boot with
  "can't resolve dependencies of the CarouselService (?) … argument Function at index [0]", and
  `ValidationPipe` and Swagger lose a `@Query()` DTO's class. Neither `tsc` nor lint catches it.
  The author's VS Code user setting writes type-only auto-imports, which suits `../web`;
  `.vscode/settings.json` turns that off here. Whether a file move's import rewrite obeys the
  setting is unverified, so check the diff after moving files.
- Read config with `ConfigService.getOrThrow`. `main.ts` ends with `void bootstrap()`; a CLI
  script ends with `main().catch(…)`, which logs and sets `process.exitCode = 1`.
