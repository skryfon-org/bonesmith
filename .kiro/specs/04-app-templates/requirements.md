# Requirements: 04 App templates

Part 4 of 6. Order: 01 core-foundation → 02 render-engine → 03 cli-install → **04 app-templates** → 05 library-storybook → 06 quality-release.
Depends on: 01–03 (engine complete). Authored with the `layer-author` agent.

## Introduction

The real `templates/` content for `type: app`: `base`, `type/app`, both toolchains, routing, state, styling and UI layers, each with pinned versions and its `.kiro` contribution (steering, agents, MCP). After this spec, `npm create bonesmith my-app --yes` produces a working app. Library content is 05. Layers must leave room for 05 (no app-only content in `base`; type-dependent placement in `when: { type }` variants).

## Requirement 1: Version pins

#### Acceptance criteria
1. Before writing layers, THE maintainer SHALL record exact versions (`npm view <pkg> version`, with date) for every package the app layers use, including MCP packages (`@mui/mcp`, `@mantine/mcp-server`, the shadcn MCP invocation), in `templates/PINS.md`.
2. Every version in a `layer.json` SHALL be one of those recorded pins.
3. THE pins SHALL be mutually compatible (peer ranges checked with `npm view <pkg> peerDependencies`).

## Requirement 2: Base and app shell

#### Acceptance criteria
1. THE `base` layer SHALL provide TypeScript strict config, Vitest + React Testing Library setup, `src/`, `_gitignore`, and the base steering (`product.md`, `testing.md`, framed `tech.md` and `structure.md` with the `sections` anchor) and `steeringSections`.
2. THE `base` layer SHALL put `react` and `react-dom` (19+) in `dependencies` only under `when: { type: "app" }`.
3. THE `base` layer SHALL contain no app shell (`index.html`, `main.tsx`, `App.tsx`, routes).
4. THE `type/app` layer SHALL provide `index.html`, `src/main.tsx` (anchors `imports`, `providers-open`, `providers-close`), `src/App.tsx` (anchors `app-imports`, `app-body`), `src/routes/`, a passing `App.test.tsx`, and `nextSteps` (`{{pmRun}} dev`).
5. THE `base` layer SHALL contribute shared agents `reviewer` and `feature-builder`; `feature-builder` mentions the tech agents only as pointers.
6. THE `base` layer SHALL own `vite.config.ts` through `when: { toolchain }` variants (`files@vp/`, `files@vite/`), each with anchors `vite-imports`, `vite-plugins`, `vite-config`, `vite-test-projects` and a `test.projects` block with a `unit` project, so non-foundation layers and 05 can patch it.
7. Packages and scripts whose placement differs by type (`react`, `react-dom`, MUI / Mantine / `styled-components` runtime packages, toolchain `dev` / `build` scripts) SHALL be declared in `when: { type: "app" }` variants.

## Requirement 3: Toolchains

#### Acceptance criteria
1. THE `toolchain/vite-plus` layer SHALL pin `vite-plus`, set `engines.node` from its published engines, and provide scripts `dev`, `build`, `lint`, `test`, `format` using `vp` commands, with no ESLint or Prettier.
2. THE `toolchain/vite` layer SHALL provide plain Vite, Vitest, ESLint (flat config) and Prettier with scripts `dev`, `build`, `lint`, `test`, `format`.
3. Each toolchain SHALL contribute a `toolchain` section to `tech.md` (commands via `{{pmRun}}`) and a `toolchain-expert` agent; the two toolchains' commands SHALL never mix.
4. Scripts `build`, `lint`, `test` SHALL run once and exit (no watch mode).

## Requirement 4: Routing and state

#### Acceptance criteria
1. `routing/react-router` (v7) and `routing/tanstack-router` SHALL each patch `main.tsx` / `App.tsx`, add a home route and a test, `routing.md` steering, a `routing` section in `structure.md`, and `routing-expert`.
2. `state/zustand` and `state/redux-toolkit` SHALL each add an example store with a test, `state.md`, a `state` section, and `state-expert`; redux-toolkit SHALL patch the provider into `main.tsx`.
3. `state/none` SHALL contribute nothing but `label`.

## Requirement 5: Styling and UI

#### Acceptance criteria
1. `styling/tailwind`, `styling/css-modules`, `styling/css-in-js` (`styled-components`, confirmed 2026-10-25) SHALL each set up styling for the app, with `when: { toolchain }` variants where setup differs, plus `styling.md`, a `styling` section and `styling-expert`.
2. `ui/shadcn` SHALL require `styling: ["tailwind"]`, copy at least one component into `src/components/ui`, and declare the official shadcn MCP server pinned.
3. `ui/mui` SHALL conflict with `styling/tailwind` and `styling/css-in-js`, patch its theme provider, and declare `@mui/mcp` pinned.
4. `ui/mantine` SHALL conflict with `styling/tailwind`, patch `MantineProvider` and its CSS import, and declare `@mantine/mcp-server` pinned.
5. Each UI layer except `none` SHALL contribute `ui.md`, a `ui` section, and `ui-expert` referencing its server (`mcpServers: ["<name>"]`).
6. `ui/none` SHALL contribute nothing but `label`.

## Requirement 6: Kiro content quality

#### Acceptance criteria
1. Every layer steering file SHALL use `inclusion: fileMatch` with a `fileMatchPattern`; `tech.md` and `structure.md` SHALL use `inclusion: always`.
2. Every tech agent SHALL list its own steering file and `structure.md` in `resources` and narrow `writes` to its files.
3. Steering text and agent prompts SHALL be concise, stack-specific, and written as plain data.

## Requirement 7: Snapshot tests and first real run

#### Acceptance criteria
1. THE snapshot suite SHALL render every valid app combination with `renderFiles` (no install) and snapshot its file list.
2. THE snapshot suite SHALL check: no `index.html` missing for apps, front matter parses, agent JSON matches the emitted Kiro shape, resources exist, exact agent/steering/MCP sets per combination (no `ui-expert`/`ui.md` for UI none; no `state-expert`/`state.md` for state none).
3. THE app file-list snapshots, and content snapshots of `package.json` and `vite.config.ts`, SHALL be frozen as the regression baseline before 05 starts.
4. THE maintainer SHALL run the CLI for real for at least two app stacks (one per toolchain) and record build, lint and test passing.
