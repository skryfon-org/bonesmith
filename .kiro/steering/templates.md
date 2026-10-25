---
inclusion: fileMatch
fileMatchPattern: "templates/**"
---

# Authoring layers (`templates/`)

## Layer kinds
- Foundation: `base/`, `type/{app,library}/`, `addons/*`. Only these may hold anchors.
- `addons/*` are never prompted; they are applied only through another layer's `includes`.
- Render order: base → type → toolchain → addons → routing → state → styling → ui. Disabled axes are skipped.

## layer.json
- `dependencies`, `devDependencies` (exact pins), `peerDependencies` (exact, or `^<major>.<minor>.0` with a satisfying exact devDependency pin), `scripts`.
- `buildScripts`: `{ <pkg>: true | false }` for dependencies with install scripts (pnpm `allowBuilds`). Prefer `false` when the package works without its script.
- `requires`, `conflicts`.
- `disablesAxes`: axes not used with this layer (`type/library`: `["routing", "state"]`). Prompts skipped, flags rejected.
- `includes`: layers pulled in (`type/library`: `["addons/storybook"]`). Unknown refs and cycles are errors.
- `variants: [{ when: { <axis>: <option> }, ... }]`: conditional deps, devDeps, peerDeps, scripts, files dir (`files@<name>/`), patches, steering snippets, agent appends. Use these instead of per-combination overrides (e.g. Tailwind setup by toolchain, `react` as peer in library mode).
- `postInstall`: argv arrays, e.g. `[["playwright", "install", "chromium"]]`. The binary must come from a pinned dependency in the resolved set; it runs via the package manager's local exec, never a download.
- Contributed agents, optional `mcpServers` (`{ command, args }` or `{ url, provider }`; see `kiro-output.md`).

## Merge rules
- `package.json`: deep merge, additive only. Nothing can remove a key, and two layers setting different values at the same path is an error. Put type-dependent placement (e.g. `react` in `dependencies` vs `peerDependencies` + `devDependencies`, toolchain `dev`/`build` scripts) in `when: { type }` variants from the start. Layers never ship `files/package.json`.
- Package-manager overrides: declare `packageJson.overrides` (exact versions or `npm:<pkg>@<exact>` only; never `resolutions` or `pnpm`). Render writes them to `package.json` `overrides` (npm, bun), `resolutions` (yarn) or `pnpm-workspace.yaml` (pnpm). Used by `toolchain/vite-plus` to alias `vite` and pin `vitest`.
- Other files: added as-is, or patched at named anchors (e.g. `// bonesmith:imports`) in foundation files: `src/main.tsx` (`imports`, `providers-open`, `providers-close`), `src/App.tsx` (`app-imports`, `app-body`), `vite.config.ts` (owned by `base` via toolchain variants: `vite-imports`, `vite-plugins`, `vite-config`, `vite-test-projects`), `src/index.ts` (`index-exports`), `.storybook/preview.tsx` (`storybook-imports`, `storybook-decorators`), steering frames (`sections`).
- Patches insert above the anchor (`position: "before"`, default; stacks in render order) or directly below it (`position: "after"`; stacks in reverse, for closing tags). Anchor lines are removed after all patches.
- Render collects all files first, then applies patches, so a patch can target any foundation file.
- Two layers writing the same plain file is an error in render's collect phase unless one declares an explicit override. A selected variant's `files@<name>/` replaces the same path in its own layer's `files/`; two selected variants of one layer writing one path is an error.
- Missing or duplicate anchor = error.
- New anchors go in foundation layers only, and must be covered by template lint for every `type` value the patch's `when` allows.

## Rules for a new option
- One folder under its axis. If it needs core code changes, stop and flag it; the layer model should cover it.
- Declare `requires` / `conflicts` for every incompatible option, and add the matching `resolve` unit tests.
- Add it to at least one matrix combination per project type it supports.
- A "none" option contributes no files, no steering, no agents and no MCP entry.
- Check library mode too: does the option need peer deps, a Storybook preview decorator or stylesheet import, or a `./styles.css` export? Express it as a `when: { type: "library" }` variant.

## Generated project baseline
- `base/`: React 19+, TypeScript strict, Vitest + RTL, `src/`. No app shell.
- `type/app/`: `index.html`, `main.tsx`, `App.tsx`, routes folder. App output must not change because of the type axis.
- `type/library/`: ESM package (`exports`, `files: ["dist"]`, `sideEffects`, peers), `src/index.ts`, accessible Button + test; includes `addons/storybook`.
- Code in templates must build and lint under both toolchains unless the file lives in a toolchain layer or a toolchain variant.
