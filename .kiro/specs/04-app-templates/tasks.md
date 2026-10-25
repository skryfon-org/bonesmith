# Tasks: 04 App templates

Prerequisites: 01–03 complete. Use the `layer-author` agent for layer work; it writes only under `templates/`.

- [x] 1. Pins and invocations
  - `npm view` every package in design §2, plus each package's `peerDependencies` to check compatibility. Record the results in `templates/PINS.md` with today's date.
  - Confirm the one-shot `vp test` form and the exact MCP invocations (`@mui/mcp`, `@mantine/mcp-server`, shadcn).
  - _Requirements: 1.1–1.3_

- [x] 2. `base`
  - `layer.json` (`steeringSections`, devDeps, variants `app`, `vp`, `vite`), files, `vite.config.ts` per toolchain variant with `vite-imports` / `vite-plugins`, steering frames, `product.md`, `testing.md`, `reviewer` and `feature-builder` agents.
  - _Requirements: 2.1–2.3, 2.5, 2.6, 6.1_

- [x] 3. `type/app`
  - Shell files with anchors (design §3), `App.test.tsx`, `nextSteps`, `structure.md` `type` section.
  - _Requirements: 2.4_

- [x] 4. Toolchains
  - `toolchain/vite-plus` (engines, scripts, section, `toolchain-expert`) and `toolchain/vite` (ESLint flat config, Prettier, scripts, section, agent).
  - _Requirements: 3.1–3.4_

- [x] 5. Routing and state
  - `routing/{react-router,tanstack-router}`, `state/{zustand,redux-toolkit,none}`, each with tests, steering, sections and agents.
  - _Requirements: 4.1–4.3, 6.2_

- [x] 6. Styling
  - `styling/{tailwind,css-modules,css-in-js}` with toolchain variants where setup differs.
  - _Requirements: 5.1_

- [x] 7. UI
  - `ui/{shadcn,mui,mantine,none}` with `requires` / `conflicts`, provider patches, MCP entries, `ui.md`, `ui-expert`.
  - Add the matching `resolve` unit tests on the real templates.
  - _Requirements: 5.2–5.6_

- [x] 8. Snapshot suite
  - `test/snapshot/app.test.ts` over all 84 app combinations; `test/snapshot/kiro-checks.ts`.
  - Commit `app-file-lists.snap` as the regression baseline.
  - _Requirements: 6.1–6.3, 7.1–7.3_

- [x] 9. Real runs
  - Run the two stacks from design §7 in a tmp dir outside the repo, check that build, lint and test pass, then delete the dirs.
  - Update `.kiro/steering/tech.md` if any commands changed.
  - _Requirements: 7.4_

## Notes

Real runs, 2026-10-24/25 (`node dist/index.js … < /dev/null` in a tmp dir; all exit 0, build + lint + test green, working tree clean after the initial commit):
- `--toolchain vite-plus --routing react-router --state zustand --ui shadcn --styling tailwind --pm pnpm` (5 tests)
- `--toolchain vite --routing tanstack-router --state redux-toolkit --ui mui --styling css-modules --pm npm` (5 tests)
- `--toolchain vite-plus --routing tanstack-router --state redux-toolkit --ui mantine --styling css-in-js --pm yarn` (5 tests)
- `--toolchain vite --routing react-router --state none --ui shadcn --styling tailwind --pm bun` (4 tests)
- `my-app --yes` (defaults; pnpm detected from the user agent)

Engine extension found in task 1: vite-plus needs package-manager overrides (`vite` → `vite-plus-core`, `vitest` pinned). Layers declare `packageJson.overrides` (exact versions only); render places them in `package.json` `overrides` (npm, bun), `resolutions` (yarn) or `pnpm-workspace.yaml` (pnpm). `.kiro/steering/tech.md` commands are unchanged.
