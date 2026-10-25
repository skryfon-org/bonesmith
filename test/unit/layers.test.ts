import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BonesmithError } from "../../src/errors.ts";
import { emitJsonSchema, isExactPin, isLocalOrHttpsUrl, layerJsonSchema, parseManifest } from "../../src/layers.ts";
import { catchError, load, variantTree } from "../helpers/fixtures.ts";

const { axes, layers } = load();
const FILE = "templates/ui/m/layer.json";

function ok(manifest: Record<string, unknown>): void {
  expect(() => parseManifest({ label: "L", ...manifest }, FILE, axes)).not.toThrow();
}

/** Asserts rejection and returns the error message. */
function bad(manifest: Record<string, unknown>): string {
  const err = catchError(() => parseManifest({ label: "L", ...manifest }, FILE, axes));
  expect(err).toBeInstanceOf(BonesmithError);
  const e = err as BonesmithError;
  expect(e.code).toBe("LAYER_INVALID");
  expect(e.fix).toBe("Fix the field in that file.");
  expect(e.message.startsWith(`${FILE}: `)).toBe(true);
  return e.message;
}

const cmdMcp = { command: "npx", args: ["--no", "@mui/mcp@1.2.3"], pin: "@mui/mcp@1.2.3" };
const urlMcp = { url: "http://localhost:6006/mcp", provider: "@storybook/addon-mcp", script: "storybook" };

describe("layer schema: fields", () => {
  it("accepts a full manifest", () => {
    ok({
      $schema: "../../layer.schema.json",
      hint: "h",
      dependencies: { react: "19.2.0" },
      devDependencies: { "@types/react": "19.2.0-rc.1" },
      peerDependencies: { "react-dom": "19.2.0" },
      scripts: { dev: "vite" },
      packageJson: { sideEffects: false, exports: { ".": "./dist/index.js" } },
      requires: { styling: ["tw", "mod"] },
      conflicts: ["styling/js"],
      disablesAxes: ["routing"],
      includes: ["addons/x"],
      engines: { node: ">=24.11.0" },
      patches: [{ file: "src/main.tsx", anchor: "imports", position: "after", content: "x" }],
      steering: [{ target: "tech.md", section: "styling", content: "x" }],
      steeringSections: { "tech.md": ["a"], "structure.md": ["b"] },
      agentAppends: [{ agent: "reviewer", prompt: "p", resources: ["file://x"] }],
      postInstall: [["playwright", "install", "chromium"]],
      mcpServers: { mui: cmdMcp, storybook: urlMcp },
      overrides: ["src/App.tsx"],
      nextSteps: "Run it.",
      variants: [{ name: "lib", when: { type: "library", toolchain: ["a", "b"] }, peerDependencies: { react: "19.2.0" } }],
    });
  });

  it("rejects unknown keys at every level", () => {
    expect(bad({ colour: "red" })).toContain(`${FILE}: colour: unknown key`);
    expect(bad({ patches: [{ file: "f", anchor: "a", content: "x", extra: 1 }] })).toContain("patches[0].extra: unknown key");
    expect(bad({ variants: [{ name: "v", when: { type: "app" }, label: "x" }] })).toContain("variants[0].label: unknown key");
  });

  it("requires label", () => {
    expect(() => parseManifest({}, FILE, axes)).toThrow(/label:/);
  });

  it.each([
    ["hint", 1],
    ["scripts", { dev: 1 }],
    ["overrides", "src/App.tsx"],
    ["nextSteps", ["x"]],
    ["includes", ["routing/r1"]],
    ["engines", { node: "not a range" }],
    ["engines", { npm: ">=10" }],
    ["steering", [{ target: "readme.md", section: "s", content: "c" }]],
    ["steeringSections", { "readme.md": ["a"] }],
    ["agentAppends", [{ prompt: "p" }]],
  ])("rejects invalid %s", (field, value) => {
    expect(bad({ [field]: value })).toContain(`${FILE}: ${field}`);
  });

  it("accepts exact overrides and rejects ranges and PM-specific keys", () => {
    ok({ packageJson: { overrides: { vite: "npm:@scope/core@1.4.0", vitest: "5.0.5" } } });
    expect(bad({ packageJson: { overrides: { vite: "^8.0.0" } } })).toContain("packageJson.overrides.vite: must be an exact version or npm:<pkg>@<exact>");
    expect(bad({ packageJson: { overrides: { vite: "npm:@scope/core@latest" } } })).toContain("packageJson.overrides.vite");
    expect(bad({ packageJson: { overrides: ["x"] } })).toContain("packageJson.overrides: must be an object");
    expect(bad({ packageJson: { resolutions: {} } })).toContain('packageJson.resolutions: declare "overrides" instead');
    expect(bad({ packageJson: { pnpm: {} } })).toContain("packageJson.pnpm");
  });

  it("rejects dependency fields in packageJson", () => {
    expect(bad({ packageJson: { dependencies: { react: "19.2.0" } } })).toContain('packageJson.dependencies: use the top-level "dependencies" field');
    expect(bad({ packageJson: { scripts: { a: "b" } } })).toContain("packageJson.scripts");
  });
});

