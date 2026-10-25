import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadAxes } from "../../src/axes.ts";
import { BonesmithError } from "../../src/errors.ts";
import { templatesRoot } from "../../src/paths.ts";
import { basicRoot, catchError, variantTree } from "../helpers/fixtures.ts";

const baseAxes = JSON.parse(readFileSync(`${basicRoot}/axes.json`, "utf8")) as Record<string, unknown>;

function axesError(changes: Parameters<typeof variantTree>[0]): BonesmithError {
  const err = catchError(() => loadAxes(variantTree(changes)));
  expect(err).toBeInstanceOf(BonesmithError);
  const e = err as BonesmithError;
  expect(e.code).toBe("AXES_INVALID");
  return e;
}

describe("loadAxes", () => {
  it("loads axes with folder-based options", () => {
    const axes = loadAxes(basicRoot);
    expect(axes.promptOrder).toEqual(["type", "toolchain", "routing", "state", "ui", "styling"]);
    expect(axes.renderOrder[0]).toBe("base");
    expect(axes.verifyScripts).toEqual(["build", "lint", "test"]);
    expect(axes.axes.get("ui")?.options).toEqual(["m", "mt", "none", "sh"]);
    expect(axes.axes.get("styling")).toMatchObject({ flag: "--styling", default: "tw", options: ["js", "mod", "tw"] });
  });

  it("picks up a new option folder without code changes", () => {
    const axes = loadAxes(variantTree({ "ui/new/layer.json": { label: "New" } }));
    expect(axes.axes.get("ui")?.options).toContain("new");
  });

  it("rejects a default that is not a folder", () => {
    const e = axesError({ "styling/tw": null });
    expect(e.message).toMatch(/axes\.styling\.default: "tw" is not a folder under styling\//);
  });

  it("rejects an unknown axis in promptOrder", () => {
    const e = axesError({ "axes.json": { ...baseAxes, promptOrder: ["type", "toolchain", "routing", "state", "ui", "styling", "colour"] } });
    expect(e.message).toContain('promptOrder[6]: unknown axis "colour"');
  });

  it("rejects an unknown axis in renderOrder", () => {
    const order = ["base", "type", "toolchain", "addons", "routing", "state", "styling", "ui", "colour"];
    const e = axesError({ "axes.json": { ...baseAxes, renderOrder: order } });
    expect(e.message).toContain('renderOrder[8]: unknown axis "colour"');
  });

  it("rejects an axis missing from renderOrder", () => {
    const e = axesError({ "axes.json": { ...baseAxes, renderOrder: ["base", "type", "toolchain", "addons", "routing", "state", "styling"] } });
    expect(e.message).toContain('renderOrder: missing "ui"');
  });

  it("rejects malformed fields and unknown keys, naming the field", () => {
    expect(axesError({ "axes.json": { ...baseAxes, verifyScripts: [] } }).message).toContain("verifyScripts:");
    expect(axesError({ "axes.json": { ...baseAxes, extra: 1 } }).message).toContain("extra: unknown key");
    const axes = baseAxes.axes as Record<string, object>;
    const bad = { ...baseAxes, axes: { ...axes, ui: { ...axes.ui, flag: "ui" } } };
    expect(axesError({ "axes.json": bad }).message).toContain("axes.ui.flag:");
  });

  it("rejects invalid JSON", () => {
    expect(axesError({ "axes.json": "{" }).message).toContain("cannot read or parse");
  });
});

describe("templates/axes.json", () => {
  it("has the v1 defaults and orders", () => {
    // Option folders arrive in specs 04/05; until then only the file content is checked.
    const raw = JSON.parse(readFileSync(`${templatesRoot()}/axes.json`, "utf8")) as {
      axes: Record<string, { default: string }>;
      promptOrder: string[];
      renderOrder: string[];
      verifyScripts: string[];
    };
    const defaults = Object.fromEntries(Object.entries(raw.axes).map(([k, v]) => [k, v.default]));
    expect(defaults).toEqual({ type: "app", toolchain: "vite-plus", routing: "react-router", state: "none", ui: "none", styling: "tailwind" });
    expect(raw.promptOrder).toEqual(["type", "toolchain", "routing", "state", "ui", "styling"]);
    expect(raw.renderOrder).toEqual(["base", "type", "toolchain", "addons", "routing", "state", "styling", "ui"]);
    expect(raw.verifyScripts).toEqual(["build", "lint", "test"]);
  });
});
