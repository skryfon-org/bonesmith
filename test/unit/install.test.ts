import { describe, expect, it } from "vitest";
import { commandLine, COMMIT_MESSAGE, install, shellQuote, succeeded, type InstallInput } from "../../src/install.ts";
import type { PackageManager } from "../../src/types.ts";
import { failing, FakeRunner } from "../support/fake-runner.ts";
import { MemoryFs } from "../support/memory-fs.ts";

const TEMP = "/tmp/bonesmith-x";
const TARGET = "/work/my-app";

function setup(overrides: Partial<InstallInput> = {}, postInstall: string[][] = [["playwright", "install", "chromium"]]) {
  const fs = new MemoryFs({ [`${TEMP}/package.json`]: "{}", [`${TEMP}/src/index.ts`]: "" });
  fs.mkdirp("/work");
  const input: InstallInput = {
    result: { tempDir: TEMP, postInstall, verifyScripts: ["build", "lint", "test"], nextSteps: "pnpm run dev" },
    targetDir: TARGET,
    displayDir: "my-app",
    pm: "pnpm",
    probe: [{ spec: "vite-plus@1.4.0", layer: "toolchain/vite-plus", fix: "Check your network and registry settings, or re-run with `--toolchain vite`." }],
    ...overrides,
  };
  return { fs, input };
}

describe("install: success", () => {
  it("runs every step in order and moves the project", async () => {
    const { fs, input } = setup();
    const runner = new FakeRunner();
    const report = await install(input, runner, fs);
    expect(runner.commands).toEqual([
      "git --version",
      "pnpm view vite-plus@1.4.0 version",
      "git init",
      "pnpm install",
      "pnpm exec playwright install chromium",
      "git add -A",
      `git commit -m ${COMMIT_MESSAGE}`,
      "pnpm run build",
      "pnpm run lint",
      "pnpm run test",
    ]);
    expect(runner.calls.slice(0, 2).every((c) => c.capture && c.cwd === TEMP)).toBe(true);
    expect(runner.calls.slice(2).every((c) => c.cwd === TARGET)).toBe(true);
    expect(report.steps.map((s) => [s.name, s.status])).toEqual([
      ["preflight", "ok"],
      ["move", "ok"],
      ["git-init", "ok"],
      ["install", "ok"],
      ["post-install", "ok"],
      ["commit", "ok"],
      ["verify:build", "ok"],
      ["verify:lint", "ok"],
      ["verify:test", "ok"],
    ]);
    expect(succeeded(report)).toBe(true);
    expect(report).toMatchObject({ created: true, nextSteps: "pnpm run dev" });
    expect(fs.kind(`${TARGET}/src/index.ts`)).toBe("file");
    expect(fs.kind(TEMP)).toBe("missing");
  });

  it("never touches git config", async () => {
    const { fs, input } = setup();
    const runner = new FakeRunner();
    await install(input, runner, fs);
    expect(runner.commands.some((c) => c.includes("config"))).toBe(false);
  });

  it.each([
    ["pnpm", "pnpm exec playwright install chromium", "pnpm view", "pnpm install", "pnpm run build"],
    ["npm", "npx --no -- playwright install chromium", "npm view", "npm install", "npm run build"],
    ["yarn", "yarn playwright install chromium", "npm view", "yarn install --no-immutable", "yarn run build"],
    ["bun", "bunx --no-install playwright install chromium", "npm view", "bun install", "bun run build"],
  ])("maps commands for %s", async (pm, exec, probe, installCmd, build) => {
    const { fs, input } = setup({ pm: pm as PackageManager });
    const runner = new FakeRunner();
    await install(input, runner, fs);
    expect(runner.commands).toContain(exec);
    expect(runner.commands).toContain(`${probe} vite-plus@1.4.0 version`);
    expect(runner.commands).toContain(installCmd);
    expect(runner.commands).toContain(build);
  });

  it("keeps an existing empty target directory", async () => {
    const { fs, input } = setup();
    fs.mkdirp(TARGET);
    await install(input, new FakeRunner(), fs);
    expect(fs.kind(`${TARGET}/package.json`)).toBe("file");
    expect(fs.ops).not.toContain(`remove ${TARGET}`);
  });

  it("falls back to copy + remove across devices", async () => {
    const { fs, input } = setup();
    fs.exdev = true;
    const report = await install(input, new FakeRunner(), fs);
    expect(report.steps[1]?.status).toBe("ok");
    expect(fs.ops).toEqual([`rename ${TEMP} ${TARGET}`, `copy ${TEMP} ${TARGET}`, `remove ${TEMP}`]);
    expect(fs.kind(`${TARGET}/src/index.ts`)).toBe("file");
  });
});

