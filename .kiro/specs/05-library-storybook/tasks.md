# Tasks: 05 Library type + Storybook

Prerequisites: 01–04 complete, with the app snapshots frozen. Use the `layer-author` agent for layer work.

- [x] 1. Compatibility spike (gate)
  - Throwaway dir outside the repo, both toolchains, Storybook + `addon-vitest` + `addon-mcp`, stories as tests; check CSS output per styling.
  - Record pins in `templates/PINS.md` and a pass/fail table per toolchain; confirm the `storybookTest` / browser-provider import paths under `vp` and plain `vitest`.
  - Record the peer-range decision (design §5) after asking the user; if ranges are approved, update the 01 schema (`peerDependencies` range form) and the lint check in 06.
  - **Stop and ask** if `addon-vitest` fails under `vp test`. Delete the dir.
  - _Requirements: 1.1–1.5, 5.6_

- [x] 2. `type/library`
  - `disablesAxes`, `includes`, `packageJson`, `nextSteps`, `src/index.ts` (with `index-exports`), accessible Button + test, `library.md`, `library-expert`, `library` sections, `feature-builder` append.
  - `base` variants `library`, `vp-library`, `vite-library`.
  - _Requirements: 2.1–2.6, 3.1–3.4, 6.1–6.4_

- [x] 3. `addons/storybook`
  - Files from design §4, pinned deps, scripts, `postInstall`, MCP entry, `vite-test-projects` patch, `storybook.md`, `storybook-expert`, `tech.md` `storybook` section.
  - _Requirements: 4.1–4.6, 6.2, 6.5_

- [x] 4. Styling and UI library variants
  - `styling/{tailwind,css-modules}`: CSS export + preview import. `styling/css-in-js`: peers. `ui/{mui,mantine}`: peers + decorator. `ui/shadcn`: `index-exports`.
  - Toolchain `library` variants for the `library` section wording.
  - _Requirements: 5.1–5.5_

- [x] 5. Tests
  - `test/snapshot/library.test.ts` (14 combinations), resolve tests on the real templates, app snapshots unchanged.
  - _Requirements: 6.6, 7.1–7.3_

- [x] 6. Real run
  - `create-bonesmith my-lib --type library --yes` plus one `--toolchain vite --ui mui --styling css-modules` library, in a tmp dir; build, lint, test (incl. Storybook browser tests), `build-storybook`, and `dist/index.d.ts` / `dist/*.css` exist. Delete the dirs.
  - Mark the source plan's tasks 1, 6, 7, 8, 11 as covered by this spec.
  - _Requirements: 7.4_

## Notes

### Task 1 spike (2026-10-25, pnpm 12.15.0, Node 24.22.1, throwaway dirs deleted)

| Check | vite-plus (`vp pack`) | vite (`vite build` lib + `vite-plugin-dts`) |
|---|---|---|
| install | pass with pnpm build-script setting (see A) | pass with pnpm build-script setting (see A) |
| `build` → `dist/index.js`, `dist/index.d.ts` | pass, needs `platform: "neutral"` (default emits `.mjs` / `.d.mts`) | pass |
| ESM only, `react/jsx-runtime` external | pass | pass (externals from `peerDependencies`) |
| CSS Modules → `dist/styles.css` | pass (`pack.css.fileName: "styles.css"`) | pass (`build.lib.cssFileName: "styles"`) |
| Tailwind → `dist/styles.css` | pass only via `@tailwindcss/cli` in `pack.onSuccess` (`vp pack` ignores Vite plugins; its PostCSS path needs `postcss-import` / `postcss-modules`) | pass (`@tailwindcss/vite`) |
| CSS-in-JS emits no stylesheet | nothing imports CSS, so no file is emitted (confirm in real run) | same |
| `test`: unit (jsdom) + storybook (Chromium) projects | pass (2/2), `vp test run` | pass (2/2), `vitest run` |
| `lint` | pass (`vp lint`, needs `.gitignore` so `node_modules` is skipped) | not run in spike (ESLint config same as apps) |
| `build-storybook` | pass | pass |
| addon-mcp `initialize` on `:6006/mcp` | pass | – |

Import paths: `storybookTest` from `@storybook/addon-vitest/vitest-plugin` (both); browser provider from `vite-plus/test/browser-playwright` (vite-plus) vs `@vitest/browser-playwright` (vite), so the storybook test project needs toolchain variants.

Open decisions (asked 2026-10-25):
- A. pnpm 12 fails `pnpm install` with `ERR_PNPM_IGNORED_BUILDS` (`esbuild` via Storybook, `@parcel/watcher` via `@tailwindcss/cli`). **Decided:** new layer field `buildScripts`, written by render as pnpm `allowBuilds` (core change in `layers.ts` / `render.ts`, with unit tests).
- B. Peer ranges (design §5). **Decided:** `^<major>.<minor>.0` peers with exact devDependency pins; 01 schema updated, render checks the pin satisfies the range.

### Real runs (2026-10-25, all exit 0: build, lint, test incl. Storybook browser tests; `build-storybook` checked on the first two)
- `my-lib --type library --yes` (vite-plus, tailwind, ui none, pnpm): `dist/index.js`, `index.d.ts`, `styles.css`; 5 tests
- `--type library --toolchain vite --ui mui --styling css-modules --pm npm`: MUI external, `styles.css`; 8 tests
- `--type library --toolchain vite-plus --ui mantine --styling css-in-js --pm yarn`: no stylesheet, no `./styles.css` export; 8 tests
- `--type library --toolchain vite --ui shadcn --styling tailwind --pm bun`: 7 tests

Found during real runs and fixed in templates: `@vitest/browser-playwright` must be installed for both toolchains (vite-plus only re-exports it); the library `tsconfig.json` includes `.storybook/**/*` (tsgolint skips a bare dot-dir include); `private: true` moved to base's `app` variant so libraries can publish.

Source plan `docs/superpowers/plans/2026-10-23-library-type-storybook.md`: tasks 1, 6, 7, 8, 11 covered by this spec.
