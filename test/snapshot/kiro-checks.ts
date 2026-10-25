// Checks on generated `.kiro/` output, shared by the app (04) and library (05) snapshot suites.
import { matchesGlob } from "node:path";
import { expect } from "vitest";
import { parse } from "yaml";
import type { VirtualTree } from "../../src/tree.ts";

export const KIRO_AGENT_FIELDS = ["name", "description", "prompt", "tools", "resources", "mcpServers", "includeMcpJson", "permissions"];
const ALWAYS = ["product.md", "tech.md", "structure.md"];

export function text(tree: VirtualTree, path: string): string {
  const entry = tree.get(path);
  if (entry === undefined) throw new Error(`missing ${path}`);
  return Buffer.from(entry.bytes).toString("utf8");
}

function list(tree: VirtualTree, prefix: string, suffix: string): string[] {
  return [...tree.keys()]
    .filter((p) => p.startsWith(prefix) && p.endsWith(suffix))
    .map((p) => p.slice(prefix.length, p.length - suffix.length))
    .sort();
}

export const steeringFiles = (tree: VirtualTree): string[] => list(tree, ".kiro/steering/", ".md");
export const agentNames = (tree: VirtualTree): string[] => list(tree, ".kiro/agents/", ".json");

/** Front matter parses; always-included frames vs fileMatch layer files with a pattern. */
export function checkSteering(tree: VirtualTree): void {
  for (const name of steeringFiles(tree)) {
    const body = text(tree, `.kiro/steering/${name}.md`);
    const match = /^---\n([\s\S]*?)\n---\n/.exec(body);
    expect(match, `${name}.md front matter`).not.toBeNull();
    const meta = parse(match?.[1] ?? "") as Record<string, unknown>;
    if (ALWAYS.includes(`${name}.md`)) {
      expect(meta.inclusion, `${name}.md inclusion`).toBe("always");
    } else {
      expect(meta.inclusion, `${name}.md inclusion`).toBe("fileMatch");
      const pattern = meta.fileMatchPattern;
      const ok = typeof pattern === "string" || (Array.isArray(pattern) && pattern.length > 0 && pattern.every((p) => typeof p === "string"));
      expect(ok, `${name}.md fileMatchPattern`).toBe(true);
    }
    expect(body).not.toMatch(/bonesmith:|\{\{\w+\}\}/);
    expect(body).not.toMatch(/\n#{1,3} [^\n]*\n+(?=#{1,3} |$)/); // no empty headings
  }
}

/** Agent JSON parses, has only Kiro fields, its file:// resources exist, and MCP refs are configured. */
export function checkAgents(tree: VirtualTree, servers: readonly string[]): void {
  const paths = [...tree.keys()];
  for (const name of agentNames(tree)) {
    const agent = JSON.parse(text(tree, `.kiro/agents/${name}.json`)) as Record<string, unknown>;
    expect(agent.name).toBe(name);
    for (const key of Object.keys(agent)) expect(KIRO_AGENT_FIELDS, `${name}.${key}`).toContain(key);
    expect(typeof agent.prompt === "string" && !/\{\{\w+\}\}/.test(agent.prompt)).toBe(true);
    for (const r of (agent.resources ?? []) as string[]) {
      if (!r.startsWith("file://")) continue;
      const pattern = r.slice("file://".length);
      expect(paths.some((p) => p === pattern || matchesGlob(p, pattern)), `${name} resource ${r}`).toBe(true);
    }
    for (const server of Object.keys((agent.mcpServers ?? {}))) {
      expect(servers, `${name} MCP ${server}`).toContain(server);
      expect(agent.tools).toContain(`@${server}`);
      expect(agent.includeMcpJson).toBe(false);
    }
  }
}

/** mcp.json has exactly `servers` (absent when empty), and tech.md lists each one. */
export function checkMcp(tree: VirtualTree, servers: readonly string[]): void {
  const path = ".kiro/settings/mcp.json";
  if (servers.length === 0) {
    expect(tree.has(path)).toBe(false);
    expect(text(tree, ".kiro/steering/tech.md")).not.toContain("## MCP servers");
    return;
  }
  const mcp = JSON.parse(text(tree, path)) as { mcpServers: Record<string, Record<string, unknown>> };
  expect(Object.keys(mcp.mcpServers).sort()).toEqual([...servers].sort());
  const tech = text(tree, ".kiro/steering/tech.md");
  for (const [name, entry] of Object.entries(mcp.mcpServers)) {
    for (const key of ["pin", "provider", "script"]) expect(entry).not.toHaveProperty(key);
    if (Array.isArray(entry.args)) expect(entry.args.some((a) => typeof a === "string" && /@\d+\.\d+\.\d+$/.test(a)), `${name} pinned`).toBe(true);
    expect(tech).toContain(`- \`${name}\`:`);
  }
}
