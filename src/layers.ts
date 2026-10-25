import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import semver from "semver";
import { z } from "zod";
import { listDirs, type AxisRegistry } from "./axes.ts";
import { BonesmithError } from "./errors.ts";
import type { AxisId, LayerId, OptionId } from "./types.ts";

// ---------------------------------------------------------------------------
// Primitive schemas
// ---------------------------------------------------------------------------

const EXACT_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const PACKAGE_NAME = /^(@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
const KEBAB = /^[a-z0-9][a-z0-9-]*$/;

/** True for `<pkg>@<exact>`, e.g. `@scope/pkg@1.2.3`. */
export function isExactPin(pin: string): boolean {
  const at = pin.lastIndexOf("@");
  if (at <= 0) return false;
  return PACKAGE_NAME.test(pin.slice(0, at)) && EXACT_VERSION.test(pin.slice(at + 1));
}

/** True for `https://…`, or `http://` on `localhost` / `127.0.0.1`. */
export function isLocalOrHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
}

const Exact = z.string().regex(EXACT_VERSION, "must be an exact version (no ^, ~, ranges or tags)");
const Deps = z.record(z.string().regex(PACKAGE_NAME, "not a valid package name"), Exact);
/** Peers may be an exact pin or `^<major>.<minor>.0`; render checks the devDependency pin satisfies it. */
export const PEER_RANGE = /^\^\d+\.\d+\.0$/;
const PeerDeps = z.record(
  z.string().regex(PACKAGE_NAME, "not a valid package name"),
  z.string().refine((v) => EXACT_VERSION.test(v) || PEER_RANGE.test(v), "must be an exact version or ^<major>.<minor>.0"),
);
/** package → whether its install script may run (pnpm `allowBuilds`). */
const BuildScripts = z.record(z.string().regex(PACKAGE_NAME, "not a valid package name"), z.boolean());
const SemverRange = z.string().refine((r) => semver.validRange(r) !== null, "must be a valid semver range");
const SteeringTarget = z.enum(["tech.md", "structure.md"]);

const RESERVED_PACKAGE_JSON_KEYS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "scripts"];
/** `1.2.3` or `npm:<pkg>@1.2.3` (an exact alias). */
export function isExactOverride(value: string): boolean {
  if (EXACT_VERSION.test(value)) return true;
  return value.startsWith("npm:") && isExactPin(value.slice("npm:".length));
}

const PM_OVERRIDE_KEYS = ["resolutions", "pnpm"];
const JsonObject = z.record(z.string(), z.json()).superRefine((obj, ctx) => {
  for (const key of Object.keys(obj)) {
    if (RESERVED_PACKAGE_JSON_KEYS.includes(key)) {
      ctx.addIssue({ code: "custom", path: [key], message: `use the top-level "${key}" field instead` });
    }
    if (PM_OVERRIDE_KEYS.includes(key)) {
      ctx.addIssue({ code: "custom", path: [key], message: 'declare "overrides" instead; it is translated for the chosen package manager' });
    }
  }
  const overrides = obj.overrides;
  if (overrides === undefined) return;
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    ctx.addIssue({ code: "custom", path: ["overrides"], message: "must be an object of package → exact version" });
    return;
  }
  for (const [pkg, value] of Object.entries(overrides)) {
    if (typeof value !== "string" || !isExactOverride(value)) {
      ctx.addIssue({ code: "custom", path: ["overrides", pkg], message: "must be an exact version or npm:<pkg>@<exact>" });
    }
  }
});

function strict<T extends z.core.$ZodLooseShape>(shape: T, keyKind = "key") {
  return z.strictObject(shape, {
    error: (iss) => (iss.code === "unrecognized_keys" ? `unknown ${keyKind}` : undefined),
  });
}

