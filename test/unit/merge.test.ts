import { describe, expect, it } from "vitest";
import { BonesmithError } from "../../src/errors.ts";
import { attributed, deepMergePackageJson, sortPackageJson } from "../../src/merge.ts";
import { catchError } from "../helpers/fixtures.ts";

describe("deepMergePackageJson", () => {
  it("merges objects recursively, including peerDependencies", () => {
    const acc = attributed({ name: "demo", version: "0.0.0" });
    deepMergePackageJson(acc, { peerDependencies: { react: "19.0.0" }, devDependencies: { react: "19.0.0" } }, "base#lib");
    deepMergePackageJson(acc, { peerDependencies: { "@mui/material": "7.0.0" } }, "ui/m#lib");
    expect(acc.value).toEqual({
      name: "demo",
      version: "0.0.0",
      peerDependencies: { react: "19.0.0", "@mui/material": "7.0.0" },
      devDependencies: { react: "19.0.0" },
    });
  });

  it("unions arrays in first-seen order and passes equal scalars", () => {
    const acc = attributed();
    deepMergePackageJson(acc, { files: ["dist"], sideEffects: ["*.css"], private: true }, "a");
    deepMergePackageJson(acc, { files: ["src", "dist"], sideEffects: ["*.css", "*.scss"], private: true }, "b");
    expect(acc.value).toEqual({ files: ["dist", "src"], sideEffects: ["*.css", "*.scss"], private: true });
  });

  it("rejects different scalars, naming both sources", () => {
    const acc = attributed();
    deepMergePackageJson(acc, { scripts: { build: "a build" } }, "toolchain/a");
    const err = catchError(() => {
      deepMergePackageJson(acc, { scripts: { build: "b build" } }, "toolchain/a#lib");
    }) as BonesmithError;
    expect(err.code).toBe("PACKAGE_JSON_CONFLICT");
    expect(err.message).toBe("package.json `scripts.build` is `a build` from `toolchain/a` and `b build` from `toolchain/a#lib`.");
  });

  it("rejects two pins of one package and type mismatches", () => {
    const acc = attributed({ name: "demo" });
    deepMergePackageJson(acc, { dependencies: { react: "19.0.0" } }, "base");
    expect((catchError(() => { deepMergePackageJson(acc, { dependencies: { react: "19.1.0" } }, "ui/m"); }) as BonesmithError).code).toBe(
      "PACKAGE_JSON_CONFLICT",
    );
    expect((catchError(() => { deepMergePackageJson(acc, { dependencies: "x" }, "ui/m"); }) as BonesmithError).message).toContain(
      "`dependencies` is `{\"react\":\"19.0.0\"}` from `base`",
    );
    expect((catchError(() => { deepMergePackageJson(acc, { name: "other" }, "ui/m"); }) as BonesmithError).message).toContain("from `bonesmith`");
  });

  it("does not alias input objects", () => {
    const input = { exports: { ".": "./a.js" } };
    const acc = attributed();
    deepMergePackageJson(acc, input, "a");
    deepMergePackageJson(acc, { exports: { "./b": "./b.js" } }, "b");
    expect(input).toEqual({ exports: { ".": "./a.js" } });
  });
});

describe("sortPackageJson", () => {
  it("uses a stable key order and sorts dependency maps", () => {
    const sorted = sortPackageJson({
      zeta: 1,
      devDependencies: { z: "1.0.0", a: "1.0.0" },
      scripts: { test: "t", build: "b" },
      alpha: 2,
      exports: {},
      version: "0.0.0",
      name: "demo",
      dependencies: { b: "1.0.0", a: "1.0.0" },
    });
    expect(Object.keys(sorted)).toEqual(["name", "version", "exports", "scripts", "dependencies", "devDependencies", "alpha", "zeta"]);
    expect(Object.keys(sorted.dependencies as object)).toEqual(["a", "b"]);
    expect(Object.keys(sorted.devDependencies as object)).toEqual(["a", "z"]);
    expect(Object.keys(sorted.scripts as object)).toEqual(["test", "build"]);
  });
});
