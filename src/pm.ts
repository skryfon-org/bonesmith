import type { OverridesTarget, RenderVars } from "./render.ts";
import type { PackageManager } from "./types.ts";

export const PACKAGE_MANAGERS: readonly PackageManager[] = ["pnpm", "npm", "yarn", "bun"];

export interface PmCommands {
  install: readonly string[];
  /** Local exec prefix: runs a binary of an installed dependency, never downloads. */
  exec: readonly string[];
  run: readonly string[];
  /** Registry probe for `<pkg>@<version>`; prints the version if it exists. */
  probe: (spec: string) => string[];
  extraFiles: Readonly<Record<string, string>>;
  overridesTarget: OverridesTarget;
}

const npmView = (spec: string): string[] => ["npm", "view", spec, "version"];

export const PM: Readonly<Record<PackageManager, PmCommands>> = {
  pnpm: {
    install: ["pnpm", "install"],
    exec: ["pnpm", "exec"],
    run: ["pnpm", "run"],
    probe: (spec) => ["pnpm", "view", spec, "version"],
    extraFiles: {},
    overridesTarget: "pnpm-workspace.yaml",
  },
  npm: { install: ["npm", "install"], exec: ["npx", "--no", "--"], run: ["npm", "run"], probe: npmView, extraFiles: {}, overridesTarget: "package.json#overrides" },
  yarn: {
    // Yarn 4 enables immutable installs when CI is set; a new project must create its lockfile.
    install: ["yarn", "install", "--no-immutable"],
    exec: ["yarn"],
    run: ["yarn", "run"],
    probe: npmView,
    extraFiles: { ".yarnrc.yml": "nodeLinker: node-modules\n" },
    overridesTarget: "package.json#resolutions",
  },
  bun: {
    install: ["bun", "install"],
    exec: ["bunx", "--no-install"],
    run: ["bun", "run"],
    probe: npmView,
    extraFiles: {},
    overridesTarget: "package.json#overrides",
  },
};

export function isPackageManager(value: string): value is PackageManager {
  return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/** Package manager from `npm_config_user_agent` (e.g. `pnpm/10.0.0 npm/? node/v24`), else `npm`. */
export function detectPm(userAgent: string | undefined): PackageManager {
  const name = (userAgent ?? "").split("/")[0]?.trim() ?? "";
  return isPackageManager(name) ? name : "npm";
}

/** Template variables for render (spec 02). */
export function pmVars(pm: PackageManager, name: string): RenderVars {
  const row = PM[pm];
  return { name, pm, pmRun: row.run.join(" "), pmExec: row.exec.join(" "), extraFiles: { ...row.extraFiles }, overridesTarget: row.overridesTarget };
}