const McpCommand = strict({ command: z.string().min(1), args: z.array(z.string()), pin: z.string() }).refine(
  (e) => isExactPin(e.pin) && e.args.includes(e.pin),
  { message: "pin must be <pkg>@<exact> and appear in args", path: ["pin"] },
);
const McpUrl = strict({
  url: z.string().refine(isLocalOrHttpsUrl, "must be https://, or http:// on localhost / 127.0.0.1"),
  provider: z.string().regex(PACKAGE_NAME, "must be a package name"),
  script: z.string().min(1),
});
const McpEntry = z.union([McpCommand, McpUrl], {
  error: () => "must be { command, args, pin } or { url, provider, script }",
});

const Patch = strict({
  file: z.string().min(1),
  anchor: z.string().regex(/^[a-z0-9-]+$/, "must be lowercase kebab-case"),
  position: z.enum(["before", "after"], { error: () => 'must be "before" or "after"' }).optional(),
  content: z.string().optional(),
  contentFile: z.string().min(1).optional(),
}).refine((p) => (p.content === undefined) !== (p.contentFile === undefined), {
  message: "exactly one of content / contentFile",
});

const SteeringSnippet = strict({ target: SteeringTarget, section: z.string().min(1), content: z.string() });
const AgentAppend = strict({
  agent: z.string().min(1),
  prompt: z.string().optional(),
  resources: z.array(z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Schema factory (axis-aware)
// ---------------------------------------------------------------------------

function nonEmpty<T extends string>(values: readonly T[]): [T, ...T[]] {
  const [first, ...rest] = values;
  if (first === undefined) throw new Error("internal: empty enum");
  return [first, ...rest];
}

function axisLayerIds(axes: AxisRegistry): LayerId[] {
  const ids: LayerId[] = [];
  for (const axis of axes.axes.values()) for (const option of axis.options) ids.push(`${axis.id}/${option}`);
  return ids;
}

/** Builds the `layer.json` schema for a given axis registry. */
export function layerSchema(axes: AxisRegistry) {
  const axisIds = [...axes.axes.keys()];
  const AxisRef = z.enum(nonEmpty(axisIds), { error: (iss) => `unknown axis "${String(iss.input)}"` });
  const optionRef = (axis: AxisId) => {
    const options = axes.axes.get(axis)?.options ?? [];
    return z.enum(nonEmpty(options), {
      error: (iss) => `unknown option "${String(iss.input)}" for ${axis} (options: ${options.join(", ")})`,
    });
  };

  const whenShape: Record<string, z.ZodType> = {};
  const requiresShape: Record<string, z.ZodType> = {};
  for (const axis of axisIds) {
    const opt = optionRef(axis);
    whenShape[axis] = z.union([opt, z.array(opt).nonempty()]).optional();
    requiresShape[axis] = z.array(opt).nonempty().optional();
  }
  const When = strict(whenShape, "axis").refine((w) => Object.keys(w).length > 0, "must name at least one axis");
  const Requires = strict(requiresShape, "axis");
  const layerIds = axisLayerIds(axes);
  const LayerRef = z.enum(nonEmpty(layerIds), { error: (iss) => `unknown layer "${String(iss.input)}"` });

  const contribution = {
    dependencies: Deps.optional(),
    devDependencies: Deps.optional(),
    peerDependencies: PeerDeps.optional(),
    buildScripts: BuildScripts.optional(),
    scripts: z.record(z.string(), z.string()).optional(),
    packageJson: JsonObject.optional(),
    patches: z.array(Patch).optional(),
    steering: z.array(SteeringSnippet).optional(),
    agentAppends: z.array(AgentAppend).optional(),
    postInstall: z.array(z.array(z.string().min(1)).nonempty("must be a non-empty array of strings")).optional(),
    mcpServers: z.record(z.string().regex(KEBAB, "server names must be lowercase kebab-case"), McpEntry).optional(),
    overrides: z.array(z.string().min(1)).optional(),
  };

  const Variant = strict({
    name: z.string().regex(KEBAB, "must be lowercase kebab-case"),
    when: When,
    ...contribution,
  });

  return strict({
    $schema: z.string().optional(),
    label: z.string().min(1),
    hint: z.string().optional(),
    ...contribution,
    requires: Requires.optional(),
    conflicts: z.array(LayerRef).optional(),
    disablesAxes: z.array(AxisRef).optional(),
    includes: z.array(z.string().regex(/^addons\/[a-z0-9][a-z0-9-]*$/, "must be addons/<name>")).optional(),
    engines: strict({ node: SemverRange }).optional(),
    steeringSections: z.partialRecord(SteeringTarget, z.array(z.string().min(1))).optional(),
    nextSteps: z.string().optional(),
    variants: z.array(Variant).optional(),
  }).superRefine((m, ctx) => {
    const seen = new Set<string>();
    m.variants?.forEach((v, i) => {
      if (seen.has(v.name)) ctx.addIssue({ code: "custom", path: ["variants", i, "name"], message: `duplicate variant "${v.name}"` });
      seen.add(v.name);
    });
  });
}

// ---------------------------------------------------------------------------
// Types derived from the schema
// ---------------------------------------------------------------------------

/** The `when` map of a variant: axis → option or list of options. */
export type When = Partial<Record<AxisId, OptionId | [OptionId, ...OptionId[]]>>;

type RawManifest = z.infer<ReturnType<typeof layerSchema>>;
type RawVariant = NonNullable<RawManifest["variants"]>[number];

/** A validated `layer.json`. `when` / `requires` are typed by axis id. */
export type LayerManifest = Omit<RawManifest, "requires" | "variants"> & {
  requires?: Partial<Record<AxisId, OptionId[]>>;
  variants?: Variant[];
};
export type Variant = Omit<RawVariant, "when"> & { when: When };

export interface LoadedLayer {
  id: LayerId;
  /** `base`, `addons`, or the axis id. Used for render order. */
  group: string;
  /** The option for axis layers; the addon name for addons; undefined for base. */
  option: string | undefined;
  dir: string;
  manifest: LayerManifest;
  hasFilesDir: boolean;
  /** Names of `files@<variant>/` directories. */
  variantDirs: string[];
  /** Basenames (no `.json`) of `kiro/agents/*.json`. */
  agentNames: string[];
}

export type LayerSet = ReadonlyMap<LayerId, LoadedLayer>;

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const key of path) {
    if (typeof key === "number") out += `[${String(key)}]`;
    else out += out === "" ? String(key) : `.${String(key)}`;
  }
  return out === "" ? "(root)" : out;
}

interface Line {
  path: PropertyKey[];
  message: string;
}

/** Flattens zod issues into `field: problem` lines, picking the relevant union branch. */
function flatten(issues: readonly z.core.$ZodIssue[], prefix: PropertyKey[] = []): Line[] {
  const lines: Line[] = [];
  for (const issue of issues) {
    const path = [...prefix, ...issue.path];
    if (issue.code === "unrecognized_keys") {
      const message = issue.message.startsWith("Unrecognized") ? "unknown key" : issue.message;
      for (const key of issue.keys) lines.push({ path: [...path, key], message });
    } else if (issue.code === "invalid_union") {
      // Drop branches that failed on the value's type itself, then prefer the closest match:
      // fewest issues, then the deepest failure (the branch that got furthest).
      const candidates = issue.errors.filter((b) => !b.some((i) => i.code === "invalid_type" && i.path.length === 0));
      const depth = (b: readonly z.core.$ZodIssue[]): number => Math.min(...b.map((i) => i.path.length));
      const rank = (a: readonly z.core.$ZodIssue[], b: readonly z.core.$ZodIssue[]): number =>
        a.length - b.length || depth(b) - depth(a);
      const sorted = [...candidates].sort(rank);
      const best = sorted[0];
      const second = sorted[1];
      if (best !== undefined && (second === undefined || rank(best, second) < 0)) {
        lines.push(...flatten(best, path));
      } else {
        lines.push({ path, message: issue.message === "Invalid input" ? "invalid value" : issue.message });
      }
    } else {
      lines.push({ path, message: issue.message });
    }
  }
  return lines;
}

function layerError(file: string, lines: Line[]): BonesmithError {
  const text = lines.map((l) => `${file}: ${formatPath(l.path)}: ${l.message}`);
  return new BonesmithError("LAYER_INVALID", text.join("\n"), "Fix the field in that file.", {
    file,
    issues: lines.map((l) => ({ field: formatPath(l.path), problem: l.message })),
  });
}

/** Maps a zod error to `LAYER_INVALID` with `file: field: problem` lines. */
export function schemaError(file: string, error: z.ZodError): BonesmithError {
  return layerError(file, flatten(error.issues));
}

/**
 * Validates an already-parsed `layer.json`. `file` is the display path used in errors
 * (e.g. `templates/<axis>/<option>/layer.json`).
 */
export function parseManifest(raw: unknown, file: string, axes: AxisRegistry): LayerManifest {
  const result = layerSchema(axes).safeParse(raw);
  if (!result.success) throw layerError(file, flatten(result.error.issues));
  return result.data as LayerManifest;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

function displayPath(root: string, file: string): string {
  return `${basename(root)}/${relative(root, file).split("\\").join("/")}`;
}

function loadLayer(root: string, id: LayerId, group: string, option: string | undefined, axes: AxisRegistry): LoadedLayer {
  const dir = join(root, id);
  const file = join(dir, "layer.json");
  const shown = displayPath(root, file);
  if (!existsSync(file)) {
    throw new BonesmithError("LAYER_INVALID", `${shown}: (file): missing layer.json`, `Add ${shown}.`, { file: shown });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw layerError(shown, [{ path: [], message: `invalid JSON: ${why}` }]);
  }
  const manifest = parseManifest(raw, shown, axes);

  const entries = readdirSync(dir, { withFileTypes: true });
  const variantNames = new Set((manifest.variants ?? []).map((v) => v.name));
  const variantDirs: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith("files@")) continue;
    const name = e.name.slice("files@".length);
    if (!variantNames.has(name)) {
      throw layerError(shown, [{ path: ["variants"], message: `directory ${e.name}/ has no variant named "${name}"` }]);
    }
    variantDirs.push(name);
  }
  variantDirs.sort();

  const agentsDir = join(dir, "kiro", "agents");
  const agentNames = existsSync(agentsDir)
    ? readdirSync(agentsDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => f.slice(0, -".json".length))
        .sort()
    : [];

  return {
    id,
    group,
    option,
    dir,
    manifest,
    hasFilesDir: entries.some((e) => e.isDirectory() && e.name === "files"),
    variantDirs,
    agentNames,
  };
}

