# Requirements: 03 CLI and install

Part 3 of 6. Order: 01 core-foundation → 02 render-engine → **03 cli-install** → 04 app-templates → 05 library-storybook → 06 quality-release.
Depends on: 01 (`resolve`, `compatibleOptions`, axes), 02 (`render`).

## Introduction

The user-facing command and everything that touches the outside world: flags and prompts (`cli.ts`), the package-manager table (`pm.ts`), the process runner (`process.ts`), and install + verify (`install.ts`). Tested with fixture templates, mocked prompts and a fake process runner; the first real end-to-end run happens in 04.

## Requirement 1: Flags and prompts

**User story:** As a developer, I want to pick my stack through prompts or flags.

#### Acceptance criteria
1. THE CLI SHALL parse flags with `commander`: `[name]`, one flag per axis from `axes.json`, `--package-manager` (alias `--pm`), `--yes`, `--help`, `--version`.
2. IF an axis flag's value isn't a folder of that axis THEN THE CLI SHALL exit listing the valid values.
3. WHEN interactive THE CLI SHALL prompt with `@clack/prompts` in `promptOrder` (type, toolchain, routing, state, UI, styling), then package manager.
4. WHEN a flag is given for an axis THE CLI SHALL skip that prompt.
5. WHEN an axis is disabled by an already-selected layer or its `includes` THE CLI SHALL skip that prompt and SHALL NOT apply its default.
6. THE CLI SHALL offer only `compatibleOptions` for each prompted axis (shadcn → only Tailwind).
7. WHEN `--yes` is given THE CLI SHALL use `axes.json` defaults and SHALL NOT prompt.
8. IF there is no TTY and `--yes` is not set and a choice is missing THEN THE CLI SHALL exit listing the missing flags.
9. THE package manager SHALL be the flag value, else detected from `npm_config_user_agent` (`pnpm/`, `yarn/`, `bun/`, `npm/`), else `npm`; interactive users SHALL be prompted with it preselected unless the flag is given or `--yes` is set.
10. THE CLI SHALL contain no option-specific logic; prompt labels and hints come from `layer.json` `label`/`hint`.

## Requirement 2: Project name and target directory

#### Acceptance criteria
1. WHEN no name is given and the CLI is interactive THE CLI SHALL prompt for it before any other prompt.
2. IF no name is given and `--yes` is set or there is no TTY THEN THE CLI SHALL exit: "No project name. Pass one: `npm create bonesmith my-app`."
3. IF the name is not a valid npm package name THEN THE CLI SHALL show the reason and ask again (prompt) or exit (argument).
4. THE target directory SHALL be `<cwd>/<name>`, using the part after `/` for scoped names.
5. IF the target exists and is not empty THEN THE CLI SHALL exit before resolving, naming the directory and telling the user to choose another name or empty it, and SHALL NOT modify it.
6. WHEN the target exists and is empty THE CLI SHALL use it.

## Requirement 3: Install

**User story:** As a developer, I want dependencies installed and git initialised.

#### Acceptance criteria
1. THE installer SHALL run, in order: preflight, move, `git init`, package install, `postInstall`, initial commit, verify.
2. THE installer SHALL be the only module that runs external processes, and SHALL run them through an injected `ProcessRunner` using argv arrays without a shell.
3. THE preflight SHALL check `git` is available and that each pinned package of a layer with `engines` can be fetched from the registry. IF it fails THEN THE installer SHALL remove the temp dir, leave the target untouched, and report the fix (for the toolchain: "re-run with `--toolchain vite`").
4. THE move SHALL rename the temp dir to the target, falling back to copy + remove across devices, and SHALL keep an existing empty target.
5. THE installer SHALL run each `postInstall` argv with the package manager's local exec: `pnpm exec`, `npx --no --`, `yarn`, `bunx --no-install`.
6. THE initial commit SHALL be `git add -A` + `git commit -m "chore: initial commit from create-bonesmith"`; the installer SHALL NOT change git config. IF git has no identity THEN the step SHALL fail with the fix.
7. IF any step after the move fails THEN THE installer SHALL stop the remaining non-verify steps, keep the project, and report `cd <dir> && <exact command>`.
8. WHERE the package manager is yarn THE rendered project SHALL include `.yarnrc.yml` with `nodeLinker: node-modules`.

## Requirement 4: Verify

#### Acceptance criteria
1. WHEN install and the initial commit succeed THE installer SHALL run each `verifyScripts` entry (`build`, `lint`, `test`) through the package manager's run command.
2. THE installer SHALL run every verify script even if an earlier one fails, and report each as passed or failed with its re-run command.
3. A verify failure SHALL keep the project.

## Requirement 5: Report and exit codes

#### Acceptance criteria
1. THE CLI SHALL print each step with ✔ / ✖ and, on success, the next steps (`cd <dir>`, then the type layer's `nextSteps`).
2. Every `BonesmithError` SHALL print `✖ <message>` and `Fix: <fix>`, and exit 1. Unexpected errors SHALL print the stack and a bug-report hint, and exit 1.
3. THE exit code SHALL be 0 only when every step passed.
4. THE CLI SHALL resolve the running Node version from `process.versions.node` and pass it to `resolve`.
