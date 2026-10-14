# Bonesmith Scaffolder: Design

Date: 2026-10-14
Status: Draft for review
Scope: Sub-project 1 of 3 (scaffolder core, plus the Kiro layer contract it must emit)

## 1. Purpose

A CLI (`npm create bonesmith`) that generates a ready-to-build React 19+ client-side repo so a team can start on features without doing setup. The user picks routing, state management, styling, UI library, package manager and toolchain. The tool produces the folder structure, config, installed dependencies, and Kiro steering rules and agents matched to that stack.

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
| Toolchain | `vite-plus` (default), `vite` |
| Routing | React Router (v7), TanStack Router |
| State | Zustand, Redux Toolkit, none |
| Styling | Tailwind, CSS Modules, CSS-in-JS |
| UI library | shadcn/ui, MUI, Mantine, none |
| Package manager | pnpm, npm, yarn, bun |

Fixed baseline in every project: React 19+, TypeScript (strict, no JS option), Vitest + React Testing Library, `git init` with an initial commit, `.kiro/` content.

Toolchain behaviour:
- `vite-plus`: Vite+ provides build, test, lint, format (`vp` commands). No separate ESLint or Prettier.
- `vite`: plain Vite, Vitest, ESLint (flat config), Prettier.
- Selection is **strict**. Default is `vite-plus`. If Vite+ cannot be resolved or the Node version is unsupported, the tool exits with a clear error telling the user to re-run with `--toolchain vite`. There is no automatic or prompted fallback.

Not in v1: CI workflow stub, plugin system for third-party layers, telemetry, self-update command, Ant Design/Chakra, Kiro specs/hooks.

## 3. CLI flow

`npm create bonesmith@latest my-app` (npm package name: `create-bonesmith`). Runs five steps in order:

1. **Collect choices.** Prompts in order: toolchain, routing, state, UI library, styling, package manager. Each can be given as a flag, which skips its prompt. `--yes` uses defaults and never prompts. UI library is asked before styling, and the styling options are filtered by the UI choice (shadcn leaves only Tailwind).
2. **Resolve.** Validate choices against layer manifests (`requires`, `conflicts`). Fail early with a clear message. Includes the Vite+ availability check.
3. **Render.** Write into a temp directory: copy `base/`, apply the toolchain layer, then each option layer in a fixed order.
4. **Install.** Move output to `my-app/`, `git init`, install with the chosen package manager, create the initial commit.
5. **Verify.** Run build and test once. A failure is reported but the project is kept.

### Unsupported combinations (v1)
- shadcn/ui requires Tailwind.
- MUI conflicts with Tailwind and with CSS-in-JS.
- Mantine conflicts with Tailwind.

## 4. Layer model

```
templates/
  base/                       # React 19 + TS strict, folder structure, Vitest + RTL
  toolchain/{vite-plus,vite}/
  routing/{react-router,tanstack-router}/
  state/{zustand,redux-toolkit,none}/
  styling/{tailwind,css-modules,css-in-js}/
  ui/{shadcn,mui,mantine,none}/
    <layer>/
      layer.json
      files/                  # project files to add
      kiro/
        steering/             # fragments/files for .kiro/steering
        agents/               # agents for .kiro/agents
```

`layer.json` declares: `dependencies`, `devDependencies` (versions pinned here), `scripts`, `requires`, `conflicts`, per-combination overrides (e.g. Tailwind plugin setup differs by toolchain), the agents the layer contributes, and an optional `mcpServers` entry (see section 5a).

### Merge rules
- `package.json`: deep merge.
- Other files: added as-is, or patched at named anchors (e.g. `// bonesmith:imports`) in a small set of shared base files (`main.tsx`, `App.tsx`, config files).
- Two layers writing the same plain file is a resolve-time error unless one declares an explicit override.
- A missing or duplicated anchor is an error, never a silent skip.

## 5. Kiro output

Verified against Kiro docs on 2026-10-14: workspace steering lives in `.kiro/steering/*.md` with `inclusion` modes `always`, `fileMatch`, `manual` (full support in the IDE; partial in some CLI versions). Project agents live in `.kiro/agents/<name>.json` or `.md`, with fields such as `name`, `description`, `prompt`, `tools` (category tags `read`, `write`, `shell`, `web`, `subagent`), `permissions`, and `resources` (e.g. `file://.kiro/steering/**/*.md`). Exact schemas are re-checked when the implementation plan is written.

```
.kiro/
  steering/
    product.md  structure.md  tech.md  testing.md     # base, composed
    routing.md  state.md  styling.md  ui.md           # per layer (state/ui absent for "none")
  agents/
    reviewer.json            # shared, from base
    feature-builder.json     # shared, from base; independent, no delegation
    routing-expert.json  state-expert.json  styling-expert.json
    ui-expert.json  toolchain-expert.json             # tech agents, only for chosen layers
```

