# Plan: Component library project type + Storybook

Date: 2026-10-23
Status: Approved. Implementation is tracked in `.kiro/specs/01-core-foundation` … `06-quality-release`: engine tasks 3–5, 9, 10 are in specs 01–03; layer tasks 1, 6, 7, 8, 11 in 05; task 12 in 06.
Spec: `docs/superpowers/specs/2026-10-14-bonesmith-scaffolder-design.md` (sections 2, 3, 4, 4a, 5, 5a, 7 amended for this plan)

## Problem

Bonesmith only generates client-side apps. Add a project type choice (`app` | `library`). `library` generates a publishable React component package with Storybook. Everything stays inside the layer model: no `if (type === 'library')` in core code.

The repo has no core code yet. Tasks 3–10 extend core modules; if those modules don't exist when this plan is picked up, fold each task into the core build of that module. Moving the app shell out of `base/` (task 5/6) is cheapest before core's `base/` is written.

## Decisions (user-confirmed)

| Question | Decision |
|---|---|
| Storybook | Library only, always on. Not offered for apps. |
| Routing / state in library mode | Skipped. Not prompted, no layers applied. Flags for them are an error. |
| UI library / styling in library mode | React, react-dom and MUI/Mantine become `peerDependencies` (also devDeps). shadcn components are copied into the package; their helper deps stay `dependencies`. Styling stays as chosen; CSS is bundled and exported as `./styles.css`. |
| Library build | Native per toolchain: `vp pack` (vite-plus), `vite build` lib mode + `vite-plugin-dts` (vite). ESM only. |
| Storybook testing | Stories plus `@storybook/addon-vitest`; stories run as tests in the normal `test` script. |
| Kiro output | `library.md`, `storybook.md` steering; `library-expert`, `storybook-expert` agents; Storybook MCP (`@storybook/addon-mcp`). |

App output must stay unchanged.

## Background (researched 2026-10-23, re-verify in task 1)

- `vp pack` builds libraries with tsdown, configured in a `pack` block in `vite.config.ts` (`dts`, `format`, `sourcemap`). CSS and CSS Modules bundling is built in. tsdown externalizes `dependencies` and `peerDependencies` by default.
- Vite lib mode needs `build.rollupOptions.external`; the config reads peer deps from `package.json`, so no anchor is needed.
- Storybook stable is 10.6.x. `@storybook/addon-vitest` needs a Vite framework (`@storybook/react-vite`) and Vitest ≥ 3. It runs stories in Vitest browser mode via `@vitest/browser-playwright` + Chromium, as a separate Vitest `projects` entry named `storybook` (`storybookTest({ configDir })`, `setupFiles: ['./.storybook/vitest.setup.ts']`). Chromium must be installed after package install.
- `@storybook/addon-mcp` (official, storybookjs, preview) serves MCP over HTTP at `http://localhost:6006/mcp` only while Storybook runs. Kiro `mcp.json` supports `{ "url": ... }` entries (HTTP allowed for localhost). The version is pinned through the devDependency.
- Risk: Vite+ bundles its own Vitest (docs mention Vitest 5). `addon-vitest` under `vp test` is unverified. If it fails in task 1, stop and ask: a library + vite-plus conflict would contradict the strict vite-plus default.

## Model changes (generic, data-driven)

