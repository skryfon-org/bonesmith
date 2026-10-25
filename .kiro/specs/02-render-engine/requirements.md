# Requirements: 02 Render engine

Part 2 of 6. Order: 01 core-foundation → **02 render-engine** → 03 cli-install → 04 app-templates → 05 library-storybook → 06 quality-release.
Depends on: 01 (`Plan`, `LayerSet`, `BonesmithError`).

## Introduction

Turns a resolved `Plan` into a complete project tree: files, `package.json`, anchor patches, placeholders and the generated `.kiro/` (steering, agents, `mcp.json`). Rendering happens in memory (`renderFiles`, pure) and is then written to a temp dir (`render`). This spec builds the generic engine only and tests it on fixture layers; real layer content comes in 04/05.

## Requirement 1: Render order and isolation

#### Acceptance criteria
1. THE renderer SHALL apply layers in the plan's order (base → type → toolchain → addons → routing → state → styling → ui, disabled axes skipped).
2. THE function `renderFiles(plan, vars)` SHALL be pure: it reads `templates/` but writes nothing, uses no network and runs no processes.
3. THE function `render(plan, vars)` SHALL write the tree only to a new temp dir and SHALL NOT touch the target directory.
4. THE renderer SHALL contain no option-specific branches.

## Requirement 2: Collect phase

**User story:** As a maintainer, I want file conflicts caught before anything is written.

#### Acceptance criteria
1. THE renderer SHALL collect every file from every layer's `files/` and every selected variant's `files@<name>/` before applying any patch.
2. WHEN a selected variant's `files@<name>/` has a path that is also in its own layer's `files/` THE renderer SHALL use the variant's file.
3. IF two selected variants of one layer write the same path THEN THE renderer SHALL fail with `VARIANT_FILE_COLLISION`.
4. IF two layers write the same path and the later layer does not list it in `overrides` THEN THE renderer SHALL fail with `FILE_COLLISION`, naming both layers and the path.
5. IF an `overrides` entry replaces no earlier file THEN THE renderer SHALL fail with `STALE_OVERRIDE`.
6. IF a layer ships `files/package.json` THEN THE renderer SHALL fail; `package.json` is built from manifest data only.
7. THE renderer SHALL map `_gitignore` → `.gitignore` and `_npmrc` → `.npmrc`.

## Requirement 3: `package.json`

#### Acceptance criteria
1. THE renderer SHALL build `package.json` from `name`, `version: "0.0.0"` and, in render order, every layer's and selected variant's `dependencies`, `devDependencies`, `peerDependencies`, `scripts` and `packageJson`.
2. THE merge SHALL be additive: objects merge recursively, arrays union in first-seen order, equal scalars pass, nothing can be deleted.
3. IF two contributions set different scalar values at the same path (e.g. two `build` scripts, two pins of one package) THEN THE renderer SHALL fail with `PACKAGE_JSON_CONFLICT`, naming both layers.
4. IF a script in `verifyScripts`, or the `script` of a `url` MCP entry, is missing from the merged scripts THEN THE renderer SHALL fail with `MISSING_SCRIPT`.
5. THE output SHALL be pretty-printed JSON with keys in a stable order.

## Requirement 4: Patch phase

#### Acceptance criteria
1. THE renderer SHALL apply patches after collection, in render order, layer patches before that layer's variant patches, in declaration order.
2. IF a patch's file is not in the tree THEN THE renderer SHALL fail with `PATCH_TARGET_MISSING`.
3. IF the target file came from a non-foundation layer THEN THE renderer SHALL fail with `ANCHOR_NOT_IN_FOUNDATION`.
4. IF the anchor appears zero times THEN `ANCHOR_MISSING`; more than once THEN `ANCHOR_DUPLICATE`. Both SHALL name the anchor, file and patching layer.
5. THE renderer SHALL insert patch content indented like the anchor: with `position: "before"` (default) above the anchor line, so patches stack in render order; with `position: "after"` directly below it, so patches stack in reverse render order (closing tags of nested providers).
6. WHEN all patches are applied THE renderer SHALL remove every anchor line.
7. THE renderer SHALL substitute `{{name}}`, `{{pm}}`, `{{pmRun}}`, `{{pmExec}}` in text files, and fail with `UNKNOWN_PLACEHOLDER` for any other `{{<word>}}` (no spaces). JSX object literals written as `{{ a }}` are not placeholders.
8. THE renderer SHALL treat a file with a NUL byte in its first 8 KB as binary and skip patching and substitution for it.

## Requirement 5: Composed steering

#### Acceptance criteria
1. THE renderer SHALL copy each layer's `kiro/steering/*.md` to `.kiro/steering/`, subject to the collision rules.
2. THE renderer SHALL compose `tech.md` and `structure.md` by inserting `steering` snippets at their `<!-- bonesmith:sections -->` anchor, sorted by base's `steeringSections` order.
3. A section with no snippet SHALL produce no output, not an empty heading.
4. IF a snippet names a section not in `steeringSections` THEN THE renderer SHALL fail with `UNKNOWN_SECTION`.
5. THE renderer SHALL generate the `mcp` section of `tech.md` from the merged servers: name and pinned package per entry, and "requires `{{pmRun}} <script>` running" for `url` entries. No servers SHALL mean no section.

## Requirement 6: Agents

#### Acceptance criteria
1. THE renderer SHALL apply `agentAppends` in render order: prompts appended as new paragraphs, resources unioned.
2. IF an append names an agent not in the output THEN THE renderer SHALL fail with `UNKNOWN_AGENT`.
3. THE renderer SHALL expand the Bonesmith shorthand `mcpServers: string[]` into Kiro's map shape, copying entries from the merged server set without Bonesmith-only fields, and add `@<server>` to `tools`.
4. IF a shorthand server is not in the merged set THEN `UNKNOWN_MCP_SERVER`.
5. THE renderer SHALL turn the Bonesmith field `writes: string[]` into `permissions.rules`: allow `fs_write` on those globs, deny `fs_write` on everything else.
6. IF a `file://` resource doesn't exist in the tree THEN `MISSING_RESOURCE`.
7. Emitted agents SHALL contain only Kiro agent fields (`name`, `description`, `prompt`, `tools`, `permissions`, `resources`, `mcpServers`, `includeMcpJson`).

## Requirement 7: `mcp.json` and output checks

#### Acceptance criteria
1. THE renderer SHALL merge all layers' `mcpServers` into `.kiro/settings/mcp.json` as `{ "mcpServers": {...} }` without Bonesmith-only fields (`pin`, `provider`, `script`), and SHALL NOT write the file when there are no servers.
2. IF two layers declare the same server name THEN `MCP_COLLISION`.
3. IF a `url` entry's `provider` is not a key of the merged dependencies or devDependencies THEN `UNPINNED_PROVIDER`.
4. IF a `postInstall` `argv[0]` is not a key of the merged dependencies or devDependencies THEN `POSTINSTALL_UNPINNED`.
5. THE rendered text files SHALL contain no `bonesmith:` anchors and no `{{` placeholders, else `LEFTOVER_MARKER`.
6. THE result SHALL include the merged `postInstall` list, `verifyScripts`, and the type layer's `nextSteps`.
