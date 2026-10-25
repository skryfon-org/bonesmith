// Unit, snapshot and lint tests must never run external processes.
// Every process-spawning export of node:child_process throws.
import { vi } from "vitest";

const forbidden = (name: string) => (): never => {
  throw new Error(`Tests must not spawn processes (child_process.${name} was called). Inject a process runner instead.`);
};

const names = ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"] as const;

function mocked(): Record<string, () => never> {
  const mod: Record<string, () => never> = {};
  for (const name of names) mod[name] = forbidden(name);
  return mod;
}

vi.mock("node:child_process", () => ({ ...mocked(), default: mocked() }));
vi.mock("child_process", () => ({ ...mocked(), default: mocked() }));
