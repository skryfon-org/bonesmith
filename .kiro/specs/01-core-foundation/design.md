# Design: 01 Core foundation

## 0. Design-time checks (2026-10-23, shared by all six specs)

| Item | Result | Where it's used |
|---|---|---|
| Kiro `mcp.json` remote entries | `{ url, headers?, disabled?, autoApprove?, disabledTools? }`; HTTPS, or HTTP for localhost; workspace `.kiro/settings/mcp.json` beats user level | 02 §8, 05 (storybook server) |
| Kiro agent schema (IDE 1.0 / CLI V3) | `mcpServers` is a map of server configs; MCP tools enabled via `@<server>` in `tools`; `permissions.rules` replaces `toolsSettings` / `allowedTools`; `includeMcpJson` pulls in all workspace + user servers | 02 §8 (shorthand expansion) |
| Steering front matter | `fileMatchPattern` takes a string or an array | 04, 05 |
| Local exec | `pnpm exec`; `npx --no`; `bunx --no-install` (skips install if missing); `yarn <bin>` | 03 §4 |
| `vite-plus` | `1.4.0`, `engines.node: ^22.18.0 \|\| ^24.11.0 \|\| >=26.0.0`, bins `vp`, `vpr`, `vpx` | 04 (engines data) |
| `addon-vitest` under `vp test` | Passes (matrix `lib-vp-*`, 2026-10-25) | 05 task 1 (gate) |

This repo's own `.kiro/agents/*.json` still use legacy `toolsSettings` / `allowedTools`; `/upgrade-agent` migrates them. That doesn't affect the scaffolder.

## 1. Package

- `package.json`: `name: create-bonesmith`, `type: module`, `engines.node: ">=24.11.0"`, `bin: { "create-bonesmith": "dist/index.js" }`, `files: ["dist", "templates"]`.
- Runtime deps (exact, `npm view` 2026-10-23): `commander@15.0.0`, `@clack/prompts@1.8.1`, `zod@4.6.7`, `semver@7.8.5`, `validate-npm-package-name@8.0.0`.
- Dev deps (exact): `typescript@7.0.2`, `vitest@5.0.5`, `eslint@10.13.0`, `typescript-eslint@8.72.0`, `yaml@2.9.1`, `@types/node@26.6.5`, `@types/semver@7.8.0`. If `typescript-eslint@8.72.0` doesn't support TypeScript 7, pin the newest TypeScript it supports.
- `tsconfig.json` (strict, `module: nodenext`, `noUncheckedIndexedAccess`), `tsconfig.build.json` (only `src/`, out `dist/`).
- `eslint.config.js`: typescript-eslint strict-type-checked, `no-explicit-any: error`.
- `vitest.config.ts` with projects `unit`, `snapshot`, `lint` (later specs fill them). `test/setup/no-processes.ts` mocks `node:child_process` so `spawn`/`exec*` throw.
- Scripts: `build` (`tsc -p tsconfig.build.json`), `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (`vitest run`).
- Templates are located from `new URL("../templates/", import.meta.url)` (`src/paths.ts`); tests pass an explicit root.

## 2. Source files in this spec

```
src/
  errors.ts    # BonesmithError
  paths.ts     # templatesRoot()
  axes.ts      # loadAxes(root) -> AxisRegistry
  layers.ts    # zod schemas, loadLayers(root, axes) -> LayerSet, JSON Schema emit
  resolve.ts   # resolve(), compatibleOptions()
  types.ts     # Choices, Plan, ResolvedLayer, ids
test/
  fixtures/templates-basic/      # tiny synthetic layer trees
  fixtures/templates-library/
  fixtures/templates-bad-*/
  unit/{axes,layers,resolve}.test.ts
