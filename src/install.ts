import { cpSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { PM } from "./pm.ts";
import type { ProcessRunner } from "./process.ts";
import type { RenderResult } from "./render.ts";
import type { PackageManager } from "./types.ts";

// ---------------------------------------------------------------------------
// Filesystem seam
// ---------------------------------------------------------------------------

/** The filesystem operations install (and the CLI target check) need. Sync, injectable. */
export interface FsLike {
  kind(path: string): "missing" | "file" | "dir";
  readdir(path: string): string[];
  /** May throw an error with `code: "EXDEV"` across devices. */
  rename(from: string, to: string): void;
  copyDir(from: string, to: string): void;
  remove(path: string): void;
}

export const nodeFs: FsLike = {
  kind(path) {
    try {
      return statSync(path).isDirectory() ? "dir" : "file";
    } catch {
      return "missing";
    }
  },
  readdir: (path) => readdirSync(path).sort(),
  rename: (from, to) => {
    renameSync(from, to);
  },
  copyDir: (from, to) => {
    cpSync(from, to, { recursive: true, errorOnExist: true, force: false });
  },
  remove: (path) => {
    rmSync(path, { recursive: true, force: true });
  },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProbeItem {
  /** `<pkg>@<exact>`. */
  spec: string;
  layer: string;
  /** e.g. "Check registry access, or re-run with `--toolchain <other>`." */
  fix: string;
}

export interface InstallInput {
  result: RenderResult;
  targetDir: string;
  /** Target as shown to the user, relative to cwd (e.g. `my-app`). */
  displayDir: string;
  pm: PackageManager;
  probe: readonly ProbeItem[];
}

export type StepName = "preflight" | "move" | "git-init" | "install" | "post-install" | "commit" | `verify:${string}`;
export type StepStatus = "ok" | "failed" | "skipped";

export interface StepReport {
  name: StepName;
  label: string;
  status: StepStatus;
  /** Re-run command (`cd <dir> && …`) for steps after the move. */
  command?: string;
  fix?: string;
}

export interface InstallReport {
  created: boolean;
  steps: StepReport[];
  nextSteps: string | undefined;
}

export const COMMIT_MESSAGE = "chore: initial commit from create-bonesmith";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** POSIX-shell quoting for display (commands themselves never go through a shell). */
export function shellQuote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

export function commandLine(argv: readonly string[]): string {
  return argv.map(shellQuote).join(" ");
}

function isExdev(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "EXDEV";
}

function move(fs: FsLike, from: string, to: string): void {
  try {
    fs.rename(from, to);
  } catch (err) {
    if (!isExdev(err)) throw err;
    fs.copyDir(from, to);
    fs.remove(from);
  }
}

/** Moves the rendered temp dir to the target; an existing (empty) target dir is kept and filled. */
export function moveToTarget(fs: FsLike, tempDir: string, targetDir: string): void {
  if (fs.kind(targetDir) === "dir") {
    for (const entry of fs.readdir(tempDir)) move(fs, join(tempDir, entry), join(targetDir, entry));
    fs.remove(tempDir);
  } else {
    move(fs, tempDir, targetDir);
  }
}

const IDENTITY = /Please tell me who you are|user\.email|user\.name/;

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * preflight → move → git init → install → postInstall → commit → verify.
 * Steps after the move stop on failure (verify runs every script); the project is kept.
 */
export async function install(
  input: InstallInput,
  runner: ProcessRunner,
  fs: FsLike,
  onStep: (step: StepReport) => void = () => undefined,
): Promise<InstallReport> {
  const { result, targetDir, displayDir, pm } = input;
  const row = PM[pm];
  const steps: StepReport[] = [];
  const report = (step: StepReport): void => {
    steps.push(step);
    onStep(step);
  };
  const reRun = (argv: readonly string[]): string => `cd ${shellQuote(displayDir)} && ${commandLine(argv)}`;

  // 1. Preflight (captured; nothing created yet)
  const preflightFail = (fix: string): InstallReport => {
    fs.remove(result.tempDir);
    report({ name: "preflight", label: "Preflight", status: "failed", fix });
    return { created: false, steps, nextSteps: undefined };
  };
  const git = await runner.run(["git", "--version"], { cwd: result.tempDir, capture: true });
  if (git.code !== 0) return preflightFail("Install git and make sure `git` is on your PATH.");
  for (const item of input.probe) {
    const probe = await runner.run(row.probe(item.spec), { cwd: result.tempDir, capture: true });
    if (probe.code !== 0 || probe.stdout.trim() === "") {
      return preflightFail(`\`${item.spec}\` (needed by \`${item.layer}\`) can't be fetched from the registry. ${item.fix}`);
    }
  }
  report({ name: "preflight", label: "Preflight", status: "ok" });

  // 2. Move
  try {
    moveToTarget(fs, result.tempDir, targetDir);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    report({ name: "move", label: `Create ${displayDir}`, status: "failed", fix: `Couldn't move the project into ${displayDir}: ${why}` });
    return { created: false, steps, nextSteps: undefined };
  }
  report({ name: "move", label: `Created ${displayDir}`, status: "ok" });

  // 3–6. Sequential steps; stop at the first failure. A step may run several commands.
  type Planned = { name: StepName; label: string; commands: string[][]; capture: boolean; fix?: (output: string) => string | undefined };
  const commit = ["git", "commit", "-m", COMMIT_MESSAGE];
  const planned: Planned[] = [
    { name: "git-init", label: "git init", commands: [["git", "init"]], capture: true },
    { name: "install", label: commandLine(row.install), commands: [[...row.install]], capture: false },
    ...result.postInstall.map((argv): Planned => {
      const full = [...row.exec, ...argv];
      return { name: "post-install", label: commandLine(full), commands: [full], capture: false };
    }),
    {
      name: "commit",
      label: "Initial commit",
      commands: [["git", "add", "-A"], commit],
      capture: true,
      fix: (output) =>
        IDENTITY.test(output)
          ? `git has no identity. Run \`git config user.email you@example.com\` and \`git config user.name "Your Name"\`, then ${reRun(commit)}`
          : undefined,
    },
  ];

  let failed = false;
  for (const step of planned) {
    if (failed) {
      report({ name: step.name, label: step.label, status: "skipped" });
      continue;
    }
    for (const [index, argv] of step.commands.entries()) {
      const res = await runner.run(argv, { cwd: targetDir, capture: step.capture });
      if (res.code === 0) continue;
      failed = true;
      // Re-run from the failing command through the end of the step.
      const command = `cd ${shellQuote(displayDir)} && ${step.commands.slice(index).map(commandLine).join(" && ")}`;
      report({ name: step.name, label: step.label, status: "failed", command, fix: step.fix?.(res.stderr + res.stdout) ?? command });
      break;
    }
    if (!failed) report({ name: step.name, label: step.label, status: "ok" });
  }

  // 7. Verify: only after a successful install + commit; run every script.
  for (const script of result.verifyScripts) {
    const argv = [...row.run, script];
    const label = commandLine(argv);
    if (failed) {
      report({ name: `verify:${script}`, label, status: "skipped" });
      continue;
    }
    const res = await runner.run(argv, { cwd: targetDir, capture: false });
    const command = reRun(argv);
    report({ name: `verify:${script}`, label, status: res.code === 0 ? "ok" : "failed", ...(res.code === 0 ? {} : { command, fix: command }) });
  }

  return { created: true, steps, nextSteps: result.nextSteps };
}

export function succeeded(report: InstallReport): boolean {
  return report.steps.every((s) => s.status === "ok");
}
