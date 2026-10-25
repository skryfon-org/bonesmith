import semver from "semver";
import type { AxisRegistry } from "./axes.ts";
import { BonesmithError } from "./errors.ts";
import type { LayerSet, LoadedLayer, When } from "./layers.ts";
import type { AxisId, Choices, LayerId, OptionId, Plan, ResolvedLayer } from "./types.ts";

export interface ResolveEnv {
  /** e.g. `process.version`. */
  nodeVersion: string;
}

type Selections = Partial<Record<AxisId, OptionId>>;

const BASE: LayerId = "base";

function flagOf(axes: AxisRegistry, axis: AxisId): string {
  return axes.axes.get(axis)?.flag ?? `--${axis}`;
}

/** `--<axis> <option>` for axis layers, the layer id otherwise. */
function describe(layer: LoadedLayer, axes: AxisRegistry): string {
  return axes.axes.has(layer.group) && layer.option !== undefined
    ? `\`${flagOf(axes, layer.group)} ${layer.option}\``
    : `\`${layer.id}\``;
}

function flagValue(axes: AxisRegistry, axis: AxisId, option: OptionId): string {
  return `\`${flagOf(axes, axis)} ${option}\``;
}

function orList(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1] ?? ""}`;
}

function getLayer(layers: LayerSet, id: LayerId, from: string): LoadedLayer {
  const layer = layers.get(id);
  if (layer === undefined) {
    throw new BonesmithError("UNKNOWN_LAYER", `${from} references unknown layer \`${id}\`.`, `Add templates/${id}/ or remove the reference.`, { layer: id });
  }
  return layer;
}

/** Seed layer ids: `base` plus one per selected axis, in prompt order. */
function seed(selections: Selections, layers: LayerSet, axes: AxisRegistry): LayerId[] {
  const ids: LayerId[] = [BASE];
  getLayer(layers, BASE, "The template set");
  for (const axis of Object.keys(selections)) {
    if (!axes.axes.has(axis)) {
      const known = axes.promptOrder.map((a) => `\`${flagOf(axes, a)}\``).join(", ");
      throw new BonesmithError("UNKNOWN_LAYER", `Unknown axis \`${axis}\`.`, `Use one of: ${known}.`, { axis });
    }
  }
  for (const axis of axes.promptOrder) {
    const option = selections[axis];
    if (option === undefined) continue;
    const id = `${axis}/${option}`;
    if (!layers.has(id)) {
      const options = axes.axes.get(axis)?.options ?? [];
      throw new BonesmithError(
        "UNKNOWN_LAYER",
        `${flagValue(axes, axis, option)} is not an option (no templates/${id}/).`,
        `Use one of: ${options.map((o) => flagValue(axes, axis, o)).join(", ")}.`,
        { layer: id },
      );
    }
    ids.push(id);
  }
  return ids;
}

/** Depth-first include expansion. Each layer appears once; cycles and unknown refs fail. */
function expandIncludes(roots: readonly LayerId[], layers: LayerSet): LayerId[] {
  const out: LayerId[] = [];
  const done = new Set<LayerId>();
  const stack: LayerId[] = [];

  const visit = (id: LayerId, from: string): void => {
    if (done.has(id)) return;
    const onStack = stack.indexOf(id);
    if (onStack !== -1) {
      const cycle = [...stack.slice(onStack), id].join(" → ");
      throw new BonesmithError("INCLUDE_CYCLE", `Include cycle: ${cycle}.`, "Remove one of these `includes` entries.", { cycle });
    }
    const layer = getLayer(layers, id, from);
    stack.push(id);
    for (const inc of layer.manifest.includes ?? []) visit(inc, `templates/${id}/layer.json \`includes\``);
    stack.pop();
    done.add(id);
    out.push(id);
  };

  for (const id of roots) visit(id, "The selection");
  return out;
}

/** True when every key of `when` matches the selections (scalar equality or array membership). */
export function matches(when: When, selections: Selections): boolean {
  for (const [axis, expected] of Object.entries(when)) {
    if (expected === undefined) continue;
    const actual = selections[axis];
    if (actual === undefined) return false;
    if (Array.isArray(expected) ? !expected.includes(actual) : expected !== actual) return false;
  }
  return true;
}

function engineOk(layer: LoadedLayer, nodeVersion: string): boolean {
  const range = layer.manifest.engines?.node;
  return range === undefined || semver.satisfies(nodeVersion, range);
}

