import { isBonesmithError } from "./errors.ts";
import type { InstallReport, StepReport } from "./install.ts";

const OK = "✔";
const FAIL = "✖";
const SKIP = "-";

export function formatStep(step: StepReport): string {
  const mark = step.status === "ok" ? OK : step.status === "failed" ? FAIL : SKIP;
  return `${mark} ${step.label}${step.status === "skipped" ? " (not run)" : ""}`;
}

/** Fix lines for failures, or next steps when everything passed. */
export function formatSummary(report: InstallReport, displayDir: string): string {
  const failed = report.steps.filter((s) => s.status === "failed");
  if (failed.length > 0) {
    const lines = failed.map((s) => `Fix: ${s.fix ?? s.command ?? s.label}`);
    if (report.created) lines.push(`The project was kept in ${displayDir}.`);
    return lines.join("\n");
  }
  const next = (report.nextSteps ?? "").split("\n").filter((l) => l.trim() !== "");
  if (next.length <= 1) return `Next: cd ${displayDir}${next[0] !== undefined ? ` && ${next[0]}` : ""}`;
  return ["Next:", `  cd ${displayDir}`, ...next.map((l) => `  ${l}`)].join("\n");
}

export function formatReport(report: InstallReport, displayDir: string): string {
  return [...report.steps.map(formatStep), "", formatSummary(report, displayDir)].join("\n");
}

/** `✖ message` + `Fix:` for BonesmithError; stack + bug hint otherwise. */
export function formatError(err: unknown): string {
  if (isBonesmithError(err)) return `${FAIL} ${err.message}\n  Fix: ${err.fix}`;
  const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
  return `${FAIL} Unexpected error\n${stack}\n\nThis is a bug in create-bonesmith. Please report it with the output above and the command you ran.`;
}

export const EXIT_OK = 0;
export const EXIT_FAIL = 1;
export const EXIT_CANCELLED = 130;
