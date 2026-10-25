import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve as resolvePath, sep } from "node:path";
import { contributions, type Contribution, type Patch } from "./contributions.ts";
import semver from "semver";
import { BonesmithError } from "./errors.ts";
import { PEER_RANGE } from "./layers.ts";
import { buildAgents, buildMcpJson, checkProviders, composeSteering, mcpSection, mergeMcpServers, type SteeringSections } from "./kiro.ts";
import {
  anchorLine,
  attributed,
  deepMergePackageJson,
  insertAtAnchor,
  PLACEHOLDER,
  sortPackageJson,
  stripAnchors,
  substitute,
  type JsonObject,
} from "./merge.ts";
import { collectFiles, isBinary, isSafeRelativePath, readText, writeText, type VirtualTree } from "./tree.ts";
import type { PackageManager, Plan } from "./types.ts";

export interface RenderVars {
  name: string;
  pm: PackageManager;
  /** e.g. `pnpm`, `npm run`. */
  pmRun: string;
  /** e.g. `pnpm exec`, `npx --no`. */
  pmExec: string;
  /** Per-package-manager files (e.g. `.yarnrc.yml`), inserted as source `pm`. */
  extraFiles: Record<string, string>;
  /** Where the merged `overrides` go: npm/bun `overrides`, yarn `resolutions`, pnpm `pnpm-workspace.yaml`. */
  overridesTarget: OverridesTarget;
}

export type OverridesTarget = "package.json#overrides" | "package.json#resolutions" | "pnpm-workspace.yaml";

export interface RenderedProject {
  /** The full project, including package.json and .kiro/**, sorted by path. */
  tree: VirtualTree;
  postInstall: string[][];
  verifyScripts: string[];
  nextSteps: string | undefined;
}

export interface RenderResult extends Omit<RenderedProject, "tree"> {
  tempDir: string;
}

const CORE = "bonesmith";

// ---------------------------------------------------------------------------
// package.json
// ---------------------------------------------------------------------------

function buildPackageJson(name: string, contribs: readonly Contribution[]): JsonObject {
  const acc = attributed({ name, version: "0.0.0" }, CORE);
  for (const c of contribs) {
    const add: JsonObject = {};
    for (const key of ["dependencies", "devDependencies", "peerDependencies", "scripts"] as const) {
      const value = c.data[key];
      if (value !== undefined) add[key] = { ...value };
    }
    for (const [key, value] of Object.entries(c.data.packageJson ?? {})) {
      if (key in add || ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "scripts"].includes(key)) {
        throw new BonesmithError(
          "LAYER_INVALID",
          `templates/${c.layer.id}/layer.json: packageJson.${key}: use the top-level "${key}" field instead`,
          "Fix the field in that file.",
          { layer: c.layer.id },
        );
      }
      add[key] = value;
    }
    deepMergePackageJson(acc, add, c.from);
  }
  return sortPackageJson(acc.value);
}

/** Merges `buildScripts` across contributions; two layers deciding differently is a conflict. */
function mergeBuildScripts(contribs: readonly Contribution[]): Map<string, boolean> {
  const out = new Map<string, { allow: boolean; from: string }>();
  for (const c of contribs) {
    for (const [pkg, allow] of Object.entries(c.data.buildScripts ?? {})) {
      const first = out.get(pkg);
      if (first !== undefined && first.allow !== allow) {
        throw new BonesmithError(
          "PACKAGE_JSON_CONFLICT",
          `\`buildScripts.${pkg}\` is \`${String(first.allow)}\` from \`${first.from}\` and \`${String(allow)}\` from \`${c.from}\`.`,
          "Decide it in one layer only.",
          { field: `buildScripts.${pkg}`, layers: [first.from, c.from] },
        );
      }
      out.set(pkg, { allow, from: first?.from ?? c.from });
    }
  }
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, v.allow]));
}

