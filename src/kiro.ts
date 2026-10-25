import { matchesGlob } from "node:path";
import { z } from "zod";
import type { Contribution, McpEntry } from "./contributions.ts";
import { BonesmithError } from "./errors.ts";
import { schemaError } from "./layers.ts";
import type { AgentSource, VirtualTree } from "./tree.ts";

// ---------------------------------------------------------------------------
// MCP servers
// ---------------------------------------------------------------------------

export interface MergedServer {
  entry: McpEntry;
  from: string;
}
export type MergedServers = Map<string, MergedServer>;

/** Merges `mcpServers` across contributions; a name declared twice is `MCP_COLLISION`. */
export function mergeMcpServers(contribs: readonly Contribution[]): MergedServers {
  const servers: MergedServers = new Map();
  for (const c of contribs) {
    for (const [name, entry] of Object.entries(c.data.mcpServers ?? {})) {
      const first = servers.get(name);
      if (first !== undefined) {
        throw new BonesmithError(
          "MCP_COLLISION",
          `MCP server \`${name}\` is declared by both \`${first.from}\` and \`${c.from}\`.`,
          "Declare it in one layer only, or rename one of them.",
          { server: name, layers: [first.from, c.from] },
        );
      }
      servers.set(name, { entry, from: c.from });
    }
  }
  return servers;
}

/** Every `url` server's `provider` must be a pinned dependency of the merged package.json. */
export function checkProviders(servers: MergedServers, pinned: ReadonlyMap<string, string>): void {
  for (const [name, { entry, from }] of servers) {
    if (!("url" in entry) || pinned.has(entry.provider)) continue;
    throw new BonesmithError(
      "UNPINNED_PROVIDER",
      `MCP server \`${name}\` (from \`${from}\`) is provided by \`${entry.provider}\`, which is not a pinned dependency.`,
      `Add \`${entry.provider}\` with an exact version to \`dependencies\` or \`devDependencies\` of a selected layer.`,
      { server: name, provider: entry.provider },
    );
  }
}

/** Kiro's entry shape: Bonesmith-only fields (`pin`, `provider`, `script`) removed. */
function kiroEntry(entry: McpEntry): Record<string, unknown> {
  return "url" in entry ? { url: entry.url } : { command: entry.command, args: [...entry.args] };
}

/** `.kiro/settings/mcp.json` content, or undefined when there are no servers. */
export function buildMcpJson(servers: MergedServers): string | undefined {
  if (servers.size === 0) return undefined;
  const out: Record<string, unknown> = {};
  for (const [name, { entry }] of servers) out[name] = kiroEntry(entry);
  return `${JSON.stringify({ mcpServers: out }, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// Steering
// ---------------------------------------------------------------------------

export const MCP_SECTION = "mcp";
export const SECTIONS_ANCHOR = "sections";
export type SteeringTarget = "tech.md" | "structure.md";
export type SteeringSections = Partial<Record<SteeringTarget, string[]>>;

/** The generated `mcp` section of tech.md, or undefined without servers. */
export function mcpSection(servers: MergedServers, pinned: ReadonlyMap<string, string>): string | undefined {
  if (servers.size === 0) return undefined;
  const lines = ["## MCP servers", ""];
  for (const [name, { entry }] of servers) {
    if ("url" in entry) {
      const version = pinned.get(entry.provider) ?? "";
      lines.push(`- \`${name}\`: \`${entry.provider}@${version}\`, requires \`{{pmRun}} ${entry.script}\` running`);
    } else {
      lines.push(`- \`${name}\`: \`${entry.pin}\``);
    }
  }
  return lines.join("\n");
}

export interface ComposedPatch {
  file: string;
  anchor: string;
  content: string;
  from: string;
}

function unknownSection(from: string, target: string, section: string, known: readonly string[], fix?: string): BonesmithError {
  return new BonesmithError(
    "UNKNOWN_SECTION",
    `\`${from}\` adds steering section \`${section}\` to ${target}, which isn't in base's \`steeringSections\` (${known.length > 0 ? known.join(", ") : "none"}).`,
    fix ?? "Use one of those sections, or add it to `steeringSections` in templates/base/layer.json.",
    { from, target, section },
  );
}

/**
 * Composes tech.md / structure.md: snippets ordered by section index, then render order,
 * joined by blank lines, as one patch per target at the `sections` anchor.
 */
export function composeSteering(contribs: readonly Contribution[], sections: SteeringSections, mcp: string | undefined): ComposedPatch[] {
  type Entry = { target: SteeringTarget; index: number; order: number; content: string };
  const entries: Entry[] = [];
  contribs.forEach((c, order) => {
    for (const s of c.data.steering ?? []) {
      const known = sections[s.target] ?? [];
      const index = known.indexOf(s.section);
      if (s.section === MCP_SECTION) {
        throw unknownSection(c.from, s.target, s.section, known, "Remove it; the `mcp` section is generated from `mcpServers`.");
      }
      if (index === -1) throw unknownSection(c.from, s.target, s.section, known);
      entries.push({ target: s.target, index, order, content: s.content.replace(/\n+$/, "") });
    }
  });
  if (mcp !== undefined) {
    const known = sections["tech.md"] ?? [];
    const index = known.indexOf(MCP_SECTION);
    if (index === -1) throw unknownSection("bonesmith", "tech.md", MCP_SECTION, known, "Add `mcp` to `steeringSections.tech.md` in templates/base/layer.json.");
    entries.push({ target: "tech.md", index, order: contribs.length, content: mcp });
  }

  const patches: ComposedPatch[] = [];
  for (const target of ["tech.md", "structure.md"] as const) {
    const mine = entries.filter((e) => e.target === target).sort((a, b) => a.index - b.index || a.order - b.order);
    if (mine.length === 0) continue;
    patches.push({
      file: `.kiro/steering/${target}`,
      anchor: SECTIONS_ANCHOR,
      content: mine.map((e) => e.content).join("\n\n"),
      from: "steering",
    });
  }
  return patches;
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

const AgentFile = z.strictObject(
  {
    name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "must be lowercase kebab-case"),
    description: z.string().min(1),
    prompt: z.string().min(1),
    tools: z.array(z.string().min(1)),
    resources: z.array(z.string().min(1)).optional(),
    mcpServers: z.array(z.string().min(1)).optional(),
    writes: z.array(z.string().min(1)).optional(),
    includeMcpJson: z.literal(false).optional(),
  },
  { error: (iss) => (iss.code === "unrecognized_keys" ? "unknown key" : undefined) },
);
type AgentFile = z.infer<typeof AgentFile>;

