import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { render, renderFiles } from "../../src/render.ts";
import { resolve } from "../../src/resolve.ts";
import { choices, load, renderRoot } from "../helpers/fixtures.ts";
import { APP, json, LIB, manifest, readFixture, renderFails, renderWith, text, VARS } from "../helpers/render.ts";

describe("render: collect", () => {
  it("collects files from every layer in render order", () => {
    const project = renderWith();
    expect([...project.tree.keys()]).toEqual([
      ".gitignore",
      ".kiro/agents/reviewer.json",
      ".kiro/agents/ui-expert.json",
      ".kiro/settings/mcp.json",
      ".kiro/steering/structure.md",
      ".kiro/steering/tech.md",
      ".kiro/steering/ui.md",
      "README.md",
      "a.config.ts",
      "assets/logo.bin",
      "package.json",
      "src/App.tsx",
      "src/main.tsx",
    ]);
    expect(project.tree.get("a.config.ts")?.from).toBe("toolchain/a");
    expect(project.tree.get("src/main.tsx")).toMatchObject({ from: "base", foundation: true });
  });

  it("disabled or unselected layers contribute nothing", () => {
    const keys = [...renderWith({}, { ...APP, ui: "none", toolchain: "b" }).tree.keys()];
    expect(keys).not.toContain("a.config.ts");
    expect(keys).not.toContain(".kiro/steering/ui.md");
    expect(keys).not.toContain(".kiro/agents/ui-expert.json");
    expect(keys).not.toContain(".kiro/settings/mcp.json");
  });

  it("a selected variant's files replace its own layer's files", () => {
    expect(text(renderWith({}, LIB), "README.md")).toBe("# demo (library)\n");
    expect(text(renderWith(), "README.md")).toContain("# demo\n");
  });

  it("rejects two selected variants of one layer writing the same path", () => {
    const base = manifest("base");
    const variants = [...(base.variants as object[]), { name: "also-app", when: { type: "app" } }];
    const e = renderFails("VARIANT_FILE_COLLISION", {
      "base/layer.json": { ...base, variants },
      "base/files@app/x.txt": "a",
      "base/files@also-app/x.txt": "b",
    });
    expect(e.message).toBe("`x.txt` is written by both variants `app` and `also-app` of `base`, and both are selected.");
  });

  it("rejects two layers writing the same path without overrides", () => {
    const e = renderFails("FILE_COLLISION", { "ui/u/files/src/App.tsx": "x" });
    expect(e.message).toBe("`src/App.tsx` is written by both `base` and `ui/u`.");
    expect(e.fix).toContain('Add "src/App.tsx" to `overrides` in templates/ui/u/layer.json');
  });

  it("lets a later layer replace a file it lists in overrides", () => {
    const project = renderWith({
      "ui/u/files/src/App.tsx": "export const App = () => null;\n",
      "ui/u/layer.json": { ...manifest("ui/u"), overrides: ["src/App.tsx"] },
    });
    expect(text(project, "src/App.tsx")).toBe("export const App = () => null;\n");
    expect(project.tree.get("src/App.tsx")?.foundation).toBe(false);
  });

  it("applies overrides declared on a selected variant", () => {
    const ui = { ...manifest("ui/u"), variants: [{ name: "app", when: { type: "app" }, overrides: ["src/App.tsx"] }] };
    expect(() => renderWith({ "ui/u/files/src/App.tsx": "x\n", "ui/u/layer.json": ui })).not.toThrow();
  });

  it("rejects an override that replaces nothing", () => {
    const e = renderFails("STALE_OVERRIDE", { "ui/u/layer.json": { ...manifest("ui/u"), overrides: ["src/Gone.tsx"] } });
    expect(e.message).toBe("templates/ui/u/layer.json overrides `src/Gone.tsx`, but no earlier layer writes it.");
  });

  it("rejects files/package.json", () => {
    const e = renderFails("FILE_COLLISION", { "toolchain/a/files/package.json": "{}" });
    expect(e.fix).toContain("Declare it in layer.json instead");
  });

  it("maps _gitignore and _npmrc", () => {
    const project = renderWith({ "toolchain/a/files/_npmrc": "save-exact=true\n" });
    expect(text(project, ".gitignore")).toBe("node_modules\n");
    expect(text(project, ".npmrc")).toBe("save-exact=true\n");
  });

  it("adds extraFiles as source pm and checks collisions", () => {
    const project = renderWith({}, APP, { extraFiles: { ".yarnrc.yml": "nodeLinker: node-modules\n" } });
    expect(project.tree.get(".yarnrc.yml")?.from).toBe("pm");
    expect(renderFails("FILE_COLLISION", {}, APP, { extraFiles: { "README.md": "x" } }).message).toBe(
      "`README.md` is written by both `base` and `pm`.",
    );
  });

  it("rejects unexpected entries under kiro/", () => {
    expect(renderFails("LAYER_INVALID", { "ui/u/kiro/settings/mcp.json": "{}" }).message).toContain("unexpected entry");
  });
});

