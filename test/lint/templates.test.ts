import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { templatesRoot } from "../../src/paths.ts";
import { formatProblems, lintTemplates } from "../../src/template-lint.ts";
import { fixturesDir } from "../helpers/fixtures.ts";

describe("template lint", () => {
  it("finds no problems in templates/", () => {
    const problems = lintTemplates(templatesRoot());
    expect(formatProblems(problems)).toBe("");
  });

  it("fails on the bad-anchor fixture (self-test)", () => {
    const problems = lintTemplates(join(fixturesDir, "templates-bad-anchor"), { nodeVersion: "24.11.0" });
    expect(problems.map((p) => p.code)).toContain("ANCHOR_MISSING");
    const missing = problems.find((p) => p.code === "ANCHOR_MISSING");
    expect(missing?.combo).toBe("--type app --ui x --pm pnpm");
    expect(missing?.message).toContain("providers-open");
  });
});
