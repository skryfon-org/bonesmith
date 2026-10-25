import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flagsBlock, readmePath, withFlagsBlock } from "../../scripts/readme-flags.ts";

describe("README.md", () => {
  it("has an up-to-date flags block (run `npm run readme` to fix)", () => {
    const readme = readFileSync(readmePath, "utf8");
    expect(withFlagsBlock(readme, flagsBlock())).toBe(readme);
  });

  it("documents every axis flag and the package-manager flag", () => {
    const block = flagsBlock();
    for (const flag of ["--type", "--toolchain", "--routing", "--state", "--ui", "--styling", "--pm", "--yes"]) expect(block).toContain(`\`${flag}`);
  });
});