describe("render: package.json", () => {
  it("builds name, version and merged contributions (app)", () => {
    const pkg = json(renderWith(), "package.json");
    expect(pkg).toEqual({
      name: "demo",
      version: "0.0.0",
      private: true,
      type: "module",
      files: ["src"],
      scripts: { test: "vitest run", lint: "eslint .", build: "a build", dev: "a dev" },
      dependencies: { react: "19.0.0", "u-lib": "2.0.0" },
      devDependencies: { eslint: "1.0.0", playwright: "1.50.0", vitest: "1.0.0" },
    });
  });

  it("merges peers and unions arrays (library)", () => {
    const pkg = json(renderWith({}, LIB), "package.json");
    expect(pkg.peerDependencies).toEqual({ react: "19.0.0" });
    expect(pkg.devDependencies).toMatchObject({ react: "19.0.0", "s-addon": "3.0.0" });
    expect(pkg.files).toEqual(["src", "dist"]);
    expect(pkg.sideEffects).toBe(false);
    expect(Object.keys(pkg).slice(0, 6)).toEqual(["name", "version", "private", "type", "files", "sideEffects"]);
  });

  it("is pretty-printed with a trailing newline", () => {
    expect(text(renderWith(), "package.json")).toMatch(/^\{\n {2}"name": "demo",\n[\s\S]*\}\n$/);
  });

  it("rejects conflicting scripts naming both layers", () => {
    const e = renderFails("PACKAGE_JSON_CONFLICT", { "ui/u/layer.json": { ...manifest("ui/u"), scripts: { build: "u build" } } });
    expect(e.message).toBe("package.json `scripts.build` is `a build` from `toolchain/a` and `u build` from `ui/u`.");
  });

  it("rejects a missing verify script", () => {
    const e = renderFails("MISSING_SCRIPT", { "base/layer.json": { ...manifest("base"), scripts: { test: "vitest run" } } });
    expect(e.message).toBe("package.json has no `lint` script, which the generated project is verified with.");
  });

  it("rejects a url MCP server whose script is missing", () => {
    const e = renderFails("MISSING_SCRIPT", { "addons/s/layer.json": { ...manifest("addons/s"), scripts: {} } }, LIB);
    expect(e.message).toBe("package.json has no `storybook` script, which serves MCP server `s`.");
  });
});

