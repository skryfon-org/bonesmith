import { spawn } from "node:child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd: string;
  /** Capture output instead of streaming it to the terminal. */
  capture: boolean;
}

/** Runs argv arrays without a shell. The only way the scaffolder starts processes. */
export interface ProcessRunner {
  run(argv: readonly string[], opts: RunOptions): Promise<RunResult>;
}

const WINDOWS_SHIMS = ["npm", "npx", "pnpm", "yarn"];

/** On Windows, package-manager binaries are `.cmd` shims that `shell: false` can't start directly. */
export function resolveCommand(argv: readonly string[], platform: NodeJS.Platform = process.platform): [string, string[]] {
  const [cmd = "", ...args] = argv;
  return [platform === "win32" && WINDOWS_SHIMS.includes(cmd) ? `${cmd}.cmd` : cmd, args];
}

export const spawnRunner: ProcessRunner = {
  run(argv, { cwd, capture }) {
    return new Promise((resolve) => {
      const [cmd, args] = resolveCommand(argv);
      let stdout = "";
      let stderr = "";
      let settled = false;
      const done = (result: RunResult): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      const child = spawn(cmd, args, { cwd, shell: false, stdio: capture ? "pipe" : "inherit" });
      child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("error", (err: NodeJS.ErrnoException) => {
        done({ code: err.code === "ENOENT" ? 127 : 1, stdout, stderr: `${stderr}${err.message}` });
      });
      child.on("close", (code) => {
        done({ code: code ?? 1, stdout, stderr });
      });
    });
  },
};
