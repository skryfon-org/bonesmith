# Requirements: 05 Library type + Storybook

Part 5 of 6. Order: 01 core-foundation → 02 render-engine → 03 cli-install → 04 app-templates → **05 library-storybook** → 06 quality-release.
Depends on: 01–04. Source plan: `docs/superpowers/plans/2026-10-23-library-type-storybook.md` (this spec replaces its tasks 1, 6, 7, 8, 11; its engine tasks 3–5, 9, 10 are covered by 01–03).

## Introduction

Adds the `type/library` layer, the `addons/storybook` layer, and library-mode variants in `base`, toolchains, styling and UI. The output is a publishable ESM React component package with Storybook, whose stories run as Vitest browser tests. App output must not change. No core code changes are expected; if one turns out to be needed, stop and raise it.

## Requirement 1: Compatibility spike (gate)

#### Acceptance criteria
1. THE maintainer SHALL build a minimal library by hand in a throwaway dir outside the repo under both toolchains (`vp pack` with dts; `vite build` lib mode + `vite-plugin-dts`), with Storybook react-vite, `@storybook/addon-vitest` and `@storybook/addon-mcp`, and run the stories as tests.
2. THE maintainer SHALL record exact versions for `storybook`, `@storybook/react-vite`, `@storybook/addon-vitest`, `@storybook/addon-mcp`, `@vitest/browser-playwright`, `playwright`, `vite-plugin-dts` in `templates/PINS.md`.
3. THE maintainer SHALL confirm the CSS output and `./styles.css` export for Tailwind and CSS Modules, and that CSS-in-JS emits no stylesheet.
4. IF `@storybook/addon-vitest` doesn't run under `vp test` THEN work SHALL stop and the user SHALL decide, because a library + vite-plus conflict would contradict the strict vite-plus default.
5. THE results SHALL be a pass/fail table per toolchain in the task notes, and the throwaway dir SHALL be deleted.

## Requirement 2: `type/library` layer

#### Acceptance criteria
1. THE layer SHALL declare `disablesAxes: ["routing", "state"]` and `includes: ["addons/storybook"]`.
2. THE generated `package.json` SHALL have `type: "module"`, `exports["."]` with `types` and `import`, `files: ["dist"]`, `sideEffects: ["**/*.css"]`, and scripts `build`, `test`, `lint`, `storybook`, `build-storybook`.
3. THE layer SHALL provide `src/index.ts` (anchor `index-exports`, so `ui/shadcn` can export its components) and `src/components/Button/{Button.tsx, Button.test.tsx}`; the Button SHALL be accessible and its tests SHALL query by role or label.
4. THE output SHALL NOT contain `index.html`, `main.tsx`, `App.tsx`, a router or a store.
5. THE `base` layer SHALL put `react` and `react-dom` in `peerDependencies` and `devDependencies` under `when: { type: "library" }`.
6. THE layer SHALL set `nextSteps` to `{{pmRun}} storybook`.

## Requirement 3: Library build per toolchain

#### Acceptance criteria
1. WHERE the toolchain is `vite-plus` THE `base` variant `vp-library` (`when: { type: "library", toolchain: "vite-plus" }`) SHALL patch a `pack` block (`dts: true`, `format: ['esm']`, `sourcemap: true`) into `vite-config` and set `build` to `vp pack`.
2. WHERE the toolchain is `vite` THE `base` variant `vite-library` SHALL patch `build.lib` (ESM only), externals read from `package.json` `peerDependencies` (and their subpaths) at config time, and `vite-plugin-dts`, and set `build`.
3. AFTER `build` THE `dist/index.js` and `dist/index.d.ts` SHALL exist.
4. THE library build SHALL produce ESM only.

## Requirement 4: `addons/storybook` layer

