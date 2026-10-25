import type { Variant } from "./layers.ts";
import type { ResolvedLayer } from "./types.ts";

/** The fields a layer manifest and its variants can both contribute. */
export type ContributionData = Pick<
  Variant,
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "buildScripts"
  | "scripts"
  | "packageJson"
  | "patches"
  | "steering"
  | "agentAppends"
  | "postInstall"
  | "mcpServers"
  | "overrides"
>;

export type Patch = NonNullable<ContributionData["patches"]>[number];
export type McpEntry = NonNullable<ContributionData["mcpServers"]>[string];

export interface Contribution {
  /** `layer` or `layer#variant`, used in error messages. */
  from: string;
  layer: ResolvedLayer;
  data: ContributionData;
}

/** Each layer's manifest followed by its selected variants, in render order. */
export function contributions(layers: readonly ResolvedLayer[]): Contribution[] {
  return layers.flatMap((layer) => [
    { from: layer.id, layer, data: layer.manifest },
    ...layer.variants.map((v) => ({ from: `${layer.id}#${v.name}`, layer, data: v })),
  ]);
}
