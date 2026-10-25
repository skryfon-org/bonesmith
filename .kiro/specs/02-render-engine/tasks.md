# Tasks: 02 Render engine

Prerequisite: 01 complete.

- [x] 1. Virtual tree and collect phase
  - `src/tree.ts`: deterministic `readLayerFiles`, `_gitignore`/`_npmrc` mapping, `isBinary`, foundation flag.
  - Collect with variant-within-layer replacement, `VARIANT_FILE_COLLISION`, `FILE_COLLISION`, `overrides`, `STALE_OVERRIDE`, `files/package.json` rejection.
  - Fixture `test/fixtures/templates-render/` + unit tests for each rule.
  - _Requirements: 1.1, 2.1–2.7_

- [x] 2. `package.json` merge
  - `deepMergePackageJson` with attribution, array union, scalar conflict, reserved-key check, stable key order.
  - `MISSING_SCRIPT` for `verifyScripts`.
  - Unit tests: peers, arrays, conflicts naming both layers, ordering.
  - _Requirements: 3.1–3.5_

- [x] 3. Patches, anchors, placeholders
  - Anchor regex for `//`, `#`, `/*`, `{/*`, `<!--`; lookup, foundation check, missing/duplicate, indented stacking insert, strip.
  - Placeholder substitution (`name`, `pm`, `pmRun`, `pmExec`), binary skip.
  - Unit tests per rule.
  - _Requirements: 4.1–4.8_

- [x] 4. Steering composition
  - `composeSteering`: copy, `steeringSections` ordering, `UNKNOWN_SECTION`, generated `mcp` section.
  - Unit tests: ordering, missing section yields nothing, mcp section text for command and url entries.
  - _Requirements: 5.1–5.5_

- [x] 5. Agents and `mcp.json`
  - Authoring-shape zod schema; appends, shorthand expansion (`@server`, `includeMcpJson: false`), `writes` → `permissions.rules`, resource check.
  - `buildMcpJson`: merge, collision, provider pin check, strip Bonesmith fields, omit when empty.
  - Unit tests per rule; emitted agent has only Kiro fields.
  - _Requirements: 6.1–6.7, 7.1–7.3_

- [x] 6. Output checks and `render()`
  - `postInstall` aggregation + pin check, leftover-marker scan, `nextSteps` passthrough.
  - `render()` writes to `mkdtemp`, cleans up on failure.
  - Test: `render()` output on disk equals `renderFiles` tree.
  - _Requirements: 1.2, 1.3, 7.4–7.6_

- [x] 7. Checkpoint
  - `build`, `typecheck`, `lint`, `test` green; no option names in `src/`.
