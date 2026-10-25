import { describe, expect, it } from "vitest";
import { detectPm, isPackageManager, PM, pmVars } from "../../src/pm.ts";
import { resolveCommand } from "../../src/process.ts";

describe("PM table", () => {
  it("has install / exec / run per package manager", () => {
    expect(PM.pnpm).toMatchObject({ install: ["pnpm", "install"], exec: ["pnpm", "exec"], run: ["pnpm", "run"] });
    expect(PM.npm).toMatchObject({ install: ["npm", "install"], exec: ["npx", "--no", "--"], run: ["npm", "run"] });
    expect(PM.yarn).toMatchObject({ install: ["yarn", "install", "--no-immutable"], exec: ["yarn"], run: ["yarn", "run"] });
    expect(PM.bun).toMatchObject({ install: ["bun", "install"], exec: ["bunx", "--no-install"], run: ["bun", "run"] });
  });

  it("probes with pnpm view for pnpm and npm view otherwise", () => {
    expect(PM.pnpm.probe("a@1.0.0")).toEqual(["pnpm", "view", "a@1.0.0", "version"]);
    for (const pm of ["npm", "yarn", "bun"] as const) expect(PM[pm].probe("a@1.0.0")).toEqual(["npm", "view", "a@1.0.0", "version"]);
  });
});

describe("detectPm", () => {
  it.each([
    ["pnpm/10.0.0 npm/? node/v24.11.0 darwin arm64", "pnpm"],
    ["yarn/4.5.0 npm/? node/v24.11.0", "yarn"],
    ["bun/1.2.0 npm/? node/v24.11.0", "bun"],
    ["npm/11.0.0 node/v24.11.0", "npm"],
    ["deno/2.0.0", "npm"],
    ["", "npm"],
    [undefined, "npm"],
  ])("%s → %s", (ua, pm) => {
    expect(detectPm(ua)).toBe(pm);
  });

  it("isPackageManager", () => {
    expect(isPackageManager("bun")).toBe(true);
    expect(isPackageManager("deno")).toBe(false);
  });
});

describe("pmVars", () => {
  it("builds render variables", () => {
    expect(pmVars("npm", "my-app")).toEqual({ name: "my-app", pm: "npm", pmRun: "npm run", pmExec: "npx --no --", extraFiles: {}, overridesTarget: "package.json#overrides" });
  });

  it("places overrides where each package manager reads them", () => {
    expect(PM.pnpm.overridesTarget).toBe("pnpm-workspace.yaml");
    expect(PM.npm.overridesTarget).toBe("package.json#overrides");
    expect(PM.bun.overridesTarget).toBe("package.json#overrides");
    expect(PM.yarn.overridesTarget).toBe("package.json#resolutions");
  });

  it("adds .yarnrc.yml for yarn", () => {
    expect(pmVars("yarn", "x").extraFiles).toEqual({ ".yarnrc.yml": "nodeLinker: node-modules\n" });
  });
});

describe("resolveCommand", () => {
  it("appends .cmd for PM shims on Windows only", () => {
    expect(resolveCommand(["npm", "install"], "win32")).toEqual(["npm.cmd", ["install"]]);
    expect(resolveCommand(["git", "init"], "win32")).toEqual(["git", ["init"]]);
    expect(resolveCommand(["npm", "install"], "darwin")).toEqual(["npm", ["install"]]);
  });
});
