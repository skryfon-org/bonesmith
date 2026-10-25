import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { BonesmithError } from "./errors.ts";
import type { LayerId, ResolvedLayer } from "./types.ts";

export interface TreeEntry {
  bytes: Uint8Array;
  /** Layer id that wrote the file, or a core source (`bonesmith`, `pm`). */
  from: LayerId;
  /** Foundation files (base, type, addons) may hold anchors. */
  foundation: boolean;
}

/** Output path (POSIX, relative) → file. */
export type VirtualTree = Map<string, TreeEntry>;

/** An agent source file found in a layer's `kiro/agents/`. */
export interface AgentSource {
  name: string;
  from: LayerId;
  file: string;
  bytes: Uint8Array;
}

/** Layer groups whose files may carry anchors. */
const FOUNDATION_GROUPS: readonly string[] = ["base", "type", "addons"];

const NAME_MAP: Readonly<Record<string, string>> = { _gitignore: ".gitignore", _npmrc: ".npmrc" };

export function isFoundation(layer: Pick<ResolvedLayer, "group">): boolean {
  return FOUNDATION_GROUPS.includes(layer.group);
}

/** A file is binary when its first 8 KB contain a NUL byte. */
export function isBinary(bytes: Uint8Array): boolean {
  return bytes.subarray(0, 8192).includes(0);
}

/** Maps `_gitignore` → `.gitignore` and `_npmrc` → `.npmrc` (basename, any depth). */
export function mapName(rel: string): string {
  const parts = rel.split("/");
  const last = parts.pop() ?? "";
  parts.push(NAME_MAP[last] ?? last);
  return parts.join("/");
}

/** Reads every file under `dir` recursively, sorted, keyed by mapped POSIX relative path. */
export function readLayerFiles(dir: string): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const walk = (abs: string, rel: string): void => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const childRel = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) walk(join(abs, e.name), childRel);
      else if (e.isFile()) out.set(mapName(childRel), readFileSync(join(abs, e.name)));
    }
  };
  if (existsSync(dir)) walk(dir, "");
  return out;
}