/** A `^x.y.0` peer needs an exact devDependency pin that satisfies it. */
function checkPeerRanges(pkg: JsonObject): void {
  const dev = stringMap(pkg, "devDependencies");
  for (const [name, range] of stringMap(pkg, "peerDependencies")) {
    if (!PEER_RANGE.test(range)) continue;
    const pin = dev.get(name);
    if (pin !== undefined && semver.satisfies(pin, range)) continue;
    throw new BonesmithError(
      "PACKAGE_JSON_CONFLICT",
      `peer \`${name}@${range}\` needs an exact devDependency pin that satisfies it (found ${pin === undefined ? "none" : `\`${pin}\``}).`,
      `Add \`${name}\` to \`devDependencies\` with a version in ${range}, next to the peer.`,
      { field: `peerDependencies.${name}` },
    );
  }
}

/**
 * Moves PM-specific settings to where the chosen package manager reads them: `overrides`
 * (npm/bun `overrides`, yarn `resolutions`), and for pnpm both overrides and `buildScripts`
 * (as `allowBuilds`) into a generated `pnpm-workspace.yaml`. Other PMs don't need `buildScripts`.
 */
function placePmSettings(pkg: JsonObject, target: OverridesTarget, buildScripts: ReadonlyMap<string, boolean>, tree: VirtualTree): JsonObject {
  const { overrides, ...rest } = pkg;
  const hasOverrides = typeof overrides === "object" && overrides !== null && !Array.isArray(overrides);
  if (target === "package.json#overrides") return pkg;
  if (target === "package.json#resolutions") return hasOverrides ? sortPackageJson({ ...rest, resolutions: overrides }) : pkg;

  const lines: string[] = [];
  if (hasOverrides) lines.push("overrides:", ...Object.entries(overrides).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`));
  if (buildScripts.size > 0) lines.push("allowBuilds:", ...[...buildScripts].map(([k, v]) => `  ${JSON.stringify(k)}: ${String(v)}`));
  if (lines.length === 0) return pkg;
  const path = "pnpm-workspace.yaml";
  if (tree.has(path)) throw new BonesmithError("FILE_COLLISION", `\`${path}\` is written by a layer; pnpm settings are generated into it.`, "Remove the file from the layer.", { path });
  tree.set(path, { bytes: Buffer.from(`${lines.join("\n")}\n`), from: CORE, foundation: false });
  return hasOverrides ? rest : pkg;
}

function stringMap(pkg: JsonObject, key: string): Map<string, string> {
  const out = new Map<string, string>();
  const value = pkg[key];
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) if (typeof v === "string") out.set(k, v);
  }
  return out;
}

function missingScript(script: string, why: string): BonesmithError {
  return new BonesmithError("MISSING_SCRIPT", `package.json has no \`${script}\` script, ${why}.`, `Add a \`${script}\` script to a selected layer's \`scripts\`.`, {
    script,
  });
}

// ---------------------------------------------------------------------------
// Patches
// ---------------------------------------------------------------------------

function patchContent(c: Contribution, patch: Patch): string {
  if (patch.content !== undefined) return patch.content;
  const dir = resolvePath(c.layer.dir, "patches");
  const file = resolvePath(dir, patch.contentFile ?? "");
  const shown = `templates/${c.layer.id}/patches/${patch.contentFile ?? ""}`;
  if (!file.startsWith(dir + sep) || !existsSync(file)) {
    throw new BonesmithError("LAYER_INVALID", `templates/${c.layer.id}/layer.json: patches: contentFile ${shown} not found`, "Add the file or fix `contentFile`.", {
      layer: c.layer.id,
    });
  }
  return readFileSync(file, "utf8");
}

