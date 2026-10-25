import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Command, CommanderError, Option } from "commander";
import validateName from "validate-npm-package-name";
import { loadAxes, type AxisRegistry } from "./axes.ts";
import { BonesmithError } from "./errors.ts";
import { install, succeeded, type FsLike, type ProbeItem } from "./install.ts";
import { loadLayers, type LayerSet } from "./layers.ts";
import { detectPm, isPackageManager, PACKAGE_MANAGERS, pmVars } from "./pm.ts";
import type { ProcessRunner } from "./process.ts";
import { Cancelled, type Prompts } from "./prompts.ts";
import { render } from "./render.ts";
import { EXIT_CANCELLED, EXIT_FAIL, EXIT_OK, formatError, formatStep, formatSummary } from "./report.ts";
import { compatibleOptions, disabledAxesFor, resolve } from "./resolve.ts";
import type { AxisId, Choices, OptionId, PackageManager, Plan } from "./types.ts";

export interface CliDeps {
  prompts: Prompts;
  runner: ProcessRunner;
  fs: FsLike;
  env: Readonly<Record<string, string | undefined>>;
  cwd: string;
  isTTY: boolean;
  /** `process.versions.node`. */
  nodeVersion: string;
  templatesRoot: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

interface Parsed {
  name: string | undefined;
  flags: Partial<Record<AxisId, OptionId>>;
  pm: PackageManager | undefined;
  yes: boolean;
}

/** Thrown internally when commander has already printed help/version/an error. */
class ExitRequest extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`exit ${String(code)}`);
    this.code = code;
  }
}

function packageVersion(): string {
  const raw = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: unknown };
  return typeof raw.version === "string" ? raw.version : "0.0.0";
}

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

function parseArgs(argv: readonly string[], axes: AxisRegistry, deps: CliDeps): Parsed {
  const program = new Command("create-bonesmith")
    .description("Scaffold a React project with a matching .kiro setup.")
    .argument("[name]", "project name (also the directory name)")
    .version(packageVersion(), "-v, --version")
    .exitOverride()
    .configureOutput({ writeOut: deps.stdout, writeErr: deps.stderr })
    .helpOption("-h, --help");

  const axisOptions = new Map<AxisId, Option>();
  for (const id of axes.promptOrder) {
    const axis = axes.axes.get(id);
    if (axis === undefined) continue;
    const option = new Option(`${axis.flag} <option>`, `${axis.message} (default: ${axis.default})`).choices([...axis.options]);
    axisOptions.set(id, option);
    program.addOption(option);
  }
  const pmOption = new Option("--package-manager, --pm <pm>", "package manager (default: detected, else npm)").choices([...PACKAGE_MANAGERS]);
  program.addOption(pmOption);
  program.option("-y, --yes", "use defaults for every choice not given by flag; never prompt");

  try {
    program.parse([...argv], { from: "node" });
  } catch (err) {
    if (err instanceof CommanderError) throw new ExitRequest(err.exitCode);
    throw err;
  }

  const opts = program.opts<Record<string, unknown>>();
  const flags: Partial<Record<AxisId, OptionId>> = {};
  for (const [id, option] of axisOptions) {
    const value = opts[option.attributeName()];
    if (typeof value === "string") flags[id] = value;
  }
  const pmValue = opts[pmOption.attributeName()];
  const [name] = program.args;
  return {
    name,
    flags,
    pm: typeof pmValue === "string" && isPackageManager(pmValue) ? pmValue : undefined,
    yes: opts.yes === true,
  };
}

// ---------------------------------------------------------------------------
// Name and target
// ---------------------------------------------------------------------------

/** Reasons a name is not a valid new npm package name (empty when valid). */
export function nameProblems(name: string): string[] {
  const result = validateName(name);
  return result.validForNewPackages ? [] : [...(result.errors ?? []), ...(result.warnings ?? [])];
}

async function projectName(parsed: Parsed, interactive: boolean, prompts: Prompts): Promise<string> {
  if (parsed.name !== undefined) {
    const problems = nameProblems(parsed.name);
    if (problems.length > 0) {
      throw new BonesmithError(
        "INVALID_NAME",
        `\`${parsed.name}\` is not a valid npm package name: ${problems.join("; ")}.`,
        "Pick a lowercase, URL-friendly name, e.g. `npm create bonesmith my-app`.",
        { name: parsed.name, problems },
      );
    }
    return parsed.name;
  }
  if (!interactive) {
    throw new BonesmithError("NO_NAME", "No project name.", "Pass one: `npm create bonesmith my-app`.");
  }
  return prompts.text({
    message: "Project name",
    placeholder: "my-app",
    validate: (value) => {
      if (value.trim() === "") return "Enter a name.";
      const problems = nameProblems(value);
      return problems.length > 0 ? problems.join("; ") : undefined;
    },
  });
}

/** Directory name: the part after `/` for scoped names. */
export function dirName(name: string): string {
  return name.split("/").pop() ?? name;
}

