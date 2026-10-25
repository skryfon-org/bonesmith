# Design: 05 Library type + Storybook

## 1. Prerequisites from 04 (already specified there)

So that 05 adds only library variants and never edits app placement:
- `base` puts `react` / `react-dom` in an `app` variant (`when: {type: "app"}`).
- `ui/mui`, `ui/mantine` and `styling/css-in-js` put their runtime packages in `app` variants.
- Both `vite.config.ts` variants in `base` carry four anchors from the start: `vite-imports`, `vite-plugins`, `vite-config`, `vite-test-projects`, and the `test` block already uses `projects` with a `unit` project.

05 then only adds `library` variants, so the app output (file lists and file contents) can't change. A content snapshot of every app `package.json` and `vite.config.ts` (taken in 04) proves this.

## 2. Where each piece lives

| Concern | Layer / variant | Mechanism |
|---|---|---|
| Skip routing/state, pull in Storybook | `type/library` | `disablesAxes`, `includes` |
| Package shape (`type`, `exports["."]`, `files`, `sideEffects`) | `type/library` | `packageJson` |
| `react` / `react-dom` as peers | `base` variant `library` | `peerDependencies` + `devDependencies` |
| `vp pack` build | `base` variant `vp-library` (`when: {type: "library", toolchain: "vite-plus"}`) | patch `vite-config` with the `pack` block; script `build: vp pack` |
| `vite build` lib mode | `base` variant `vite-library` | patches `vite-imports` (pkg import, `dts`), `vite-plugins` (`dts()`), `vite-config` (`build.lib` + externals); script `build` |
| Storybook files, scripts, `postInstall`, MCP | `addons/storybook` | files, scripts, `postInstall`, `mcpServers` |
| Vitest `storybook` project | `addons/storybook` | patch `vite-test-projects` (variants per toolchain only if import paths differ, per the spike) |
| CSS export, preview stylesheet | `styling/{tailwind,css-modules}` variant `library` | `packageJson.exports["./styles.css"]`, patch `storybook-imports`, CSS build output |
| Peers + decorator | `ui/{mui,mantine}`, `styling/css-in-js` variant `library` | deps placement; patches `storybook-imports`, `storybook-decorators` |
| shadcn in a library | `ui/shadcn` variant `library` | export components from `src/index.ts` via a patch at `type/library`'s `index-exports` anchor |

Script conflicts: under `library`, `toolchain/*` must not also set `build` to the app command. Toolchain app scripts therefore sit in `when: {type: "app"}` variants (04 design §2 is amended accordingly), and the library `build` comes from `base`'s library variants.

## 3. Config sketch (vite toolchain, library)

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";
import pkg from "./package.json" with { type: "json" };

const peers = Object.keys(pkg.peerDependencies ?? {});
const external = (id: string) => id === "react/jsx-runtime" || peers.some((p) => id === p || id.startsWith(`${p}/`));

export default defineConfig({
  plugins: [react(), dts({ include: ["src"], exclude: ["**/*.stories.tsx", "**/*.test.tsx"] })],
  build: { lib: { entry: "src/index.ts", formats: ["es"], fileName: "index" }, rollupOptions: { external }, sourcemap: true },
  test: { projects: [ /* unit */, /* storybook (patched) */ ] },
});
```
Externals are read from `package.json`, so no UI layer needs a config patch. The vite-plus `pack` block is `pack: { entry: ["src/index.ts"], dts: true, format: ["esm"], sourcemap: true }`; tsdown externalizes deps and peers itself.

## 4. Storybook layer

```
addons/storybook/
  layer.json
  files/.storybook/main.ts
  files/.storybook/preview.tsx        # anchors storybook-imports, storybook-decorators
  files/.storybook/vitest.setup.ts    # setProjectAnnotations([preview])
  files/src/components/Button/Button.stories.tsx   # play: click via getByRole
  kiro/steering/storybook.md
  kiro/agents/storybook-expert.json
```
```tsx
import type { Preview } from "@storybook/react-vite";
// bonesmith:storybook-imports
const preview: Preview = {
  decorators: [
    // bonesmith:storybook-decorators
  ],
};
export default preview;
```
MUI decorator patch: `(Story) => <ThemeProvider theme={theme}><Story /></ThemeProvider>,`.

## 5. Peer ranges (approved 2026-10-25: ranges)

Exact peer pins (`"react": "19.2.1"`) force consumers onto one patch version, which is hostile for a published library. Proposed: `peerDependencies` may use `^<major>.<minor>.0` ranges, the installed version stays an exact `devDependencies` pin, and template lint checks that the pin satisfies the range. This is an exception to the exact-pin rule in the spec and `tech.md`, so it needs your approval. Until then, the 01 schema keeps peers exact and task 1 of this spec records the decision.

## 6. Kiro

- `type/library`: `library.md`, `library-expert`, `structure.md` / `tech.md` `library` sections, the `feature-builder` append. Toolchain-specific wording (`vp pack` vs `vite build`) comes from `when: {type: "library"}` variants of `toolchain/*` that add to the `library` section.
- `addons/storybook`: `storybook.md`, `storybook-expert` (`mcpServers: ["storybook"]`), `tech.md` `storybook` section. Core generates the MCP line (02 §7).

## 7. Tests

- `test/snapshot/library.test.ts`: 14 combinations, assertions from Req 7.2, sharing `kiro-checks.ts`.
- 04's app file-list and content snapshots must stay unchanged.
- Resolve tests on the real templates (Req 7.3).
