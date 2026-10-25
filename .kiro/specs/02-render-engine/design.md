# Design: 02 Render engine

## 1. Files

```
src/
  render.ts   # renderFiles(plan, vars) -> RenderedProject; render(plan, vars) -> RenderResult
  tree.ts     # VirtualTree, readLayerFiles(), name mapping, isBinary()
  merge.ts    # deepMergePackageJson(), patchAnchors(), substitute()
  kiro.ts     # composeSteering(), buildAgents(), buildMcpJson()
test/
  unit/{tree,merge,patch,kiro,render}.test.ts
  fixtures/templates-render/   # layers exercising every rule
```

## 2. Types

```ts
interface RenderVars { name: string; pm: PackageManager; pmRun: string; pmExec: string; extraFiles: Record<string, string> }
type VirtualTree = Map<string, { bytes: Uint8Array; from: LayerId; foundation: boolean }>;
interface RenderedProject {
  tree: VirtualTree;                    // includes package.json and .kiro/**
  postInstall: string[][];
  verifyScripts: string[];
  nextSteps: string | undefined;
}
interface RenderResult extends Omit<RenderedProject, "tree"> { tempDir: string }
```
`pmRun` / `pmExec` come from the PM table in spec 03 (`src/pm.ts`); 02 receives them as plain strings so it doesn't depend on install. Extra per-PM files (e.g. `.yarnrc.yml`) are passed as `extraFiles` in `RenderVars` and inserted as from layer `"pm"` before collision checks.

## 3. Pipeline in `renderFiles`

```
contributions = layers.flatMap(l => [l.manifest, ...l.variants])   // render order
1. collect files (incl. kiro/steering copies)   -> tree   (§4)
2. package.json                                 -> tree   (§5)
3. compose steering sections (as patches)               (§7)
4. apply all patches                            -> tree   (§6)
5. build agents and mcp.json                    -> tree   (§8)
6. strip anchors, substitute placeholders       -> tree   (§6)
7. output checks                                          (§9)
```
Composition (3) is expressed as patches at the `sections` anchor, so step 4 applies it like any other patch and step 6 strips the anchor. Agents (5) are built before step 6 so `{{pmRun}}` in agent prompts is substituted too.

## 4. Collect (`tree.ts`)

For each layer:
1. `own = read(files/)`; for each selected variant `v`: `vf = read(files@v.name/)`. Track paths written by variants; a path in two variant maps → `VARIANT_FILE_COLLISION`. Merge `own` then variant maps (variant wins within the layer).
2. Add `kiro/steering/*.md` as `.kiro/steering/<base>` and `kiro/agents/*.json` into a separate `agents` map (not the tree yet).
3. For each path: map `_gitignore`/`_npmrc`. `package.json` → `FILE_COLLISION` with fix "Declare it in layer.json instead." If the tree has it and the path isn't in `manifest.overrides ∪ variant.overrides` → `FILE_COLLISION`; else replace. Each `overrides` entry must have replaced something → `STALE_OVERRIDE`.
4. `foundation = id === "base" || id.startsWith("type/") || id.startsWith("addons/")`.

Reads are sorted (`readdir` + sort) so output is deterministic.

## 5. `package.json` (`merge.ts`)

*Added in 04:* `packageJson.overrides` (exact versions or `npm:<pkg>@<exact>`, validated in `layers.ts`) is merged like any other key, then `placeOverrides` moves it to where `RenderVars.overridesTarget` says: `package.json#overrides` (npm, bun), `package.json#resolutions` (yarn) or a generated `pnpm-workspace.yaml` (pnpm; a layer shipping that file is `FILE_COLLISION`).

```ts
deepMergePackageJson(acc: Attributed<JsonObject>, add: JsonObject, from: LayerId): void
```
- `Attributed` tracks which layer set each leaf, for error messages.
- object + object → recurse; array + array → union (JSON-equality, first-seen order); scalar === scalar → keep; otherwise `PACKAGE_JSON_CONFLICT` ("`scripts.build` is `vp build` from `toolchain/vite-plus` and `vp pack` from `toolchain/vite-plus#library`."). Type mismatch (object vs scalar) is also a conflict.
- Input per contribution: `{ dependencies, devDependencies, peerDependencies, scripts, ...packageJson }`; `packageJson` may not contain the four reserved keys (checked here, `LAYER_INVALID`).
- Final key order: `name, version, private, type, description, files, sideEffects, exports, main, types, scripts, dependencies, peerDependencies, devDependencies`, then the rest alphabetically; dependency maps sorted alphabetically.

## 6. Patches and markers (`merge.ts`)

