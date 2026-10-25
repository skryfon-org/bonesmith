import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { COMMIT_MESSAGE } from "../../src/install.ts";
import { renderRoot } from "../helpers/fixtures.ts";
import { runCli } from "../support/cli.ts";

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

describe("cli end-to-end (fake runner)", () => {
  it("renders into the target and runs the expected command sequence", async () => {
    const r = await runCli(["demo", "--type", "library", "--toolchain", "a", "--ui", "u", "--pm", "yarn"], { templatesRoot: renderRoot });
    expect(r.stderr).toBe("");
    expect(r.code).toBe(0);

    const target = join(r.cwd, "demo");
    expect(listFiles(target)).toEqual([
      ".gitignore",
      ".kiro/agents/reviewer.json",
      ".kiro/agents/ui-expert.json",
      ".kiro/settings/mcp.json",
      ".kiro/steering/structure.md",
      ".kiro/steering/tech.md",
      ".kiro/steering/ui.md",
      ".yarnrc.yml",
      "README.md",
      "a.config.ts",
      "assets/logo.bin",
      "bin/run",
      "package.json",
      "src/App.tsx",
      "src/main.tsx",
    ]);
    expect(readFileSync(join(target, ".kiro/steering/tech.md"), "utf8")).toContain("requires `yarn run storybook` running");
    expect(statSync(join(target, "bin/run")).mode & 0o777).toBe(0o755);

    const tempDir = r.runner.calls[0]?.cwd ?? "";
    expect(tempDir).toMatch(/bonesmith-/);
    expect(r.runner.calls.map((c) => [c.argv.join(" "), c.cwd === tempDir ? "temp" : c.cwd === target ? "target" : c.cwd])).toEqual([
      ["git --version", "temp"],
      ["git init", "target"],
      ["yarn install --no-immutable", "target"],
      ["yarn playwright install chromium", "target"],
      ["git add -A", "target"],
      [`git commit -m ${COMMIT_MESSAGE}`, "target"],
      ["yarn run build", "target"],
      ["yarn run lint", "target"],
      ["yarn run test", "target"],
    ]);
    expect(() => statSync(tempDir)).toThrow();
  });
});