function checkTarget(fs: FsLike, targetDir: string, shown: string): void {
  const kind = fs.kind(targetDir);
  if (kind === "missing" || (kind === "dir" && fs.readdir(targetDir).length === 0)) return;
  throw new BonesmithError(
    "TARGET_NOT_EMPTY",
    `\`${shown}\` already exists and is not empty.`,
    "Choose another project name, or empty that directory first.",
    { targetDir },
  );
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------

async function collectSelections(
  parsed: Parsed,
  interactive: boolean,
  layers: LayerSet,
  axes: AxisRegistry,
  prompts: Prompts,
): Promise<Partial<Record<AxisId, OptionId>>> {
  // Flags first, so later-axis flags already constrain earlier prompts. Flags for axes
  // that end up disabled stay in, and resolve reports them (AXIS_DISABLED).
  const selections: Partial<Record<AxisId, OptionId>> = { ...parsed.flags };
  const missing: AxisId[] = [];

  for (const id of axes.promptOrder) {
    const axis = axes.axes.get(id);
    if (axis === undefined || selections[id] !== undefined) continue;
    if (disabledAxesFor(selections, layers, axes).has(id)) continue;
    if (parsed.yes) {
      selections[id] = axis.default;
      continue;
    }
    if (!interactive) {
      missing.push(id);
      continue;
    }
    const options = compatibleOptions(id, selections, layers, axes);
    if (options.length === 0) {
      throw new BonesmithError(
        "CONFLICT",
        `No \`${axis.flag}\` option is compatible with the choices so far.`,
        "Re-run and pick different earlier options.",
        { axis: id },
      );
    }
    selections[id] = await prompts.select({
      message: axis.message,
      options: options.map((o) => {
        const m = layers.get(`${id}/${o}`)?.manifest;
        return { value: o, label: m?.label ?? o, ...(m?.hint !== undefined ? { hint: m.hint } : {}) };
      }),
      ...(options.includes(axis.default) ? { initialValue: axis.default } : {}),
    });
  }

  if (missing.length > 0) {
    const list = missing.map((id) => {
      const axis = axes.axes.get(id);
      return `\`${axis?.flag ?? `--${id}`} <${(axis?.options ?? []).join("|")}>\``;
    });
    throw new BonesmithError(
      "MISSING_FLAGS",
      `No terminal to prompt in, and these choices are missing: ${list.join(", ")}.`,
      "Pass the missing flags, or add `--yes` to use the defaults.",
      { missing },
    );
  }
  return selections;
}

async function packageManager(parsed: Parsed, interactive: boolean, env: CliDeps["env"], prompts: Prompts): Promise<PackageManager> {
  if (parsed.pm !== undefined) return parsed.pm;
  const detected = detectPm(env.npm_config_user_agent);
  if (!interactive) return detected;
  return prompts.select<PackageManager>({
    message: "Package manager",
    options: PACKAGE_MANAGERS.map((pm) => ({ value: pm, label: pm, ...(pm === detected ? { hint: "detected" } : {}) })),
    initialValue: detected,
  });
}

/** Registry probes for pinned packages of layers with `engines`, with a fix naming the alternatives. */
export function probeList(plan: Plan, layers: LayerSet): ProbeItem[] {
  const { axes } = plan;
  const items: ProbeItem[] = [];
  for (const layer of plan.layers) {
    if (layer.manifest.engines === undefined) continue;
    const axis = axes.axes.get(layer.group);
    let fix = "Check your network and registry settings.";
    if (axis !== undefined) {
      const rest = Object.fromEntries(Object.entries(plan.choices.selections).filter(([a]) => a !== axis.id));
      const alternatives = compatibleOptions(axis.id, rest, layers, axes).filter((o) => o !== layer.option);
      if (alternatives.length > 0) {
        fix = `Check your network and registry settings, or re-run with ${alternatives.map((o) => `\`${axis.flag} ${o}\``).join(" or ")}.`;
      }
    }
    const deps = [layer.manifest, ...layer.variants].flatMap((c) => [
      ...Object.entries(c.dependencies ?? {}),
      ...Object.entries(c.devDependencies ?? {}),
    ]);
    const seen = new Set<string>();
    for (const [pkg, version] of deps) {
      const spec = `${pkg}@${version}`;
      if (seen.has(spec)) continue;
      seen.add(spec);
      items.push({ spec, layer: layer.id, fix });
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/** Runs the CLI. Returns the exit code. */
export async function main(argv: readonly string[], deps: CliDeps): Promise<number> {
  try {
    const axes = loadAxes(deps.templatesRoot);
    const layers = loadLayers(deps.templatesRoot, axes);
    const parsed = parseArgs(argv, axes, deps);
    const interactive = deps.isTTY && !parsed.yes;
    if (interactive) deps.prompts.intro("create-bonesmith");

    const name = await projectName(parsed, interactive, deps.prompts);
    const shown = dirName(name);
    const targetDir = join(deps.cwd, shown);
    checkTarget(deps.fs, targetDir, shown);

    const selections = await collectSelections(parsed, interactive, layers, axes, deps.prompts);
    const pm = await packageManager(parsed, interactive, deps.env, deps.prompts);
    const choices: Choices = { name, targetDir, packageManager: pm, selections, explicit: new Set(Object.keys(parsed.flags)) };
    const plan = resolve(choices, layers, axes, { nodeVersion: deps.nodeVersion });

    const result = render(plan, pmVars(pm, name));
    const report = await install({ result, targetDir, displayDir: shown, pm, probe: probeList(plan, layers) }, deps.runner, deps.fs, (step) => {
      deps.stdout(`${formatStep(step)}\n`);
    });
    const ok = succeeded(report);
    (ok ? deps.stdout : deps.stderr)(`\n${formatSummary(report, shown)}\n`);
    return ok ? EXIT_OK : EXIT_FAIL;
  } catch (err) {
    if (err instanceof ExitRequest) return err.code;
    if (err instanceof Cancelled) {
      deps.stderr("Cancelled.\n");
      return EXIT_CANCELLED;
    }
    deps.stderr(`${formatError(err)}\n`);
    return EXIT_FAIL;
  }
}
