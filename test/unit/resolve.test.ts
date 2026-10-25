import { describe, expect, it } from "vitest";
import { BonesmithError, type ErrorCode } from "../../src/errors.ts";
import { compatibleOptions, matches, resolve } from "../../src/resolve.ts";
import type { Choices } from "../../src/types.ts";
import { catchError, choices, load, variantTree, type Loaded } from "../helpers/fixtures.ts";

const fixture = load();
const NODE = { nodeVersion: "v24.22.1" };

const appDefaults = { type: "app", toolchain: "a", routing: "r1", state: "none", ui: "none", styling: "tw" };
const libDefaults = { ...appDefaults, type: "library" };

function run(c: Choices, f: Loaded = fixture, env = NODE) {
  return resolve(c, f.layers, f.axes, env);
}

function fails(code: ErrorCode, c: Choices, f: Loaded = fixture, env = NODE): BonesmithError {
  const err = catchError(() => run(c, f, env));
  expect(err).toBeInstanceOf(BonesmithError);
  const e = err as BonesmithError;
  expect(e.code).toBe(code);
  return e;
}

const ids = (c: Choices, f?: Loaded) => run(c, f).layers.map((l) => l.id);

describe("resolve: layer set and order", () => {
  it("builds the app set in render order", () => {
    expect(ids(choices(appDefaults))).toEqual(["base", "type/app", "toolchain/a", "routing/r1", "state/none", "styling/tw", "ui/none"]);
  });

  it("library excludes routing/state, includes the addon, and drops disabled defaults", () => {
    const plan = run(choices(libDefaults));
    expect(plan.layers.map((l) => l.id)).toEqual(["base", "type/library", "toolchain/a", "addons/x", "styling/tw", "ui/none"]);
    expect(plan.disabledAxes).toEqual(["routing", "state"]);
    expect(plan.choices.selections).toEqual({ type: "library", toolchain: "a", ui: "none", styling: "tw" });
  });

  it("orders by renderOrder regardless of selection order", () => {
    const c = choices({ styling: "mod", ui: "m", type: "app", state: "s", routing: "r2", toolchain: "b" });
    expect(ids(c)).toEqual(["base", "type/app", "toolchain/b", "routing/r2", "state/s", "styling/mod", "ui/m"]);
  });

  it("rejects an unknown option or axis", () => {
    const e = fails("UNKNOWN_LAYER", choices({ ...appDefaults, ui: "zzz" }, ["ui"]));
    expect(e.message).toBe("`--ui zzz` is not an option (no templates/ui/zzz/).");
    expect(e.fix).toBe("Use one of: `--ui m`, `--ui mt`, `--ui none`, `--ui sh`.");
    expect(fails("UNKNOWN_LAYER", choices({ ...appDefaults, colour: "red" })).message).toBe("Unknown axis `colour`.");
  });
});

describe("resolve: disabled axes", () => {
  it.each([
    ["routing", "r2"],
    ["state", "s"],
  ])("rejects an explicit --%s with --type library", (axis, option) => {
    const e = fails("AXIS_DISABLED", choices({ ...libDefaults, [axis]: option }, ["type", axis]));
    expect(e.message).toBe(`\`--${axis}\` isn't used with \`--type library\`; remove it.`);
    expect(e.fix).toBe(`Remove \`--${axis} ${option}\` from the command.`);
  });

  it("accepts routing/state flags with --type app", () => {
    expect(() => run(choices({ ...appDefaults, routing: "r2", state: "s" }, ["routing", "state"]))).not.toThrow();
  });
});

describe("resolve: includes", () => {
  it("rejects an unknown include", () => {
    const f = load(variantTree({ "type/library/layer.json": { label: "Library", disablesAxes: ["routing", "state"], includes: ["addons/ghost"] } }));
    const e = fails("UNKNOWN_LAYER", choices(libDefaults), f);
    expect(e.message).toBe("templates/type/library/layer.json `includes` references unknown layer `addons/ghost`.");
  });

  it("rejects an include cycle with its path", () => {
    const f = load(
      variantTree({
        "addons/x/layer.json": { label: "X", includes: ["addons/y"] },
        "addons/y/layer.json": { label: "Y", includes: ["addons/x"] },
      }),
    );
    const e = fails("INCLUDE_CYCLE", choices(libDefaults), f);
    expect(e.message).toBe("Include cycle: addons/x → addons/y → addons/x.");
  });

  it("includes each layer once", () => {
    const f = load(
      variantTree({
        "addons/x/layer.json": { label: "X", includes: ["addons/y"] },
        "addons/y/layer.json": { label: "Y" },
        "styling/tw/layer.json": { label: "TW", includes: ["addons/y"] },
      }),
    );
    expect(ids(choices(libDefaults), f)).toEqual(["base", "type/library", "toolchain/a", "addons/y", "addons/x", "styling/tw", "ui/none"]);
  });
});

describe("resolve: variants", () => {
  const baseVariants = (c: Choices) => run(c).layers.find((l) => l.id === "base")?.variants.map((v) => v.name);

  it("matches scalar and array `when`", () => {
    expect(baseVariants(choices(appDefaults))).toEqual(["tool-any", "with-r1"]);
    expect(baseVariants(choices({ ...appDefaults, toolchain: "b", routing: "r2" }))).toEqual(["tool-any"]);
  });

  it("never matches a key on a disabled axis", () => {
    expect(baseVariants(choices(libDefaults))).toEqual(["lib", "tool-any"]);
  });

  it("matches() requires every key", () => {
    expect(matches({ type: "app", ui: ["m", "mt"] }, { type: "app", ui: "mt" })).toBe(true);
    expect(matches({ type: "app", ui: ["m", "mt"] }, { type: "app", ui: "sh" })).toBe(false);
    expect(matches({ routing: "r1" }, { type: "library" })).toBe(false);
  });
});

