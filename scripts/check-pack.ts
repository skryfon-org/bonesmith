// Checks the npm tarball file list (`npm run check:pack`). Runs `npm pack`, so it lives outside
// the unit suite. Fails if anything outside the allowed set is packed, or a required file is missing.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("../", import.meta.url));
const ROOT_FILES = ["README.md", "LICENSE", "package.json"];
const REQUIRED = [...ROOT_FILES, "dist/index.js", "dist/cli.js", "templates/axes.json", "templates/PINS.md", "templates/layer.schema.json"];

interface PackResult {
  files: { path: string }[];
}

const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: repo, encoding: "utf8" });
const [result] = JSON.parse(out) as PackResult[];
if (result === undefined) throw new Error("npm pack returned no result");
const packed = new Set(result.files.map((f) => f.path));

const problems: string[] = [];
for (const path of packed) {
  if (!ROOT_FILES.includes(path) && !path.startsWith("dist/") && !path.startsWith("templates/")) problems.push(`unexpected file in tarball: ${path}`);
}
for (const path of REQUIRED) {
  if (!packed.has(path)) problems.push(`missing from tarball: ${path}`);
}

// Every template file on disk must ship (npm silently drops some names, e.g. `.npmrc`, `.gitignore`).
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}
for (const file of walk(join(repo, "templates"))) {
  const path = relative(repo, file).split("\\").join("/");
  if (!packed.has(path)) problems.push(`template file not packed (rename it, e.g. \`_gitignore\`): ${path}`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`npm pack: ${String(packed.size)} files OK`);