```ts
const anchorRe = (a: string) => new RegExp(String.raw`^([ \t]*)(?://|#|/\*|\{/\*|<!--)\s*bonesmith:${a}\b.*$`, "gm");
```
- Lookup, foundation check, count check as in requirements. Content: `content` or file at `<layer>/patches/<contentFile>`; trailing newline normalised; each line prefixed with the anchor indent; inserted above the anchor line (`before`, default) or directly below it (`after`, so successive `after` patches end up in reverse render order).
- Strip: remove every line matching `anchorRe("[a-z0-9-]+")` in text files.
- Placeholders: `/\{\{(\w+)\}\}/g` replaced from `RenderVars` (`name`, `pm`, `pmRun`, `pmExec`); any other name → `UNKNOWN_PLACEHOLDER` naming the file. JSX object literals must be written with spaces (`style={{ color }}`), which the pattern doesn't match.
- `isBinary`: NUL in first 8192 bytes.

## 7. Steering composition (`kiro.ts`)

- `base` `layer.json` has `steeringSections: { "tech.md": ["toolchain","library","storybook","routing","state","styling","ui","mcp"], "structure.md": ["toolchain","library","routing","state","styling","ui"] }`. Real values are set in 04/05; 02 tests use fixtures.
- Collect snippets from all contributions; unknown section → `UNKNOWN_SECTION`. Group by target, order by section index then render order; join with `\n\n`.
- `mcp` section: built from merged servers (§8) as
  ```md
  ## MCP servers
  - `mui` — `@mui/mcp@<ver>` (runs via `{{pmExec}}`… as configured)
  - `storybook` — `@storybook/addon-mcp@<ver>`, requires `{{pmRun}} storybook` running
  ```
  Version of a `url` server = merged dependency version of its `provider`. A layer snippet with `section: "mcp"` is an error (`UNKNOWN_SECTION`), since core owns it.
- Inserted as a patch at `tech.md`/`structure.md` `sections` anchor (both live in base, so the foundation rule holds).

## 8. Agents and MCP (`kiro.ts`)

Authoring shape (layer `kiro/agents/<name>.json`, validated with zod here):
```ts
{ name: string; description: string; prompt: string; tools: string[];
  resources?: string[]; mcpServers?: string[]; writes?: string[]; includeMcpJson?: false }
```
Build:
1. Start from all layer agents (names unique per 01 resolve).
2. `agentAppends`: prompt `+ "\n\n" + append`; resources union. Missing agent → `UNKNOWN_AGENT`.
3. `mcpServers` shorthand → `{ [n]: stripBonesmith(servers[n]) }`, `tools.push("@" + n)`; missing → `UNKNOWN_MCP_SERVER`.
4. `writes` →
   ```json
   "permissions": { "rules": [
     { "capability": "fs_write", "match": [...writes], "effect": "allow" },
     { "capability": "fs_write", "match": ["**"], "exclude": [...writes], "effect": "deny" } ] }
   ```
5. `includeMcpJson: false` emitted explicitly when the agent has `mcpServers`, so it gets only its paired server.
6. Resources `file://<path>` checked against the tree (globs matched against tree paths; zero matches → `MISSING_RESOURCE`).
7. Write `.kiro/agents/<name>.json` (2-space JSON, trailing newline).

`mcp.json`: merge `mcpServers` across contributions (`MCP_COLLISION`), validate providers against merged deps (`UNPINNED_PROVIDER`), strip `pin`/`provider`/`script`, write only if non-empty.

## 9. Output checks

- `postInstall` argv[0] ∈ merged deps ∪ devDeps → else `POSTINSTALL_UNPINNED`.
- Text files: no `/bonesmith:[a-z0-9-]+/` and no `/\{\{\w+\}\}/` → else `LEFTOVER_MARKER` with file + line.
- `postInstall` aggregated in render order, de-duplicated by JSON equality.

## 10. `render()`

`fs.mkdtemp(join(os.tmpdir(), "bonesmith-"))`, write every tree entry (mkdir -p, mode 0644; files under `bin/` or with `#!` get 0755). On write failure, remove the temp dir and rethrow.

## 11. Testing

Fixture `templates-render` covers: variant replacing a base file; two variants colliding; cross-layer collision with and without `overrides`; stale override; `files/package.json`; scalar script conflict; peer merge; array union (`files`, `sideEffects`); patch stacking + indentation; missing/duplicate anchor; patch into non-foundation file; unknown placeholder; binary file untouched; steering sections ordering + missing section; `mcp` section text; agent append, unknown agent, shorthand expansion, `writes` → rules, missing resource; `mcp.json` absent when empty; `url` provider unpinned; postInstall unpinned; leftover marker. `render()` test writes to a temp dir and compares to `renderFiles` output (filesystem only, no processes).