describe("render: overrides per package manager", () => {
  const withOverrides = { "toolchain/a/layer.json": { ...manifest("toolchain/a"), packageJson: { overrides: { vite: "npm:core@1.0.0", vitest: "1.0.0" } } } };

  it("keeps package.json overrides for npm / bun", () => {
    const project = renderWith(withOverrides, APP, { overridesTarget: "package.json#overrides" });
    expect(json(project, "package.json").overrides).toEqual({ vite: "npm:core@1.0.0", vitest: "1.0.0" });
    expect(project.tree.has("pnpm-workspace.yaml")).toBe(false);
  });

  it("renames them to resolutions for yarn", () => {
    const pkg = json(renderWith(withOverrides, APP, { overridesTarget: "package.json#resolutions" }), "package.json");
    expect(pkg.resolutions).toEqual({ vite: "npm:core@1.0.0", vitest: "1.0.0" });
    expect(pkg.overrides).toBeUndefined();
  });

  it("writes pnpm-workspace.yaml for pnpm", () => {
    const project = renderWith(withOverrides, APP, { overridesTarget: "pnpm-workspace.yaml" });
    expect(text(project, "pnpm-workspace.yaml")).toBe('overrides:\n  "vite": "npm:core@1.0.0"\n  "vitest": "1.0.0"\n');
    expect(json(project, "package.json").overrides).toBeUndefined();
  });

  it("writes buildScripts as pnpm allowBuilds only", () => {
    const tc = { ...manifest("toolchain/a"), buildScripts: { esbuild: false, "@parcel/watcher": false } };
    const pnpm = renderWith({ "toolchain/a/layer.json": tc }, APP, { overridesTarget: "pnpm-workspace.yaml" });
    expect(text(pnpm, "pnpm-workspace.yaml")).toBe('allowBuilds:\n  "@parcel/watcher": false\n  "esbuild": false\n');
    expect(renderWith({ "toolchain/a/layer.json": tc }, APP, { overridesTarget: "package.json#overrides" }).tree.has("pnpm-workspace.yaml")).toBe(false);
  });

  it("rejects conflicting buildScripts decisions", () => {
    const e = renderFails("PACKAGE_JSON_CONFLICT", {
      "toolchain/a/layer.json": { ...manifest("toolchain/a"), buildScripts: { esbuild: false } },
      "ui/u/layer.json": { ...manifest("ui/u"), buildScripts: { esbuild: true } },
    });
    expect(e.message).toBe("`buildScripts.esbuild` is `false` from `toolchain/a` and `true` from `ui/u`.");
  });

  it("requires a devDependency pin satisfying each peer range", () => {
    const base = manifest("base");
    const lib = (dev: Record<string, string>) => ({
      ...base,
      variants: [{ name: "lib", when: { type: "library" }, peerDependencies: { react: "^19.0.0" }, devDependencies: dev }],
    });
    expect(json(renderWith({ "base/layer.json": lib({ react: "19.3.1" }) }, LIB), "package.json").peerDependencies).toEqual({ react: "^19.0.0" });
    expect(renderFails("PACKAGE_JSON_CONFLICT", { "base/layer.json": lib({ react: "18.3.1" }) }, LIB).message).toBe(
      "peer `react@^19.0.0` needs an exact devDependency pin that satisfies it (found `18.3.1`).",
    );
    expect(renderFails("PACKAGE_JSON_CONFLICT", { "base/layer.json": lib({}) }, LIB).message).toContain("(found none)");
  });

  it("writes nothing without overrides", () => {
    expect(renderWith({}, APP, { overridesTarget: "pnpm-workspace.yaml" }).tree.has("pnpm-workspace.yaml")).toBe(false);
  });

  it("rejects a layer shipping pnpm-workspace.yaml when overrides are generated", () => {
    const e = renderFails("FILE_COLLISION", { ...withOverrides, "base/files/pnpm-workspace.yaml": "packages: []\n" }, APP, { overridesTarget: "pnpm-workspace.yaml" });
    expect(e.message).toContain("pnpm settings are generated into it");
  });
});

