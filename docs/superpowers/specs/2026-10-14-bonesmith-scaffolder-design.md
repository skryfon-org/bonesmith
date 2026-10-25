# Bonesmith Scaffolder: Design

Date: 2026-10-14
Amended: 2026-10-23 (project type `app` | `library` + Storybook; plan `docs/superpowers/plans/2026-10-23-library-type-storybook.md`; sections 1, 2, 3, 4, 4a, 5, 5a, 7, 9). Also 2026-10-23: project-name prompt, `--yes` defaults, lint in Verify, `commander` (sections 3, 6, 9).
Status: Draft for review
Scope: Sub-project 1 of 3 (scaffolder core, plus the Kiro layer contract it must emit)

## 1. Purpose

A CLI (`npm create bonesmith`) that generates a ready-to-build React 19+ repo so a team can start on features without doing setup. The user picks a project type (client-side app or publishable component library), then routing, state management, styling, UI library, package manager and toolchain as the type allows. The tool produces the folder structure, config, installed dependencies, and Kiro steering rules and agents matched to that stack.

### Success criteria
- One command yields a project that installs, builds, lints and tests green for every supported combination.
- Adding a new option is one new folder under `templates/`, with no changes to core code.
- Generated `.kiro/` content matches the chosen stack exactly (no leftover files for unchosen options).

### Decomposition
| # | Sub-project | Status |
|---|---|---|
| 1 | Scaffolder core + layer model (this spec) | Specified here |
| 2 | Deeper stack-aware Kiro rules/agents content | Later; this spec defines only the contract and a v1 content set |
| 3 | Update agent | Later; maintainer-side only, edits `templates/` (pinned versions in `layer.json`, rule text). Never ships in the scaffolder and never touches generated projects |

## 2. v1 options

| Axis | Options |
|---|---|
| Type | `app` (default), `library` |
| Toolchain | `vite-plus` (default), `vite` |
| Routing | React Router (v7), TanStack Router (app only) |
| State | Zustand, Redux Toolkit, none (app only) |
| Styling | Tailwind, CSS Modules, CSS-in-JS |
| UI library | shadcn/ui, MUI, Mantine, none |
| Package manager | pnpm, npm, yarn, bun |

Fixed baseline in every project: React 19+, TypeScript (strict, no JS option), Vitest + React Testing Library, `git init` with an initial commit, `.kiro/` content.

Type behaviour:
- `app`: client-side React app (shell with `index.html`, `main.tsx`, `App.tsx`, routes). Output is unchanged by the introduction of the type axis.
- `library`: publishable ESM React component package with Storybook (always on, not offered for apps). Routing and state are not prompted and no layers are applied for them; passing their flags is an error. See section 4a.