1. Type axis: `templates/type/{app,library}/`. The app shell (`index.html`, `main.tsx`, `App.tsx`, routes folder) moves from `base/` to `type/app/`. `base/` keeps tsconfig, Vitest + RTL setup, `src/`.
2. `disablesAxes` in `layer.json`: `type/library` declares `["routing", "state"]`. CLI skips those prompts, resolve rejects flags for them, `Choices.routing` / `Choices.state` are optional.
3. `includes` in `layer.json`: `type/library` declares `["addons/storybook"]`. Unknown references and cycles are errors.
4. `variants: [{ when: { type: "library" }, ... }]`: conditional additions (deps, devDeps, peerDeps, scripts, a files dir such as `files@library/`, patches, steering snippets, agent appends). Generalizes the per-combination overrides.
5. Anchors may live in the foundation (`base` or `type/*`). Render runs two phases: collect all files (duplicate-path detection), then apply all patches. Template lint checks each patch's anchor exists for every `type` value its `when` allows. `.storybook/preview.tsx` carries `// bonesmith:storybook-imports` and `// bonesmith:storybook-decorators`.
6. `postInstall: [["playwright", "install", "chromium"]]`. `install` runs these through the package manager's local exec (`pnpm exec`, `npx --no`, `yarn`, `bunx --no-install`), never unpinned, after install and before the initial commit. Failure is reported with the exact re-run command; the project is kept.
7. MCP entries are a union: `{ command, args }` or `{ url, provider }`. A `url` entry must name a pinned devDependency as `provider` (lint-checked). `tech.md` marks url servers "requires `storybook` running".
8. Render order: base → type → toolchain → addons → routing → state → styling → ui. Disabled axes are skipped.

## Generated library project

- `package.json`: `type: module`, `exports` (`.` with `types` + `import`, `./styles.css`), `files: ["dist"]`, `sideEffects: ["**/*.css"]`, `peerDependencies`. Scripts `build`, `test`, `storybook`, `build-storybook`.
- `src/index.ts`; `src/components/Button/{Button.tsx, Button.stories.tsx, Button.test.tsx}` (accessible; tests query by role/label).
- `.storybook/{main.ts, preview.tsx, vitest.setup.ts}`.
- Vitest `storybook` browser project alongside the unit project.
- No `index.html`, router or store.

## Tasks

### 1. Compatibility spike + version pins
*Covered by `.kiro/specs/05-library-storybook` (done 2026-10-25).*
In a throwaway dir outside the repo, hand-build a minimal library under both toolchains (`vp pack` with dts; `vite build` lib + `vite-plugin-dts`). Add Storybook react-vite, addon-vitest, addon-mcp; run stories as tests (`vp test` / `vitest`). Record exact versions (`npm view`) for `storybook`, `@storybook/react-vite`, `@storybook/addon-vitest`, `@storybook/addon-mcp`, `@vitest/browser-playwright`, `playwright`, `vite-plugin-dts`. Confirm CSS export for Tailwind, CSS Modules, CSS-in-JS. Delete the dir.
Demo: findings note with pins and a pass/fail table per toolchain. Stop and ask if vite-plus + addon-vitest fails.

### 2. Spec + steering amendment
Spec sections 2–5a and 7; `product.md`, `structure.md`, `templates.md`, `kiro-output.md`, `testing.md`; `tech.md` if anything changes.
Demo: diff review. (Done 2026-10-23.)

### 3. `layers.ts` schema extensions
*Covered by specs 01–03.*
`disablesAxes`, `includes`, `variants[].when`, `peerDependencies`, `postInstall` (argv arrays), MCP union. No `any`.
Tests: valid/malformed per field with readable errors; url MCP without a pinned provider rejected.

### 4. `resolve.ts`
*Covered by specs 01–03.*
Expand includes (cycle/unknown errors); apply `disablesAxes` (e.g. "`--routing` isn't used with `--type library`; remove it"); select variants by `when`; run requires/conflicts on the expanded set; routing/state optional in `Choices`.
Tests: library + routing flag errors; library layer set excludes routing/state and includes `addons/storybook`; variant selection; include cycle; existing conflict pairs hold in library mode.

### 5. `render.ts`
*Covered by specs 01–03.*
Two-phase files-then-patches; variant file dirs; `peerDependencies` deep merge; anchor lookup across the merged set (missing/duplicate → error); app shell moves base → `type/app`.
Tests: variant override, missing preview anchor, peer merge. Snapshot regression: existing app combination file list unchanged.

