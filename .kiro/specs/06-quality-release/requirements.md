# Requirements: 06 Quality and release

Part 6 of 6. Order: 01 core-foundation → 02 render-engine → 03 cli-install → 04 app-templates → 05 library-storybook → **06 quality-release**.
Depends on: 01–05.

## Introduction

Proves every supported combination works, and ships it: template lint (exhaustive, in-memory), the CI matrix (real installs), the CI workflow for this repo, and the npm release process.

## Requirement 1: Template lint

**User story:** As a maintainer, I want template mistakes caught without running installs.

#### Acceptance criteria
1. THE function `lintTemplates(root)` SHALL load every layer (schema), enumerate every combination of options, keep those `resolve` accepts, run `renderFiles` on each, and return every error with its combination, instead of stopping at the first.
2. THE lint SHALL therefore catch, for every reachable combination: missing or duplicate anchors, anchors outside the foundation, unknown or cyclic `includes`, unpinned MCP providers and `postInstall` binaries, file collisions without override, package.json conflicts, missing scripts, leftover markers, and agent / steering / MCP problems.
3. THE lint SHALL fail if any option is valid in no combination, if any variant is selected in no combination, or if any patch never applies.
4. THE lint SHALL run as `lint:templates` and as part of `test`, without network or processes.
5. A bad-anchor fixture tree SHALL make the lint fail (self-test).
6. WHERE peer ranges are approved (05 design §5) THE lint SHALL check that every `peerDependencies` range is satisfied by the matching devDependency pin.

## Requirement 2: Matrix

**User story:** As a maintainer, I want real installs, builds, lints and tests for a representative set of stacks.

#### Acceptance criteria
1. THE matrix SHALL run the built CLI (`node dist/index.js <name> --yes` + flags) in a temp dir, then rely on its own verify (build, lint, test) and fail on any failed step.
2. THE combination list (`test/matrix/combinations.ts`) SHALL cover every layer at least once (pairwise-style), include a fixed list of likely real stacks, and rotate the four package managers.
3. THE list SHALL include every styling and UI option at least once in library mode, under both toolchains.
4. FOR library combinations THE matrix SHALL also run `build-storybook` and check that `dist/index.d.ts` exists, and `dist/*.css` exists when styling emits CSS.
5. A unit test SHALL check the coverage rules of Req 2.2–2.3 against the combination list and the template folders.
6. THE matrix SHALL run as `test:matrix`, only in CI or on demand, and SHALL clean up its temp dirs.

## Requirement 3: CI for this repo

#### Acceptance criteria
1. ON every push and pull request THE CI SHALL run `build`, `typecheck`, `lint`, `test` (including template lint and snapshots) on the supported Node versions.
2. ON pull requests touching `src/` or `templates/`, and on release tags, THE CI SHALL run the matrix, sharded per combination, with Playwright browsers and package-manager stores cached.
3. THE CI SHALL install pnpm, yarn and bun at pinned versions.

## Requirement 4: Release

#### Acceptance criteria
1. THE package SHALL be published to public npm as `create-bonesmith` with provenance, from CI only, on a version tag.
2. A release SHALL require a green matrix run for the tagged commit.
3. THE published tarball SHALL contain only `dist/`, `templates/` (including `PINS.md` and `layer.schema.json`), `README.md`, `LICENSE`, `package.json`, and a CI check SHALL compare `npm pack --dry-run --json` output against that list. It runs a process, so it lives outside the unit suite.
4. THE `README.md` SHALL document usage, every flag, the options table and unsupported combinations.
5. `.kiro/steering/tech.md` SHALL list the final commands (`build`, `typecheck`, `lint`, `test`, `test:matrix`, `lint:templates`).
