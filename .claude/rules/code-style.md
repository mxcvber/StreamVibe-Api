---
paths:
  - src/**
---

# Code style

- Prettier from `.prettierrc`: single quotes, semicolons, trailing commas, 80 columns. That is
  not `../web`'s style (double quotes, no semicolons, 120 columns). `npm run lint` applies it.
- Nest's layout: HTTP feature modules live in `src/modules/<feature>/`: `<feature>.module.ts`,
  `.controller.ts` and `.service.ts`, DTOs in `dto/*.dto.ts`, and query and mapping helpers as
  plain function modules in `utils/` (`movie-sort.ts`). Shared code and infrastructure stay at
  the top of `src/`: `common/`, `config/`, `prisma/`, `tmdb-import/` and `cli/`.
- Code lives with the feature that uses it. `common/` holds only what several modules share, or
  what belongs to no feature: `constants.ts`, `dto/` (`MoviePosterDto`, `IdParamDto`) and `utils/`
  (`toCalendarDate`). `CursorPageQueryDto` is in `movies/dto/` because only movie lists page so
  far; it moves to `common/dto/` when a second module pages.
- A DTO file is named after its main class (`top-ten-movie.dto.ts`, `TopTenMovieDto`), and a
  carousel's class and handler after its route: `/carousel/new-releases` is
  `CarouselNewReleasesDto` and `findNewReleases`.
- Export only what another file imports: `movieSortQuery`, not its `MovieSortQuery` type. A DTO
  class used only inside its own file isn't exported either (`MovieListItemDto`, `GenreTagDto`),
  and still gets its schema in `openapi.json`.
- Imports are relative, with no path alias: packages first, then relative paths, the farthest
  first (`../../common/…` before `./dto/…`).
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
