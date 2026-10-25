import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { BonesmithError, type ErrorCode } from "../../src/errors.ts";
import { renderFiles, type RenderedProject, type RenderVars } from "../../src/render.ts";
import { resolve } from "../../src/resolve.ts";
import { catchError, choices, load, renderRoot, variantTree } from "./fixtures.ts";

export const VARS: RenderVars = { name: "demo", pm: "pnpm", pmRun: "pnpm", pmExec: "pnpm exec", extraFiles: {}, overridesTarget: "pnpm-workspace.yaml" };
export const APP = { type: "app", toolchain: "a", ui: "u" };
export const LIB = { type: "library", toolchain: "a", ui: "u" };

type Changes = Parameters<typeof variantTree>[0];

/** Renders the `templates-render` fixture (optionally modified) for `selections`. */
export function renderWith(changes: Changes = {}, selections: Record<string, string> = APP, vars: Partial<RenderVars> = {}): RenderedProject {
  const root = Object.keys(changes).length > 0 ? variantTree(changes, renderRoot) : renderRoot;
  const { layers, axes } = load(root);
  const plan = resolve(choices(selections), layers, axes, { nodeVersion: "24.11.0" });
  return renderFiles(plan, { ...VARS, ...vars });
}

export function renderFails(code: ErrorCode, changes: Changes, selections: Record<string, string> = APP, vars: Partial<RenderVars> = {}): BonesmithError {
  const err = catchError(() => renderWith(changes, selections, vars));
  expect(err).toBeInstanceOf(BonesmithError);
  const e = err as BonesmithError;
  expect(e.code).toBe(code);
  return e;
}

export function text(project: RenderedProject, path: string): string {
  const entry = project.tree.get(path);
  if (entry === undefined) throw new Error(`no ${path} in tree`);
  return Buffer.from(entry.bytes).toString("utf8");
}

export function json(project: RenderedProject, path: string): Record<string, unknown> {
  return JSON.parse(text(project, path)) as Record<string, unknown>;
}

/** Reads a fixture layer.json so tests can extend it. */
export function manifest(project: string): Record<string, unknown> {
  return JSON.parse(readFixture(`${project}/layer.json`)) as Record<string, unknown>;
}

export function readFixture(rel: string): string {
  return readFileSync(`${renderRoot}/${rel}`, "utf8");
}
