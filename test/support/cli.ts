import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll } from "vitest";
import { main, type CliDeps } from "../../src/cli.ts";
import { nodeFs } from "../../src/install.ts";
import { Cancelled, type Prompts, type SelectOption } from "../../src/prompts.ts";
import { basicRoot } from "../helpers/fixtures.ts";
import { FakeRunner } from "./fake-runner.ts";

export interface SelectCall {
  message: string;
  options: SelectOption<string>[];
  initialValue: string | undefined;
}

type Answer = string | string[] | typeof CANCEL;
export const CANCEL = Symbol("cancel");

/** Prompts answered from a script keyed by message. Text answers may be a list of attempts. */
export class ScriptedPrompts implements Prompts {
  readonly selects: SelectCall[] = [];
  readonly texts: { message: string; rejected: string[] }[] = [];
  intros = 0;
  private readonly answers: Record<string, Answer>;
  constructor(answers: Record<string, Answer> = {}) {
    this.answers = answers;
  }

  intro(): void {
    this.intros++;
  }

  private answer(message: string): Exclude<Answer, typeof CANCEL> {
    const a = this.answers[message];
    if (a === CANCEL) throw new Cancelled();
    if (a === undefined) throw new Error(`unexpected prompt: ${message}`);
    return a;
  }

  text(opts: { message: string; validate?: (value: string) => string | undefined }): Promise<string> {
    const attempts = this.answer(opts.message);
    const record = { message: opts.message, rejected: [] as string[] };
    this.texts.push(record);
    for (const value of Array.isArray(attempts) ? attempts : [attempts]) {
      const problem = opts.validate?.(value);
      if (problem === undefined) return Promise.resolve(value);
      record.rejected.push(`${value}: ${problem}`);
    }
    throw new Error(`no valid answer for ${opts.message}`);
  }

  select<T extends string>(opts: { message: string; options: SelectOption<T>[]; initialValue?: T }): Promise<T> {
    this.selects.push({ message: opts.message, options: opts.options, initialValue: opts.initialValue });
    const a = this.answer(opts.message);
    const value = Array.isArray(a) ? (a[0] ?? "") : a;
    if (!opts.options.some((o) => o.value === value)) throw new Error(`${value} not offered for ${opts.message}`);
    return Promise.resolve(value as T);
  }

  get asked(): string[] {
    return this.selects.map((s) => s.message);
  }
}

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

export function workDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bonesmith-cli-"));
  dirs.push(dir);
  return dir;
}

export interface RunCli {
  code: number;
  stdout: string;
  stderr: string;
  cwd: string;
  runner: FakeRunner;
  prompts: ScriptedPrompts;
  read: (rel: string) => string;
}

export interface CliOptions {
  prompts?: ScriptedPrompts;
  runner?: FakeRunner;
  isTTY?: boolean;
  env?: Record<string, string>;
  nodeVersion?: string;
  cwd?: string;
  templatesRoot?: string;
}

/** Runs `main` with fixture templates, fakes and a fresh temp cwd. */
export async function runCli(args: string[], o: CliOptions = {}): Promise<RunCli> {
  const cwd = o.cwd ?? workDir();
  mkdirSync(cwd, { recursive: true });
  const prompts = o.prompts ?? new ScriptedPrompts();
  const runner = o.runner ?? new FakeRunner();
  let stdout = "";
  let stderr = "";
  const deps: CliDeps = {
    prompts,
    runner,
    fs: nodeFs,
    env: o.env ?? {},
    cwd,
    isTTY: o.isTTY ?? false,
    nodeVersion: o.nodeVersion ?? "24.11.0",
    templatesRoot: o.templatesRoot ?? basicRoot,
    stdout: (t) => (stdout += t),
    stderr: (t) => (stderr += t),
  };
  const code = await main(["node", "create-bonesmith", ...args], deps);
  return { code, stdout, stderr, cwd, runner, prompts, read: (rel) => readFileSync(join(cwd, rel), "utf8") };
}