describe("layer schema: versions", () => {
  it.each(["^1.0.0", "~1.0.0", "latest", "1.x", ">=1.0.0", "1.0", "next", "1.0.0 || 2.0.0", "*"])("rejects %s", (version) => {
    for (const field of ["dependencies", "devDependencies"]) {
      expect(bad({ [field]: { pkg: version } })).toContain(`${field}.pkg: must be an exact version`);
    }
    if (version !== "^1.0.0") expect(bad({ peerDependencies: { pkg: version } })).toContain("peerDependencies.pkg: must be an exact version");
    expect(bad({ variants: [{ name: "v", when: { type: "app" }, dependencies: { pkg: version } }] })).toContain(
      "variants[0].dependencies.pkg: must be an exact version",
    );
  });

  it("allows ^x.y.0 ranges for peers only", () => {
    ok({ peerDependencies: { react: "^19.2.0" } });
    expect(bad({ peerDependencies: { react: "^19.2.1" } })).toContain("peerDependencies.react: must be an exact version or ^<major>.<minor>.0");
    expect(bad({ peerDependencies: { react: ">=19" } })).toContain("peerDependencies.react");
    expect(bad({ dependencies: { react: "^19.2.0" } })).toContain("dependencies.react: must be an exact version");
  });

  it("validates buildScripts", () => {
    ok({ buildScripts: { esbuild: false, "@parcel/watcher": true } });
    expect(bad({ buildScripts: { esbuild: "no" } })).toContain("buildScripts.esbuild");
  });

  it("accepts exact and prerelease versions", () => {
    ok({ dependencies: { a: "1.2.3", b: "0.0.1-beta.4" } });
  });
});

describe("layer schema: axis and option references", () => {
  it("rejects an unknown axis in when / requires / disablesAxes", () => {
    expect(bad({ variants: [{ name: "v", when: { colour: "red" } }] })).toContain(`${FILE}: variants[0].when.colour: unknown axis`);
    expect(bad({ requires: { colour: ["red"] } })).toContain("requires.colour: unknown axis");
    expect(bad({ disablesAxes: ["colour"] })).toContain('disablesAxes[0]: unknown axis "colour"');
  });

  it("rejects an unknown option in when / requires / conflicts", () => {
    expect(bad({ variants: [{ name: "v", when: { ui: "x" } }] })).toContain('variants[0].when.ui: unknown option "x" for ui');
    expect(bad({ variants: [{ name: "v", when: { ui: ["m", "x"] } }] })).toContain('variants[0].when.ui[1]: unknown option "x"');
    expect(bad({ requires: { styling: ["nope"] } })).toContain('requires.styling[0]: unknown option "nope" for styling');
    expect(bad({ conflicts: ["styling/nope"] })).toContain('conflicts[0]: unknown layer "styling/nope"');
  });

  it("rejects an empty when and duplicate variant names", () => {
    expect(bad({ variants: [{ name: "v", when: {} }] })).toContain("variants[0].when: must name at least one axis");
    const twice = [
      { name: "v", when: { type: "app" } },
      { name: "v", when: { type: "library" } },
    ];
    expect(bad({ variants: twice })).toContain('variants[1].name: duplicate variant "v"');
  });
});

