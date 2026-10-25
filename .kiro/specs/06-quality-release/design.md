# Design: 06 Quality and release

## 1. Template lint (`src/template-lint.ts`)

```ts
interface Problem { combo: string; code: ErrorCode | "OPTION_UNREACHABLE" | "VARIANT_UNUSED" | "PATCH_UNUSED" | "PEER_RANGE"; message: string }
lintTemplates(root: string, opts?: { nodeVersion?: string }): Problem[]
```
- Enumeration: the cartesian product over `axes.promptOrder` options is 2 × 2 × 2 × 3 × 4 × 3 = 288 raw combinations. Library combinations collapse to one per toolchain × UI × styling, because routing/state are disabled. For each, build `Choices` with routing/state left out when the type disables them (so library combinations aren't rejected with `AXIS_DISABLED`). `resolve`; `REQUIRES_UNMET` / `CONFLICT` are expected and skipped; any other error is a problem. Then `renderFiles` with fixed `RenderVars` (pm `npm`), collecting its error.
- Engines: run with `nodeVersion` = the minimum Node in `package.json` engines, so engine ranges are checked against what we support.
- Coverage tracking: sets of (layer, option) seen in an accepted combination, variant names selected, patches applied (render reports applied patch ids via an optional collector arg added to `renderFiles`). Anything never hit → problem.
- Package-manager differences only add `extraFiles`; one extra pass per PM over a single combo checks they don't collide.
- Runtime: in-memory, ~300 renders; target < 10 s. Layers are loaded once and file reads cached.
- Test: `test/lint/templates.test.ts` asserts `lintTemplates(realRoot)` is `[]`, and `lintTemplates(fixtures/templates-bad-anchor)` contains `ANCHOR_MISSING`. Script `lint:templates` runs only this project.

## 2. Matrix (`test/matrix/`)

```
test/matrix/
  combinations.ts       # export const combos: Combo[]  (id, flags, pm)
  coverage.test.ts      # unit project: coverage rules over combos + template folders
  matrix.test.ts        # matrix project: one test per combo (filter via MATRIX_COMBO env)
```
- Starting list (finalised in task 2, then fixed):
  - Likely real stacks: vite-plus + react-router + zustand + shadcn/tailwind (pnpm); vite + tanstack-router + redux-toolkit + mui/css-modules (npm); vite-plus + tanstack-router + none + mantine/css-modules (yarn); vite + react-router + zustand + none/tailwind (bun).
  - Pairwise fill for remaining app pairs (state none + css-in-js, etc.).
  - Library: (vite-plus, tailwind, shadcn), (vite, tailwind, none), (vite-plus, css-modules, mui), (vite, css-modules, mantine), (vite-plus, css-in-js, none), (vite, css-in-js, none). That covers every styling and UI option in library mode, both toolchains, with PMs rotating.
- `matrix.test.ts`: `mkdtemp`, run `node dist/index.js <id> --yes ...flags --pm <pm>` with `cwd` = temp, `stdio` captured to a log file, timeout 15 min; assert exit 0; for libraries run `<pm> run build-storybook` and check `dist/` files. Logs uploaded as CI artifacts on failure. Temp dir removed in `afterEach`.
- `vitest.config.ts` gets a `matrix` project excluded from `test`; script `test:matrix` = `vitest run --project matrix`.

## 3. CI (`.github/workflows/`)

- `ci.yml` (push, PR): Node `24.x` and `26.x` (the scaffolder requires `>=24.11.0`, 01). Steps: checkout, setup-node (npm cache), `npm ci`, `npm run build`, `typecheck`, `lint`, `test`.
- `matrix.yml` (PR paths `src/**`, `templates/**`; tags `v*`; manual dispatch): job 1 builds and lists combo ids as JSON output; job 2 fans out `strategy.matrix.combo` with `fail-fast: false`, sets up pnpm / yarn (corepack) / bun at pinned versions, caches `~/.cache/ms-playwright`, pnpm store, yarn cache, bun cache; runs `MATRIX_COMBO=<id> npm run test:matrix`.
- All third-party actions pinned by commit SHA.

## 4. Release (`release.yml`)

- Trigger: tag `v*`. `release.yml` calls `matrix.yml` as a reusable workflow (`workflow_call`) and the publish job `needs` it, so a release can't happen without a green matrix for that commit.
- Steps: `npm ci`, `build`, version check (tag == `package.json` version), `npm pack --dry-run --json` file-list check, `npm publish --provenance --access public` with `id-token: write` and `NODE_AUTH_TOKEN` from secrets.
- `files` in `package.json` already limits the tarball (01); `PINS.md` and `layer.schema.json` under `templates/` are included and harmless.

## 5. README

Usage (`npm create bonesmith@latest my-app`), flags table generated from `axes.json` + PM flag (a small script `scripts/readme-flags.ts` keeps it in sync; a unit test checks the README block matches), options table, unsupported combinations, library mode notes, `.kiro` output overview, Node requirement.
