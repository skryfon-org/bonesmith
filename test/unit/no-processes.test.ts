import { describe, expect, it } from "vitest";
import { execFileSync, spawn } from "node:child_process";

describe("test setup", () => {
  it("forbids spawning processes", () => {
    expect(() => spawn("node", ["--version"])).toThrow(/must not spawn processes/);
    expect(() => execFileSync("node", ["--version"])).toThrow(/must not spawn processes/);
  });
});
