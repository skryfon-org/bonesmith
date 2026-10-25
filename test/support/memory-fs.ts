import { posix } from "node:path";
import type { FsLike } from "../../src/install.ts";

/** In-memory FsLike: a set of directories and a map of files (POSIX paths). */
export class MemoryFs implements FsLike {
  readonly dirs = new Set<string>();
  readonly files = new Map<string, string>();
  /** When true, `rename` throws EXDEV (cross-device). */
  exdev = false;
  readonly ops: string[] = [];

  constructor(files: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(files)) this.writeFile(path, content);
  }

  writeFile(path: string, content: string): void {
    this.mkdirp(posix.dirname(path));
    this.files.set(path, content);
  }

  mkdirp(path: string): void {
    let p = path;
    while (p !== "/" && p !== "." && !this.dirs.has(p)) {
      this.dirs.add(p);
      p = posix.dirname(p);
    }
  }

  kind(path: string): "missing" | "file" | "dir" {
    if (this.files.has(path)) return "file";
    return this.dirs.has(path) ? "dir" : "missing";
  }

  readdir(path: string): string[] {
    const children = new Set<string>();
    for (const p of [...this.dirs, ...this.files.keys()]) {
      if (posix.dirname(p) === path) children.add(posix.basename(p));
    }
    return [...children].sort();
  }

  private moveTree(from: string, to: string, keep: boolean): void {
    const under = (p: string) => p === from || p.startsWith(`${from}/`);
    const map = (p: string) => to + p.slice(from.length);
    for (const d of [...this.dirs].filter(under)) {
      this.mkdirp(map(d));
      if (!keep) this.dirs.delete(d);
    }
    for (const [p, c] of [...this.files].filter(([p]) => under(p))) {
      this.writeFile(map(p), c);
      if (!keep) this.files.delete(p);
    }
  }

  rename(from: string, to: string): void {
    this.ops.push(`rename ${from} ${to}`);
    if (this.exdev) throw Object.assign(new Error("EXDEV: cross-device link not permitted"), { code: "EXDEV" });
    if (this.kind(to) !== "missing") throw Object.assign(new Error(`EEXIST: ${to}`), { code: "EEXIST" });
    this.moveTree(from, to, false);
  }

  copyDir(from: string, to: string): void {
    this.ops.push(`copy ${from} ${to}`);
    this.moveTree(from, to, true);
  }

  remove(path: string): void {
    this.ops.push(`remove ${path}`);
    for (const d of [...this.dirs]) if (d === path || d.startsWith(`${path}/`)) this.dirs.delete(d);
    for (const f of [...this.files.keys()]) if (f === path || f.startsWith(`${path}/`)) this.files.delete(f);
  }
}