describe("install: preflight", () => {
  it("removes the temp dir and creates nothing when a probe fails", async () => {
    const { fs, input } = setup();
    const runner = new FakeRunner(failing("pnpm view"));
    const report = await install(input, runner, fs);
    expect(report.created).toBe(false);
    expect(report.steps).toEqual([
      {
        name: "preflight",
        label: "Preflight",
        status: "failed",
        fix: "`vite-plus@1.4.0` (needed by `toolchain/vite-plus`) can't be fetched from the registry. Check your network and registry settings, or re-run with `--toolchain vite`.",
      },
    ]);
    expect(fs.kind(TEMP)).toBe("missing");
    expect(fs.kind(TARGET)).toBe("missing");
    expect(runner.commands).toEqual(["git --version", "pnpm view vite-plus@1.4.0 version"]);
  });

  it("fails when git is missing", async () => {
    const { fs, input } = setup();
    const report = await install(input, new FakeRunner(failing("git --version", { code: 127 })), fs);
    expect(report.steps[0]?.fix).toBe("Install git and make sure `git` is on your PATH.");
    expect(fs.kind(TARGET)).toBe("missing");
  });

  it("treats empty probe output as unavailable", async () => {
    const { fs, input } = setup();
    const report = await install(input, new FakeRunner(failing("pnpm view", { code: 0, stdout: "" })), fs);
    expect(report.created).toBe(false);
  });
});

describe("install: failures after the move", () => {
  it("stops at a postInstall failure, keeps the project and reports the exact command", async () => {
    const { fs, input } = setup();
    const runner = new FakeRunner(failing("pnpm exec playwright"));
    const report = await install(input, runner, fs);
    expect(report.created).toBe(true);
    expect(fs.kind(`${TARGET}/package.json`)).toBe("file");
    const failed = report.steps.find((s) => s.status === "failed");
    expect(failed).toMatchObject({ name: "post-install", command: "cd my-app && pnpm exec playwright install chromium" });
    expect(report.steps.filter((s) => s.status === "skipped").map((s) => s.name)).toEqual(["commit", "verify:build", "verify:lint", "verify:test"]);
    expect(runner.commands).not.toContain("git add -A");
    expect(succeeded(report)).toBe(false);
  });

  it("explains a missing git identity", async () => {
    const { fs, input } = setup();
    const runner = new FakeRunner(failing("git commit", { code: 128, stderr: "*** Please tell me who you are.\n" }));
    const report = await install(input, runner, fs);
    const commit = report.steps.find((s) => s.name === "commit");
    expect(commit?.status).toBe("failed");
    expect(commit?.fix).toBe(
      "git has no identity. Run `git config user.email you@example.com` and `git config user.name \"Your Name\"`, then cd my-app && git commit -m 'chore: initial commit from create-bonesmith'",
    );
    expect(report.steps.filter((s) => s.name.startsWith("verify:")).every((s) => s.status === "skipped")).toBe(true);
  });

  it("re-runs add + commit when git add fails", async () => {
    const { fs, input } = setup();
    const report = await install(input, new FakeRunner(failing("git add")), fs);
    expect(report.steps.find((s) => s.name === "commit")?.command).toBe(
      "cd my-app && git add -A && git commit -m 'chore: initial commit from create-bonesmith'",
    );
  });

  it("runs every verify script even if one fails", async () => {
    const { fs, input } = setup();
    const runner = new FakeRunner(failing("pnpm run lint"));
    const report = await install(input, runner, fs);
    expect(runner.commands.slice(-3)).toEqual(["pnpm run build", "pnpm run lint", "pnpm run test"]);
    expect(report.steps.slice(-3).map((s) => s.status)).toEqual(["ok", "failed", "ok"]);
    expect(report.steps.find((s) => s.status === "failed")?.command).toBe("cd my-app && pnpm run lint");
    expect(report.created).toBe(true);
  });
});

describe("shell quoting", () => {
  it("quotes only when needed", () => {
    expect(shellQuote("pnpm")).toBe("pnpm");
    expect(shellQuote("@scope/pkg@1.0.0")).toBe("@scope/pkg@1.0.0");
    expect(shellQuote("a b")).toBe("'a b'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
    expect(commandLine(["git", "commit", "-m", "x y"])).toBe("git commit -m 'x y'");
  });
});