describe.each([
  ["app", appDefaults],
  ["library", libDefaults],
])("resolve: requires / conflicts (%s)", (_type, defaults) => {
  it("sh requires tw", () => {
    for (const styling of ["mod", "js"]) {
      const e = fails("REQUIRES_UNMET", choices({ ...defaults, ui: "sh", styling }));
      expect(e.message).toBe("`--ui sh` requires `--styling tw`.");
      expect(e.fix).toBe("Re-run with `--styling tw`, or pick a different `--ui`.");
    }
  });

  it("m conflicts with tw and js", () => {
    for (const styling of ["tw", "js"]) {
      const e = fails("CONFLICT", choices({ ...defaults, ui: "m", styling }));
      expect(e.message).toBe(`\`--ui m\` conflicts with \`--styling ${styling}\`.`);
      expect(e.fix).toBe("Use `--styling mod` instead.");
    }
  });

  it("mt conflicts with tw", () => {
    const e = fails("CONFLICT", choices({ ...defaults, ui: "mt", styling: "tw" }));
    expect(e.message).toBe("`--ui mt` conflicts with `--styling tw`.");
    expect(e.fix).toBe("Use `--styling js` or `--styling mod` instead.");
  });

  it.each([
    ["sh", "tw"],
    ["m", "mod"],
    ["mt", "mod"],
    ["mt", "js"],
    ["none", "tw"],
    ["none", "mod"],
    ["none", "js"],
  ])("accepts %s + %s", (ui, styling) => {
    expect(() => run(choices({ ...defaults, ui, styling }))).not.toThrow();
  });
});

describe("resolve: requires on a disabled axis", () => {
  it("fails naming the flag", () => {
    const f = load(variantTree({ "ui/sh/layer.json": { label: "SH", requires: { routing: ["r1"] } } }));
    const e = fails("REQUIRES_UNMET", choices({ ...libDefaults, ui: "sh" }), f);
    expect(e.message).toBe("`--ui sh` requires `--routing r1` (`--routing` is not used here).");
  });
});

describe("resolve: engines", () => {
  it("passes on a supported Node", () => {
    expect(() => run(choices(appDefaults), fixture, { nodeVersion: "24.11.0" })).not.toThrow();
  });

  it("fails with the range and passing alternatives", () => {
    const e = fails("ENGINE_UNSUPPORTED", choices(appDefaults), fixture, { nodeVersion: "v20.0.0" });
    expect(e.message).toBe("`--toolchain a` needs Node ^22.18.0 || ^24.11.0 || >=26.0.0; this is Node v20.0.0.");
    expect(e.fix).toBe("Upgrade Node to ^22.18.0 || ^24.11.0 || >=26.0.0, or re-run with `--toolchain b`.");
  });

  it("only suggests upgrading when no alternative passes", () => {
    const f = load(variantTree({ "toolchain/b/layer.json": { label: "B", engines: { node: ">=30.0.0" } } }));
    const e = fails("ENGINE_UNSUPPORTED", choices(appDefaults), f, { nodeVersion: "20.0.0" });
    expect(e.fix).toBe("Upgrade Node to ^22.18.0 || ^24.11.0 || >=26.0.0.");
  });
});

describe("resolve: agents", () => {
  it("rejects two layers shipping the same agent name", () => {
    const f = load(variantTree({ "styling/tw/kiro/agents/reviewer.json": "{}" }));
    const e = fails("AGENT_COLLISION", choices(appDefaults), f);
    expect(e.message).toBe("Agent `reviewer` is shipped by both `base` and `styling/tw`.");
  });
});

describe("compatibleOptions", () => {
  const { layers, axes } = fixture;

  it("filters styling by the selected UI", () => {
    expect(compatibleOptions("styling", { type: "app", ui: "sh" }, layers, axes)).toEqual(["tw"]);
    expect(compatibleOptions("styling", { type: "app", ui: "m" }, layers, axes)).toEqual(["mod"]);
    expect(compatibleOptions("styling", { type: "library", ui: "mt" }, layers, axes)).toEqual(["js", "mod"]);
    expect(compatibleOptions("styling", { type: "app", ui: "none" }, layers, axes)).toEqual(["js", "mod", "tw"]);
  });

  it("filters UI by the selected styling (both directions)", () => {
    expect(compatibleOptions("ui", { styling: "tw" }, layers, axes)).toEqual(["none", "sh"]);
    expect(compatibleOptions("ui", { styling: "mod" }, layers, axes)).toEqual(["m", "mt", "none"]);
    expect(compatibleOptions("ui", { styling: "js" }, layers, axes)).toEqual(["mt", "none"]);
  });

  it("ignores the axis's own current value", () => {
    expect(compatibleOptions("styling", { ui: "m", styling: "tw" }, layers, axes)).toEqual(["mod"]);
  });

  it("checks engines when env is given", () => {
    expect(compatibleOptions("toolchain", {}, layers, axes, { nodeVersion: "20.0.0" })).toEqual(["b"]);
    expect(compatibleOptions("toolchain", {}, layers, axes, NODE)).toEqual(["a", "b"]);
  });

  it("returns [] for an unknown axis", () => {
    expect(compatibleOptions("colour", {}, layers, axes)).toEqual([]);
  });
});
