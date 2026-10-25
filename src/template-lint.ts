import { readFileSync } from "node:fs";
import semver from "semver";
import { loadAxes, type AxisRegistry } from "./axes.ts";
import { isBonesmithError, type ErrorCode } from "./errors.ts";
import { loadLayers, type LayerSet } from "./layers.ts";
import { PACKAGE_MANAGERS, pmVars } from "./pm.ts";
import { patchId, renderFiles } from "./render.ts";
import { disabledAxesFor, resolve } from "./resolve.ts";
import type { AxisId, Choices, OptionId, Plan } from "./types.ts";

export type ProblemCode = ErrorCode | "OPTION_UNREACHABLE" | "VARIANT_UNUSED" | "PATCH_UNUSED" | "PEER_RANGE";

export interface Problem {
  /** The combination as CLI flags (e.g. `--type app --ui mui --pm npm`), or `(templates)` for set-wide problems. */
  combo: string;
  code: ProblemCode;
  message: string;
}

export interface LintOptions {
  /** Node version that engine ranges are checked against. Default: the minimum of this package's `engines.node`. */
  nodeVersion?: string;
}

type Selections = Partial<Record<AxisId, OptionId>>;

/** Errors that mean "this combination is unsupported", not "the templates are broken". */
const EXPECTED: readonly ErrorCode[] = ["REQUIRES_UNMET", "CONFLICT"];
const SET_WIDE = "(templates)";

/** Minimum Node version of `engines.node` in this package's package.json. */
export function minimumNode(): string {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { engines?: { node?: string } };
  const range = pkg.engines?.node;
  const min = range === undefined ? null : semver.minVersion(range);
  if (min === null) throw new Error("package.json has no usable engines.node range");
  return min.version;
}

/**
 * Every combination of axis options, in prompt order. Axes disabled by the options chosen so
 * far are left out, so each disabled-axis family (e.g. library) appears once, not once per option.
 */
export function enumerateSelections(layers: LayerSet, axes: AxisRegistry): Selections[] {
  const out: Selections[] = [];
  const walk = (i: number, partial: Selections): void => {
    const axis = axes.promptOrder[i];
    if (axis === undefined) {
      out.push(partial);
      return;
    }
    if (disabledAxesFor(partial, layers, axes).has(axis)) {
      walk(i + 1, partial);
      return;
    }
    for (const option of axes.axes.get(axis)?.options ?? []) walk(i + 1, { ...partial, [axis]: option });
  };
  walk(0, {});
  return out;
}

/** `--type app --toolchain vite ...` in prompt order. */
export function comboLabel(selections: Selections, axes: AxisRegistry, pm?: string): string {
  const parts: string[] = [];
  for (const axis of axes.promptOrder) {
    const option = selections[axis];
    if (option !== undefined) parts.push(`${axes.axes.get(axis)?.flag ?? `--${axis}`} ${option}`);
  }
  if (pm !== undefined) parts.push(`--pm ${pm}`);
  return parts.join(" ");
}

function choicesFor(selections: Selections): Choices {
  return { name: "lint-demo", targetDir: "/nonexistent/lint-demo", packageManager: "npm", selections, explicit: new Set() };
}

function problemFrom(err: unknown, combo: string): Problem {
  if (!isBonesmithError(err)) return { combo, code: "LAYER_INVALID", message: `internal error: ${err instanceof Error ? err.message : String(err)}` };
  const field = err.details?.field;
  const code: ProblemCode = err.code === "PACKAGE_JSON_CONFLICT" && typeof field === "string" && field.startsWith("peerDependencies.") ? "PEER_RANGE" : err.code;
  return { combo, code, message: `${err.message} ${err.fix}` };
}

/** Every patch id a layer set can apply (manifest patches and variant patches). */
function allPatchIds(layers: LayerSet): string[] {
  const ids: string[] = [];
  for (const layer of layers.values()) {
    (layer.manifest.patches ?? []).forEach((_, i) => ids.push(patchId(layer.id, i)));
    for (const v of layer.manifest.variants ?? []) {
      (v.patches ?? []).forEach((_, i) => ids.push(patchId(`${layer.id}#${v.name}`, i)));
    }
  }
  return ids;
}

/**
 * Lints a template tree without network or processes: loads every layer, resolves every
 * combination, renders each accepted one for every package manager, and reports every
 * problem (instead of stopping at the first), plus options, variants and patches never used.
 */
export function lintTemplates(root: string, opts: LintOptions = {}): Problem[] {
  let axes: AxisRegistry;
  let layers: LayerSet;
  try {
    axes = loadAxes(root);
    layers = loadLayers(root, axes);
  } catch (err) {
    return [problemFrom(err, SET_WIDE)];
  }
  const env = { nodeVersion: opts.nodeVersion ?? minimumNode() };

  const problems: Problem[] = [];
  const usedLayers = new Set<string>();
  const usedVariants = new Set<string>();
  const appliedPatches = new Set<string>();
  const seen = new Set<string>();

  for (const selections of enumerateSelections(layers, axes)) {
    let plan: Plan;
    try {
      plan = resolve(choicesFor(selections), layers, axes, env);
    } catch (err) {
      if (isBonesmithError(err) && EXPECTED.includes(err.code)) continue;
      problems.push(problemFrom(err, comboLabel(selections, axes)));
      continue;
    }
    const key = comboLabel(plan.choices.selections, axes);
    if (seen.has(key)) continue;
    seen.add(key);

    let rendered = false;
    for (const pm of PACKAGE_MANAGERS) {
      try {
        renderFiles(plan, pmVars(pm, "lint-demo"), { onPatch: (id) => appliedPatches.add(id) });
        rendered = true;
      } catch (err) {
        problems.push(problemFrom(err, comboLabel(plan.choices.selections, axes, pm)));
      }
    }
    if (!rendered) continue;
    for (const layer of plan.layers) {
      usedLayers.add(layer.id);
      for (const v of layer.variants) usedVariants.add(`${layer.id}#${v.name}`);
    }
  }

  for (const id of layers.keys()) {
    if (!usedLayers.has(id)) {
      problems.push({ combo: SET_WIDE, code: "OPTION_UNREACHABLE", message: `templates/${id} is in no valid, renderable combination.` });
    }
  }
  for (const layer of layers.values()) {
    for (const v of layer.manifest.variants ?? []) {
      const id = `${layer.id}#${v.name}`;
      if (!usedVariants.has(id)) problems.push({ combo: SET_WIDE, code: "VARIANT_UNUSED", message: `Variant \`${id}\` is selected in no valid combination; fix its \`when\` or remove it.` });
    }
  }
  for (const id of allPatchIds(layers)) {
    if (!appliedPatches.has(id)) problems.push({ combo: SET_WIDE, code: "PATCH_UNUSED", message: `Patch \`${id}\` is applied in no valid combination.` });
  }
  return problems;
}

/** One line per problem, for CLI / test output. */
export function formatProblems(problems: readonly Problem[]): string {
  return problems.map((p) => `[${p.code}] ${p.combo}: ${p.message}`).join("\n");
}