/** Loads every layer under `root`: `base`, `<axis>/<option>` for each axis, and `addons/*`. */
export function loadLayers(root: string, axes: AxisRegistry): LayerSet {
  const layers = new Map<LayerId, LoadedLayer>();
  layers.set("base", loadLayer(root, "base", "base", undefined, axes));
  for (const axis of axes.axes.values()) {
    for (const option of axis.options) {
      const id = `${axis.id}/${option}`;
      layers.set(id, loadLayer(root, id, axis.id, option, axes));
    }
  }
  for (const name of listDirs(join(root, "addons"))) {
    const id = `addons/${name}`;
    layers.set(id, loadLayer(root, id, "addons", name, axes));
  }
  return layers;
}

// ---------------------------------------------------------------------------
// JSON Schema
// ---------------------------------------------------------------------------

/** JSON Schema of `layer.json` for the given registry (refinements are not representable). */
export function layerJsonSchema(axes: AxisRegistry): Record<string, unknown> {
  return z.toJSONSchema(layerSchema(axes), { unrepresentable: "any" });
}

/** Writes `layer.schema.json` (default: `<axes.root>/layer.schema.json`). Returns the path. */
export function emitJsonSchema(axes: AxisRegistry, outFile = join(axes.root, "layer.schema.json")): string {
  writeFileSync(outFile, `${JSON.stringify(layerJsonSchema(axes), null, 2)}\n`);
  return outFile;
}
