// Runs in the `unit` project: checks the matrix list against the template folders. No processes.
import { describe, expect, it } from "vitest";
import { loadAxes } from "../../src/axes.ts";
import { loadLayers } from "../../src/layers.ts";
import { templatesRoot } from "../../src/paths.ts";
import { PACKAGE_MANAGERS } from "../../src/pm.ts";
import { resolve } from "../../src/resolve.ts";
import { choices } from "../helpers/fixtures.ts";
import { combos, type Combo } from "./combinations.ts";

const root = templatesRoot();
const axes = loadAxes(root);
const layers = loadLayers(root, axes);
const options = (axis: string): readonly string[] => axes.axes.get(axis)?.options ?? [];
const plan = (c: Combo) => resolve(choices({ ...c.selections }), layers, axes, { nodeVersion: "24.11.0" });
const ofType = (type: string): Combo[] => combos.filter((c) => c.selections.type === type);

describe("matrix combinations", () => {
  it("have unique, valid ids", () => {
    const ids = combos.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  it.each(combos.map((c) => [c.id, c]))("%s resolves", (_, c) => {
    expect(() => plan(c)).not.toThrow();
  });

  it("use every layer at least once", () => {
    const used = new Set(combos.flatMap((c) => plan(c).layers.map((l) => l.id)));
    expect([...layers.keys()].filter((id) => !used.has(id))).toEqual([]);
  });

  it("use every app option with both toolchains", () => {
    const missing: string[] = [];
    for (const toolchain of options("toolchain")) {
      for (const axis of axes.promptOrder.filter((a) => a !== "type" && a !== "toolchain")) {
        for (const option of options(axis)) {
          const hit = ofType("app").some((c) => c.selections.toolchain === toolchain && c.selections[axis] === option);
          if (!hit) missing.push(`${toolchain} + --${axis} ${option}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("use every styling and UI option in library mode, and both toolchains", () => {
    const libs = ofType("library");
    for (const axis of ["styling", "ui", "toolchain"]) {
      expect(new Set(libs.map((c) => c.selections[axis])), axis).toEqual(new Set(options(axis)));
    }
  });

  it("rotate every package manager in both types", () => {
    for (const type of ["app", "library"]) {
      expect(new Set(ofType(type).map((c) => c.pm)), type).toEqual(new Set(PACKAGE_MANAGERS));
    }
  });
});
