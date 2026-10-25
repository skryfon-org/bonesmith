# Design: 04 App templates

## 1. Two engine extensions found while designing the layers

1. **`vite.config.ts` must be a foundation file.** Styling (Tailwind's Vite plugin) and later 05 (library build config) patch it, but anchors may live only in foundation files, and toolchain layers aren't foundation. So `base` owns the config through toolchain variants: `base` variant `vp` (`when: { toolchain: "vite-plus" }`) ships `files@vp/vite.config.ts`, and variant `vite` (`when: { toolchain: "vite" }`) ships `files@vite/vite.config.ts`. Both carry the anchors `vite-imports`, `vite-plugins`, `vite-config` and `vite-test-projects`, and their `test` block uses `projects` with a `unit` project, so 05 adds library config without touching app output. Toolchain layers keep scripts, deps, steering and agents.
2. **Patch position.** Provider wrapping needs closing tags in reverse order. `Patch.position?: "before" | "after"` (default `before`): `before` inserts above the anchor, so patches stack in render order; `after` inserts directly below it, so patches stack in reverse. This is added to 01 (schema) and 02 (Req 4.5).
3. **Library-ready placement.** Anything 05 places differently in library mode sits in `when: { type: "app" }` variants from the start: `react` / `react-dom` (`base`), the runtime packages of `ui/mui`, `ui/mantine` and `styling/css-in-js`, and the toolchain `build` / `dev` scripts. 05 then adds only `library` variants, which can't change app output.

## 2. Layer map

| Layer | Key `layer.json` data | Files | Kiro |
|---|---|---|---|
| `base` | `steeringSections`. devDeps `typescript`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`. Variant `app` (`when: {type: "app"}`): `react`, `react-dom` in `dependencies`. Variants `vp` / `vite`: the config files. | `tsconfig.json`, `vitest.setup.ts`, `src/vite-env.d.ts`, `_gitignore`, `README.md`, `files@vp/vite.config.ts`, `files@vite/vite.config.ts` | steering `product.md`, `testing.md`, frames `tech.md` / `structure.md`; agents `reviewer`, `feature-builder` |
| `type/app` | `nextSteps: "{{pmRun}} dev"` | `index.html`, `src/main.tsx`, `src/App.tsx`, `src/App.test.tsx`, `src/routes/.gitkeep` | `structure.md` section `type` |
| `toolchain/vite-plus` | `vite-plus` pin; `engines.node` copied from its published engines; scripts `lint: vp lint`, `test: vp test run`*, `format: vp fmt`; variant `app`: `dev: vp dev`, `build: vp build` | – | section `toolchain`; `toolchain-expert` |
| `toolchain/vite` | `vite`, `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier`; scripts `lint` (`eslint .`), `test` (`vitest run`), `format` (`prettier --write .`); variant `app`: `dev`, `build` (`tsc -b && vite build`) | `eslint.config.js`, `.prettierrc` | section `toolchain`; `toolchain-expert` |
| `routing/react-router` | `react-router` | `src/routes/Home.tsx` + test; patches `main.tsx` | `routing.md`; `routing-expert` |
| `routing/tanstack-router` | `@tanstack/react-router` (code-based routes, no codegen step) | `src/routes/{root,index}.tsx` + test; patches | same |
| `state/zustand` | `zustand` | `src/stores/counter.ts` + test | `state.md`; `state-expert` |
| `state/redux-toolkit` | `@reduxjs/toolkit`, `react-redux` | `src/store/{index,counterSlice}.ts` + test; provider patches | same |
| `state/none` | `label` only | – | – |
| `styling/tailwind` | `tailwindcss`, `@tailwindcss/vite`; patches `vite-imports`, `vite-plugins` | `src/index.css` (`@import "tailwindcss";`); CSS import patch | `styling.md`; `styling-expert` |
| `styling/css-modules` | – | `src/App.module.css`, `src/index.css`; import patch | same |
| `styling/css-in-js` | `styled-components` (confirmed 2026-10-25) | example styled component + test | same |
| `ui/shadcn` | `requires: { styling: ["tailwind"] }`; `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot`, `lucide-react`; MCP `shadcn` | `components.json`, `src/lib/utils.ts`, `src/components/ui/button.tsx` | `ui.md`; `ui-expert` |
| `ui/mui` | `conflicts: ["styling/tailwind","styling/css-in-js"]`; `@mui/material`, `@emotion/react`, `@emotion/styled`; MCP `mui` | theme file; provider patches | same |
| `ui/mantine` | `conflicts: ["styling/tailwind"]`; `@mantine/core`, `@mantine/hooks`, `postcss`, `postcss-preset-mantine`; MCP `mantine` | `postcss.config.cjs`; provider + CSS import patches | same |
| `ui/none` | `label` only | – | – |

\* `vp test run` is the expected one-shot form. Task 1 confirms it and, if it differs, updates this table, the layer `scripts`, and the `toolchain` section of `tech.md` together, so they never disagree.

MCP entries: `{ command: "npx", args: ["<pkg>@<exact>", ...], pin: "<pkg>@<exact>" }`. A pinned `npx` fetch on first use is allowed by the spec (the ban is on unpinned `npx -y`). Task 1 re-verifies each server's exact invocation (including shadcn's) and pins it.

## 3. Anchors

| File | Owner | Anchors |
|---|---|---|
| `src/main.tsx` | `type/app` | `imports`, `providers-open`, `providers-close` |
| `src/App.tsx` | `type/app` | `app-imports`, `app-body` |
| `vite.config.ts` | `base` (`vp` / `vite` variants) | `vite-imports`, `vite-plugins`, `vite-config`, `vite-test-projects` |
| `.kiro/steering/tech.md`, `structure.md` | `base` | `sections` |

`main.tsx`:
```tsx
// bonesmith:imports
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* bonesmith:providers-open */}
    <App />
    {/* bonesmith:providers-close */}
  </StrictMode>,
);
```
Provider layers patch `providers-open` with `<X>` (position `before`) and `providers-close` with `</X>` (position `after`), which gives correct nesting for any number of providers. Routing layers render their router where `<App />` is today by patching `app-body` in `App.tsx`.

## 4. Steering frames

`base/kiro/steering/tech.md`:
```md
---
inclusion: always
---
# Tech
React 19, TypeScript strict, Vitest + React Testing Library. Package manager: {{pm}}.

