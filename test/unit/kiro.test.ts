import { describe, expect, it } from "vitest";
import { APP, json, LIB, manifest, renderFails, renderWith, text } from "../helpers/render.ts";

const frontMatter = (inclusion: string) => `---\ninclusion: ${inclusion}\n---\n\n`;

describe("steering", () => {
  it("copies layer steering files", () => {
    expect(text(renderWith(), ".kiro/steering/ui.md")).toBe(`---\ninclusion: fileMatch\nfileMatchPattern: "src/**"\n---\n\n# U\n`);
  });

  it("composes tech.md in section order with the generated mcp section", () => {
    expect(text(renderWith({}, LIB), ".kiro/steering/tech.md")).toBe(
      `${frontMatter("always")}# Tech\n\n## Toolchain\n\nUse \`pnpm build\`.\n\n## UI\n\nUse U.\n\n## MCP servers\n\n` +
        "- `s`: `s-addon@3.0.0`, requires `pnpm storybook` running\n- `u`: `@u/mcp@2.0.0`\n",
    );
  });

  it("orders by section, not render order", () => {
    // ui/u lists `ui` before `toolchain`; output follows steeringSections, and toolchain/a precedes ui/u within a section.
    const ui = { ...manifest("ui/u"), steering: [{ target: "structure.md", section: "ui", content: "## UI" }, { target: "structure.md", section: "toolchain", content: "U toolchain note." }] };
    expect(text(renderWith({ "ui/u/layer.json": ui }), ".kiro/steering/structure.md")).toBe(
      `${frontMatter("always")}# Structure\n\n## Toolchain\n\nConfig in a.config.ts.\n\nU toolchain note.\n\n## UI\n`,
    );
  });

  it("emits nothing for sections without snippets and no mcp section without servers", () => {
    const project = renderWith({}, { ...APP, ui: "none" });
    expect(text(project, ".kiro/steering/tech.md")).toBe(`${frontMatter("always")}# Tech\n\n## Toolchain\n\nUse \`pnpm build\`.\n`);
    expect(text(project, ".kiro/steering/structure.md")).not.toContain("## UI");
  });

  it("emits no headings when nothing contributes", () => {
    const project = renderWith({ "toolchain/b/layer.json": { label: "B", scripts: { build: "b", dev: "b" } } }, { ...APP, toolchain: "b", ui: "none" });
    expect(text(project, ".kiro/steering/tech.md")).toBe(`${frontMatter("always")}# Tech\n\n`);
  });

  it("rejects an unknown section and a layer-authored mcp section", () => {
    const bad = (section: string) => ({ ...manifest("ui/u"), steering: [{ target: "tech.md", section, content: "x" }] });
    const e = renderFails("UNKNOWN_SECTION", { "ui/u/layer.json": bad("colours") });
    expect(e.message).toBe("`ui/u` adds steering section `colours` to tech.md, which isn't in base's `steeringSections` (toolchain, ui, mcp).");
    expect(renderFails("UNKNOWN_SECTION", { "ui/u/layer.json": bad("mcp") }).fix).toContain("generated from `mcpServers`");
  });

  it("requires base to list the mcp section when servers exist", () => {
    const base = { ...manifest("base"), steeringSections: { "tech.md": ["toolchain", "ui"], "structure.md": ["toolchain", "ui"] } };
    expect(renderFails("UNKNOWN_SECTION", { "base/layer.json": base }).fix).toContain("Add `mcp` to `steeringSections.tech.md`");
  });
});