```

## 3. Errors (`errors.ts`)

```ts
export class BonesmithError extends Error {
  constructor(readonly code: ErrorCode, message: string, readonly fix: string, readonly details?: Record<string, unknown>) { super(message); }
}
export type ErrorCode =
  | "AXES_INVALID" | "LAYER_INVALID" | "UNKNOWN_LAYER" | "INCLUDE_CYCLE"
  | "AXIS_DISABLED" | "REQUIRES_UNMET" | "CONFLICT" | "ENGINE_UNSUPPORTED" | "AGENT_COLLISION"
  // added by 02/03:
  | "FILE_COLLISION" | "VARIANT_FILE_COLLISION" | "STALE_OVERRIDE" | "PACKAGE_JSON_CONFLICT"
  | "MISSING_SCRIPT" | "PATCH_TARGET_MISSING" | "ANCHOR_NOT_IN_FOUNDATION" | "ANCHOR_MISSING"
  | "ANCHOR_DUPLICATE" | "UNKNOWN_PLACEHOLDER" | "UNKNOWN_SECTION" | "UNKNOWN_AGENT"
  | "UNKNOWN_MCP_SERVER" | "MCP_COLLISION" | "UNPINNED_PROVIDER" | "MISSING_RESOURCE"
  | "POSTINSTALL_UNPINNED" | "LEFTOVER_MARKER"
  | "NO_NAME" | "INVALID_NAME" | "TARGET_NOT_EMPTY" | "MISSING_FLAGS" | "PREFLIGHT_FAILED" | "STEP_FAILED";