/** Emitted Kiro agent: only Kiro fields. */
export interface KiroAgent {
  name: string;
  description: string;
  prompt: string;
  tools: string[];
  resources?: string[];
  mcpServers?: Record<string, unknown>;
  includeMcpJson?: false;
  permissions?: { rules: Record<string, unknown>[] };
}

function parseAgent(source: AgentSource): AgentFile {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(source.bytes).toString("utf8"));
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    throw new BonesmithError("LAYER_INVALID", `${source.file}: (root): invalid JSON: ${why}`, "Fix the field in that file.", { file: source.file });
  }
  const parsed = AgentFile.safeParse(raw);
  if (!parsed.success) throw schemaError(source.file, parsed.error);
  if (parsed.data.name !== source.name) {
    throw new BonesmithError(
      "LAYER_INVALID",
      `${source.file}: name: must match the file name ("${source.name}")`,
      "Fix the field in that file.",
      { file: source.file },
    );
  }
  return parsed.data;
}

function union(into: string[], add: readonly string[]): void {
  for (const item of add) if (!into.includes(item)) into.push(item);
}

function checkResources(agent: KiroAgent, tree: VirtualTree): void {
  const paths = [...tree.keys()];
  for (const resource of agent.resources ?? []) {
    if (!resource.startsWith("file://")) continue;
    const pattern = resource.slice("file://".length).replace(/^\.\//, "");
    const hit = paths.some((p) => p === pattern || matchesGlob(p, pattern));
    if (!hit) {
      throw new BonesmithError(
        "MISSING_RESOURCE",
        `Agent \`${agent.name}\` lists resource \`${resource}\`, but no generated file matches it.`,
        "Fix the path, or add the file to a selected layer.",
        { agent: agent.name, resource },
      );
    }
  }
}

/**
 * Builds `.kiro/agents/<name>.json` contents: appends, MCP shorthand expansion,
 * `writes` → `permissions.rules`, and resource checks against `tree`.
 */
export function buildAgents(
  sources: ReadonlyMap<string, AgentSource>,
  contribs: readonly Contribution[],
  servers: MergedServers,
  tree: VirtualTree,
): Map<string, string> {
  const agents = new Map<string, { src: AgentFile; prompt: string; resources: string[] }>();
  for (const source of sources.values()) {
    const src = parseAgent(source);
    agents.set(src.name, { src, prompt: src.prompt, resources: [...(src.resources ?? [])] });
  }

  for (const c of contribs) {
    for (const append of c.data.agentAppends ?? []) {
      const agent = agents.get(append.agent);
      if (agent === undefined) {
        throw new BonesmithError(
          "UNKNOWN_AGENT",
          `\`${c.from}\` appends to agent \`${append.agent}\`, which is not in the output (agents: ${[...agents.keys()].join(", ") || "none"}).`,
          "Fix the `agent` name, or remove the append.",
          { from: c.from, agent: append.agent },
        );
      }
      if (append.prompt !== undefined) agent.prompt = `${agent.prompt.replace(/\n+$/, "")}\n\n${append.prompt}`;
      union(agent.resources, append.resources ?? []);
    }
  }

  const out = new Map<string, string>();
  for (const [name, { src, prompt, resources }] of agents) {
    const tools = [...src.tools];
    const agent: KiroAgent = { name, description: src.description, prompt, tools };
    if (resources.length > 0) agent.resources = resources;

    if (src.mcpServers !== undefined && src.mcpServers.length > 0) {
      const map: Record<string, unknown> = {};
      for (const server of src.mcpServers) {
        const merged = servers.get(server);
        if (merged === undefined) {
          throw new BonesmithError(
            "UNKNOWN_MCP_SERVER",
            `Agent \`${name}\` uses MCP server \`${server}\`, which no selected layer declares (servers: ${[...servers.keys()].join(", ") || "none"}).`,
            "Declare the server in the layer's `mcpServers`, or remove it from the agent.",
            { agent: name, server },
          );
        }
        map[server] = kiroEntry(merged.entry);
        union(tools, [`@${server}`]);
      }
      agent.mcpServers = map;
      agent.includeMcpJson = false;
    } else if (src.includeMcpJson === false) {
      agent.includeMcpJson = false;
    }

    if (src.writes !== undefined) {
      const rules: Record<string, unknown>[] = [];
      if (src.writes.length > 0) rules.push({ capability: "fs_write", match: [...src.writes], effect: "allow" });
      rules.push({
        capability: "fs_write",
        match: ["**"],
        ...(src.writes.length > 0 ? { exclude: [...src.writes] } : {}),
        effect: "deny",
      });
      agent.permissions = { rules };
    }

    checkResources(agent, tree);
    out.set(`.kiro/agents/${name}.json`, `${JSON.stringify(agent, null, 2)}\n`);
  }
  return out;
}
