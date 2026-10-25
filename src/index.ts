#!/usr/bin/env node
import { main } from "./cli.ts";
import { nodeFs } from "./install.ts";
import { templatesRoot } from "./paths.ts";
import { spawnRunner } from "./process.ts";
import { clackPrompts } from "./prompts.ts";

const code = await main(process.argv, {
  prompts: clackPrompts,
  runner: spawnRunner,
  fs: nodeFs,
  env: process.env,
  cwd: process.cwd(),
  isTTY: process.stdin.isTTY && process.stdout.isTTY,
  nodeVersion: process.versions.node,
  templatesRoot: templatesRoot(),
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
});
process.exitCode = code;