describe("render: patches and placeholders", () => {
  it("stacks providers (before in render order, after in reverse) and imports from contentFile", () => {
    expect(text(renderWith(), "src/main.tsx")).toBe(
      [
        'import { UProvider } from "u-lib";',
        'import { App } from "./App";',
        "",
        "export function Root() {",
        "  return (",
        "    <>",
        "      <AppProvider>",
        "      <UProvider>",
        "      <App />",
        "      </UProvider>",
        "      </AppProvider>",
        "    </>",
        "  );",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("applies a layer's patches before its variants' patches", () => {
    const ui = {
      ...manifest("ui/u"),
      variants: [{ name: "app", when: { type: "app" }, patches: [{ file: "src/main.tsx", anchor: "imports", content: "import './v';" }] }],
    };
    expect(text(renderWith({ "ui/u/layer.json": ui }), "src/main.tsx").split("\n").slice(0, 2)).toEqual([
      'import { UProvider } from "u-lib";',
      "import './v';",
    ]);
  });

  it("rejects a patch to a file not in the tree", () => {
    const ui = { ...manifest("ui/u"), patches: [{ file: "src/nope.tsx", anchor: "imports", content: "x" }] };
    expect(renderFails("PATCH_TARGET_MISSING", { "ui/u/layer.json": ui }).message).toContain("no selected layer writes `src/nope.tsx`");
  });

  it("rejects a patch into a non-foundation file", () => {
    const ui = { ...manifest("ui/u"), patches: [{ file: "a.config.ts", anchor: "imports", content: "x" }] };
    const e = renderFails("ANCHOR_NOT_IN_FOUNDATION", { "ui/u/layer.json": ui, "toolchain/a/files/a.config.ts": "// bonesmith:imports\n" });
    expect(e.message).toContain("comes from `toolchain/a`");
  });

  it("rejects missing and duplicate anchors, naming anchor, file and layer", () => {
    const ui = { ...manifest("ui/u"), patches: [{ file: "src/main.tsx", anchor: "nowhere", content: "x" }] };
    expect(renderFails("ANCHOR_MISSING", { "ui/u/layer.json": ui }).message).toBe(
      "No anchor `bonesmith:nowhere` in `src/main.tsx` (patched by `ui/u`).",
    );
    const dup = readFixture("base/files/src/main.tsx").replace("// bonesmith:imports", "// bonesmith:imports\n// bonesmith:imports");
    expect(renderFails("ANCHOR_DUPLICATE", { "base/files/src/main.tsx": dup }).message).toContain("`bonesmith:imports` in `src/main.tsx` (patched by `ui/u`)");
  });

  it("rejects a missing contentFile", () => {
    expect(renderFails("LAYER_INVALID", { "ui/u/patches/imports.ts": null }).message).toContain("contentFile templates/ui/u/patches/imports.ts not found");
  });

  it("removes all anchor lines, even unpatched ones", () => {
    const project = renderWith({}, { ...APP, ui: "none" });
    expect(text(project, "src/main.tsx")).not.toContain("bonesmith:");
    expect(text(project, ".kiro/steering/structure.md")).not.toContain("bonesmith:");
  });

  it("substitutes placeholders in files, agents and nextSteps", () => {
    const project = renderWith({}, APP, { pm: "npm", pmRun: "npm run", pmExec: "npx --no" });
    expect(text(project, "README.md")).toBe("# demo\n\nRun `npm run dev` or `npx --no vitest` (npm).\n");
    expect(json(project, ".kiro/agents/reviewer.json").prompt).toContain("Use npm run test.");
    expect(project.nextSteps).toBe("cd demo && npm run dev");
    expect(text(project, "src/App.tsx")).toContain('style={{ color: "red" }}');
  });

  it("rejects unknown placeholders", () => {
    expect(renderFails("UNKNOWN_PLACEHOLDER", { "toolchain/a/files/x.md": "{{version}}\n" }).message).toContain("`{{version}}` in `x.md`");
  });

  it("leaves binary files untouched", () => {
    const original = readFileSync(join(renderRoot, "base/files/assets/logo.bin"));
    expect(Buffer.from(renderWith().tree.get("assets/logo.bin")?.bytes ?? [])).toEqual(original);
  });

  it("rejects leftover markers", () => {
    const e = renderFails("LEFTOVER_MARKER", { "toolchain/a/files/x.ts": "const a = 1; // bonesmith:imports\n" });
    expect(e.message).toBe("`x.ts` line 1 still contains `bonesmith:imports` (from `toolchain/a`).");
  });
});

describe("render: postInstall, verifyScripts, nextSteps", () => {
  it("returns aggregated, de-duplicated postInstall and the verify scripts", () => {
    const base = { ...manifest("base"), devDependencies: { vitest: "1.0.0", eslint: "1.0.0", playwright: "1.50.0" }, postInstall: [["playwright", "install", "chromium"]] };
    const project = renderWith({ "base/layer.json": base });
    expect(project.postInstall).toEqual([["playwright", "install", "chromium"]]);
    expect(project.verifyScripts).toEqual(["build", "lint", "test"]);
    expect(renderWith({}, LIB).nextSteps).toBeUndefined();
  });

  it("rejects a postInstall binary that isn't a pinned dependency", () => {
    const ui = { ...manifest("ui/u"), devDependencies: {} };
    const e = renderFails("POSTINSTALL_UNPINNED", { "ui/u/layer.json": ui });
    expect(e.message).toBe("`postInstall` in `ui/u` runs `playwright`, which is not a pinned dependency.");
  });
});

describe("render()", () => {
  function listFiles(dir: string): string[] {
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) walk(p);
        else out.push(relative(dir, p).split("\\").join("/"));
      }
    };
    walk(dir);
    return out.sort();
  }

  it("writes exactly the renderFiles tree to a new temp dir", () => {
    const fixture = load(renderRoot);
    const plan = resolve(choices(LIB), fixture.layers, fixture.axes, { nodeVersion: "24.11.0" });
    const expected = renderFiles(plan, VARS);
    const result = render(plan, VARS);
    try {
      expect(result.tempDir).toContain("bonesmith-");
      expect(listFiles(result.tempDir)).toEqual([...expected.tree.keys()].sort());
      for (const [path, entry] of expected.tree) {
        expect(Buffer.from(readFileSync(join(result.tempDir, path)))).toEqual(Buffer.from(entry.bytes));
      }
      expect(statSync(join(result.tempDir, "bin/run")).mode & 0o777).toBe(0o755);
      expect(statSync(join(result.tempDir, "README.md")).mode & 0o777).toBe(0o644);
      expect(result.postInstall).toEqual(expected.postInstall);
      expect(result.verifyScripts).toEqual(expected.verifyScripts);
    } finally {
      rmSync(result.tempDir, { recursive: true, force: true });
    }
  });
});