describe("agents", () => {
  it("applies appends: prompt paragraphs and resource union", () => {
    const reviewer = json(renderWith(), ".kiro/agents/reviewer.json");
    expect(reviewer.prompt).toBe("Review the change. Use pnpm test.\n\nCheck U usage.");
    expect(reviewer.resources).toEqual(["file://.kiro/steering/tech.md", "file://.kiro/steering/ui.md"]);
    const plain = json(renderWith({}, { ...APP, ui: "none" }), ".kiro/agents/reviewer.json");
    expect(plain.prompt).toBe("Review the change. Use pnpm test.");
  });

  it("expands mcpServers shorthand and writes into Kiro fields only", () => {
    const agent = json(renderWith(), ".kiro/agents/ui-expert.json");
    expect(Object.keys(agent)).toEqual(["name", "description", "prompt", "tools", "resources", "mcpServers", "includeMcpJson", "permissions"]);
    expect(agent.tools).toEqual(["fs_read", "fs_write", "@u"]);
    expect(agent.mcpServers).toEqual({ u: { command: "npx", args: ["--no", "@u/mcp@2.0.0"] } });
    expect(agent.includeMcpJson).toBe(false);
    expect(agent.permissions).toEqual({
      rules: [
        { capability: "fs_write", match: ["src/**/*.tsx"], effect: "allow" },
        { capability: "fs_write", match: ["**"], exclude: ["src/**/*.tsx"], effect: "deny" },
      ],
    });
  });

  it("turns empty writes into deny-all and omits permissions without writes", () => {
    expect(json(renderWith(), ".kiro/agents/reviewer.json").permissions).toEqual({ rules: [{ capability: "fs_write", match: ["**"], effect: "deny" }] });
    const agent = { name: "reviewer", description: "d", prompt: "p", tools: [] };
    const out = json(renderWith({ "base/kiro/agents/reviewer.json": agent }, { ...APP, ui: "none" }), ".kiro/agents/reviewer.json");
    expect(out).toEqual(agent);
  });

  it("rejects an append to an agent not in the output", () => {
    const ui = { ...manifest("ui/u"), agentAppends: [{ agent: "ghost", prompt: "x" }] };
    expect(renderFails("UNKNOWN_AGENT", { "ui/u/layer.json": ui }).message).toBe(
      "`ui/u` appends to agent `ghost`, which is not in the output (agents: reviewer, ui-expert).",
    );
  });

  it("rejects a shorthand server that isn't declared", () => {
    const ui = { ...manifest("ui/u"), mcpServers: {} };
    expect(renderFails("UNKNOWN_MCP_SERVER", { "ui/u/layer.json": ui }).message).toContain("uses MCP server `u`, which no selected layer declares");
  });

  it("rejects a file:// resource that matches nothing (globs allowed)", () => {
    const agent = (resources: string[]) => ({ name: "reviewer", description: "d", prompt: "p", tools: [], resources });
    expect(() => renderWith({ "base/kiro/agents/reviewer.json": agent(["file://.kiro/steering/*.md", "skill://x"]) })).not.toThrow();
    expect(renderFails("MISSING_RESOURCE", { "base/kiro/agents/reviewer.json": agent(["file://.kiro/steering/routing.md"]) }).message).toBe(
      "Agent `reviewer` lists resource `file://.kiro/steering/routing.md`, but no generated file matches it.",
    );
  });

  it("validates the authoring shape", () => {
    const bad = { name: "reviewer", description: "d", prompt: "p", tools: [], toolsSettings: {} };
    expect(renderFails("LAYER_INVALID", { "base/kiro/agents/reviewer.json": bad }).message).toBe(
      "templates/base/kiro/agents/reviewer.json: toolsSettings: unknown key",
    );
    const misnamed = { name: "other", description: "d", prompt: "p", tools: [] };
    expect(renderFails("LAYER_INVALID", { "base/kiro/agents/reviewer.json": misnamed }).message).toContain("name: must match the file name");
  });
});

describe("mcp.json", () => {
  it("merges servers without Bonesmith-only fields", () => {
    expect(json(renderWith({}, LIB), ".kiro/settings/mcp.json")).toEqual({
      mcpServers: { s: { url: "http://localhost:6006/mcp" }, u: { command: "npx", args: ["--no", "@u/mcp@2.0.0"] } },
    });
  });

  it("is absent without servers", () => {
    expect(renderWith({}, { ...APP, ui: "none" }).tree.has(".kiro/settings/mcp.json")).toBe(false);
  });

  it("rejects a server name declared twice", () => {
    const tc = { ...manifest("toolchain/a"), mcpServers: { u: { command: "npx", args: ["x@1.0.0"], pin: "x@1.0.0" } } };
    expect(renderFails("MCP_COLLISION", { "toolchain/a/layer.json": tc }).message).toBe("MCP server `u` is declared by both `toolchain/a` and `ui/u`.");
  });

  it("rejects a url provider that isn't a pinned dependency", () => {
    const addon = { ...manifest("addons/s"), devDependencies: {} };
    expect(renderFails("UNPINNED_PROVIDER", { "addons/s/layer.json": addon }, LIB).message).toBe(
      "MCP server `s` (from `addons/s`) is provided by `s-addon`, which is not a pinned dependency.",
    );
  });
});