Composition:
- One concern per steering file. `structure.md` and `tech.md` are composed from short per-layer snippets in a fixed section order defined by base. A missing layer means a missing section, with no empty placeholders.
- Inclusion: `tech.md` and `structure.md` use `always`; layer files use `fileMatch` so they load only when relevant. Because CLI support for inclusion is partial, every agent also lists the steering files it needs in `resources`, so agents work without relying on inclusion.
- Commands in `tech.md` and the agents come from the toolchain layer (`vp ...` against plain Vite scripts), so the two toolchains never mix.
- Tech agents: each has a prompt covering that technology's conventions, points at its own steering file plus `structure.md`, and gets narrow tool permissions from the layer manifest (e.g. the styling agent edits only style files and config).
- Layers can append guidance to the shared agents and add new agents. They cannot replace the shared agents. Agent name collisions between layers are a resolve-time error.
- `feature-builder` stays independent of the tech agents in v1. Its prompt only mentions them as pointers.

## 5a. MCP servers

A layer may declare an MCP server for its library. The renderer merges all declared servers into one workspace file, `.kiro/settings/mcp.json` (Kiro's workspace MCP location, verified 2026-10-14; agents may also carry an `mcpServers` field, and workspace JSON ranks below agent config in load priority).

Rules:
- **Official servers only in v1.** A server is included only if the library's own maintainers publish it. Third-party or community servers are not shipped by default.
- **Pinned versions.** The server package version is pinned in `layer.json` (no `@latest`, no unpinned `npx -y`), so generated projects don't execute drifting code. Pins are part of what the update agent bumps.
- **Present only when the layer is chosen.** No entry for "none" options.
- **Tech agents reference their server.** `ui-expert` lists its library's server in `mcpServers`, so the agent and the server stay paired.
- **Generated projects are told about it.** `tech.md` lists the configured MCP servers so users know what runs on their machine.

v1 coverage, from the 2026-10-14 check:

| Layer | Official MCP server | v1 |
|---|---|---|
| ui/shadcn | shadcn MCP (`ui.shadcn.com/docs/mcp`) | Included |
| ui/mui | `@mui/mcp` | Included |
| ui/mantine | `@mantine/mcp-server` | Included |
| routing/*, state/*, styling/*, toolchain/* | None found | Not included; revisit when an official server appears |

Because of the pinning rule, all server commands and packages above are re-verified at plan time, including the exact shadcn invocation and the version pin for each.

## 6. Scaffolder repo layout

```
bonesmith/
  package.json           # name: create-bonesmith, bin: create-bonesmith
  src/
    cli.ts               # flags + prompts -> Choices
    resolve.ts           # validate Choices against manifests
    render.ts            # copy, merge, patch anchors -> temp dir
    install.ts           # move, git init, install, verify
    layers.ts            # load + type-check layer.json
  templates/
  test/{unit,matrix}/
  docs/superpowers/specs/
```

TypeScript on Node (current LTS and newer). Each of `resolve`, `render`, `install` is one function with typed input and output so they test in isolation. Prompt and flag libraries (`@clack/prompts`; `citty` or `commander`) are chosen at plan time and do not affect the design.

## 7. Testing

1. **Unit** (every change): `resolve` rejects each invalid pair; deep merge of `package.json`; anchor patching fails on missing or duplicate anchors; duplicate-file detection.
2. **Render snapshot**: render without installing; check file lists and `.kiro` output: valid front matter, agent JSON parses, referenced steering files exist, no unresolved placeholders, and the agent set exactly matches the chosen layers (no `ui-expert` when UI is "none"). `.kiro/settings/mcp.json` contains exactly the servers of the chosen layers, each with a pinned version, and `tech.md` lists them.
3. **Matrix** (CI, slow): scaffold, install, build, lint, test. The full product is too large, so every layer appears in at least one tested combination (pairwise-style cover), plus a fixed list of likely real stacks. Package managers rotate through combinations rather than multiplying them.

Template lint in CI: every `layer.json` validates against a schema, every referenced anchor exists in base, and no two layers write the same path without a declared override.

## 8. Release

Published to public npm as `create-bonesmith`, version-tagged. Dependency versions are pinned in each `layer.json`, which is the surface the future update agent edits. A release requires a green matrix run.

## 9. Open items for the plan stage
- Confirm exact Kiro steering and agent schemas against current docs.
- Define the Vite+ availability check precisely (resolve `vite-plus`, supported Node range).
- Re-verify MCP server commands and pick version pins (section 5a), including the exact shadcn invocation.
- Pick the prompt and flag libraries.
- Choose the pairwise cover set and the fixed "likely real" stacks.
