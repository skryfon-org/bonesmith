---
inclusion: always
---

# Structure

```
bonesmith/
  package.json           # name: create-bonesmith, bin: create-bonesmith
  src/
    cli.ts               # flags + prompts -> Choices
    resolve.ts           # expand includes, apply disablesAxes, select variants, requires/conflicts, engines (Node) check; registry probe is install preflight
    render.ts            # collect files from all layers, then patch anchors, merge -> temp dir
    install.ts           # move, git init, install, postInstall, initial commit, verify
    layers.ts            # load + type-check layer.json
  templates/
    base/                # TS strict, Vitest + RTL setup, src/ (no app shell)
    type/{app,library}/  # app: index.html, main.tsx, App.tsx, routes/; library: package entry
    toolchain/{vite-plus,vite}/
    addons/storybook/    # never prompted; pulled in via `includes`
    routing/{react-router,tanstack-router}/
    state/{zustand,redux-toolkit,none}/
    styling/{tailwind,css-modules,css-in-js}/
    ui/{shadcn,mui,mantine,none}/
  test/
    unit/
    matrix/
  docs/superpowers/specs/
  docs/superpowers/plans/
```

## Layer folder
```
<axis>/<option>/
  layer.json        # deps, devDeps, peerDeps (pinned), scripts, requires, conflicts,
                    # disablesAxes, includes, variants, postInstall, agents, mcpServers
  files/            # project files to add
  files@<variant>/  # files added only when that variant's `when` matches
  kiro/
    steering/       # fragments/files for generated .kiro/steering
    agents/         # agents for generated .kiro/agents
```

## Module boundaries
- `resolve`, `render`, `install` are each one exported function with typed input and output. They must be testable in isolation.
- `render` never touches the network or the target directory; it writes to a temp dir.
- `install` is the only module that runs external processes (git, package manager, `postInstall`, build/test).
- Core code must not contain option-specific logic (no `if (choices.ui === 'mui')`, no `if (choices.type === 'library')`). Option behaviour lives in `layer.json` (`disablesAxes`, `includes`, `variants`) and layer files.
- `Choices.routing` and `Choices.state` are optional; whether they are set comes from `disablesAxes`.

## Pipeline order
1. Collect (project name if not given; non-empty target dir is an error; prompts: type, toolchain, routing, state, UI, styling, package manager; prompts for axes disabled by the type are skipped; styling filtered by UI).
2. Resolve (expand includes, apply disablesAxes, select variants, requires/conflicts; fail early, clear message).
3. Render, two phases: collect files from base -> type -> toolchain -> addons -> routing -> state -> styling -> ui (disabled axes skipped; duplicate paths error), then apply all anchor patches.
4. Install (move to target, `git init`, install, `postInstall` via the package manager's local exec, initial commit).
5. Verify (build + lint + test once; failure is reported with the re-run command, project kept).