function applyPatch(tree: VirtualTree, file: string, anchor: string, position: "before" | "after", content: string, from: string): void {
  const entry = tree.get(file);
  if (entry === undefined) {
    throw new BonesmithError(
      "PATCH_TARGET_MISSING",
      `\`${from}\` patches \`${file}\` at \`bonesmith:${anchor}\`, but no selected layer writes \`${file}\`.`,
      "Fix the patch's `file`, or limit the patch with a `when` variant.",
      { file, anchor, from },
    );
  }
  if (!entry.foundation) {
    throw new BonesmithError(
      "ANCHOR_NOT_IN_FOUNDATION",
      `\`${from}\` patches \`${file}\`, which comes from \`${entry.from}\`; only base, type and addons files may hold anchors.`,
      "Move the anchor into a foundation file, or ship the change as a file in the layer.",
      { file, anchor, from, owner: entry.from },
    );
  }
  tree.set(file, writeText(entry, insertAtAnchor(readText(entry), position, content, { file, anchor, from })));
}

// ---------------------------------------------------------------------------
// Output checks
// ---------------------------------------------------------------------------

function checkLeftovers(tree: VirtualTree): void {
  const anyAnchor = /bonesmith:[a-z0-9-]+/;
  const placeholder = new RegExp(PLACEHOLDER.source);
  for (const [path, entry] of tree) {
    if (isBinary(entry.bytes)) continue;
    const lines = readText(entry).split("\n");
    lines.forEach((line, i) => {
      const marker = anyAnchor.exec(line)?.[0] ?? placeholder.exec(line)?.[0];
      if (marker === undefined) return;
      throw new BonesmithError(
        "LEFTOVER_MARKER",
        `\`${path}\` line ${i + 1} still contains \`${marker}\` (from \`${entry.from}\`).`,
        "Put anchors on their own comment line in a foundation file, and use only known placeholders.",
        { file: path, line: i + 1, marker },
      );
    });
  }
}