export function isSafeRelativePath(path: string): boolean {
  if (path === "" || path.startsWith("/") || path.includes("\\") || /^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((seg) => seg !== "" && seg !== "." && seg !== "..");
}

function layerFile(layer: ResolvedLayer): string {
  return `templates/${layer.id}/layer.json`;
}

function collision(path: string, first: LayerId, second: ResolvedLayer | LayerId): BonesmithError {
  const secondId = typeof second === "string" ? second : second.id;
  const fix =
    typeof second === "string"
      ? `Remove \`${path}\` from \`${first}\`.`
      : `Add "${path}" to \`overrides\` in ${layerFile(second)} if it should replace the earlier file, or remove one of them.`;
  return new BonesmithError("FILE_COLLISION", `\`${path}\` is written by both \`${first}\` and \`${secondId}\`.`, fix, {
    path,
    layers: [first, secondId],
  });
}

/** Files of one layer: `files/`, then selected variants' `files@<name>/`, then `kiro/steering/*.md`. */
function layerFiles(layer: ResolvedLayer, agents: Map<string, AgentSource>): Map<string, Uint8Array> {
  const files = layer.hasFilesDir ? readLayerFiles(join(layer.dir, "files")) : new Map<string, Uint8Array>();

  const writtenBy = new Map<string, string>();
  for (const variant of layer.variants) {
    if (!layer.variantDirs.includes(variant.name)) continue;
    for (const [path, bytes] of readLayerFiles(join(layer.dir, `files@${variant.name}`))) {
      const other = writtenBy.get(path);
      if (other !== undefined) {
        throw new BonesmithError(
          "VARIANT_FILE_COLLISION",
          `\`${path}\` is written by both variants \`${other}\` and \`${variant.name}\` of \`${layer.id}\`, and both are selected.`,
          `Remove it from one of files@${other}/ and files@${variant.name}/, or make their \`when\` exclusive.`,
          { path, layer: layer.id, variants: [other, variant.name] },
        );
      }
      writtenBy.set(path, variant.name);
      files.set(path, bytes);
    }
  }

  const kiroDir = join(layer.dir, "kiro");
  if (existsSync(kiroDir)) {
    for (const entry of readdirSync(kiroDir, { withFileTypes: true })) {
      if (!(entry.isDirectory() && (entry.name === "steering" || entry.name === "agents"))) {
        throw new BonesmithError(
          "LAYER_INVALID",
          `templates/${layer.id}/kiro/${entry.name}: unexpected entry (only steering/ and agents/ are allowed).`,
          "Move or remove it.",
          { layer: layer.id },
        );
      }
    }
    for (const [name, bytes] of readLayerFiles(join(kiroDir, "steering"))) {
      if (name.includes("/") || !name.endsWith(".md")) {
        throw new BonesmithError(
          "LAYER_INVALID",
          `templates/${layer.id}/kiro/steering/${name}: steering files must be top-level .md files.`,
          "Move or rename it.",
          { layer: layer.id },
        );
      }
      const out = `.kiro/steering/${name}`;
      if (files.has(out)) throw collision(out, layer.id, layer.id);
      files.set(out, bytes);
    }
    for (const [file, bytes] of readLayerFiles(join(kiroDir, "agents"))) {
      if (file.includes("/") || !file.endsWith(".json")) {
        throw new BonesmithError(
          "LAYER_INVALID",
          `templates/${layer.id}/kiro/agents/${file}: agent files must be top-level .json files.`,
          "Move or rename it.",
          { layer: layer.id },
        );
      }
      const name = file.slice(0, -".json".length);
      const first = agents.get(name);
      if (first !== undefined) {
        throw new BonesmithError(
          "AGENT_COLLISION",
          `Agent \`${name}\` is shipped by both \`${first.from}\` and \`${layer.id}\`.`,
          `Rename templates/${layer.id}/kiro/agents/${file}, or use \`agentAppends\` to extend the existing agent.`,
          { agent: name, layers: [first.from, layer.id] },
        );
      }
      agents.set(name, { name, from: layer.id, file: `templates/${layer.id}/kiro/agents/${file}`, bytes });
    }
  }
  return files;
}

export interface Collected {
  tree: VirtualTree;
  agents: Map<string, AgentSource>;
}

/**
 * Collect phase: every layer's files in render order, with variant replacement,
 * collision and override checks, then `extraFiles` (source `pm`).
 */
export function collectFiles(layers: readonly ResolvedLayer[], extraFiles: Readonly<Record<string, string>>): Collected {
  const tree: VirtualTree = new Map();
  const agents = new Map<string, AgentSource>();

  for (const layer of layers) {
    const files = layerFiles(layer, agents);
    const overrides = new Set([...(layer.manifest.overrides ?? []), ...layer.variants.flatMap((v) => v.overrides ?? [])]);
    const used = new Set<string>();
    const foundation = isFoundation(layer);

    for (const [path, bytes] of files) {
      if (path === "package.json") {
        throw new BonesmithError(
          "FILE_COLLISION",
          `templates/${layer.id} ships files/package.json; package.json is built from layer.json data.`,
          "Declare it in layer.json instead (dependencies, devDependencies, peerDependencies, scripts, packageJson).",
          { path, layers: [layer.id] },
        );
      }
      const existing = tree.get(path);
      if (existing !== undefined) {
        if (!overrides.has(path)) throw collision(path, existing.from, layer);
        used.add(path);
      }
      tree.set(path, { bytes, from: layer.id, foundation });
    }

    for (const path of overrides) {
      if (!used.has(path)) {
        throw new BonesmithError(
          "STALE_OVERRIDE",
          `${layerFile(layer)} overrides \`${path}\`, but no earlier layer writes it.`,
          `Remove "${path}" from \`overrides\`.`,
          { path, layer: layer.id },
        );
      }
    }
  }

  for (const [path, content] of Object.entries(extraFiles)) {
    if (!isSafeRelativePath(path)) throw new Error(`internal: unsafe extra file path ${path}`);
    const existing = tree.get(path);
    if (existing !== undefined || path === "package.json") throw collision(path, existing?.from ?? "bonesmith", "pm");
    tree.set(path, { bytes: Buffer.from(content, "utf8"), from: "pm", foundation: false });
  }

  return { tree, agents };
}

export function readText(entry: TreeEntry): string {
  return Buffer.from(entry.bytes).toString("utf8");
}

export function writeText(entry: TreeEntry, text: string): TreeEntry {
  return { ...entry, bytes: Buffer.from(text, "utf8") };
}
