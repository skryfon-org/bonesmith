import { BonesmithError } from "./errors.ts";

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

// ---------------------------------------------------------------------------
// package.json deep merge
// ---------------------------------------------------------------------------

/** A JSON object plus which source set each path (for error messages). */
export interface Attributed {
  value: JsonObject;
  origin: Map<string, string>;
}

export function attributed(initial: JsonObject = {}, from = "bonesmith"): Attributed {
  const acc: Attributed = { value: {}, origin: new Map() };
  deepMergePackageJson(acc, initial, from);
  return acc;
}

function isObject(v: Json | undefined): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function clone(v: Json): Json {
  return JSON.parse(JSON.stringify(v)) as Json;
}

function show(v: Json): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

function originOf(acc: Attributed, path: readonly string[]): string {
  for (let i = path.length; i > 0; i--) {
    const found = acc.origin.get(path.slice(0, i).join("."));
    if (found !== undefined) return found;
  }
  return "bonesmith";
}

function mergeInto(acc: Attributed, target: JsonObject, add: JsonObject, path: string[], from: string): void {
  for (const [key, value] of Object.entries(add)) {
    const here = [...path, key];
    const current = target[key];
    if (current === undefined) {
      target[key] = clone(value);
      acc.origin.set(here.join("."), from);
    } else if (isObject(current) && isObject(value)) {
      mergeInto(acc, current, value, here, from);
    } else if (Array.isArray(current) && Array.isArray(value)) {
      const seen = new Set(current.map((v) => JSON.stringify(v)));
      for (const item of value) {
        const k = JSON.stringify(item);
        if (!seen.has(k)) {
          seen.add(k);
          current.push(clone(item));
        }
      }
    } else if (current !== value || isObject(current) || Array.isArray(current)) {
      const field = here.join(".");
      const first = originOf(acc, here);
      throw new BonesmithError(
        "PACKAGE_JSON_CONFLICT",
        `package.json \`${field}\` is \`${show(current)}\` from \`${first}\` and \`${show(value)}\` from \`${from}\`.`,
        "Set it in one layer only, or move it into `when` variants so only one applies.",
        { field, layers: [first, from] },
      );
    }
  }
}

/**
 * Additive deep merge: objects recurse, arrays union (JSON equality, first-seen order),
 * equal scalars pass, anything else is `PACKAGE_JSON_CONFLICT` naming both sources.
 */
export function deepMergePackageJson(acc: Attributed, add: JsonObject, from: string): void {
  mergeInto(acc, acc.value, add, [], from);
}

const KEY_ORDER = [
  "name",
  "version",
  "private",
  "type",
  "description",
  "files",
  "sideEffects",
  "exports",
  "main",
  "types",
  "scripts",
  "dependencies",
  "peerDependencies",
  "devDependencies",
];
const SORTED_MAPS = ["dependencies", "peerDependencies", "devDependencies", "optionalDependencies"];

function sortKeys(obj: JsonObject): JsonObject {
  const out: JsonObject = {};
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v !== undefined) out[key] = v;
  }
  return out;
}

/** Stable key order: KEY_ORDER first, then the rest alphabetically; dependency maps sorted. */
export function sortPackageJson(pkg: JsonObject): JsonObject {
  const known = KEY_ORDER.filter((k) => k in pkg);
  const rest = Object.keys(pkg)
    .filter((k) => !KEY_ORDER.includes(k))
    .sort();
  const out: JsonObject = {};
  for (const key of [...known, ...rest]) {
    const v = pkg[key];
    if (v === undefined) continue;
    out[key] = SORTED_MAPS.includes(key) && isObject(v) ? sortKeys(v) : v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

const COMMENT = String.raw`(?:\/\/|#|\/\*|\{\/\*|<!--)`;

/** Matches a whole anchor line for `anchor` (or any anchor when omitted); group 1 is the indent. */
export function anchorLine(anchor = "[a-z0-9-]+"): RegExp {
  return new RegExp(String.raw`^([ \t]*)${COMMENT}\s*bonesmith:${anchor}(?![a-z0-9-]).*$`);
}

export interface PatchContext {
  file: string;
  anchor: string;
  /** Layer (or `layer#variant`) applying the patch. */
  from: string;
}

/** Inserts `content` above (`before`) or directly below (`after`) the single anchor line, indented like it. */
export function insertAtAnchor(text: string, position: "before" | "after", content: string, ctx: PatchContext): string {
  const lines = text.split("\n");
  const re = anchorLine(ctx.anchor);
  const hits: number[] = [];
  lines.forEach((line, i) => {
    if (re.test(line)) hits.push(i);
  });
  const where = `anchor \`bonesmith:${ctx.anchor}\` in \`${ctx.file}\` (patched by \`${ctx.from}\`)`;
  if (hits.length === 0) {
    throw new BonesmithError("ANCHOR_MISSING", `No ${where}.`, `Add the anchor to the foundation file, or fix the patch's \`anchor\` / \`file\`.`, {
      ...ctx,
    });
  }
  if (hits.length > 1) {
    throw new BonesmithError(
      "ANCHOR_DUPLICATE",
      `${where} appears ${hits.length} times (lines ${hits.map((i) => i + 1).join(", ")}).`,
      "Keep exactly one anchor line with that name.",
      { ...ctx },
    );
  }
  const index = hits[0] ?? 0;
  const indent = re.exec(lines[index] ?? "")?.[1] ?? "";
  const body = content.replace(/\n+$/, "");
  if (body === "") return text;
  const insert = body.split("\n").map((l) => (l === "" ? "" : indent + l));
  lines.splice(position === "before" ? index : index + 1, 0, ...insert);
  return lines.join("\n");
}

/** Removes every anchor line. */
export function stripAnchors(text: string): string {
  const re = anchorLine();
  return text
    .split("\n")
    .filter((line) => !re.test(line))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

export const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** Replaces `{{key}}` from `vars`; any other `{{word}}` is `UNKNOWN_PLACEHOLDER`. */
export function substitute(text: string, vars: Readonly<Record<string, string>>, file: string): string {
  return text.replace(PLACEHOLDER, (whole, key: string) => {
    const value = Object.hasOwn(vars, key) ? vars[key] : undefined;
    if (value === undefined) {
      throw new BonesmithError(
        "UNKNOWN_PLACEHOLDER",
        `\`${whole}\` in \`${file}\` is not a known placeholder (known: ${Object.keys(vars).join(", ")}).`,
        "Use a known placeholder. JSX object literals must be written with spaces (`{{ a }}`).",
        { file, placeholder: key },
      );
    }
    return value;
  });
}
