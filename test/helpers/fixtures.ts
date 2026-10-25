import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll } from "vitest";
import { loadAxes, type AxisRegistry } from "../../src/axes.ts";
import { loadLayers, type LayerSet } from "../../src/layers.ts";
import type { Choices } from "../../src/types.ts";

export const fixturesDir = fileURLToPath(new URL("../fixtures/", import.meta.url));
export const basicRoot = join(fixturesDir, "templates-basic");
export const renderRoot = join(fixturesDir, "templates-render");

const created: string[] = [];
afterAll(() => {
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
});

/**
 * Copies `from` (default `templates-basic`) to a temp dir named `templates`, then writes (string) or
 * deletes (null) the given relative paths. Objects are written as JSON.
 */
export function variantTree(changes: Record<string, string | object | null>, from = basicRoot): string {
  const parent = mkdtempSync(join(tmpdir(), "bonesmith-test-"));
  created.push(parent);
  const root = join(parent, "templates");
  cpSync(from, root, { recursive: true });
  for (const [rel, content] of Object.entries(changes)) {
    const file = join(root, rel);
    if (content === null) {
      rmSync(file, { recursive: true, force: true });
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
  }
  return root;
}

export interface Loaded {
  root: string;
  axes: AxisRegistry;
  layers: LayerSet;
}

export function load(root = basicRoot): Loaded {
  const axes = loadAxes(root);
  return { root, axes, layers: loadLayers(root, axes) };
}

export function choices(selections: Choices["selections"], explicit: readonly string[] = []): Choices {
  return {
    name: "demo",
    targetDir: "/tmp/demo",
    packageManager: "pnpm",
    selections,
    explicit: new Set(explicit),
  };
}

/** Captures a thrown error for assertions. */
export function catchError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected the call to throw");
}
