---
inclusion: fileMatch
fileMatchPattern: ["src/**", "package.json"]
---

# Library

- This is a published ESM package. The public API is exactly what `src/index.ts` exports; adding, renaming or removing an export is an API change.
- `react`, `react-dom` and any UI framework are `peerDependencies` (caret ranges) plus exact `devDependencies` pins for local work. Never move them to `dependencies`. Other runtime packages go in `dependencies`.
- No app-only code: no router, global store, `index.html` or `document`-level side effects at import time. Components take everything through props.
- Every exported component ships with types (generated into `dist/index.d.ts`), a test and a story.
- Versioning is semver: breaking export or prop changes need a major bump; record user-visible changes in `CHANGELOG.md`.
- `{{pmRun}} build` must produce `dist/index.js` and `dist/index.d.ts`; check what consumers import, not just that the build passes.
