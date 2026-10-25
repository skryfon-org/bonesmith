---
inclusion: always
---

# Tech

- Language: TypeScript (strict) on Node, current LTS and newer.
- Distribution: public npm as `create-bonesmith`, version-tagged. Release requires a green matrix run.
- Prompts: `@clack/prompts`. Flags: `commander`.
- Tests: Vitest.

## Commands
Package manager for this repo: `npm` (`save-exact=true` in `.npmrc`).
- `npm run build`: compile `src/` to `dist/` (`tsc -p tsconfig.build.json`).
- `npm run typecheck`: `tsc --noEmit` over `src/`, `test/`, `scripts/`.
- `npm run lint`: ESLint (typescript-eslint strict-type-checked, `no-explicit-any: error`).
- `npm test`: Vitest (`unit`, `snapshot`, `lint` projects). Spawning a child process in a test throws.
- `npm run lint:templates`: template lint only (`src/template-lint.ts`): every combination resolved and rendered in memory for every package manager.
- `npm run test:matrix`: real scaffold + install + build + lint + test of `test/matrix/combinations.ts` (needs `npm run build`, network, pnpm/yarn/bun). Filter with `MATRIX_COMBO=<id>,<id>`; logs in `matrix-logs/`.
- `npm run check:pack`: checks the `npm pack` file list (`dist/`, `templates/`, `README.md`, `LICENSE`, `package.json`).
- `npm run readme`: regenerates the README flags block from `templates/` (a unit test fails when it's stale).
- `npm run schema`: write `templates/layer.schema.json` (needs the real option folders, from spec 04).

CI: `.github/workflows/ci.yml` (every push/PR, Node 24 and 26), `matrix.yml` (PRs touching `src/`/`templates/`, manual, and called by release), `release.yml` (`v*` tag → checks, matrix, `npm publish --provenance`). Actions are pinned by commit SHA.

TypeScript is pinned to 6.0.3, not 7.x: `typescript-eslint@8.72.0` supports `typescript <6.1.0`. Source imports use `.ts` extensions (`rewriteRelativeImportExtensions`), so scripts run directly with Node's type stripping.

## Conventions
- No `any`; use `unknown` and narrow. Validate `layer.json` at load time against a schema, not with ad-hoc checks.
- Errors are user-facing: say what failed, why, and the exact flag or action that fixes it (e.g. "re-run with `--toolchain vite`").
- Fail loudly. Missing or duplicate anchors, file collisions without override, agent name collisions and unknown layer references are errors, never silent skips.
- Dependency versions live only in `layer.json` files, pinned exactly. No `latest`, no `^`/`~` ranges, no unpinned `npx -y`. One exception (decided 2026-10-25): library `peerDependencies` may be `^<major>.<minor>.0`, and must sit next to an exact `devDependencies` pin that satisfies the range (render checks this).
- pnpm 12 rejects unreviewed dependency build scripts. Layers decide them in `buildScripts` (`{ "esbuild": false }`); render writes them as `allowBuilds` in the generated `pnpm-workspace.yaml`. Other package managers ignore the field.
- `postInstall` commands run only through the package manager's local exec (`pnpm exec`, `npx --no`, `yarn`, `bunx --no-install`) against binaries of pinned dependencies. Never a download.
- Toolchain is strict: default `vite-plus`; if it can't be resolved or Node is unsupported, exit with an error. No automatic or prompted fallback.
- Keep layer content (steering text, agent prompts, MCP entries) as plain data so it can later be emitted in other formats (e.g. Kiro powers).
- Keep dependencies of the scaffolder itself minimal and pinned.
