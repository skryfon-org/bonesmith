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

const combos: Combo[] = [];
for (const toolchain of options("toolchain"))
  for (const ui of options("ui"))
    for (const styling of compatibleOptions("styling", { type: "library", ui }, layers, axes)) {
      combos.push({ key: [toolchain, ui, styling].join(" "), selections: { type: "library", toolchain, ui, styling } });
    }

const cache = new Map<string, RenderedProject>();
function render(combo: Combo): RenderedProject {
  let project = cache.get(combo.key);
  if (project === undefined) {
    const plan = resolve(choices(combo.selections), layers, axes, { nodeVersion: "24.11.0" });
    project = renderFiles(plan, pmVars("npm", "demo-lib"));
    cache.set(combo.key, project);
  }
  return project;
}

const UI_SERVER: Record<string, string> = { shadcn: "shadcn", mui: "mui", mantine: "mantine" };
const UI_PEERS: Record<string, string[]> = {
  mui: ["@emotion/react", "@emotion/styled", "@mui/material"],
  mantine: ["@mantine/core", "@mantine/hooks"],
};
const EMITS_CSS = ["tailwind", "css-modules"];

describe("library combinations", () => {
  it("covers all 14 valid library combinations", () => {
    expect(combos).toHaveLength(14);
  });

  it.each(combos.map((c) => [c.key, c] as const))("%s", (_key, combo) => {
    const { tree, postInstall, nextSteps } = render(combo);
    const { ui, styling } = combo.selections;
    const pkg = JSON.parse(text(tree, "package.json")) as Record<string, Record<string, unknown> | undefined>;

    // Package shape
    expect(pkg.type).toBe("module");
    expect(pkg.private).toBeUndefined();
    expect(pkg.files).toEqual(["dist"]);
    expect(pkg.sideEffects).toEqual(["**/*.css"]);
    const exports = pkg.exports ?? {};
    expect(exports["."]).toEqual({ types: "./dist/index.d.ts", import: "./dist/index.js" });
    expect(exports["./styles.css"]).toBe(EMITS_CSS.includes(styling ?? "") ? "./dist/styles.css" : undefined);
    expect(Object.keys(pkg.scripts ?? {})).toEqual(expect.arrayContaining(["build", "test", "lint", "storybook", "build-storybook"]));

    // Peers: caret ranges with satisfying exact dev pins; nothing peer-ish in dependencies.
    const peers = Object.keys(pkg.peerDependencies ?? {}).sort();
    const expectedPeers = ["react", "react-dom", ...(UI_PEERS[ui ?? ""] ?? []), ...(styling === "css-in-js" ? ["styled-components"] : [])].sort();
    expect(peers).toEqual(expectedPeers);
    for (const peer of peers) {
      expect(pkg.devDependencies?.[peer], `${peer} dev pin`).toMatch(/^\d+\.\d+\.\d+$/);
      expect(pkg.dependencies?.[peer], `${peer} not a dependency`).toBeUndefined();
    }

    // No app shell, no routing/state
    for (const f of ["index.html", "src/main.tsx", "src/App.tsx", "src/router.tsx"]) expect(tree.has(f), f).toBe(false);
    expect([...tree.keys()].some((p) => p.startsWith("src/store"))).toBe(false);
    for (const f of ["src/index.ts", "src/components/Button/Button.tsx", "src/components/Button/Button.test.tsx", "src/components/Button/Button.stories.tsx", ".storybook/main.ts", ".storybook/preview.tsx", ".storybook/vitest.setup.ts"]) {
      expect(tree.has(f), f).toBe(true);
    }

    // Preview patched per UI, no leftover anchors anywhere (checked by render too)
    const preview = text(tree, ".storybook/preview.tsx");
    expect(preview).not.toContain("bonesmith:");
    if (ui === "mui") expect(preview).toContain("<ThemeProvider theme={theme}>");
    if (ui === "mantine") expect(preview).toContain("<MantineProvider theme={theme}>");
    if (styling === "tailwind") expect(preview).toContain('import "../src/styles.css";');

    // Vitest projects: unit + storybook browser
    const vite = text(tree, "vite.config.ts");
    expect(vite).toContain('name: "unit"');
    expect(vite).toContain('name: "storybook"');
    expect(vite).toContain(combo.selections.toolchain === "vite-plus" ? "pack: {" : "lib: {");

    expect(postInstall).toEqual([["playwright", "install", "chromium"]]);
    expect(nextSteps).toBe("npm run storybook");

    // .kiro
    const agents = ["feature-builder", "library-expert", "reviewer", "storybook-expert", "styling-expert", "toolchain-expert", ...(ui === "none" ? [] : ["ui-expert"])];
    const steering = ["library", "product", "storybook", "structure", "styling", "tech", "testing", ...(ui === "none" ? [] : ["ui"])];
    expect(agentNames(tree)).toEqual(agents.sort());
    expect(steeringFiles(tree)).toEqual(steering.sort());
    const servers = ["storybook", ...(UI_SERVER[ui ?? ""] !== undefined ? [UI_SERVER[ui ?? ""] ?? ""] : [])];
    checkSteering(tree);
    checkAgents(tree, servers);
    checkMcp(tree, servers);
    expect(text(tree, ".kiro/steering/tech.md")).toContain("- `storybook`: `@storybook/addon-mcp@10.6.3`, requires `npm run storybook` running");
    expect(text(tree, ".kiro/steering/tech.md")).toContain("## Library build");
    expect((JSON.parse(text(tree, ".kiro/agents/feature-builder.json")) as { prompt: string }).prompt).toContain("export from src/index.ts");
  });
});

describe("app output has no library content", () => {
  it("no library or Storybook files in any app combination", () => {
    for (const toolchain of options("toolchain")) {
      const plan = resolve(choices({ type: "app", toolchain, routing: "react-router", state: "none", ui: "none", styling: "tailwind" }), layers, axes, { nodeVersion: "24.11.0" });
      const keys = [...renderFiles(plan, pmVars("npm", "demo-app")).tree.keys()];
      expect(keys.filter((k) => /storybook|library|\.stories\.|src\/index\.ts$/.test(k))).toEqual([]);
    }
  });
});
