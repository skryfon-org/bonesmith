# Tasks: 06 Quality and release

Prerequisites: 01–05 complete.

- [x] 1. Template lint
  - `src/template-lint.ts` (design §1); optional applied-patch collector in `renderFiles`; `test/lint/templates.test.ts`; fixture `templates-bad-anchor`; script `lint:templates`.
  - Peer-range check if approved in 05.
  - _Requirements: 1.1–1.6_

- [x] 2. Matrix
  - `test/matrix/{combinations,coverage.test,matrix.test}.ts`, `matrix` Vitest project, script `test:matrix`.
  - Run 2 app and 2 library combinations locally and record the results.
  - _Requirements: 2.1–2.6_

- [x] 3. CI workflows
  - `ci.yml`, `matrix.yml` (reusable, sharded, caches, pinned PM versions, actions pinned by SHA).
  - _Requirements: 3.1–3.3_

- [x] 4. Release
  - `release.yml` (tag, calls matrix, version check, pack file-list check, `npm publish --provenance`).
  - `README.md` with the generated flags block + sync test; `LICENSE`.
  - _Requirements: 4.1–4.4_

- [x] 5. Final alignment
  - `.kiro/steering/tech.md` commands; mark the spec's open items in §9 as resolved or still open.
  - Dry-run the release workflow (`npm pack --dry-run`) without publishing; publishing needs your go-ahead.
  - _Requirements: 4.5_

## Results (2026-10-25)

Template lint: 168 combinations enumerated (144 app, 24 library), every accepted one rendered for all 4 package managers, 0 problems, ~0.6 s.

Matrix, run locally on macOS (Node 24.22.1, pnpm 12.15.0, yarn 4.18.1, bun 1.4.4, npm 11.19.1). All 14 green:

| Combo | PM | Result | Time |
|---|---|---|---|
| app-vp-shadcn | pnpm | pass | 15 s |
| app-vite-mui | npm | pass | 84 s |
| app-vp-mantine | yarn | pass | 15 s |
| app-vite-tailwind | bun | pass | 10 s |
| app-vite-mantine-cssinjs | pnpm | pass | 19 s |
| app-vp-rtk-cssinjs | npm | pass | 47 s |
| app-vite-shadcn | yarn | pass | 27 s |
| app-vp-mui | bun | pass | 24 s |
| lib-vp-shadcn | pnpm | pass | 15 s |
| lib-vite-tailwind | npm | pass | 107 s |
| lib-vp-mui | yarn | pass (after fix below) | 24 s |
| lib-vite-mantine | bun | pass | 38 s |
| lib-vp-cssinjs | pnpm | pass | 13 s |
| lib-vite-cssinjs | npm | pass | 21 s |

Found and fixed: Yarn 4 turns on immutable installs when `CI` is set and refuses to create `yarn.lock` (YN0028). `src/pm.ts` now runs `yarn install --no-immutable`; 03 design table updated.

CI workflows linted with actionlint 1.7.12 (0 issues). Not yet run on GitHub.