function conflictsWith(a: LoadedLayer, b: LoadedLayer): boolean {
  return (a.manifest.conflicts ?? []).includes(b.id) || (b.manifest.conflicts ?? []).includes(a.id);
}

/** Layers for a partial selection (base + selected axes + their includes; unknown refs skipped). */
function selectedLayers(partial: Selections, layers: LayerSet, axes: AxisRegistry, exclude: AxisId): LoadedLayer[] {
  const out: LoadedLayer[] = [];
  const seen = new Set<LayerId>();
  const add = (id: LayerId): void => {
    if (seen.has(id)) return;
    seen.add(id);
    const layer = layers.get(id);
    if (layer === undefined) return;
    out.push(layer);
    for (const inc of layer.manifest.includes ?? []) add(inc);
  };
  add(BASE);
  for (const axis of axes.promptOrder) {
    const option = partial[axis];
    if (axis !== exclude && option !== undefined) add(`${axis}/${option}`);
  }
  return out;
}

/** Axes disabled by the layers of a partial selection (including their includes). */
export function disabledAxesFor(partial: Selections, layers: LayerSet, axes: AxisRegistry): Set<AxisId> {
  const disabled = new Set<AxisId>();
  for (const layer of selectedLayers(partial, layers, axes, "")) {
    for (const axis of layer.manifest.disablesAxes ?? []) disabled.add(axis);
  }
  return disabled;
}

/**
 * Options of `axis` compatible with `partial`: no conflict in either direction with the
 * selected layers, the candidate's `requires` on already-selected axes hold, and every
 * selected layer's `requires` on `axis` include it. With `env`, engines must pass too.
 */
export function compatibleOptions(
  axis: AxisId,
  partial: Selections,
  layers: LayerSet,
  axes: AxisRegistry,
  env?: ResolveEnv,
): OptionId[] {
  const definition = axes.axes.get(axis);
  if (definition === undefined) return [];
  const selected = selectedLayers(partial, layers, axes, axis);
  return definition.options.filter((option) => {
    const candidate = layers.get(`${axis}/${option}`);
    if (candidate === undefined) return false;
    if (env !== undefined && !engineOk(candidate, env.nodeVersion)) return false;
    for (const layer of selected) {
      if (conflictsWith(candidate, layer)) return false;
      const allowed = layer.manifest.requires?.[axis];
      if (allowed !== undefined && !allowed.includes(option)) return false;
    }
    for (const [reqAxis, allowed] of Object.entries(candidate.manifest.requires ?? {})) {
      const current = reqAxis === axis ? undefined : partial[reqAxis];
      if (current !== undefined && allowed !== undefined && !allowed.includes(current)) return false;
    }
    return true;
  });
}

