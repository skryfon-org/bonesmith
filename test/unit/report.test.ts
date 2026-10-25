import { describe, expect, it } from "vitest";
import { BonesmithError } from "../../src/errors.ts";
import type { InstallReport, StepName, StepReport } from "../../src/install.ts";
import { formatError, formatReport, formatStep } from "../../src/report.ts";

const ok = (name: StepName, label: string): StepReport => ({ name, label, status: "ok" });

describe("report", () => {
  it("formats a successful run with next steps", () => {
    const report: InstallReport = {
      created: true,
      nextSteps: "pnpm run dev",
      steps: [
        ok("preflight", "Preflight"),
        ok("move", "Created my-app"),
        ok("git-init", "git init"),
        ok("install", "pnpm install"),
        ok("post-install", "pnpm exec playwright install chromium"),
        ok("commit", "Initial commit"),
        ok("verify:build", "pnpm run build"),
        ok("verify:lint", "pnpm run lint"),
        ok("verify:test", "pnpm run test"),
      ],
    };
    expect(formatReport(report, "my-app")).toMatchInlineSnapshot(`
      "✔ Preflight
      ✔ Created my-app
      ✔ git init
      ✔ pnpm install
      ✔ pnpm exec playwright install chromium
      ✔ Initial commit
      ✔ pnpm run build
      ✔ pnpm run lint
      ✔ pnpm run test

      Next: cd my-app && pnpm run dev"
    `);
  });

  it("lists multi-line next steps and works without any", () => {
    const base: InstallReport = { created: true, steps: [ok("move", "Created x")], nextSteps: undefined };
    expect(formatReport(base, "x").split("\n").at(-1)).toBe("Next: cd x");
    expect(formatReport({ ...base, nextSteps: "pnpm run dev\npnpm run storybook" }, "x")).toContain("Next:\n  cd x\n  pnpm run dev\n  pnpm run storybook");
  });

  it("formats failures with fix lines and skipped steps", () => {
    const report: InstallReport = {
      created: true,
      nextSteps: "pnpm run dev",
      steps: [
        ok("move", "Created my-app"),
        { name: "post-install", label: "pnpm exec playwright install chromium", status: "failed", command: "cd my-app && pnpm exec playwright install chromium", fix: "cd my-app && pnpm exec playwright install chromium" },
        { name: "commit", label: "Initial commit", status: "skipped" },
      ],
    };
    expect(formatReport(report, "my-app")).toMatchInlineSnapshot(`
      "✔ Created my-app
      ✖ pnpm exec playwright install chromium
      - Initial commit (not run)

      Fix: cd my-app && pnpm exec playwright install chromium
      The project was kept in my-app."
    `);
    expect(formatStep({ name: "preflight", label: "Preflight", status: "failed" })).toBe("✖ Preflight");
  });

  it("formats errors", () => {
    expect(formatError(new BonesmithError("CONFLICT", "`--ui m` conflicts with `--styling tw`.", "Use `--styling mod` instead."))).toBe(
      "✖ `--ui m` conflicts with `--styling tw`.\n  Fix: Use `--styling mod` instead.",
    );
    const unexpected = formatError(new TypeError("boom"));
    expect(unexpected).toMatch(/^✖ Unexpected error\nTypeError: boom\n {4}at /);
    expect(unexpected).toContain("This is a bug in create-bonesmith. Please report it");
  });
});
