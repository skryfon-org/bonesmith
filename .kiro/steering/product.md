---
inclusion: always
---

# Product: Bonesmith

Bonesmith is a CLI (`npm create bonesmith`, package `create-bonesmith`) that generates a ready-to-build React 19+ repo: a client-side app or a publishable component library with Storybook. The user picks project type, toolchain, routing, state, UI library, styling and package manager (routing and state are app only). The tool writes the folder structure, config, installed dependencies and a `.kiro/` setup (steering, agents, MCP) matched to that stack.

Source of truth: `docs/superpowers/specs/2026-10-14-bonesmith-scaffolder-design.md`. If code and spec disagree, raise it; do not silently diverge.

Implementation specs, in build order: `.kiro/specs/01-core-foundation`, `02-render-engine`, `03-cli-install`, `04-app-templates`, `05-library-storybook`, `06-quality-release`. Finish a spec's checkpoint before starting the next.

## Success criteria
- Every supported combination installs, builds, lints and tests green from one command.
- Adding an option = one new folder under `templates/`. No core code changes.
- Generated `.kiro/` matches the chosen stack exactly. Nothing for unchosen options.

## Scope (sub-project 1)
In: scaffolder core (`cli`, `resolve`, `render`, `install`, `layers`), the layer model, and a v1 `.kiro` content set.
Later: deeper Kiro content (sub-project 2); the maintainer-side update agent (sub-project 3), which edits `templates/` only and never ships in the scaffolder.

## v1 options
| Axis | Options |
|---|---|
| Type | `app` (default), `library` |
| Toolchain | `vite-plus` (default), `vite` |
| Routing | `react-router` (v7), `tanstack-router` (app only) |
| State | `zustand`, `redux-toolkit`, `none` (app only) |
| Styling | `tailwind`, `css-modules`, `css-in-js` |
| UI | `shadcn`, `mui`, `mantine`, `none` |
| Package manager | `pnpm`, `npm`, `yarn`, `bun` |

Fixed baseline: React 19+, TypeScript strict (no JS option), Vitest + React Testing Library, `git init` + initial commit, `.kiro/`.

Unsupported combinations (both types): shadcn requires Tailwind; MUI conflicts with Tailwind and CSS-in-JS; Mantine conflicts with Tailwind. `library` with any routing or state flag is an error.

Library type: ESM-only package (`vp pack` / `vite build` lib mode), React and MUI/Mantine as peers, CSS exported as `./styles.css` when styling emits CSS, Storybook always on with stories run as Vitest browser tests. App output is unchanged by the type axis. Details: spec section 4a.

## Non-goals for v1
CI workflow stub, third-party layer plugins, telemetry, self-update, Ant Design/Chakra, Kiro specs/hooks, Kiro powers output, Storybook for apps, CJS library output. Do not add these without a spec change.