#### Acceptance criteria
1. THE layer SHALL pin the versions from Req 1.2 and provide `.storybook/main.ts` (framework `@storybook/react-vite`, addons `@storybook/addon-vitest` and `@storybook/addon-mcp`), `.storybook/preview.tsx` (anchors `storybook-imports`, `storybook-decorators`), `.storybook/vitest.setup.ts`, and `Button.stories.tsx` with a `play` function.
2. THE Vitest config SHALL get a `storybook` browser project (`storybookTest({ configDir: ".storybook" })`, Playwright Chromium, `setupFiles: [".storybook/vitest.setup.ts"]`) patched into `vite-test-projects` next to the `unit` project, with `toolchain` variants only if the spike shows the import paths differ.
3. THE `test` script SHALL run both projects once, using the toolchain's one-shot test command (04 design §2).
4. THE layer SHALL add scripts `storybook` and `build-storybook`, and `postInstall: [["playwright", "install", "chromium"]]`.
5. THE layer SHALL declare MCP server `storybook`: `{ url: "http://localhost:6006/mcp", provider: "@storybook/addon-mcp", script: "storybook" }`.
6. THE layer SHALL never be prompted; it SHALL apply only through `includes`.

## Requirement 5: Styling and UI in library mode

#### Acceptance criteria
1. `styling/tailwind` and `styling/css-modules` SHALL, under `when: { type: "library" }`, patch the preview stylesheet import, make the build emit CSS into `dist/`, and add `exports["./styles.css"]`.
2. `styling/css-in-js` SHALL, under `when: { type: "library" }`, move `styled-components` to `peerDependencies` + `devDependencies` and add no `./styles.css` export.
3. `ui/mui` and `ui/mantine` SHALL, under `when: { type: "library" }`, list their packages (and MUI's emotion peers) as `peerDependencies` + `devDependencies` instead of `dependencies`, and patch the provider into `storybook-decorators`.
4. `ui/shadcn` SHALL, under `when: { type: "library" }`, keep its components in `src/components/ui`, export them from `src/index.ts` via `index-exports`, and keep its helper packages in `dependencies`.
5. 05 SHALL add only `library` variants; app-mode placement already sits in `app` variants (04 Req 2.7), so app output is unchanged.
6. IF the peer-range decision (design §5) is approved THEN `peerDependencies` SHALL use `^<major>.<minor>.0` ranges satisfied by the exact devDependency pins; otherwise they SHALL equal the exact pins.

## Requirement 6: Library `.kiro` content

#### Acceptance criteria
1. THE output SHALL contain `library.md` (`fileMatchPattern: ["src/**", "package.json"]`: public API via `src/index.ts`, peer deps, no app-only code, semver and changelog) and `storybook.md` (`fileMatchPattern: ["**/*.stories.tsx", ".storybook/**"]`).
2. THE output SHALL contain `library-expert` (`writes`: `src/index.ts`, `package.json`, `vite.config.ts`) and `storybook-expert` (`writes`: `**/*.stories.tsx`, `.storybook/**`; `mcpServers: ["storybook"]`), each listing its own steering file and `structure.md` in `resources`.
3. THE layers SHALL add the `library` and `storybook` sections to `tech.md` / `structure.md` (layout; pack and Storybook commands from the toolchain).
4. THE `feature-builder` append SHALL say a new component means component + story + test + export from `src/index.ts`.
5. `tech.md` SHALL list the storybook server as "requires `{{pmRun}} storybook` running".
6. Library output SHALL NOT contain `routing.md`, `state.md`, `routing-expert` or `state-expert`; app output SHALL contain no library or Storybook content.

## Requirement 7: Tests

#### Acceptance criteria
1. THE app file-list and content snapshots (`app-file-lists.snap`, `app-contents.snap` from 04) SHALL pass unchanged.
2. THE snapshot suite SHALL render every library combination (2 toolchains × 7 valid styling × UI pairs = 14) and check: exports and peers present; `./styles.css` only for Tailwind and CSS Modules; no `index.html` / `main.tsx`; preview anchors patched and none left over; scripts present; the `.kiro` checks from 04 with the library agent and steering sets; `mcp.json` = storybook + the UI server, if any.
3. THE resolve unit tests on the real templates SHALL include: `--type library --routing ...` and `--state ...` rejected; library set excludes routing/state and includes `addons/storybook`; the existing conflict pairs hold in library mode.
4. THE maintainer SHALL run `create-bonesmith my-lib --type library --yes` for real and record build, lint, test (incl. Storybook browser tests) and `build-storybook` passing.
