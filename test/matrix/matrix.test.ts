// Matrix project only (`npm run test:matrix`): real scaffold + install + build + lint + test per
// combination. Needs `npm run build` first, network access, and the combo's package manager.
// Filter with MATRIX_COMBO=<id>[,<id>...]. Logs go to MATRIX_LOG_DIR (default: matrix-logs/).
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { PM } from "../../src/pm.ts";
import { comboFlags, combos, type Combo } from "./combinations.ts";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const cli = join(repo, "dist", "index.js");
const logDir = resolve(repo, process.env.MATRIX_LOG_DIR ?? "matrix-logs");
const TIMEOUT = 20 * 60 * 1000;

const filter = (process.env.MATRIX_COMBO ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
const unknown = filter.filter((id) => !combos.some((c) => c.id === id));
if (unknown.length > 0) throw new Error(`MATRIX_COMBO: unknown combination(s) ${unknown.join(", ")}`);
const selected = filter.length > 0 ? combos.filter((c) => filter.includes(c.id)) : combos;

/** Runs argv (no shell), appending output to the log file. Resolves with the exit code. */
function run(argv: readonly string[], cwd: string, log: string): Promise<number> {
  const fd = openSync(log, "a");
  writeSync(fd, `\n$ ${argv.join(" ")}   (in ${cwd})\n`);
  return new Promise((done) => {
    const [cmd = "", ...args] = argv;
    const child = spawn(cmd, args, { cwd, shell: false, stdio: ["ignore", fd, fd], env: { ...process.env, CI: "1" } });
    const finish = (code: number): void => {
      writeSync(fd, `\n[exit ${code}]\n`);
      closeSync(fd);
      done(code);
    };
    child.on("error", (err) => {
      writeSync(fd, `${err.message}\n`);
      finish(127);
    });
    child.on("close", (code) => {
      finish(code ?? 1);
    });
  });
}

function tail(log: string, lines = 60): string {
  return readFileSync(log, "utf8").split("\n").slice(-lines).join("\n");
}

let temp: string | undefined;
afterEach(() => {
  if (temp !== undefined) rmSync(temp, { recursive: true, force: true });
  temp = undefined;
});

describe.runIf(selected.length > 0)("matrix", () => {
  it.each(selected.map((c) => [c.id, c] as const))("%s", async (_, combo: Combo) => {
    if (!existsSync(cli)) throw new Error("dist/index.js is missing; run `npm run build` first.");
    mkdirSync(logDir, { recursive: true });
    const log = join(logDir, `${combo.id}.log`);
    rmSync(log, { force: true });
    temp = realpathSync(mkdtempSync(join(tmpdir(), "bonesmith-matrix-")));
    const project = join(temp, combo.id);

    // 1. Scaffold: the CLI installs, commits and verifies (build, lint, test) itself.
    const code = await run([process.execPath, cli, combo.id, "--yes", ...comboFlags(combo)], temp, log);
    expect(code, `create-bonesmith failed; log: ${log}\n${tail(log)}`).toBe(0);

    if (combo.selections.type !== "library") return;

    // 2. Library extras: build-storybook, and the published files.
    const sb = await run([...PM[combo.pm].run, "build-storybook"], project, log);
    expect(sb, `build-storybook failed; log: ${log}\n${tail(log)}`).toBe(0);

    const pkg = JSON.parse(readFileSync(join(project, "package.json"), "utf8")) as { exports?: Record<string, unknown> };
    expect(existsSync(join(project, "dist", "index.d.ts")), "dist/index.d.ts").toBe(true);
    const emitsCss = pkg.exports !== undefined && "./styles.css" in pkg.exports;
    const css = readdirSync(join(project, "dist")).filter((f) => f.endsWith(".css"));
    if (emitsCss) expect(css, "dist/*.css (package exports ./styles.css)").not.toEqual([]);
  }, TIMEOUT);
});