Toolchain behaviour:
- `vite-plus`: Vite+ provides build, test, lint, format (`vp` commands). No separate ESLint or Prettier. Libraries build with `vp pack`.
- `vite`: plain Vite, Vitest, ESLint (flat config), Prettier. Libraries build with `vite build` in lib mode + `vite-plugin-dts`.
- Selection is **strict**. Default is `vite-plus`. If the Node version is unsupported (checked in resolve via `engines`) or Vite+ cannot be fetched from the registry (checked in install's preflight, before anything is created), the tool exits with a clear error telling the user to re-run with `--toolchain vite`. There is no automatic or prompted fallback.

Not in v1: CI workflow stub, plugin system for third-party layers, telemetry, self-update command, Ant Design/Chakra, Kiro specs/hooks, Storybook for apps, CJS library output.

## 3. CLI flow

`npm create bonesmith@latest my-app` (npm package name: `create-bonesmith`). Runs five steps in order:

1. **Collect choices.** If no project name is given, prompt for it first (interactive only; under `--yes` or without a TTY, exit with an error asking for a name). The name must be a valid npm package name. A target directory that exists and is not empty is an error; nothing is overwritten. Then prompts in order: type, toolchain, routing, state, UI library, styling, package manager. Each can be given as a flag, which skips its prompt. `--yes` uses defaults (type `app`, toolchain `vite-plus`, routing `react-router`, state `none`, styling `tailwind`, UI `none`, package manager detected from `npm_config_user_agent`, else `npm`) and never prompts. Prompts for axes disabled by the chosen type (`disablesAxes`, section 4) are skipped; which axes are skipped comes from the manifests, not from core code. UI library is asked before styling, and the styling options are filtered by the UI choice (shadcn leaves only Tailwind).
2. **Resolve.** Expand `includes`, apply `disablesAxes`, select `variants`, then validate the expanded layer set against `requires` / `conflicts` and each layer's `engines.node` (the running Node version). Fail early with a clear message (e.g. "`--routing` isn't used with `--type library`; remove it"). Resolve does no network access.
3. **Render.** Write into a temp directory in two phases: collect all files from the layers in render order (section 4), then apply all anchor patches.
4. **Install.** Preflight first, before anything is created: check `git` is available and that every pinned package of a layer with `engines` (e.g. `vite-plus`) can be fetched from the registry; on failure, remove the temp directory, leave the target untouched and exit with the fix (e.g. "re-run with `--toolchain vite`"). Then move output to `my-app/`, `git init`, install with the chosen package manager, run layer `postInstall` commands, create the initial commit.
5. **Verify.** Run build, lint and test once. A failure names the failed step and its re-run command; the project is kept.

### Unsupported combinations (v1)
- shadcn/ui requires Tailwind.
- MUI conflicts with Tailwind and with CSS-in-JS.
- Mantine conflicts with Tailwind.
- `library` with any routing or state flag.

These hold in both types.

## 4. Layer model

```
templates/
  base/                       # TS strict, Vitest + RTL setup, src/
  type/{app,library}/         # app: shell (index.html, main.tsx, App.tsx, routes/); library: package entry
  toolchain/{vite-plus,vite}/
  addons/storybook/           # never prompted; applied only via `includes`
  routing/{react-router,tanstack-router}/
  state/{zustand,redux-toolkit,none}/
  styling/{tailwind,css-modules,css-in-js}/
  ui/{shadcn,mui,mantine,none}/
    <layer>/
      layer.json
      files/                  # project files to add
      files@<variant>/        # files added only when that variant is selected
      kiro/
        steering/             # fragments/files for .kiro/steering
        agents/               # agents for .kiro/agents
```

Render order: base → type → toolchain → addons → routing → state → styling → ui. Disabled axes are skipped. `base`, `type/*` and `addons/*` form the foundation.

`layer.json` declares:
- `dependencies`, `devDependencies`, `peerDependencies` (versions pinned here), `scripts`.
- `requires`, `conflicts`.
- `disablesAxes`: axes not used when this layer is chosen (`type/library`: `["routing", "state"]`). Their prompts are skipped and their flags are rejected.
- `includes`: extra layers pulled in by this layer (`type/library`: `["addons/storybook"]`). Unknown references and cycles are errors.
- `variants`: `[{ when: { <axis>: <option>, ... }, ... }]`. A variant applies when every key in `when` matches the resolved choices. It may add deps, devDeps, peerDeps, scripts, a files dir (`files@<name>/`), anchor patches, steering snippets and agent appends. This replaces the earlier "per-combination overrides" (e.g. Tailwind plugin setup by toolchain is a `when: { toolchain: ... }` variant).
- `postInstall`: argv arrays run after install (section 3, step 4).
- The agents the layer contributes, and an optional `mcpServers` entry (see section 5a).

### Merge rules
- `package.json`: deep merge, additive only. A layer or variant cannot remove a key another layer set. Anything whose placement depends on the type (e.g. `react` in `dependencies` for apps vs `peerDependencies` + `devDependencies` for libraries) is declared in type-conditional variants or in `type/*`, never in a shared section plus a removal.
- Other files: added as-is, or patched at named anchors (e.g. `// bonesmith:imports`). Anchor files live only in the foundation (`base`, `type/*`, `addons/*`): `main.tsx`, `App.tsx`, config files, `.storybook/preview.tsx` (`// bonesmith:storybook-imports`, `// bonesmith:storybook-decorators`).
- Render collects every file before applying any patch, so a patch may target a file from any foundation layer regardless of render order.
- Two layers writing the same plain file is an error in render's collect phase (before anything is written) unless one declares an explicit override. Within one layer, a selected variant's `files@<name>/` replaces the same path in that layer's `files/`; two selected variants of one layer writing the same path is an error.
- A missing or duplicated anchor is an error, never a silent skip.

## 4a. Library projects

Generated output for `type: library`:
- `package.json`: `type: module`; `exports` with `.` (`types` + `import`) and, when the styling layer emits CSS, `./styles.css`; `files: ["dist"]`; `sideEffects: ["**/*.css"]`; `peerDependencies`. Scripts `build`, `test`, `lint`, `storybook`, `build-storybook`.
- `src/index.ts` (the public API); `src/components/Button/{Button.tsx, Button.stories.tsx, Button.test.tsx}`. The Button is accessible and its tests query by role or label.
- `.storybook/{main.ts, preview.tsx, vitest.setup.ts}`.
- A Vitest `storybook` browser project (`@storybook/addon-vitest`, `@vitest/browser-playwright`, Chromium) next to the unit project, so stories run as tests in the normal `test` script.
- No `index.html`, router or store.

Dependencies:
- `react`, `react-dom`, and MUI/Mantine (with their own required peers) are `peerDependencies` and also `devDependencies`. Peers use `^<major>.<minor>.0` ranges; the devDependency is the exact pin and must satisfy the range (decided 2026-10-25, the one exception to exact pins).
- shadcn components are copied into `src/components/ui`; their helper deps stay `dependencies`. Tailwind output is exported as `./styles.css`.
- Styling stays as chosen. Tailwind and CSS Modules are bundled into `dist/` and exported as `./styles.css`. CSS-in-JS emits no stylesheet, so it adds no `./styles.css` export. Whether its runtime is a peer is decided in plan task 1 (section 9).

Build is native per toolchain, ESM only:
- `vite-plus`: `vp pack` (tsdown), a `pack` block in `vite.config.ts` with `dts`, `format: ['esm']`, `sourcemap`. tsdown externalizes `dependencies` and `peerDependencies`.
- `vite`: `vite build` lib mode + `vite-plugin-dts`; `build.rollupOptions.external` is read from `package.json` peer deps in the config file (no anchor).

Storybook pins (`storybook`, `@storybook/react-vite`, `@storybook/addon-vitest`, `@storybook/addon-mcp`, `@vitest/browser-playwright`, `playwright`, `vite-plugin-dts`) are set in plan task 1 and live only in `layer.json`.

`postInstall` (`addons/storybook`: `[["playwright", "install", "chromium"]]`) runs through the package manager's local exec only (`pnpm exec`, `npx --no`, `yarn`, `bunx --no-install`), never a download. The first argv element must be a binary of a pinned dependency in the resolved layer set (lint-checked). It runs after install and before the initial commit. A failure is reported with the exact re-run command and the project is kept.

## 5. Kiro output

Verified against Kiro docs on 2026-10-14: workspace steering lives in `.kiro/steering/*.md` with `inclusion` modes `always`, `auto`, `fileMatch`, `manual` (full support in the IDE; partial in some CLI versions). v1 uses only `always` and `fileMatch`. Project agents live in `.kiro/agents/<name>.json` or `.md`, with fields such as `name`, `description`, `prompt`, `tools` (category tags `read`, `write`, `shell`, `web`, `subagent`; MCP tools as `@<server>`), `permissions` (`rules` with `capability`, `match`, `effect`; replaces `toolsSettings`), `mcpServers` (a map of server configs), `includeMcpJson`, and `resources` (e.g. `file://.kiro/steering/**/*.md`). Re-checked 2026-10-23 against the IDE 1.0 / CLI V3 reference. Layer agents are authored with a Bonesmith shorthand (`mcpServers: ["<name>"]`, `writes: [globs]`) that render expands into that shape.

```
.kiro/
  steering/
    product.md  structure.md  tech.md  testing.md     # base, composed
    routing.md  state.md  styling.md  ui.md           # per layer (state/ui absent for "none"; routing/state absent for library)
    library.md  storybook.md                          # library only
  agents/
    reviewer.json            # shared, from base
    feature-builder.json     # shared, from base; independent, no delegation
    routing-expert.json  state-expert.json  styling-expert.json
    ui-expert.json  toolchain-expert.json             # tech agents, only for chosen layers
    library-expert.json  storybook-expert.json        # library only
  settings/
    mcp.json                                          # only if a chosen layer declares a server
```

Composition:
- One concern per steering file. `structure.md` and `tech.md` are composed from short per-layer snippets in a fixed section order defined by base. A missing layer means a missing section, with no empty placeholders.
- Inclusion: `tech.md` and `structure.md` use `always`; layer files use `fileMatch` so they load only when relevant. Because CLI support for inclusion is partial, every agent also lists the steering files it needs in `resources`, so agents work without relying on inclusion.
- Commands in `tech.md` and the agents come from the toolchain layer (`vp ...` against plain Vite scripts, including `vp pack` vs `vite build` for libraries), so the two toolchains never mix.
- Tech agents: each has a prompt covering that technology's conventions, points at its own steering file plus `structure.md`, and gets narrow tool permissions from the layer manifest (e.g. the styling agent edits only style files and config).
- Layers can append guidance to the shared agents and add new agents. They cannot replace the shared agents. Agent name collisions between layers are a resolve-time error.
- `feature-builder` stays independent of the tech agents in v1. Its prompt only mentions them as pointers. In library mode it gets an append: a new component means component + story + test + export from `src/index.ts`.

Library content:
- `library.md` (fileMatch `src/**`, `package.json`): public API only through `src/index.ts`, peer deps, no app-only code, semver and changelog.
- `storybook.md` (fileMatch `**/*.stories.tsx`, `.storybook/**`).
- `library-expert` writes only `src/index.ts`, `package.json` and build config. `storybook-expert` writes only stories and `.storybook/**` and references the `storybook` MCP server. Both list their own steering file + `structure.md` in `resources`.
- `structure.md` / `tech.md` snippets: library layout, pack and Storybook commands from the toolchain layer, MCP list.

## 5a. MCP servers

A layer may declare an MCP server for its library. The renderer merges all declared servers into one workspace file, `.kiro/settings/mcp.json` (Kiro's workspace MCP location, verified 2026-10-14; agents may also carry an `mcpServers` field, and workspace JSON ranks below agent config in load priority).

An entry is one of:
- `{ command, args }`: a local process. The package version is pinned in the args.
- `{ url, provider }`: an HTTP server (localhost only). `provider` names a pinned devDependency of the resolved layer set that serves it, so the version is pinned through that dependency (lint-checked).

Rules:
- **Official servers only in v1.** A server is included only if the library's own maintainers publish it. Third-party or community servers are not shipped by default.
- **Pinned versions.** The server package version is pinned in `layer.json` (no `@latest`, no unpinned `npx -y`), directly or through `provider`, so generated projects don't execute drifting code. Pins are part of what the update agent bumps.
- **Present only when the layer is chosen.** No entry for "none" options.
- **Tech agents reference their server.** `ui-expert` names its library's server and `storybook-expert` names `storybook` (shorthand `mcpServers: ["<name>"]`). Render copies that server's config into the agent's `mcpServers` map and adds `@<name>` to `tools`, so the agent and the server stay paired.
- **Generated projects are told about it.** `tech.md` lists the configured MCP servers so users know what runs on their machine. `url` servers are marked "requires `storybook` running" (or the equivalent for their provider).

v1 coverage, from the 2026-10-14 check (Storybook added 2026-10-23):

| Layer | Official MCP server | v1 |
|---|---|---|
| ui/shadcn | shadcn MCP (`ui.shadcn.com/docs/mcp`) | Included |
| ui/mui | `@mui/mcp` | Included |
| ui/mantine | `@mantine/mcp-server` | Included |
| addons/storybook | `@storybook/addon-mcp` (storybookjs, preview), `url: http://localhost:6006/mcp` | Included |
| routing/*, state/*, styling/*, toolchain/* | None found | Not included; revisit when an official server appears |

Because of the pinning rule, all server commands and packages above are re-verified at plan time, including the exact shadcn invocation and the version pin for each.

## 5b. Future: Kiro powers (not in v1)

Checked 2026-10-14 against kiro.dev/docs/powers. A power is a directory with a `plugin.json` manifest (activation keywords), optional `skills/` (Agent Skills, `SKILL.md`) and optional `mcp.json`, following the open Agent Plugins spec. Kiro loads a power's tools and skills on demand when the conversation matches its keywords. (The launch blog describes `POWER.md`; the current docs use `plugin.json`, so the docs are the reference.)

Possible later uses:
- Ship UI-library MCP servers as a power so they load only when relevant, instead of living permanently in `.kiro/settings/mcp.json`.
- Express per-technology guidance as skills, which load on demand, instead of `fileMatch` steering.
- Publish one power per layer from the maintainer-side update agent (sub-project 3), giving teams updates without regenerating projects.

Why not in v1: powers are installed by each user in their IDE and are not committed with the repo like `.kiro/` files. It is unconfirmed whether a scaffolder can install a power or scope it to a project. With at most one MCP server per project in v1, context overload is not yet a problem. A second output format would add maintenance with no confirmed gain.

v1 constraint that keeps this cheap: layer content (steering text, agent prompts, MCP entries) stays plain data in `layer.json` and `kiro/`, so the same data can later also be emitted as a power directory.

## 6. Scaffolder repo layout

```
bonesmith/
  package.json           # name: create-bonesmith, bin: create-bonesmith
  src/
    cli.ts               # flags + prompts -> Choices
    resolve.ts           # expand includes, apply disablesAxes, select variants, requires/conflicts
    render.ts            # collect files, then patch anchors, merge -> temp dir
    install.ts           # move, git init, install, postInstall, initial commit, verify
    layers.ts            # load + type-check layer.json
  templates/
  test/{unit,matrix}/
  docs/superpowers/{specs,plans}/
```

Core code contains no option-specific logic (no `if (type === 'library')`); type behaviour comes from `disablesAxes`, `includes` and `variants`. `Choices.routing` and `Choices.state` are optional.

TypeScript on Node (current LTS and newer). Each of `resolve`, `render`, `install` is one function with typed input and output so they test in isolation. Prompts use `@clack/prompts`; flags use `commander` (decided 2026-10-23).

## 7. Testing

1. **Unit** (every change): `resolve` rejects each invalid pair (in both types), routing/state flags with `--type library`, include cycles and unknown includes; `resolve` selects variants by `when` and the library layer set excludes routing/state and includes `addons/storybook`. Deep merge of `package.json` (including `peerDependencies`); anchor patching fails on missing or duplicate anchors; duplicate-file detection (including variant file dirs). `layers.ts` rejects malformed new fields and a `url` MCP entry without a pinned provider. `install` maps `postInstall` to each package manager's local exec and reports failure with the exact command (injected process runner, no real processes).
2. **Render snapshot**: render without installing; check file lists and `.kiro` output: valid front matter, agent JSON parses, referenced steering files exist, no unresolved placeholders or leftover anchors, and the agent set exactly matches the chosen layers (no `ui-expert` when UI is "none"; no `routing.md`, `state.md`, `routing-expert`, `state-expert` for libraries; `library-expert` and `storybook-expert` present for libraries; no library or Storybook content for apps). `.kiro/settings/mcp.json` contains exactly the servers of the chosen layers, each with a pinned version, and `tech.md` lists them. Existing app combination file lists are unchanged by the type axis (regression). Library snapshots per toolchain and for every valid styling × UI pair: exports and peers present, `./styles.css` export only when the styling emits CSS, no `index.html` / `main.tsx`.
3. **Matrix** (CI, slow): scaffold, install, build, lint, test. The full product is too large, so every layer appears in at least one tested combination (pairwise-style cover), plus a fixed list of likely real stacks. Package managers rotate through combinations rather than multiplying them. Library combinations cover every styling and UI option at least once, both toolchains; library verify also runs Storybook browser tests (in `test`) and `build-storybook`, and checks `dist/index.d.ts` exists (and `dist/*.css` when the styling emits CSS). Playwright browsers are cached in CI.

Template lint in CI: every `layer.json` validates against a schema; every patch's anchor exists in the foundation for every combination its `when` allows (in practice, per `type` value); every `includes` reference exists and there are no cycles; every `url` MCP entry's `provider` and every `postInstall` binary is a pinned dependency of the resolved set; no two layers write the same path without a declared override.

## 8. Release

Published to public npm as `create-bonesmith`, version-tagged. Dependency versions are pinned in each `layer.json`, which is the surface the future update agent edits. A release requires a green matrix run.

## 9. Open items for the plan stage
Status reviewed 2026-10-25 (spec 06 task 5).
- ~~Confirm exact Kiro steering and agent schemas against current docs.~~ Resolved 2026-10-23: see `.kiro/specs/01-core-foundation/design.md` §0.
- ~~Define the Vite+ availability check precisely.~~ Decided 2026-10-24: Node range via `engines` in resolve; registry probe of pinned packages of `engines` layers in install preflight (section 3).
- ~~Re-verify MCP server commands and pick version pins (section 5a), including the exact shadcn invocation and Kiro `mcp.json` `url` entry support.~~ Resolved 2026-10-24: pins and `initialize` checks in `templates/PINS.md`; `url` entries confirmed 2026-10-23 (01 design §0).
- Verify whether a power can be installed project-scoped or by a script (decides whether section 5b is viable). **Still open**; not needed for v1.
- ~~Choose the pairwise cover set and the fixed "likely real" stacks.~~ Resolved 2026-10-25: `test/matrix/combinations.ts` (8 app, 6 library), rules enforced by `test/matrix/coverage.test.ts`.
- ~~Library (plan task 1): confirm `@storybook/addon-vitest` runs under `vp test`.~~ Resolved: story browser tests pass under `vp test` (matrix `lib-vp-*`, 2026-10-25).
- ~~Library (plan task 1): decide whether the CSS-in-JS runtime (and MUI's emotion packages) are peers.~~ Decided: they are peers (`styled-components`, `@emotion/react`, `@emotion/styled`, `@mui/material` as `^x.y.0` peers with exact devDependency pins).
- ~~Library (plan task 9): confirm each local-exec form (`npx --no`, `yarn`, `bunx --no-install`) runs only installed binaries.~~ Resolved: 01 design §0; `postInstall` (`playwright install chromium`) ran through each form in the matrix (2026-10-25).