function collectPostInstall(contribs: readonly Contribution[], pinned: ReadonlyMap<string, string>): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  for (const c of contribs) {
    for (const argv of c.data.postInstall ?? []) {
      const bin = argv[0] ?? "";
      if (!pinned.has(bin)) {
        throw new BonesmithError(
          "POSTINSTALL_UNPINNED",
          `\`postInstall\` in \`${c.from}\` runs \`${bin}\`, which is not a pinned dependency.`,
          `Add \`${bin}\` with an exact version to \`devDependencies\` of a selected layer.`,
          { from: c.from, bin },
        );
      }
      const key = JSON.stringify(argv);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([...argv]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

export interface RenderHooks {
  /** Called for every applied layer patch with its id, `<layer>[#<variant>]:patches[<i>]` (template lint). */
  onPatch?: (id: string) => void;
}

/** Id of a layer patch, as reported to `RenderHooks.onPatch`. */
export function patchId(from: string, index: number): string {
  return `${from}:patches[${index}]`;
}

/** Renders a plan in memory. Reads templates only; writes nothing, runs nothing. */
export function renderFiles(plan: Plan, vars: RenderVars, hooks: RenderHooks = {}): RenderedProject {
  const contribs = contributions(plan.layers);
  const placeholders: Record<string, string> = { name: vars.name, pm: vars.pm, pmRun: vars.pmRun, pmExec: vars.pmExec };

  // 1. Collect
  const { tree, agents } = collectFiles(plan.layers, vars.extraFiles);

  // 2. package.json
  const merged = buildPackageJson(vars.name, contribs);
  checkPeerRanges(merged);
  const pkg = placePmSettings(merged, vars.overridesTarget, mergeBuildScripts(contribs), tree);
  tree.set("package.json", { bytes: Buffer.from(`${JSON.stringify(pkg, null, 2)}\n`), from: CORE, foundation: false });
  const scripts = stringMap(pkg, "scripts");
  const pinned = new Map([...stringMap(pkg, "dependencies"), ...stringMap(pkg, "devDependencies")]);
  for (const script of plan.axes.verifyScripts) {
    if (!scripts.has(script)) throw missingScript(script, "which the generated project is verified with");
  }

  // 3. MCP servers and composed steering
  const servers = mergeMcpServers(contribs);
  checkProviders(servers, pinned);
  for (const [name, { entry }] of servers) {
    if ("url" in entry && !scripts.has(entry.script)) throw missingScript(entry.script, `which serves MCP server \`${name}\``);
  }
  const sections: SteeringSections = plan.layers.find((l) => l.group === "base")?.manifest.steeringSections ?? {};
  const composed = composeSteering(contribs, sections, mcpSection(servers, pinned));

  // 4. Patches: composed steering, then layers in render order (layer before its variants)
  for (const p of composed) applyPatch(tree, p.file, p.anchor, "before", p.content, p.from);
  for (const c of contribs) {
    (c.data.patches ?? []).forEach((patch, i) => {
      applyPatch(tree, patch.file, patch.anchor, patch.position ?? "before", patchContent(c, patch), c.from);
      hooks.onPatch?.(patchId(c.from, i));
    });
  }

  // 5. Agents and mcp.json
  for (const [path, json] of buildAgents(agents, contribs, servers, tree)) {
    if (tree.has(path)) throw new BonesmithError("FILE_COLLISION", `\`${path}\` is written by a layer and generated as an agent.`, "Remove the file from the layer.", { path });
    tree.set(path, { bytes: Buffer.from(json), from: CORE, foundation: false });
  }
  const mcpJson = buildMcpJson(servers);
  if (mcpJson !== undefined) {
    const path = ".kiro/settings/mcp.json";
    if (tree.has(path)) throw new BonesmithError("FILE_COLLISION", `\`${path}\` is written by a layer; it is generated from \`mcpServers\`.`, "Remove the file from the layer.", { path });
    tree.set(path, { bytes: Buffer.from(mcpJson), from: CORE, foundation: false });
  }

  // 6. Strip anchors, substitute placeholders (text files only)
  const anchor = anchorLine();
  for (const [path, entry] of tree) {
    if (isBinary(entry.bytes)) continue;
    let text = readText(entry);
    if (text.split("\n").some((l) => anchor.test(l))) text = stripAnchors(text);
    tree.set(path, writeText(entry, substitute(text, placeholders, path)));
  }

  // 7. Output checks
  checkLeftovers(tree);
  const postInstall = collectPostInstall(contribs, pinned);
  const steps = plan.layers.map((l) => l.manifest.nextSteps).filter((s): s is string => s !== undefined && s !== "");
  const nextSteps = steps.length > 0 ? substitute(steps.join("\n"), placeholders, "nextSteps") : undefined;

  const sorted: VirtualTree = new Map([...tree.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { tree: sorted, postInstall, verifyScripts: [...plan.axes.verifyScripts], nextSteps };
}

function isExecutable(path: string, bytes: Uint8Array): boolean {
  return path.startsWith("bin/") || (bytes[0] === 0x23 && bytes[1] === 0x21);
}

/** Writes a rendered tree into `dir` (which must exist). */
export function writeTree(tree: VirtualTree, dir: string): void {
  for (const [path, entry] of tree) {
    if (!isSafeRelativePath(path)) throw new Error(`internal: unsafe output path ${path}`);
    const file = join(dir, path);
    if (relative(dir, file).startsWith("..")) throw new Error(`internal: unsafe output path ${path}`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, entry.bytes);
    chmodSync(file, isExecutable(path, entry.bytes) ? 0o755 : 0o644);
  }
}

/** Renders a plan into a new temp dir. Never touches the target directory. */
export function render(plan: Plan, vars: RenderVars): RenderResult {
  const { tree, ...rest } = renderFiles(plan, vars);
  const tempDir = mkdtempSync(join(tmpdir(), "bonesmith-"));
  try {
    writeTree(tree, tempDir);
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true });
    throw err;
  }
  return { tempDir, ...rest };
}
