import type { PackageManager } from "../../src/types.ts";

/**
 * The fixed CI matrix: real install, build, lint and test per combination.
 * Coverage rules are checked by `coverage.test.ts` (unit project).
 */
export interface Combo {
  /** Also the project name; unique, kebab-case. */
  id: string;
  /** Axis → option, passed as `--<axis> <option>`. Library combos have no routing/state. */
  selections: Readonly<Record<string, string>>;
  pm: PackageManager;
}

const app = (id: string, toolchain: string, routing: string, state: string, ui: string, styling: string, pm: PackageManager): Combo => ({
  id: `app-${id}`,
  selections: { type: "app", toolchain, routing, state, ui, styling },
  pm,
});

const lib = (id: string, toolchain: string, ui: string, styling: string, pm: PackageManager): Combo => ({
  id: `lib-${id}`,
  selections: { type: "library", toolchain, ui, styling },
  pm,
});

export const combos: readonly Combo[] = [
  // Likely real stacks.
  app("vp-shadcn", "vite-plus", "react-router", "zustand", "shadcn", "tailwind", "pnpm"),
  app("vite-mui", "vite", "tanstack-router", "redux-toolkit", "mui", "css-modules", "npm"),
  app("vp-mantine", "vite-plus", "tanstack-router", "none", "mantine", "css-modules", "yarn"),
  app("vite-tailwind", "vite", "react-router", "zustand", "none", "tailwind", "bun"),
  // Pairwise fill: every app option with both toolchains, css-in-js in app mode.
  app("vite-mantine-cssinjs", "vite", "react-router", "none", "mantine", "css-in-js", "pnpm"),
  app("vp-rtk-cssinjs", "vite-plus", "tanstack-router", "redux-toolkit", "none", "css-in-js", "npm"),
  app("vite-shadcn", "vite", "tanstack-router", "zustand", "shadcn", "tailwind", "yarn"),
  app("vp-mui", "vite-plus", "react-router", "none", "mui", "css-modules", "bun"),
  // Library: every styling and UI option, both toolchains, package managers rotating.
  lib("vp-shadcn", "vite-plus", "shadcn", "tailwind", "pnpm"),
  lib("vite-tailwind", "vite", "none", "tailwind", "npm"),
  lib("vp-mui", "vite-plus", "mui", "css-modules", "yarn"),
  lib("vite-mantine", "vite", "mantine", "css-modules", "bun"),
  lib("vp-cssinjs", "vite-plus", "none", "css-in-js", "pnpm"),
  lib("vite-cssinjs", "vite", "none", "css-in-js", "npm"),
];

/** CLI flags for a combination (without the project name). */
export function comboFlags(combo: Combo): string[] {
  return [...Object.entries(combo.selections).flatMap(([axis, option]) => [`--${axis}`, option]), "--pm", combo.pm];
}
