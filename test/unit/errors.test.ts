import { describe, expect, it } from "vitest";
import { BonesmithError, isBonesmithError } from "../../src/errors.ts";

describe("BonesmithError", () => {
  it("carries code, message and fix", () => {
    const err = new BonesmithError("CONFLICT", "`--ui mui` conflicts with `--styling tailwind`.", "Use `--styling css-modules` instead.", {
      layers: ["ui/mui", "styling/tailwind"],
    });
    expect(err).toBeInstanceOf(Error);
    expect(isBonesmithError(err)).toBe(true);
    expect(err.name).toBe("BonesmithError");
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("`--ui mui` conflicts with `--styling tailwind`.");
    expect(err.fix).toBe("Use `--styling css-modules` instead.");
    expect(err.details).toEqual({ layers: ["ui/mui", "styling/tailwind"] });
  });

  it("is distinguishable from plain errors", () => {
    expect(isBonesmithError(new Error("x"))).toBe(false);
    expect(isBonesmithError("x")).toBe(false);
  });
});
