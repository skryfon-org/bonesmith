import { describe, expect, it } from "vitest";
import { comboLabel, enumerateSelections, lintTemplates, minimumNode } from "../../src/template-lint.ts";
import { load, renderRoot, variantTree } from "../helpers/fixtures.ts";
import { manifest } from "../helpers/render.ts";

const NODE = { nodeVersion: "24.11.0" };
const codes = (root: string): string[] => lintTemplates(root, NODE).map((p) => p.code);

describe("enumerateSelections", () => {
  it("covers the cartesian product and drops axes disabled by earlier choices", () => {
    const root = variantTree({ "type/library/layer.json": { ...manifest("type/library"), disablesAxes: ["ui"] } }, renderRoot);
    const { layers, axes } = load(root);
    const labels = enumerateSelections(layers, axes).map((s) => comboLabel(s, axes));
    expect(labels).toEqual([
      "--type app --toolchain a --ui none",
      "--type app --toolchain a --ui u",
      "--type app --toolchain b --ui none",
      "--type app --toolchain b --ui u",
      "--type library --toolchain a",
      "--type library --toolchain b",
    ]);
  });
});

describe("lintTemplates", () => {
  it("passes the render fixture", () => {
    expect(lintTemplates(renderRoot, NODE)).toEqual([]);
  });

  it("reports load errors instead of throwing", () => {
    const root = variantTree({ "ui/u/layer.json": "{ not json" }, renderRoot);
    expect(codes(root)).toEqual(["LAYER_INVALID"]);
  });

  it("reports every failing combination, not just the first", () => {
    const root = variantTree({ "toolchain/b/layer.json": { label: "B", scripts: { dev: "b dev" } } }, renderRoot);
    const problems = lintTemplates(root, NODE).filter((p) => p.code === "MISSING_SCRIPT");
    // 4 combinations use toolchain b (app and library, ui none and u), each × 4 package managers.
    expect(new Set(problems.map((p) => p.combo.replace(/ --pm \w+$/, ""))).size).toBe(4);
    expect(problems).toHaveLength(16);
  });

  it("skips unsupported combinations (requires/conflicts) without reporting them", () => {
    const root = variantTree({ "ui/u/layer.json": { ...manifest("ui/u"), conflicts: ["toolchain/b"] } }, renderRoot);
    expect(lintTemplates(root, NODE)).toEqual([]);
  });

  it("reports an option that is valid in no combination", () => {
    const root = variantTree({ "ui/u/layer.json": { ...manifest("ui/u"), requires: { toolchain: ["a"] }, conflicts: ["toolchain/a"] } }, renderRoot);
    const problems = lintTemplates(root, NODE);
    expect(problems.map((p) => p.code)).toContain("OPTION_UNREACHABLE");
    expect(problems.find((p) => p.code === "OPTION_UNREACHABLE")?.message).toContain("templates/ui/u");
  });

  it("reports a variant that is never selected and its patches", () => {
    const base = manifest("base");
    const variants = [
      ...(base.variants as object[]),
      { name: "never", when: { toolchain: "b", ui: "u" }, patches: [{ file: "src/main.tsx", anchor: "imports", content: "// never" }] },
    ];
    const root = variantTree(
      { "base/layer.json": { ...base, variants }, "ui/u/layer.json": { ...manifest("ui/u"), conflicts: ["toolchain/b"] } },
      renderRoot,
    );
    const problems = lintTemplates(root, NODE);
    expect(problems.map((p) => [p.code, p.message.split("`")[1]])).toEqual([
      ["VARIANT_UNUSED", "base#never"],
      ["PATCH_UNUSED", "base#never:patches[0]"],
    ]);
  });

  it("reports a peer range not satisfied by the devDependency pin", () => {
    const base = manifest("base");
    const variants = (base.variants as Record<string, unknown>[]).map((v) =>
      v.name === "lib" ? { ...v, peerDependencies: { react: "^19.1.0" }, devDependencies: { react: "19.0.0" } } : v,
    );
    const root = variantTree({ "base/layer.json": { ...base, variants } }, renderRoot);
    const problems = lintTemplates(root, NODE);
    const peer = problems.filter((p) => p.code === "PEER_RANGE");
    expect(peer.map((p) => p.combo)).toContain("--type library --toolchain a --ui u --pm npm");
    expect(peer[0]?.message).toContain("react@^19.1.0");
  });

  it("checks engines against the given Node version", () => {
    const root = variantTree({ "toolchain/b/layer.json": { ...manifest("toolchain/b"), engines: { node: ">=26.0.0" } } }, renderRoot);
    expect(codes(root)).toContain("ENGINE_UNSUPPORTED");
    expect(lintTemplates(root, { nodeVersion: "26.0.0" })).toEqual([]);
  });

  it("defaults the Node version to the minimum of package.json engines", () => {
    expect(minimumNode()).toBe("24.11.0");
  });
});
