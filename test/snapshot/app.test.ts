import { describe, expect, it } from "vitest";
import { loadAxes } from "../../src/axes.ts";
import { loadLayers } from "../../src/layers.ts";
import { templatesRoot } from "../../src/paths.ts";
import { pmVars } from "../../src/pm.ts";
import { renderFiles, type RenderedProject } from "../../src/render.ts";
import { compatibleOptions, resolve } from "../../src/resolve.ts";
import { choices } from "../helpers/fixtures.ts";
import { agentNames, checkAgents, checkMcp, checkSteering, steeringFiles, text } from "./kiro-checks.ts";

const root = templatesRoot();
const axes = loadAxes(root);
const layers = loadLayers(root, axes);
const options = (axis: string): readonly string[] => axes.axes.get(axis)?.options ?? [];

interface Combo {
  key: string;
  selections: Record<string, string>;
}

/** Every valid app combination: toolchain × routing × state × compatible (ui, styling). */
const combos: Combo[] = [];
for (const toolchain of options("toolchain"))
  for (const routing of options("routing"))
    for (const state of options("state"))
      for (const ui of options("ui"))
        for (const styling of compatibleOptions("styling", { type: "app", ui }, layers, axes)) {
          const selections = { type: "app", toolchain, routing, state, ui, styling };
          combos.push({ key: [toolchain, routing, state, ui, styling].join(" "), selections });
        }

const rendered = new Map<string, RenderedProject>();
function render(combo: Combo): RenderedProject {
  let project = rendered.get(combo.key);
  if (project === undefined) {
    const plan = resolve(choices(combo.selections), layers, axes, { nodeVersion: "24.11.0" });
    // npm keeps overrides in package.json, so the content snapshot shows them.
    project = renderFiles(plan, pmVars("npm", "demo-app"));
    rendered.set(combo.key, project);
  }
  return project;
}

const MCP_SERVER: Record<string, string> = { shadcn: "shadcn", mui: "mui", mantine: "mantine" };

describe("app combinations", () => {
  it("covers all 84 valid app combinations", () => {
    expect(combos).toHaveLength(84);
  });

  it.each(combos.map((c) => [c.key, c] as const))("%s", (_key, combo) => {
    const { tree } = render(combo);
    const { state, ui } = combo.selections;

    for (const f of ["index.html", "src/main.tsx", "src/App.tsx", "src/App.test.tsx", "vite.config.ts", "package.json"]) expect(tree.has(f), f).toBe(true);

    const expectedAgents = ["feature-builder", "reviewer", "routing-expert", "styling-expert", "toolchain-expert"];
    const expectedSteering = ["product", "routing", "structure", "styling", "tech", "testing"];
    if (state !== "none") {
      expectedAgents.push("state-expert");
      expectedSteering.push("state");
    }
    if (ui !== "none") {
      expectedAgents.push("ui-expert");
      expectedSteering.push("ui");
    }
    expect(agentNames(tree)).toEqual(expectedAgents.sort());
    expect(steeringFiles(tree)).toEqual(expectedSteering.sort());

    const servers = ui !== undefined && MCP_SERVER[ui] !== undefined ? [MCP_SERVER[ui]] : [];
    checkSteering(tree);
    checkAgents(tree, servers);
    checkMcp(tree, servers);
  });
});

describe("regression baseline (frozen before spec 05)", () => {
  it("file lists", async () => {
    const lists = combos.map((c) => `## ${c.key}\n${[...render(c).tree.keys()].join("\n")}`).join("\n\n");
    await expect(`${lists}\n`).toMatchFileSnapshot("__snapshots__/app-file-lists.snap");
  });

  it("package.json and vite.config.ts", async () => {
    const contents = combos
      .map((c) => {
        const { tree } = render(c);
        return `## ${c.key}\n### package.json\n${text(tree, "package.json")}### vite.config.ts\n${text(tree, "vite.config.ts")}`;
      })
      .join("\n");
    await expect(contents).toMatchFileSnapshot("__snapshots__/app-contents.snap");
  });
});
