# Requirements: 01 Core foundation

Part 1 of 6. Order: **01 core-foundation** → 02 render-engine → 03 cli-install → 04 app-templates → 05 library-storybook → 06 quality-release.
Source: `docs/superpowers/specs/2026-10-14-bonesmith-scaffolder-design.md` (amended 2026-10-23).

## Introduction

Sets up the scaffolder package and the data layer everything else builds on: the axis registry (`templates/axes.json`), the `layer.json` schema and loader (`layers.ts`), the error type, and the resolver (`resolve.ts`), which turns choices into a validated, ordered layer plan. Nothing here renders files, prompts, or runs processes. Tests use small fixture template trees, not real layer content (that comes in 04/05).

Glossary:
- **Axis**: type, toolchain, routing, state, styling, ui. Package manager is not a template axis.
- **Layer**: `templates/<axis>/<option>/` with `layer.json`, `files/`, optional `files@<variant>/`, `patches/`, `kiro/`.
- **Foundation**: `base/`, `type/*`, `addons/*`.
- **Plan**: the resolver's output; the ordered layers with selected variants.

## Requirement 1: Scaffolder package

**User story:** As a maintainer, I want a minimal, pinned, strict TypeScript package, so that the scaffolder is reproducible.

#### Acceptance criteria
1. THE repo SHALL have a `package.json` named `create-bonesmith`, ESM, with `bin: { "create-bonesmith": "dist/index.js" }`, `files: ["dist", "templates"]` and `engines.node` covering the current Node LTS and newer.
2. Every dependency and devDependency of the scaffolder SHALL be pinned exactly, and runtime dependencies SHALL be limited to `commander`, `@clack/prompts`, `zod`, `semver`, `validate-npm-package-name`.
3. THE TypeScript config SHALL be `strict`, and lint SHALL fail on `any` (`@typescript-eslint/no-explicit-any: error`).
4. THE package SHALL provide scripts `build`, `typecheck`, `lint`, `test`, and `tech.md` SHALL list them.
5. THE `test` script SHALL run with Vitest and SHALL fail if any test spawns a child process.

## Requirement 2: Errors

**User story:** As a developer, I want every failure to tell me how to fix it.

#### Acceptance criteria
1. THE core SHALL raise failures as `BonesmithError` with a stable `code`, a `message` (what failed and why) and a `fix` (the exact flag or action).
2. THE core SHALL treat unknown layer references, include cycles and agent name collisions as errors, never silent skips.

## Requirement 3: Axis registry

**User story:** As a maintainer, I want axes defined as data, so that core never names an axis option.

#### Acceptance criteria
1. THE file `templates/axes.json` SHALL define, per axis, its flag, prompt message and default, plus `promptOrder`, `renderOrder` and `verifyScripts`.
2. THE options of an axis SHALL be the subfolders of `templates/<axis>/`; adding an option SHALL NOT need a core change.
3. IF `axes.json` is malformed, or an axis default is not one of its folders, THEN loading SHALL fail naming the field.
4. Defaults SHALL be: type `app`, toolchain `vite-plus`, routing `react-router`, state `none`, styling `tailwind`, UI `none`.

## Requirement 4: Load and validate layer manifests

**User story:** As a maintainer, I want malformed layers rejected at load time, so that template mistakes surface early.

#### Acceptance criteria
1. THE loader SHALL validate every `layer.json` against a zod schema with unknown keys rejected.
2. THE schema SHALL cover `label`, `hint`, `dependencies`, `devDependencies`, `peerDependencies`, `scripts`, `packageJson`, `requires`, `conflicts`, `disablesAxes`, `includes`, `engines`, `variants` (`name`, `when`, and the contribution fields), `patches`, `steering`, `steeringSections`, `agentAppends`, `postInstall`, `mcpServers`, `overrides`, `nextSteps`.
3. IF a dependency version is not an exact pin (range, `^`, `~`, tag, `latest`) THEN THE loader SHALL reject the layer.
4. IF a `when`, `requires`, `disablesAxes` key names an unknown axis, or a value names an unknown option, THEN THE loader SHALL reject it.
5. IF an MCP entry is neither `{ command, args, pin }` (with `pin` exactly `<pkg>@<exact>` and present in `args`) nor `{ url, provider, script }` (with `url` on `https://`, `http://localhost` or `http://127.0.0.1`) THEN THE loader SHALL reject it.
6. IF a `postInstall` entry is not a non-empty array of strings THEN THE loader SHALL reject it.
7. IF a `patches` entry has both or neither of `content` / `contentFile`, or a `position` other than `before` / `after`, THEN THE loader SHALL reject it.
8. WHEN validation fails THE error SHALL name the layer path, the field path, and the problem.
9. THE loader SHALL type untrusted input as `unknown` and narrow it; layer types SHALL be derived from the schema.
10. THE loader SHALL emit a JSON Schema of `layer.json` for editor support.

## Requirement 5: Resolve choices into a plan

**User story:** As a developer, I want invalid stacks rejected before anything is written.

#### Acceptance criteria
1. THE resolver SHALL process in order: seed (`base` + one layer per selected axis), expand `includes`, apply `disablesAxes`, select variants, check `requires` / `conflicts`, check `engines`, check agent name collisions, sort by `renderOrder`.
2. IF an `includes` reference is unknown, or the includes form a cycle, THEN THE resolver SHALL fail naming the layers (cycle as a path `a → b → a`).
3. IF a flag was given for an axis disabled by the expanded set THEN THE resolver SHALL fail with "`--<axis>` isn't used with `--<axis> <option>`; remove it."
4. THE resolver SHALL drop disabled axes from the selections; `routing` and `state` SHALL be optional in `Choices`.
5. WHEN every key of a variant's `when` matches the selections (scalar equality or array membership) THE resolver SHALL select it; a key on a disabled axis SHALL never match.
6. IF a `requires` is unmet THEN THE resolver SHALL fail with the flag that fixes it (e.g. "`--ui shadcn` requires `--styling tailwind`").
7. THE resolver SHALL treat `conflicts` as symmetric and fail with the compatible alternatives on the conflicting axis.
8. IF a layer's `engines.node` is not satisfied by the running Node version THEN THE resolver SHALL fail naming the required range and the other options on that axis whose engines pass (e.g. "re-run with `--toolchain vite`").
9. IF two layers ship an agent file with the same name THEN THE resolver SHALL fail.
10. THE resolver SHALL export `compatibleOptions(axis, partialSelections, layers)`, returning the options of `axis` that satisfy `requires` and `conflicts` in both directions against the selected layers.
11. THE resolver SHALL do no network access and run no processes, and SHALL contain no option-specific branches.
