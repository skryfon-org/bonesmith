import type { AxisRegistry } from "./axes.ts";
import type { LayerManifest, LoadedLayer, Variant } from "./layers.ts";

/** An axis name from `templates/axes.json` (e.g. the folder name `ui`). */
export type AxisId = string;
/** An option of an axis: a subfolder of `templates/<axis>/`. */
export type OptionId = string;
/** `base`, `<axis>/<option>` or `addons/<name>`. */
export type LayerId = string;

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface Choices {
  name: string;
  targetDir: string;
  packageManager: PackageManager;
  /** One option per selected axis. Axes disabled by the layer set are absent. */
  selections: Partial<Record<AxisId, OptionId>>;
  /** Axes the user set by flag (as opposed to defaults or prompts). */
  explicit: ReadonlySet<AxisId>;
}

export interface ResolvedLayer extends LoadedLayer {
  /** Variants whose `when` matched the selections, in declaration order. */
  variants: Variant[];
}

export interface Plan {
  /** The input choices with disabled axes removed from `selections`. */
  choices: Choices;
  /** Layers in render order. */
  layers: ResolvedLayer[];
  /** Axes disabled by some layer in the set. */
  disabledAxes: AxisId[];
  axes: AxisRegistry;
}

export type { LayerManifest };
