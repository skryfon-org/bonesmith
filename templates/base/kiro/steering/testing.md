---
inclusion: fileMatch
fileMatchPattern: ["**/*.test.ts", "**/*.test.tsx", "vitest.setup.ts"]
---

# Testing

- Vitest + React Testing Library + `@testing-library/jest-dom` matchers; `jsdom` environment.
- Tests sit next to the code: `Thing.tsx` → `Thing.test.tsx`. Unit tests match `src/**/*.test.{ts,tsx}`.
- Query by role and accessible name (`getByRole("button", { name: "Save" })`); avoid test ids and implementation details.
- Simulate users with `@testing-library/user-event` (`const user = userEvent.setup()`), not `fireEvent`.
- Components that need providers (router, store, theme) get a small `renderWith…` helper in the test file, not global mocks.
- `{{pmRun}} test` runs every test once and exits; it must pass before a change is done.