```
The code list is the full union for all six specs, defined once here so later specs only add cases to `switch`es.

## 4. Axis registry (`templates/axes.json`, `axes.ts`)

```json
{
  "promptOrder": ["type", "toolchain", "routing", "state", "ui", "styling"],
  "renderOrder": ["base", "type", "toolchain", "addons", "routing", "state", "styling", "ui"],
  "axes": {
    "type":      { "flag": "--type",      "message": "Project type", "default": "app" },
    "toolchain": { "flag": "--toolchain", "message": "Toolchain",    "default": "vite-plus" },
    "routing":   { "flag": "--routing",   "message": "Routing",      "default": "react-router" },
    "state":     { "flag": "--state",     "message": "State",        "default": "none" },
    "ui":        { "flag": "--ui",        "message": "UI library",   "default": "none" },
    "styling":   { "flag": "--styling",   "message": "Styling",      "default": "tailwind" }
  },
  "verifyScripts": ["build", "lint", "test"]
}
```
- `loadAxes` validates with zod, reads `templates/<axis>/*/` as options, and checks that each default is an option. `base` and `addons` are in `renderOrder` but are not axes.
- 01 ships the real `templates/axes.json`, but the real layer folders arrive in 04/05. Until then `loadAxes` is tested only on fixtures; the first test against the real `templates/` is added in 04.

## 5. Layer schema (`layers.ts`)

```ts
const Exact = z.string().regex(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, "must be an exact version (no ^, ~, ranges or tags)");
const Deps = z.record(z.string(), Exact);
const When = z.record(AxisId, z.union([OptionId, z.array(OptionId).nonempty()]));
const McpEntry = z.union([
  z.object({ command: z.string(), args: z.array(z.string()), pin: z.string() }).strict()
    .refine(e => isExactPin(e.pin) && e.args.includes(e.pin), "pin must be <pkg>@<exact> and appear in args"),
  z.object({ url: LocalOrHttpsUrl, provider: z.string(), script: z.string() }).strict(),
]);
const Patch = z.object({ file: z.string(), anchor: z.string().regex(/^[a-z0-9-]+$/), position: z.enum(["before", "after"]).optional(), content: z.string().optional(), contentFile: z.string().optional() })
  .strict().refine(p => (p.content === undefined) !== (p.contentFile === undefined), "exactly one of content / contentFile");
const Contribution = {
  dependencies: Deps.optional(), devDependencies: Deps.optional(), peerDependencies: Deps.optional(),
  scripts: z.record(z.string(), z.string()).optional(),
  packageJson: JsonObject.optional(),
  patches: z.array(Patch).optional(),
  steering: z.array(z.object({ target: z.enum(["tech.md", "structure.md"]), section: z.string(), content: z.string() }).strict()).optional(),
  agentAppends: z.array(z.object({ agent: z.string(), prompt: z.string().optional(), resources: z.array(z.string()).optional() }).strict()).optional(),
  postInstall: z.array(z.array(z.string()).nonempty()).optional(),
  mcpServers: z.record(z.string(), McpEntry).optional(),
  overrides: z.array(z.string()).optional(),
};
const LayerManifest = z.object({
  label: z.string(), hint: z.string().optional(),
  ...Contribution,
  requires: z.record(AxisId, z.array(OptionId)).optional(),
  conflicts: z.array(LayerId).optional(),
  disablesAxes: z.array(AxisId).optional(),
  includes: z.array(AddonLayerId).optional(),
  engines: z.object({ node: SemverRange }).strict().optional(),
  steeringSections: z.record(z.enum(["tech.md", "structure.md"]), z.array(z.string())).optional(),  // base only
  nextSteps: z.string().optional(),
  variants: z.array(z.object({ name: z.string().regex(/^[a-z0-9-]+$/), when: When, ...Contribution }).strict()).optional(),
}).strict();
```
- `AxisId` / `OptionId` / `LayerId` are built from the loaded `AxisRegistry`, so unknown names fail at schema time (Req 4.4). The schema is therefore a factory `layerSchema(axes)`.
- Errors: zod issues are mapped to `LAYER_INVALID` with message `templates/ui/mui/layer.json: variants[0].when.colour: unknown axis` and fix "Fix the field in that file."
- `loadLayers` returns `LayerSet = Map<LayerId, { id, dir, manifest, hasFilesDir, variantDirs, agentNames }>`. Agent names are the basenames of `kiro/agents/*.json`.
- `emitJsonSchema(axes)` writes `templates/layer.schema.json` via `z.toJSONSchema` (script `schema`); layer files can reference it with `$schema`, which the schema allows as the one extra key.

## 6. Types (`types.ts`)

```ts
type PackageManager = "pnpm" | "npm" | "yarn" | "bun";
interface Choices {
  name: string; targetDir: string; packageManager: PackageManager;
  selections: Partial<Record<AxisId, OptionId>>;
  explicit: ReadonlySet<AxisId>;     // set by flag
}
interface ResolvedLayer { id: LayerId; dir: string; manifest: LayerManifest; variants: Variant[] }
interface Plan { choices: Choices; layers: ResolvedLayer[]; axes: AxisRegistry }
```

## 7. Resolve (`resolve.ts`)

`resolve(choices, layers, axes, env: { nodeVersion: string }): Plan`:
1. Seed: `base` + `<axis>/<selection>` for each selection. A missing folder → `UNKNOWN_LAYER`.
2. Expand includes depth-first with a visiting stack: unknown → `UNKNOWN_LAYER`; revisit while on stack → `INCLUDE_CYCLE` (path in message). Each layer once.
3. `disabled = ⋃ disablesAxes`. For axis in `disabled ∩ explicit` → `AXIS_DISABLED` ("`--routing` isn't used with `--type library`; remove it.", naming the layer that disabled it). Remove disabled selections and their layers.
4. Variants: `matches(when, selections)`.
5. `requires`: for each layer, for `[axis, allowed]`, `selections[axis] ∈ allowed` else `REQUIRES_UNMET`. `conflicts`: build a symmetric set; any pair both present → `CONFLICT`, fix lists `compatibleOptions` for the later axis in prompt order.
6. `engines`: `semver.satisfies(nodeVersion, range)` else `ENGINE_UNSUPPORTED`, fix "Upgrade Node, or re-run with `--toolchain vite`" built from passing alternatives.
7. Agent names across layers unique, else `AGENT_COLLISION`.
8. Sort by `renderOrder` index of the layer's axis (`base` → `"base"`, `addons/*` → `"addons"`, stable within).

`compatibleOptions(axis, partial, layers, axes, env?)`: for each option of `axis`, candidate layer passes if no selected layer conflicts with it (either direction), its own `requires` on already-selected axes hold, and selected layers' `requires` on `axis` (if any) include it. Used by cli (03) to filter prompts and by resolve for fixes.

Resolve reads manifests only; it does not touch `files/`. The registry probe ("Vite+ can't be fetched") is not here; it is install's preflight (spec 03), because resolve must stay network-free. *(Confirmed 2026-10-24; see spec 03 design §1.)*

## 8. Testing

- Fixtures: `templates-basic` (base, type/{app,library}, toolchain/{a,b}, addons/x, routing/{r1,r2}, state/{s,none}, styling/{tw,mod,js}, ui/{sh,m,none}) mirroring real `requires`/`conflicts`/`disablesAxes`/`includes`/`engines` shapes with dummy content.
- `axes.test.ts`: valid load; missing default; unknown axis in orders.
- `layers.test.ts`: one valid + one invalid case per field from Req 4.2, error message format (path + field), `^1.0.0` / `latest` / `1.x` rejected, MCP union both shapes + bad url + pin not in args, patch content/contentFile xor, unknown key.
- `resolve.test.ts`: every conflict pair in both types; `AXIS_DISABLED` for routing and state flags; library set excludes routing/state and includes the addon; unknown include; cycle path text; variant scalar/array/disabled-axis matching; engines pass/fail with fix text; agent collision; render order; `compatibleOptions` (shadcn → only tw; mui → not tw, not js).
