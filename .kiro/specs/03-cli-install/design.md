# Design: 03 CLI and install

## 1. Decisions

- **Registry probe in install, not resolve** *(confirmed 2026-10-24)*. Resolve stays pure; it checks Node via `engines`. Whether a pinned toolchain package can be fetched needs the network, so it is install's preflight, which runs before anything is created. The error and the `--toolchain vite` fix are the same. Spec §3 step 2 is amended to say this.
- Install output streams to the terminal; preflight is captured.

## 2. Files

```
src/
  index.ts     # #!/usr/bin/env node; main(process.argv) and exit code
  cli.ts       # main(argv, deps): parse, collect, resolve, render, install, report
  prompts.ts   # thin wrapper over @clack/prompts (mockable)
  pm.ts        # PM table, detectPm()
  process.ts   # ProcessRunner + spawnRunner
  install.ts   # install(input, runner, fs) -> InstallReport
  report.ts    # format report and errors
test/unit/{cli,pm,install,report}.test.ts
```

`main(argv, deps)` takes `deps = { prompts, runner, fs, env, cwd, isTTY, nodeVersion, templatesRoot }` so every external input is injectable.

## 3. CLI flow (`cli.ts`)

1. `axes = loadAxes(root)`, `layers = loadLayers(root, axes)`.
2. commander program built from `axes.axes`: `.addOption(new Option(flag + " <option>", message).choices(optionsOf(axis)))`. `--pm` uses `["pnpm","npm","yarn","bun"]`. `explicit` = axes whose flags were passed.
3. Name: argument, else prompt (`text`, validate with `validate-npm-package-name`, errors joined), else `NO_NAME`. Invalid argument → `INVALID_NAME` with the package's reasons. `targetDir = join(cwd, name.split("/").pop())`. Exists and `readdir` non-empty → `TARGET_NOT_EMPTY`.
4. Choices loop over `promptOrder`:
   ```ts
   for (const axis of axes.promptOrder) {
     if (disabledBy(selections, layers).has(axis)) continue;     // expands includes generically
     const value = flags[axis] ?? (yes ? axes.axes[axis].default : undefined);
     if (value) { selections[axis] = value; continue; }
     if (!isTTY) { missing.push(axis); continue; }
     const options = compatibleOptions(axis, selections, layers, axes);
     selections[axis] = await prompts.select({ message, options: options.map(o => ({ value: o, label: layer.label, hint: layer.hint })) });
   }
   ```
   `missing` non-empty → `MISSING_FLAGS` listing `--<axis> <options>`. A flag for a disabled axis isn't consumed here; resolve raises `AXIS_DISABLED`. Ctrl-C (`isCancel`) exits 130 with "Cancelled."
5. PM: flag, else `detectPm(env.npm_config_user_agent)`; interactive and not `--yes` → `select` preselected.
6. `plan = resolve(choices, layers, axes, { nodeVersion })`.
7. `vars = pmVars(pm, name)`; `result = await render(plan, vars)`.
8. `report = await install({ result, targetDir, pm, probe: probeList(plan) }, runner, fs)`; print; exit code.

`probeList(plan)`: for layers with `engines`, every dependency/devDependency they pin (e.g. `vite-plus@1.4.0`), with `fix` built like resolve's engines fix ("re-run with `--toolchain vite`", from alternatives on the same axis).

## 4. PM table (`pm.ts`)

| PM | install | exec | run | probe `<pkg>@<ver>` | extra files |
|---|---|---|---|---|---|
| pnpm | `pnpm install` | `pnpm exec` | `pnpm run` | `pnpm view <spec> version` | – |
| npm | `npm install` | `npx --no --` | `npm run` | `npm view <spec> version` | – |
| yarn | `yarn install --no-immutable` (Yarn 4 is immutable under `CI`; a new project must write its lockfile) | `yarn` | `yarn run` | `npm view <spec> version` | `.yarnrc.yml`: `nodeLinker: node-modules` |
| bun | `bun install` | `bunx --no-install` | `bun run` | `npm view <spec> version` | – |

