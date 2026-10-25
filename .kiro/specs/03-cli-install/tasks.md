# Tasks: 03 CLI and install

Prerequisites: 01 and 02 complete.

- [x] 1. PM table and process runner
  - `src/pm.ts` (table, `detectPm`, `pmVars` with `.yarnrc.yml` extra file), `src/process.ts` (`spawnRunner`, ENOENT → 127, win32 `.cmd`).
  - Unit tests for table, detection, `pmVars`.
  - _Requirements: 3.2, 3.5, 3.8, 1.9_

- [x] 2. Install
  - `src/install.ts` with `FsLike`; steps preflight → move → git init → install → postInstall → commit → verify; stop/continue rules; command strings with quoting.
  - `test/support/fake-runner.ts`, `test/support/memory-fs.ts`.
  - Unit tests from design §8.
  - _Requirements: 3.1–3.7, 4.1–4.3_

- [x] 3. Report
  - `src/report.ts`: step list, fix line, next steps, error formatting, exit codes.
  - Snapshot tests.
  - _Requirements: 5.1–5.3_

- [x] 4. CLI
  - `src/prompts.ts` wrapper; `src/cli.ts` `main(argv, deps)`: commander from `axes.json`, name handling, target check, choices loop with `compatibleOptions` and disabled-axis skip, PM selection, resolve → render → install → report; `src/index.ts` bin.
  - Unit tests from design §8 with fixture templates and mocked prompts.
  - _Requirements: 1.1–1.10, 2.1–2.6, 5.2, 5.4_

- [x] 5. End-to-end with fakes
  - `cli.e2e.test.ts` per design §8.
  - _Requirements: 3.1_

- [x] 6. Spec amendment
  - Amend `docs/superpowers/specs/2026-10-14-bonesmith-scaffolder-design.md` §3 step 2/4: Node check in resolve, registry probe in install preflight (confirmed 2026-10-24).

- [x] 7. Checkpoint
  - `build`, `typecheck`, `lint`, `test` green; `node dist/index.js --help` lists every axis flag from `axes.json`.
