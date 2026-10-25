---
inclusion: fileMatch
fileMatchPattern: "templates/**/kiro/**"
---

# Generated `.kiro/` contract

```
.kiro/
  steering/
    product.md structure.md tech.md testing.md   # base, composed
    routing.md state.md styling.md ui.md         # per layer; absent for "none"; routing/state absent for library
    library.md storybook.md                      # library only
  agents/
    reviewer.json  feature-builder.json          # shared, from base
    routing-expert.json state-expert.json styling-expert.json
    ui-expert.json toolchain-expert.json         # only for chosen layers
    library-expert.json storybook-expert.json    # library only
  settings/
    mcp.json                                     # only if a chosen layer declares a server
```

## Steering
- One concern per file. `structure.md` and `tech.md` are composed from per-layer snippets in a fixed section order defined by base. Missing layer = missing section, no empty placeholders.
- `tech.md`, `structure.md`: `inclusion: always`. Layer files: `inclusion: fileMatch` with a `fileMatchPattern`.
- CLI support for inclusion is partial (CLI skips `fileMatch`/`manual` files during auto-load), so every agent lists the steering files it needs in `resources`.
- Commands in `tech.md` and agents come from the toolchain layer (`vp ...` vs plain Vite scripts; `vp pack` vs `vite build` for libraries). Never mix the two.
- Library: `library.md` (fileMatch `src/**`, `package.json`: public API via `src/index.ts`, peer deps, no app-only code, semver/changelog); `storybook.md` (fileMatch `**/*.stories.tsx`, `.storybook/**`).

## Agents
- Authoring shape (layer `kiro/agents/*.json`): Kiro fields plus Bonesmith shorthand `mcpServers: string[]` (server names) and `writes: string[]` (globs). Render expands them to Kiro V3: an `mcpServers` map copied from the merged servers, `@<server>` in `tools`, `includeMcpJson: false`, and `permissions.rules` (allow `fs_write` on `writes`, deny elsewhere).
- Tech agents: prompt on that technology's conventions; `resources` = own steering file + `structure.md`; narrow `writes` (e.g. styling agent writes only style files and config).
- Library agents: `library-expert` writes only `src/index.ts`, `package.json`, build config. `storybook-expert` writes only stories and `.storybook/**`, `mcpServers: ["storybook"]` (shorthand).
- Layers may append guidance to shared agents and add new agents. They may not replace shared agents. Name collisions are a resolve-time error.
- `feature-builder` does not delegate to tech agents in v1; it only mentions them. Library append: component + story + test + export from `src/index.ts`.

## MCP
- Official servers only (published by the library's maintainers): shadcn MCP, `@mui/mcp`, `@mantine/mcp-server`, `@storybook/addon-mcp`. None for routing/state/styling/toolchain in v1.
- Entry is `{ command, args, pin }` (`pin` = `<pkg>@<exact>`, present in args) or `{ url, provider, script }` (localhost HTTP or HTTPS; `provider` is a pinned dependency of the resolved set; `script` is the package.json script that serves it). `pin` / `provider` / `script` are stripped from the emitted `mcp.json`. Storybook: `url: http://localhost:6006/mcp`, provider `@storybook/addon-mcp`, script `storybook`.
- No `@latest`, no unpinned `npx -y`.
- Merged into `.kiro/settings/mcp.json`; `tech.md` lists every configured server and marks `url` servers "requires `storybook` running".
- `ui-expert` references its library's server; `storybook-expert` references `storybook`.

Re-check the Kiro steering/agent schemas and MCP commands against current docs before changing this contract.
