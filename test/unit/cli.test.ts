import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dirName, nameProblems } from "../../src/cli.ts";
import { variantTree } from "../helpers/fixtures.ts";
import { CANCEL, runCli, ScriptedPrompts, workDir } from "../support/cli.ts";
import { failing, FakeRunner } from "../support/fake-runner.ts";

const appAnswers = { "Project type": "app", Toolchain: "a", Routing: "r1", State: "none", "UI library": "none", Styling: "tw", "Package manager": "pnpm" };
const pkg = (r: { read: (rel: string) => string }, name = "my-app") => JSON.parse(r.read(`${name}/package.json`)) as Record<string, Record<string, string>>;

describe("cli: help and flags", () => {
  it("--help lists every axis flag from axes.json", async () => {
    const r = await runCli(["--help"]);
    expect(r.code).toBe(0);
    for (const flag of ["--type", "--toolchain", "--routing", "--state", "--ui", "--styling", "--package-manager, --pm", "--yes"]) {
      expect(r.stdout).toContain(flag);
    }
    expect(r.stdout).toMatch(/choices: "m", "mt",\s+"none", "sh"/);
  });

  it("--version prints the package version", async () => {
    const version = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;
    const r = await runCli(["--version"]);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(version);
  });

  it("rejects an unknown axis value, listing valid ones", async () => {
    const r = await runCli(["my-app", "--ui", "zzz"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("argument 'zzz' is invalid. Allowed choices are m, mt, none, sh.");
  });

  it("accepts --pm as an alias of --package-manager", async () => {
    const r = await runCli(["my-app", "--yes", "--pm", "bun"]);
    expect(r.code).toBe(0);
    expect(r.runner.commands).toContain("bun install");
  });
});

describe("cli: name and target", () => {
  it("prompts for the name first and re-asks on invalid input", async () => {
    const prompts = new ScriptedPrompts({ "Project name": ["Bad Name", "good-name"], ...appAnswers });
    const r = await runCli([], { isTTY: true, prompts });
    expect(r.code).toBe(0);
    expect(prompts.texts).toEqual([{ message: "Project name", rejected: [expect.stringContaining("Bad Name: name can only contain URL-friendly characters")] }]);
    expect(existsSync(join(r.cwd, "good-name/package.json"))).toBe(true);
    expect(prompts.intros).toBe(1);
  });

  it.each([[["--yes"]], [[]]])("exits without a name when not interactive (%j)", async (args) => {
    const r = await runCli(args, { isTTY: args.length === 0 ? false : true });
    expect(r.code).toBe(1);
    expect(r.stderr).toBe("✖ No project name.\n  Fix: Pass one: `npm create bonesmith my-app`.\n");
  });

  it("exits on an invalid name argument with the reasons", async () => {
    const r = await runCli(["Bad Name", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("`Bad Name` is not a valid npm package name: name can only contain URL-friendly characters");
  });

  it("uses the part after / for scoped names", async () => {
    expect(dirName("@acme/widgets")).toBe("widgets");
    expect(nameProblems("@acme/widgets")).toEqual([]);
    const r = await runCli(["@acme/widgets", "--yes"]);
    expect(r.code).toBe(0);
    expect(pkg(r, "widgets").name).toBe("@acme/widgets");
  });

  it("refuses a non-empty target before resolving and leaves it untouched", async () => {
    const cwd = workDir();
    mkdirSync(join(cwd, "my-app"));
    writeFileSync(join(cwd, "my-app/keep.txt"), "mine");
    const r = await runCli(["my-app", "--yes", "--type", "library", "--state", "s"], { cwd });
    expect(r.code).toBe(1);
    expect(r.stderr).toBe("✖ `my-app` already exists and is not empty.\n  Fix: Choose another project name, or empty that directory first.\n");
    expect(readdirSync(join(cwd, "my-app"))).toEqual(["keep.txt"]);
    expect(r.runner.calls).toEqual([]);
  });

  it("uses an existing empty target", async () => {
    const cwd = workDir();
    mkdirSync(join(cwd, "my-app"));
    const r = await runCli(["my-app", "--yes"], { cwd });
    expect(r.code).toBe(0);
    expect(existsSync(join(cwd, "my-app/package.json"))).toBe(true);
  });
});

describe("cli: choices", () => {
  it("--yes uses axes.json defaults without prompting", async () => {
    const prompts = new ScriptedPrompts();
    const r = await runCli(["my-app", "--yes"], { isTTY: true, prompts });
    expect(r.code).toBe(0);
    expect(prompts.selects).toEqual([]);
    const p = pkg(r);
    expect(p.dependencies).toEqual({ "r1-lib": "1.0.0" }); // routing r1 default (base variant)
    expect(p.devDependencies).toEqual({ "a-tool": "1.0.0" }); // toolchain a default
  });

  it("prompts in promptOrder, then package manager, with labels and hints from layer.json", async () => {
    const prompts = new ScriptedPrompts(appAnswers);
    const r = await runCli(["my-app"], { isTTY: true, prompts });
    expect(r.code).toBe(0);
    expect(prompts.asked).toEqual(["Project type", "Toolchain", "Routing", "State", "UI library", "Styling", "Package manager"]);
    const ui = prompts.selects.find((s) => s.message === "UI library");
    expect(ui?.options).toContainEqual({ value: "sh", label: "SH", hint: "Needs TW" });
    expect(ui?.initialValue).toBe("none");
  });

  it("skips prompts for flagged axes", async () => {
    const prompts = new ScriptedPrompts(appAnswers);
    await runCli(["my-app", "--toolchain", "b", "--ui", "none"], { isTTY: true, prompts });
    expect(prompts.asked).toEqual(["Project type", "Routing", "State", "Styling", "Package manager"]);
  });

  it("library skips routing and state prompts and doesn't apply their defaults", async () => {
    const prompts = new ScriptedPrompts({ ...appAnswers, "Project type": "library" });
    const r = await runCli(["my-app"], { isTTY: true, prompts });
    expect(r.code).toBe(0);
    expect(prompts.asked).toEqual(["Project type", "Toolchain", "UI library", "Styling", "Package manager"]);
    expect(pkg(r).dependencies).toBeUndefined(); // no r1-lib: routing default not applied
    expect(existsSync(join(r.cwd, "my-app/.kiro/agents/storybook-expert.json"))).toBe(true);
  });

  it("rejects --state with --type library", async () => {
    const r = await runCli(["my-app", "--type", "library", "--state", "s", "--yes"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe("✖ `--state` isn't used with `--type library`; remove it.\n  Fix: Remove `--state s` from the command.\n");
  });

  it("offers only compatible options (sh → only tw)", async () => {
    const prompts = new ScriptedPrompts({ ...appAnswers, "UI library": "sh" });
    await runCli(["my-app"], { isTTY: true, prompts });
    expect(prompts.selects.find((s) => s.message === "Styling")?.options.map((o) => o.value)).toEqual(["tw"]);
  });

  it("lets later flags constrain earlier prompts (--styling tw → no m / mt)", async () => {
    const prompts = new ScriptedPrompts(appAnswers);
    await runCli(["my-app", "--styling", "tw"], { isTTY: true, prompts });
    expect(prompts.selects.find((s) => s.message === "UI library")?.options.map((o) => o.value)).toEqual(["none", "sh"]);
  });

  it("lists missing flags without a TTY", async () => {
    const r = await runCli(["my-app", "--type", "library", "--toolchain", "a"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(
      "✖ No terminal to prompt in, and these choices are missing: `--ui <m|mt|none|sh>`, `--styling <js|mod|tw>`.\n  Fix: Pass the missing flags, or add `--yes` to use the defaults.\n",
    );
  });

  it("works fully non-interactively with all flags", async () => {
    const r = await runCli(["my-app", "--type", "app", "--toolchain", "b", "--routing", "r2", "--state", "s", "--ui", "m", "--styling", "mod", "--pm", "npm"]);
    expect(r.code).toBe(0);
    expect(r.runner.commands).toContain("npm install");
  });

  it("exits 130 on cancel", async () => {
    const prompts = new ScriptedPrompts({ "Project type": CANCEL });
    const r = await runCli(["my-app"], { isTTY: true, prompts });
    expect(r.code).toBe(130);
    expect(r.stderr).toBe("Cancelled.\n");
    expect(existsSync(join(r.cwd, "my-app"))).toBe(false);
  });
});

describe("cli: package manager", () => {
  it("detects from npm_config_user_agent and preselects it", async () => {
    const prompts = new ScriptedPrompts({ ...appAnswers, "Package manager": "yarn" });
    const r = await runCli(["my-app"], { isTTY: true, prompts, env: { npm_config_user_agent: "yarn/4.5.0 npm/? node/v24.11.0" } });
    const select = prompts.selects.find((s) => s.message === "Package manager");
    expect(select?.initialValue).toBe("yarn");
    expect(select?.options.find((o) => o.value === "yarn")?.hint).toBe("detected");
    expect(r.read("my-app/.yarnrc.yml")).toBe("nodeLinker: node-modules\n");
  });

  it("uses the detected PM with --yes, else npm", async () => {
    const pnpm = await runCli(["my-app", "--yes"], { env: { npm_config_user_agent: "pnpm/10.0.0" } });
    expect(pnpm.runner.commands).toContain("pnpm install");
    const fallback = await runCli(["my-app", "--yes"]);
    expect(fallback.runner.commands).toContain("npm install");
  });

  it("doesn't prompt when --pm is given", async () => {
    const prompts = new ScriptedPrompts(appAnswers);
    await runCli(["my-app", "--pm", "bun"], { isTTY: true, prompts });
    expect(prompts.asked).not.toContain("Package manager");
  });
});

describe("cli: resolve, preflight and report", () => {
  it("passes the Node version to resolve", async () => {
    const r = await runCli(["my-app", "--yes"], { nodeVersion: "20.0.0" });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("`--toolchain a` needs Node ^22.18.0 || ^24.11.0 || >=26.0.0; this is Node 20.0.0.");
    expect(r.stderr).toContain("re-run with `--toolchain b`");
  });

  it("probes pinned packages of engine-gated layers and suggests alternatives", async () => {
    const r = await runCli(["my-app", "--yes"], { runner: new FakeRunner(failing("npm view")) });
    expect(r.runner.commands).toContain("npm view a-tool@1.0.0 version");
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("✖ Preflight\n");
    expect(r.stderr).toContain("Fix: `a-tool@1.0.0` (needed by `toolchain/a`) can't be fetched from the registry. Check your network and registry settings, or re-run with `--toolchain b`.");
    expect(existsSync(join(r.cwd, "my-app"))).toBe(false);
  });

  it("prints steps and next steps on success", async () => {
    const r = await runCli(["my-app", "--yes", "--pm", "pnpm"]);
    expect(r.stdout).toBe(
      [
        "✔ Preflight",
        "✔ Created my-app",
        "✔ git init",
        "✔ pnpm install",
        "✔ Initial commit",
        "✔ pnpm run build",
        "✔ pnpm run lint",
        "✔ pnpm run test",
        "",
        "Next: cd my-app && pnpm run dev",
        "",
      ].join("\n"),
    );
  });

  it("exits 1 and prints the fix when a verify script fails", async () => {
    const r = await runCli(["my-app", "--yes", "--pm", "pnpm"], { runner: new FakeRunner(failing("pnpm run lint")) });
    expect(r.code).toBe(1);
    expect(r.stdout).toContain("✖ pnpm run lint\n✔ pnpm run test\n");
    expect(r.stderr).toBe("\nFix: cd my-app && pnpm run lint\nThe project was kept in my-app.\n");
  });

  it("reports template errors as BonesmithError", async () => {
    const root = variantTree({ "ui/m/layer.json": { label: "M", dependencies: { x: "^1.0.0" } } });
    const r = await runCli(["my-app", "--yes"], { templatesRoot: root });
    expect(r.code).toBe(1);
    expect(r.stderr).toBe("✖ templates/ui/m/layer.json: dependencies.x: must be an exact version (no ^, ~, ranges or tags)\n  Fix: Fix the field in that file.\n");
  });
});
