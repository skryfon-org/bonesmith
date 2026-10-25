import { describe, expect, it } from "vitest";
import { isBinary, isSafeRelativePath, mapName, readLayerFiles } from "../../src/tree.ts";
import { renderRoot } from "../helpers/fixtures.ts";

describe("tree helpers", () => {
  it("maps _gitignore and _npmrc at any depth", () => {
    expect(mapName("_gitignore")).toBe(".gitignore");
    expect(mapName("pkg/_npmrc")).toBe("pkg/.npmrc");
    expect(mapName("src/_other")).toBe("src/_other");
  });

  it("detects binary files by a NUL in the first 8 KB", () => {
    expect(isBinary(Buffer.from("text"))).toBe(false);
    expect(isBinary(Buffer.from("a\0b"))).toBe(true);
    const late = Buffer.alloc(9000, 0x61);
    late[8500] = 0;
    expect(isBinary(late)).toBe(false);
  });

  it("reads layer files sorted by source name, with mapped names", () => {
    const files = readLayerFiles(`${renderRoot}/base/files`);
    expect([...files.keys()]).toEqual(["README.md", ".gitignore", "assets/logo.bin", "src/App.tsx", "src/main.tsx"]);
    expect(readLayerFiles(`${renderRoot}/base/missing`).size).toBe(0);
  });

  it("rejects unsafe paths", () => {
    expect(isSafeRelativePath("a/b.txt")).toBe(true);
    for (const p of ["", "/abs", "../x", "a/../b", "a//b", "C:/x", "a\\b"]) expect(isSafeRelativePath(p)).toBe(false);
  });
});
