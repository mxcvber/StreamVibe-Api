---
paths:
  - src/**
---

# Code style

- Prettier from `.prettierrc`: single quotes, semicolons, trailing commas, 80 columns. That is
  not `../web`'s style (double quotes, no semicolons, 120 columns). `npm run lint` applies it.
- Nest's layout: `<feature>/<feature>.module.ts`, `.controller.ts` and `.service.ts`, DTOs in
  `<feature>/dto/*.dto.ts`, shared DTOs in `src/common/dto/`, and query helpers as plain
  function modules beside the service (`movie-sort.ts`). Imports are relative; there is no path
  alias.
- **`import type` only for pure types** (`tmdb.types.ts`), never for a class in a decorated
  signature: an injected constructor parameter, or a `@Query()`, `@Body()` or `@Param()` DTO.
  `emitDecoratorMetadata` then records `Object` in `design:paramtypes` (verified), so Nest can't
  inject the dependency and `ValidationPipe` silently skips validation and transformation.
  `../web`'s habit of importing types with `import type` doesn't carry over.
- Read config with `ConfigService.getOrThrow`. `main.ts` ends with `void bootstrap()`; a CLI
  script ends with `main().catch(…)`, which logs and sets `process.exitCode = 1`.
