import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { BonesmithError } from "./errors.ts";
import type { AxisId, OptionId } from "./types.ts";

/** Render groups that are not prompted axes. */
export const FOUNDATION_GROUPS = ["base", "addons"] as const;

const NAME = /^[a-z0-9][a-z0-9-]*$/;

const AxisEntry = z.strictObject({
  flag: z.string().regex(/^--[a-z][a-z0-9-]*$/, "must look like --<name>"),
  message: z.string().min(1),
  default: z.string().min(1),
});

const AxesFile = z.strictObject({
  $schema: z.string().optional(),
  promptOrder: z.array(z.string()).nonempty(),
  renderOrder: z.array(z.string()).nonempty(),
  axes: z.record(z.string().regex(NAME, "axis names must be lowercase kebab-case"), AxisEntry),
  verifyScripts: z.array(z.string().min(1)).nonempty(),
});

export interface AxisDefinition {
  readonly id: AxisId;
  readonly flag: string;
  readonly message: string;
  readonly default: OptionId;
  /** Subfolders of `templates/<axis>/`. */
  readonly options: readonly OptionId[];
}

export interface AxisRegistry {
  readonly root: string;
  readonly promptOrder: readonly AxisId[];
  /** Axis ids plus the foundation groups `base` and `addons`. */
  readonly renderOrder: readonly string[];
  readonly axes: ReadonlyMap<AxisId, AxisDefinition>;
  readonly verifyScripts: readonly string[];
}

function invalid(field: string, problem: string): BonesmithError {
  return new BonesmithError(
    "AXES_INVALID",
    `axes.json: ${field}: ${problem}`,
    "Fix that field in templates/axes.json.",
    { field },
  );
}

function formatPath(path: readonly PropertyKey[]): string {
  let out = "";
  for (const key of path) {
    out += typeof key === "number" ? `[${String(key)}]` : out === "" ? String(key) : `.${String(key)}`;
  }
  return out === "" ? "(root)" : out;
}

/** Lists the subdirectories of `dir` (sorted), or `[]` if it doesn't exist. */
export function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/** Loads and validates `<root>/axes.json`; options come from `<root>/<axis>/*`. */
export function loadAxes(root: string): AxisRegistry {
  const file = join(root, "axes.json");
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw invalid("(file)", `cannot read or parse ${file}: ${why}`);
  }

  const parsed = AxesFile.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue === undefined) throw invalid("(root)", "invalid");
    const path = issue.code === "unrecognized_keys" ? [...issue.path, issue.keys[0] ?? ""] : issue.path;
    throw invalid(formatPath(path), issue.code === "unrecognized_keys" ? "unknown key" : issue.message);
  }
  const data = parsed.data;
  const axisIds = Object.keys(data.axes);

  data.promptOrder.forEach((id, i) => {
    if (!axisIds.includes(id)) throw invalid(`promptOrder[${i}]`, `unknown axis "${id}"`);
  });
  for (const id of axisIds) {
    if (!data.promptOrder.includes(id)) throw invalid("promptOrder", `missing axis "${id}"`);
  }
  if (new Set(data.promptOrder).size !== data.promptOrder.length) throw invalid("promptOrder", "duplicate entry");

  const groups: readonly string[] = [...FOUNDATION_GROUPS, ...axisIds];
  data.renderOrder.forEach((id, i) => {
    if (!groups.includes(id)) throw invalid(`renderOrder[${i}]`, `unknown axis "${id}"`);
  });
  for (const id of groups) {
    if (!data.renderOrder.includes(id)) throw invalid("renderOrder", `missing "${id}"`);
  }
  if (new Set(data.renderOrder).size !== data.renderOrder.length) throw invalid("renderOrder", "duplicate entry");

  const axes = new Map<AxisId, AxisDefinition>();
  for (const id of axisIds) {
    const entry = data.axes[id];
    if (entry === undefined) continue;
    if (entry.flag !== `--${id}`) throw invalid(`axes.${id}.flag`, `must be "--${id}"`);
    const options = listDirs(join(root, id));
    for (const option of options) {
      if (!NAME.test(option)) throw invalid(`axes.${id}`, `option folder "${id}/${option}" must be lowercase kebab-case`);
    }
    if (!options.includes(entry.default)) {
      const known = options.length > 0 ? options.join(", ") : "none";
      throw invalid(`axes.${id}.default`, `"${entry.default}" is not a folder under ${id}/ (options: ${known})`);
    }
    axes.set(id, { id, flag: entry.flag, message: entry.message, default: entry.default, options });
  }

  return {
    root,
    promptOrder: data.promptOrder,
    renderOrder: data.renderOrder,
    axes,
    verifyScripts: data.verifyScripts,
  };
}
