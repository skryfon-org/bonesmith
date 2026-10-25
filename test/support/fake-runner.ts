import type { ProcessRunner, RunOptions, RunResult } from "../../src/process.ts";

export interface Call {
  argv: string[];
  cwd: string;
  capture: boolean;
}

/** Records every call; `respond` decides the result (default: success). */
export class FakeRunner implements ProcessRunner {
  readonly calls: Call[] = [];
  private readonly respond: (argv: readonly string[]) => Partial<RunResult>;
  constructor(respond: (argv: readonly string[]) => Partial<RunResult> = () => ({})) {
    this.respond = respond;
  }

  run(argv: readonly string[], opts: RunOptions): Promise<RunResult> {
    this.calls.push({ argv: [...argv], cwd: opts.cwd, capture: opts.capture });
    return Promise.resolve({ code: 0, stdout: argv.includes("view") ? "1.0.0\n" : "", stderr: "", ...this.respond(argv) });
  }

  /** argv joined by spaces, one string per call. */
  get commands(): string[] {
    return this.calls.map((c) => c.argv.join(" "));
  }
}

/** Fails any call whose joined argv starts with `prefix`. */
export function failing(prefix: string, result: Partial<RunResult> = { code: 1 }): (argv: readonly string[]) => Partial<RunResult> {
  return (argv) => (argv.join(" ").startsWith(prefix) ? result : {});
}