- The probe uses `npm view` for yarn and bun too: `npm` ships with Node and the probe only needs registry metadata. The 06 matrix confirms this with custom registries.
- `pmVars(pm, name) → { name, pm, pmRun, pmExec, extraFiles }`, consumed by 02.
- `detectPm(ua)`: prefix before `/`; unknown → `npm`.

## 5. Process runner (`process.ts`)

```ts
interface ProcessRunner { run(argv: readonly string[], opts: { cwd: string; capture: boolean }): Promise<{ code: number; stdout: string; stderr: string }> }
```
`spawnRunner`: `spawn(argv[0], argv.slice(1), { cwd, shell: false, stdio: capture ? "pipe" : "inherit" })`. On `win32`, package-manager binaries are `.cmd` shims that `shell: false` can't start, so `npm`, `npx`, `pnpm`, `yarn` get `.cmd` appended there (no extra dependency). Windows isn't in the CI matrix for v1; this is best effort. Spawn errors (`ENOENT`) map to `code: 127` with the message in `stderr`.

## 6. Install (`install.ts`)

```ts
interface InstallInput { result: RenderResult; targetDir: string; pm: PackageManager; probe: ProbeItem[] }
interface StepReport { name: "preflight"|"move"|"git-init"|"install"|"post-install"|"commit"|"verify:build"|...; ok: boolean; command?: string; fix?: string }
interface InstallReport { created: boolean; steps: StepReport[]; nextSteps?: string }
```
Steps:
1. preflight (capture): `git --version`; each probe. Failure → remove `tempDir`, `created: false`, `PREFLIGHT_FAILED` step with fix.
2. move: if target exists (empty, checked by cli) `rmdir` it, then `rename`; on `EXDEV` `cp -r` + `rm -r`.
3. `git init` (cwd target).
4. `PM.install`.
5. each `postInstall`: `[...PM.exec, ...argv]`.
6. `git add -A`; `git commit -m ...`. Non-zero with stderr matching `Please tell me who you are|user.email` → fix "Run `git config user.email you@example.com` (and `user.name`), then `git commit -m \"chore: initial commit from create-bonesmith\"`."
7. verify: each script `[...PM.run, script]`; continue on failure.
Steps 3–6 stop on failure; remaining steps marked not run. Command strings in reports use `cd <relative dir> && <argv joined with shell quoting>`.

## 7. Report (`report.ts`)

```
✔ Preflight
✔ Created my-app
✔ git init
✔ pnpm install
✔ pnpm exec playwright install chromium
✔ Initial commit
✔ pnpm run build   ✖ pnpm run lint   ✔ pnpm run test

Fix: cd my-app && pnpm run lint
Next: cd my-app && pnpm run dev
```
Errors: `✖ <message>\n  Fix: <fix>`. Exit: 0 all ok; 1 otherwise; 130 cancelled.

## 8. Testing

- `pm.test.ts`: table rows, `detectPm` per UA, unknown UA.
- `install.test.ts` (fake runner records argv; `FsLike` interface with an in-memory implementation in `test/support/`, no extra dependency): full success order; exec mapping per PM; probe failure removes temp and creates nothing; postInstall failure keeps project and reports exact command; missing git identity fix text; verify runs all three despite a failure; EXDEV fallback.
- `cli.test.ts` (fixture templates, mocked prompts, fake runner): name prompt + re-ask on invalid; `--yes` without name errors; non-empty target errors without touching it; `--yes` defaults; library skips routing/state prompts; `--type library --state zustand` → `AXIS_DISABLED`; shadcn → styling prompt offers only tailwind; no TTY missing flags list; unknown flag value lists valid ones; PM detection + preselect; cancel exits 130.
- `report.test.ts`: formatting snapshots.
- `cli.e2e.test.ts`: `main` with fixture templates and a fake runner that always succeeds; asserts the rendered files land in the target dir and the runner saw the expected argv sequence.
