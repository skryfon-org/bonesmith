---
inclusion: fileMatch
fileMatchPattern: ["**/*.stories.tsx", ".storybook/**"]
---

# Storybook

- One `<Name>.stories.tsx` next to each component, CSF3: `const meta = { component, args } satisfies Meta<typeof X>`, named `StoryObj` exports.
- Stories are tests: `{{pmRun}} test` runs each story in Chromium. Add a `play` function for behaviour (query by role, `userEvent`, `expect` from `storybook/test`); spy on callbacks with `fn()` in `args`.
- Cover the states consumers care about (variants, disabled, long content, error) as separate stories.
- Global decorators and stylesheet imports live in `.storybook/preview.tsx`; don't repeat providers in individual stories.
- With `{{pmRun}} storybook` running, the `storybook` MCP server answers component and docs questions; use it before guessing props.