describe("layer schema: MCP entries", () => {
  it("accepts both shapes", () => {
    ok({ mcpServers: { a: cmdMcp, b: urlMcp, c: { ...urlMcp, url: "https://example.com/mcp" }, d: { ...urlMcp, url: "http://127.0.0.1:1/mcp" } } });
  });

  it("rejects a pin that is not exact or not in args", () => {
    expect(bad({ mcpServers: { a: { ...cmdMcp, pin: "@mui/mcp@latest", args: ["@mui/mcp@latest"] } } })).toContain(
      "mcpServers.a.pin: pin must be <pkg>@<exact> and appear in args",
    );
    expect(bad({ mcpServers: { a: { ...cmdMcp, args: ["-y", "@mui/mcp"] } } })).toContain("mcpServers.a.pin");
  });

  it("rejects a non-local http url", () => {
    expect(bad({ mcpServers: { a: { ...urlMcp, url: "http://example.com/mcp" } } })).toContain("mcpServers.a.url: must be https://");
  });

  it("rejects a url entry without provider and other shapes", () => {
    expect(bad({ mcpServers: { a: { url: "https://example.com/mcp", script: "s" } } })).toContain("mcpServers.a.provider");
    expect(bad({ mcpServers: { a: { name: "x" } } })).toContain(
      "mcpServers.a: must be { command, args, pin } or { url, provider, script }",
    );
  });

  it("helpers", () => {
    expect(isExactPin("@storybook/addon-mcp@0.1.0")).toBe(true);
    expect(isExactPin("pkg@1.0.0")).toBe(true);
    expect(isExactPin("pkg")).toBe(false);
    expect(isExactPin("pkg@^1.0.0")).toBe(false);
    expect(isLocalOrHttpsUrl("http://localhost:6006/mcp")).toBe(true);
    expect(isLocalOrHttpsUrl("ftp://localhost")).toBe(false);
    expect(isLocalOrHttpsUrl("not a url")).toBe(false);
  });
});

describe("layer schema: postInstall and patches", () => {
  it.each([[[[]]], [["playwright install"]], [[[1]]], [[[""]]]])("rejects postInstall %j", (value) => {
    expect(bad({ postInstall: value })).toContain("postInstall[0]");
  });

  it("requires exactly one of content / contentFile", () => {
    expect(bad({ patches: [{ file: "f", anchor: "a" }] })).toContain("patches[0]: exactly one of content / contentFile");
    expect(bad({ patches: [{ file: "f", anchor: "a", content: "x", contentFile: "y" }] })).toContain("exactly one of content / contentFile");
    ok({ patches: [{ file: "f", anchor: "a", contentFile: "patches/a.ts" }] });
  });

  it("rejects a bad position or anchor", () => {
    expect(bad({ patches: [{ file: "f", anchor: "a", content: "x", position: "inside" }] })).toContain('patches[0].position: must be "before" or "after"');
    expect(bad({ patches: [{ file: "f", anchor: "Bad Anchor", content: "x" }] })).toContain("patches[0].anchor");
  });
});

describe("loadLayers", () => {
  it("loads base, axis layers and addons with dirs and agents", () => {
    expect([...layers.keys()]).toContain("base");
    expect([...layers.keys()]).toContain("addons/x");
    expect(layers.size).toBe(1 + 2 + 2 + 2 + 2 + 3 + 4 + 1);
    const base = layers.get("base");
    expect(base).toMatchObject({ group: "base", option: undefined, hasFilesDir: true, variantDirs: ["lib"], agentNames: ["reviewer"] });
    expect(layers.get("ui/m")).toMatchObject({ group: "ui", option: "m", hasFilesDir: false, agentNames: ["ui-expert"] });
    expect(layers.get("addons/x")).toMatchObject({ group: "addons", option: "x", agentNames: ["storybook-expert"] });
  });

  it("names the layer path and field on failure", () => {
    const root = variantTree({ "ui/m/layer.json": { label: "M", dependencies: { a: "^1.0.0" } } });
    const err = catchError(() => load(root));
    expect(err).toBeInstanceOf(BonesmithError);
    expect((err as BonesmithError).message).toBe("templates/ui/m/layer.json: dependencies.a: must be an exact version (no ^, ~, ranges or tags)");
  });

  it("rejects a missing layer.json, invalid JSON, and a files@ dir without a variant", () => {
    expect((catchError(() => load(variantTree({ "ui/m/layer.json": null }))) as BonesmithError).message).toContain(
      "templates/ui/m/layer.json: (file): missing layer.json",
    );
    expect((catchError(() => load(variantTree({ "ui/m/layer.json": "{" }))) as BonesmithError).message).toContain("invalid JSON");
    expect((catchError(() => load(variantTree({ "ui/m/files@ghost/a.txt": "x" }))) as BonesmithError).message).toContain(
      'files@ghost/ has no variant named "ghost"',
    );
  });
});

describe("JSON Schema", () => {
  it("describes layer.json with axis-aware enums", () => {
    const schema = layerJsonSchema(axes);
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    const props = schema.properties as Record<string, unknown>;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["label", "variants", "mcpServers", "disablesAxes", "$schema"]));
    expect(JSON.stringify(props.disablesAxes)).toContain('"routing"');
  });

  it("writes layer.schema.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "bonesmith-schema-"));
    try {
      const file = emitJsonSchema(axes, join(dir, "layer.schema.json"));
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      expect(parsed.$schema).toMatch(/json-schema\.org/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