<!-- bonesmith:sections -->
```
`steeringSections`: tech `["toolchain","library","storybook","routing","state","styling","ui","mcp"]`; structure `["type","library","routing","state","styling","ui"]`. 05 fills `library` / `storybook`.

## 5. Agent template

```json
{
  "name": "ui-expert",
  "description": "MUI components, theming and the sx prop in this project.",
  "prompt": "…conventions… Run {{pmRun}} test after changes.",
  "tools": ["read", "write", "shell"],
  "resources": ["file://.kiro/steering/ui.md", "file://.kiro/steering/structure.md"],
  "mcpServers": ["mui"],
  "writes": ["src/**/*.tsx", "src/theme/**"]
}
```

## 6. Snapshot tests (`test/snapshot/app.test.ts`)

- Enumerate the app combinations: toolchain × routing × state × valid (styling, ui) pairs = 2 × 2 × 3 × 7 = 84.
- Each combination → `renderFiles` → sorted file-list snapshot keyed by the combination, in `__snapshots__/app-file-lists.snap`, plus a content snapshot of `package.json` and `vite.config.ts` in `__snapshots__/app-contents.snap`. Both are the regression baseline for 05 (Req 7.3).
- `test/snapshot/kiro-checks.ts` (reused by 05): front matter parses (`yaml`); agent JSON keys ⊆ Kiro fields; `file://` resources exist; the agent / steering / MCP sets are computed from the combination and compared exactly.

## 7. Real runs

Task 9 runs `node dist/index.js` in a tmp dir outside the repo for:
- `--toolchain vite-plus --routing react-router --state zustand --ui shadcn --styling tailwind --pm pnpm`
- `--toolchain vite --routing tanstack-router --state redux-toolkit --ui mui --styling css-modules --pm npm`

Results go in the task notes. The 06 matrix automates this.
