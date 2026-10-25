# Tasks: 01 Core foundation

- [x] 1. Package setup
  - Create `package.json` (name, ESM, bin, files, engines, pinned deps from design §1), `tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `vitest.config.ts` with `unit` / `snapshot` / `lint` projects, `test/setup/no-processes.ts`.
  - Add `src/index.ts` stub (`#!/usr/bin/env node`) so `build` produces `dist/index.js`.
  - Verify `typescript-eslint` supports the pinned TypeScript; adjust the pin if not.
  - Update `.kiro/steering/tech.md` Commands with `build`, `typecheck`, `lint`, `test`.
  - Done when `build`, `typecheck`, `lint`, `test` all pass on an empty test suite, and a test that calls `spawn` fails.
  - _Requirements: 1.1–1.5_

- [x] 2. Errors and core types
  - `src/errors.ts` (`BonesmithError`, full `ErrorCode` union), `src/types.ts`, `src/paths.ts`.
  - Unit test: message/fix/code fields.
  - _Requirements: 2.1_

- [x] 3. Axis registry
  - `templates/axes.json` (design §4), `src/axes.ts` with zod validation and folder-based options.
  - Fixture trees under `test/fixtures/`.
  - Unit tests: valid load, missing default, unknown axis in `promptOrder`/`renderOrder`.
  - _Requirements: 3.1–3.4_

- [x] 4. Layer schema and loader
  - `layerSchema(axes)` factory with all fields (design §5), exact-version regex, MCP union, patch xor, `.strict()` objects.
  - `loadLayers(root, axes)` collecting dirs, variant dirs and agent names; zod issue → `LAYER_INVALID` with path + field.
  - `emitJsonSchema` + `schema` script writing `templates/layer.schema.json`.
  - Unit tests: valid/invalid per field, version rejections, MCP shapes, error text.
  - _Requirements: 4.1–4.10_

- [x] 5. Resolver
  - `resolve()` steps 1–8 and `compatibleOptions()` (design §7). No `if` on option names.
  - Unit tests listed in design §8 for resolve.
  - _Requirements: 5.1–5.11, 2.2_

- [x] 6. Checkpoint
  - `build`, `typecheck`, `lint`, `test` green. Grep `src/` for option names (`library`, `mui`, `tailwind`, `vite-plus`, ...) returns nothing.