### 6. `type/app`, `type/library` layers + base/toolchain variants
*Covered by `.kiro/specs/05-library-storybook` (done 2026-10-25).*
Library: `disablesAxes`, `includes`, `src/index.ts`, accessible Button + test, package.json fields, base variant moving react/react-dom to peer + dev. vite-plus variant: `pack` block (`dts`, `format: ['esm']`, `sourcemap`), `build` = `vp pack`. vite variant: lib config with externals from `peerDependencies` + `vite-plugin-dts`.
Tests: snapshot per toolchain (exports/peers present, no `index.html` / `main.tsx`).

### 7. `addons/storybook` layer
*Covered by `.kiro/specs/05-library-storybook` (done 2026-10-25).*
Pinned deps from task 1; `.storybook/main.ts` (addon-vitest, addon-mcp); `preview.tsx` with both anchors; `vitest.setup.ts`; `Button.stories.tsx` with a `play` function; Vitest storybook project (toolchain variant if vite-plus import paths differ); scripts `storybook`, `build-storybook`; `postInstall` Chromium install.
Tests: snapshot (files present, anchors patched, no leftover anchors, scripts present).

### 8. Styling / UI library variants
*Covered by `.kiro/specs/05-library-storybook` (done 2026-10-25).*
`styling/*`: preview stylesheet import, `./styles.css` export and CSS build output. `ui/mui`, `ui/mantine`: peer deps + provider decorator in preview. `ui/shadcn`: components in `src/components/ui`, helper deps regular, Tailwind CSS exported.
Tests: snapshot for every valid styling × UI combination in library mode.

### 9. `install.ts` postInstall
*Covered by specs 01–03.*
argv → package-manager local exec mapping; run after install, before the initial commit; report failure with the exact command; keep the project.
Tests: injected process runner (no real processes): mapping per package manager, failure message.

### 10. `cli.ts`
*Covered by specs 01–03.*
`type` prompt first + `--type`; skip prompts for disabled axes (manifest-driven); `--yes` → `app`; UI → styling filter still applies.
Tests: mocked prompts; library skips routing/state; `--type library --state zustand` errors.
Demo: `create-bonesmith my-lib --type library --yes` renders end to end.

### 11. Library `.kiro` content
*Covered by `.kiro/specs/05-library-storybook` (done 2026-10-25).*
- `library.md` (fileMatch `src/**`, `package.json`): public API via `index.ts`, peer deps, no app-only code, semver/changelog.
- `storybook.md` (fileMatch `**/*.stories.tsx`, `.storybook/**`).
- `library-expert` (writes only `src/index.ts`, `package.json`, build config); `storybook-expert` (writes only stories + `.storybook/**`, `mcpServers: storybook`). Both list own steering + `structure.md` in `resources`.
- `structure.md` / `tech.md` snippets: library layout, pack/storybook commands from the toolchain layer, MCP list with the "requires storybook running" note.
- `feature-builder` append: component + story + test + export.
- `mcp.json` url entry.
Tests: valid front matter; agent JSON parses; library combos lack `routing.md`, `state.md`, `routing-expert`, `state-expert`; `storybook-expert` present; `mcp.json` has exactly storybook + the UI server; `tech.md` lists both; app combos have no library/storybook content.

### 12. Template lint + matrix
Lint: new schema fields, anchor-per-`when`, includes refs, url MCP ↔ provider pairing; fails on a bad-anchor fixture. Matrix: library combos so every styling and UI option appears in library mode at least once, both toolchains, package managers rotating. Library verify: build, test (incl. Storybook browser tests), `build-storybook`, `dist/index.d.ts` and `dist/*.css` exist. Cache Playwright browsers in CI.
Demo: local matrix run of 2 library combos green.

## Conventions
TypeScript strict, no `any`. Versions pinned exactly in `layer.json` only (no `^`/`~`/`latest`, no unpinned `npx -y`). Fail loudly with errors that name the fixing flag/action. Unit and snapshot tests never hit the network or run a package manager. A "none" option contributes nothing.