function checkRequires(set: readonly LoadedLayer[], selections: Selections, axes: AxisRegistry): void {
  for (const layer of set) {
    for (const [axis, allowed] of Object.entries(layer.manifest.requires ?? {})) {
      if (allowed === undefined) continue;
      const current = selections[axis];
      if (current !== undefined && allowed.includes(current)) continue;
      const wanted = orList(allowed.map((o) => flagValue(axes, axis, o)));
      const owner = layer.group === "base" || layer.group === "addons" ? "" : `, or pick a different \`${flagOf(axes, layer.group)}\``;
      throw new BonesmithError(
        "REQUIRES_UNMET",
        `${describe(layer, axes)} requires ${wanted}${current === undefined ? ` (\`${flagOf(axes, axis)}\` is not used here)` : ""}.`,
        `Re-run with ${wanted}${owner}.`,
        { layer: layer.id, axis, allowed },
      );
    }
  }
}

function checkConflicts(set: readonly LoadedLayer[], selections: Selections, layers: LayerSet, axes: AxisRegistry): void {
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      const a = set[i];
      const b = set[j];
      if (a === undefined || b === undefined || !conflictsWith(a, b)) continue;
      // Suggest changing the layer whose axis comes later in prompt order.
      const [keep, change] = axes.promptOrder.indexOf(a.group) > axes.promptOrder.indexOf(b.group) ? [b, a] : [a, b];
      const pickOther = axes.axes.has(keep.group) ? `\`${flagOf(axes, keep.group)}\`` : `layer than ${describe(keep, axes)}`;
      let fix = `Pick a different ${pickOther}.`;
      if (axes.axes.has(change.group)) {
        const rest: Selections = Object.fromEntries(Object.entries(selections).filter(([axis]) => axis !== change.group));
        const alternatives = compatibleOptions(change.group, rest, layers, axes);
        if (alternatives.length > 0) {
          fix = `Use ${orList(alternatives.map((o) => flagValue(axes, change.group, o)))} instead.`;
        }
      }
      throw new BonesmithError(
        "CONFLICT",
        `${describe(keep, axes)} conflicts with ${describe(change, axes)}.`,
        fix,
        { layers: [keep.id, change.id] },
      );
    }
  }
}

function checkEngines(set: readonly LoadedLayer[], layers: LayerSet, axes: AxisRegistry, env: ResolveEnv): void {
  for (const layer of set) {
    const range = layer.manifest.engines?.node;
    if (range === undefined || engineOk(layer, env.nodeVersion)) continue;
    let fix = `Upgrade Node to ${range}.`;
    const axis = axes.axes.get(layer.group);
    if (axis !== undefined) {
      const passing = axis.options.filter((o) => {
        const other = layers.get(`${axis.id}/${o}`);
        return o !== layer.option && other !== undefined && engineOk(other, env.nodeVersion);
      });
      if (passing.length > 0) fix = `Upgrade Node to ${range}, or re-run with ${orList(passing.map((o) => flagValue(axes, axis.id, o)))}.`;
    }
    throw new BonesmithError(
      "ENGINE_UNSUPPORTED",
      `${describe(layer, axes)} needs Node ${range}; this is Node ${env.nodeVersion}.`,
      fix,
      { layer: layer.id, range, nodeVersion: env.nodeVersion },
    );
  }
}

function checkAgents(set: readonly LoadedLayer[]): void {
  const owners = new Map<string, LayerId>();
  for (const layer of set) {
    for (const name of layer.agentNames) {
      const first = owners.get(name);
      if (first !== undefined) {
        throw new BonesmithError(
          "AGENT_COLLISION",
          `Agent \`${name}\` is shipped by both \`${first}\` and \`${layer.id}\`.`,
          `Rename templates/${layer.id}/kiro/agents/${name}.json, or use \`agentAppends\` to extend the existing agent.`,
          { agent: name, layers: [first, layer.id] },
        );
      }
      owners.set(name, layer.id);
    }
  }
}

/** Turns choices into a validated, render-ordered plan. Reads manifests only; no I/O. */
export function resolve(choices: Choices, layers: LayerSet, axes: AxisRegistry, env: ResolveEnv): Plan {
  // 1. Seed
  const roots = seed(choices.selections, layers, axes);

  // 2. Expand includes
  const expanded = expandIncludes(roots, layers).map((id) => getLayer(layers, id, "The selection"));

  // 3. Disabled axes
  const disabledBy = new Map<AxisId, LoadedLayer>();
  for (const layer of expanded) {
    for (const axis of layer.manifest.disablesAxes ?? []) if (!disabledBy.has(axis)) disabledBy.set(axis, layer);
  }
  for (const axis of axes.promptOrder) {
    const by = disabledBy.get(axis);
    const option = choices.selections[axis];
    if (by === undefined || option === undefined || !choices.explicit.has(axis)) continue;
    const flag = flagOf(axes, axis);
    throw new BonesmithError(
      "AXIS_DISABLED",
      `\`${flag}\` isn't used with ${describe(by, axes)}; remove it.`,
      `Remove \`${flag} ${option}\` from the command.`,
      { axis, disabledBy: by.id },
    );
  }
  const selections: Selections = {};
  for (const [axis, option] of Object.entries(choices.selections)) {
    if (option !== undefined && !disabledBy.has(axis)) selections[axis] = option;
  }
  // Re-expand without the disabled layers so their includes drop out too.
  const set = expandIncludes(seed(selections, layers, axes), layers).map((id) => getLayer(layers, id, "The selection"));

  // 4. Variants
  const resolved: ResolvedLayer[] = set.map((layer) => ({
    ...layer,
    variants: (layer.manifest.variants ?? []).filter((v) => matches(v.when, selections)),
  }));

  // 5–7. Constraints
  checkRequires(set, selections, axes);
  checkConflicts(set, selections, layers, axes);
  checkEngines(set, layers, axes, env);
  checkAgents(set);

  // 8. Render order (stable within a group)
  const order = (l: LoadedLayer): number => axes.renderOrder.indexOf(l.group);
  const sorted = resolved
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => order(a.layer) - order(b.layer) || a.index - b.index)
    .map((e) => e.layer);

  return {
    choices: { ...choices, selections },
    layers: sorted,
    disabledAxes: axes.promptOrder.filter((a) => disabledBy.has(a)),
    axes,
  };
}
