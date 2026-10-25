---
inclusion: always
---

# Testing

Every change to `src/` or `templates/` needs tests at the right level.

1. Unit (`test/unit`, run on every change)
   - `resolve` rejects each invalid pair (shadcn without Tailwind, MUI + Tailwind, MUI + CSS-in-JS, Mantine + Tailwind) in both types, and the `engines` (Node) check; the Vite+ registry probe is tested in `install` preflight.
   - `resolve` rejects routing/state flags with `--type library`, include cycles and unknown includes; selects variants by `when`; the library layer set excludes routing/state and includes `addons/storybook`.
   - `layers.ts` rejects malformed `disablesAxes`, `includes`, `variants`, `peerDependencies`, `postInstall`, MCP entries, and a `url` MCP entry without a pinned provider.
   - Deep merge of `package.json`, including `peerDependencies`.
   - Anchor patching fails on missing and on duplicate anchors.
   - Duplicate-file detection between layers and between variant file dirs.
   - `install` `postInstall`: local-exec mapping per package manager and failure message with the exact command, via an injected process runner.
2. Render snapshot (no install)
   - File list per combination. Existing app file lists stay unchanged by the type axis (regression).
   - Library per toolchain and every valid styling × UI pair: exports and peers present, `./styles.css` export only when styling emits CSS, no `index.html` / `main.tsx`, preview anchors patched.
   - `.kiro` output: valid front matter, agent JSON parses, referenced steering files exist, no unresolved placeholders or leftover anchors.
   - Agent set exactly matches chosen layers (no `ui-expert` / `state-expert` / `ui.md` / `state.md` for "none"; no `routing.md` / `state.md` / `routing-expert` / `state-expert` for library; `library-expert` + `storybook-expert` for library only).
   - `.kiro/settings/mcp.json` contains exactly the chosen layers' servers, each version-pinned (directly or via `provider`), and `tech.md` lists them.
3. Matrix (`test/matrix`, CI, slow)
   - Scaffold, install, build, lint, test.
   - Pairwise-style cover so every layer appears in at least one combination, plus a fixed list of likely real stacks. Package managers rotate across combinations.
   - Library: every styling and UI option at least once in library mode, both toolchains. Verify also runs Storybook browser tests (in `test`) and `build-storybook`, and checks `dist/index.d.ts` (and `dist/*.css` when styling emits CSS). Cache Playwright browsers in CI.

Template lint (CI): every `layer.json` validates against the schema; every patch's anchor exists in the foundation for every `type` its `when` allows; `includes` refs exist with no cycles; every `url` MCP `provider` and `postInstall` binary is a pinned dependency of the resolved set; no two layers write the same path without a declared override.

Unit and snapshot tests must not hit the network or run a package manager or other external process.
