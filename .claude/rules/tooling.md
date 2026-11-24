---
paths:
  - package.json
  - tsconfig*.json
  - nest-cli.json
  - eslint.config.mjs
  - .prettierrc
  - .vscode/settings.json
---

# Tooling

- `npm run generate` is a standalone command, run deliberately. Never wire it into another
  script as a `prebuild`/`predev` lifecycle hook: one command invoked explicitly beats the same
  thing duplicated across hidden hooks (the author's call).
- Both tsconfigs pin `tsBuildInfoFile` inside `dist/`. Don't remove the pins: with `incremental`
  on and `rootDir` set, TypeScript's default puts the buildinfo at the repo root, where
  `deleteOutDir` can't clear it. A deleted `dist/` then never gets rebuilt, and `npm run dev`
  dies with `Cannot find module 'dist/main'`.
- `strict: true` is explicit rather than defaulted: TypeScript 6, the version VS Code bundles,
  turns it on by default and this project's 5.9 doesn't, so leaving it unset made the editor and
  `tsc` disagree. `noImplicitAny: false` and `strictBindCallApply: false` are the two deliberate
  exceptions.
- `tsconfig.json` covers `src` and `prisma7.config.ts`; `tsconfig.build.json` compiles `src`
  only, with `rootDir: ./src`, which puts the output at `dist/main.js` and `dist/cli/…`, the
  paths the npm scripts run.
- `nest-cli.json`: `deleteOutDir`, so every build wipes `dist/`, and the `@nestjs/swagger`
  plugin with `introspectComments` (`nestjs.md`). After changing the plugin's options, restart
  `npm run dev` or run `npm run build`.
- ESLint: typed `recommendedTypeChecked`, plus Prettier as an error (`endOfLine: auto`).
  `no-explicit-any` is off; `no-floating-promises` and `no-unsafe-argument` only warn;
  `src/generated/**` is ignored. `npm run lint` fixes in place, and `npm run format` runs
  Prettier over `src`. The config is built with ESLint core's `defineConfig` (`eslint/config`),
  not `tseslint.config()`, which typescript-eslint 8 deprecated in its favor: don't switch back.
- `.vscode/settings.json` sets `js/ts.preferences.preferTypeOnlyAutoImports` to `false` for this
  repo only. The author's user setting turns it on, which suits `../web` but writes `import type`
  for classes here (`code-style.md`). It applies only when `api/` is the opened folder. Keep it.
- There is no test tooling: the Jest scaffolding was removed on purpose (CLAUDE.md).
