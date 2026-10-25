import { readFileSync } from "node:fs";
import { join } from "node:path";
import semver from "semver";
import { describe, expect, it } from "vitest";
import { loadAxes } from "../../src/axes.ts";
import { BonesmithError } from "../../src/errors.ts";
import { loadLayers } from "../../src/layers.ts";
import { templatesRoot } from "../../src/paths.ts";
import { compatibleOptions, resolve } from "../../src/resolve.ts";
import { catchError, choices } from "../helpers/fixtures.ts";

const root = templatesRoot();
const axes = loadAxes(root);
const layers = loadLayers(root, axes);
const NODE = { nodeVersion: "24.11.0" };
const app = { type: "app", toolchain: "vite-plus", routing: "react-router", state: "none", ui: "none", styling: "tailwind" };

function fails(selections: Record<string, string>, env = NODE): BonesmithError {
  const err = catchError(() => resolve(choices(selections), layers, axes, env));
  expect(err).toBeInstanceOf(BonesmithError);
  return err as BonesmithError;
}

describe("real templates: axes", () => {
  it("loads every v1 app option", () => {
    expect(axes.axes.get("toolchain")?.options).toEqual(["vite", "vite-plus"]);
    expect(axes.axes.get("routing")?.options).toEqual(["react-router", "tanstack-router"]);
    expect(axes.axes.get("state")?.options).toEqual(["none", "redux-toolkit", "zustand"]);
    expect(axes.axes.get("styling")?.options).toEqual(["css-in-js", "css-modules", "tailwind"]);
    expect(axes.axes.get("ui")?.options).toEqual(["mantine", "mui", "none", "shadcn"]);
  });
});

describe("real templates: pins", () => {
  it("every layer.json version is recorded in templates/PINS.md", () => {
    const pins = new Map<string, string>();
    for (const line of readFileSync(join(root, "PINS.md"), "utf8").split("\n")) {
      const cells = line.split("|").map((c) => c.trim());
      const [names, version] = [cells[1], cells[2]];
      if (names === undefined || version === undefined || !/^\d+\.\d+\.\d+/.test(version)) continue;
      for (const name of names.split(",")) pins.set(name.trim(), version);
    }
    const missing: string[] = [];
    const check = (pkg: string, version: string, where: string): void => {
      if (pins.get(pkg) !== version) missing.push(`${where}: ${pkg}@${version}`);
    };
    for (const layer of layers.values()) {
      for (const c of [layer.manifest, ...(layer.manifest.variants ?? [])]) {
        for (const deps of [c.dependencies, c.devDependencies]) {
          for (const [pkg, version] of Object.entries(deps ?? {})) check(pkg, version, layer.id);
        }
        // Peer ranges (^x.y.0) must be satisfied by the recorded pin.
        for (const [pkg, range] of Object.entries(c.peerDependencies ?? {})) {
          const pin = pins.get(pkg);
          if (pin === undefined || !semver.satisfies(pin, range)) missing.push(`${layer.id}: peer ${pkg}@${range} (pin ${pin ?? "none"})`);
        }
        const overrides = (c.packageJson?.overrides ?? {}) as Record<string, string>;
        for (const [pkg, value] of Object.entries(overrides)) {
          const alias = /^npm:(.+)@([^@]+)$/.exec(value);
          if (alias?.[1] !== undefined && alias[2] !== undefined) check(alias[1], alias[2], `${layer.id} overrides.${pkg}`);
          else check(pkg, value, `${layer.id} overrides`);
        }
        for (const [server, entry] of Object.entries(c.mcpServers ?? {})) {
          if ("pin" in entry) {
            const at = entry.pin.lastIndexOf("@");
            check(entry.pin.slice(0, at), entry.pin.slice(at + 1), `${layer.id} mcp ${server}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe("real templates: resolve (library)", () => {
  const lib = { type: "library", toolchain: "vite-plus", ui: "none", styling: "tailwind" };

  it.each([
    ["routing", "tanstack-router"],
    ["state", "zustand"],
  ])("rejects --%s with --type library", (axis, option) => {
    const err = catchError(() => resolve(choices({ ...lib, [axis]: option }, ["type", axis]), layers, axes, NODE));
    expect(err).toBeInstanceOf(BonesmithError);
    expect((err as BonesmithError).code).toBe("AXIS_DISABLED");
    expect((err as BonesmithError).message).toBe(`\`--${axis}\` isn't used with \`--type library\`; remove it.`);
  });

  it("excludes routing/state and includes addons/storybook", () => {
    const plan = resolve(choices({ ...lib, routing: "react-router", state: "none" }), layers, axes, NODE);
    expect(plan.layers.map((l) => l.id)).toEqual(["base", "type/library", "toolchain/vite-plus", "addons/storybook", "styling/tailwind", "ui/none"]);
    expect(plan.disabledAxes).toEqual(["routing", "state"]);
  });

  it.each([
    ["shadcn", "css-modules", "REQUIRES_UNMET"],
    ["mui", "tailwind", "CONFLICT"],
    ["mui", "css-in-js", "CONFLICT"],
    ["mantine", "tailwind", "CONFLICT"],
  ])("%s + %s still fails in library mode", (ui, styling, code) => {
    expect(fails({ ...lib, ui, styling }).code).toBe(code);
  });
});

describe("real templates: resolve (app)", () => {
  it.each(["css-modules", "css-in-js"])("shadcn requires tailwind (not %s)", (styling) => {
    const e = fails({ ...app, ui: "shadcn", styling });
    expect(e.code).toBe("REQUIRES_UNMET");
    expect(e.message).toBe("`--ui shadcn` requires `--styling tailwind`.");
  });

  it.each([
    ["mui", "tailwind", "Use `--styling css-modules` instead."],
    ["mui", "css-in-js", "Use `--styling css-modules` instead."],
    ["mantine", "tailwind", "Use `--styling css-in-js` or `--styling css-modules` instead."],
  ])("%s conflicts with %s", (ui, styling, fix) => {
    const e = fails({ ...app, ui, styling });
    expect(e.code).toBe("CONFLICT");
    expect(e.message).toBe(`\`--ui ${ui}\` conflicts with \`--styling ${styling}\`.`);
    expect(e.fix).toBe(fix);
  });

  it("vite-plus needs a supported Node and suggests --toolchain vite", () => {
    const e = fails(app, { nodeVersion: "22.12.0" });
    expect(e.code).toBe("ENGINE_UNSUPPORTED");
    expect(e.fix).toBe("Upgrade Node to ^22.18.0 || ^24.11.0 || >=26.0.0, or re-run with `--toolchain vite`.");
    expect(() => resolve(choices({ ...app, toolchain: "vite" }), layers, axes, { nodeVersion: "22.12.0" })).not.toThrow();
  });

  it("selects toolchain and type variants of base", () => {
    const plan = resolve(choices(app), layers, axes, NODE);
    expect(plan.layers.find((l) => l.id === "base")?.variants.map((v) => v.name)).toEqual(["app", "vp"]);
  });

  it("compatibleOptions filters styling by UI and UI by styling", () => {
    expect(compatibleOptions("styling", { type: "app", ui: "shadcn" }, layers, axes)).toEqual(["tailwind"]);
    expect(compatibleOptions("styling", { type: "app", ui: "mui" }, layers, axes)).toEqual(["css-modules"]);
    expect(compatibleOptions("styling", { type: "app", ui: "mantine" }, layers, axes)).toEqual(["css-in-js", "css-modules"]);
    expect(compatibleOptions("ui", { styling: "tailwind" }, layers, axes)).toEqual(["none", "shadcn"]);
  });
});
