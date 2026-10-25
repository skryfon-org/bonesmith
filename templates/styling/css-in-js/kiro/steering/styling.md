---
inclusion: fileMatch
fileMatchPattern: ["src/**/*.tsx", "src/styles/**"]
---

# Styling: styled-components

- Define styled components at module level, next to the component that uses them; never inside a render function.
- Shared tokens (colours, spacing, radius) come from `src/styles/tokens.ts`; don't hard-code them in components.
- Variants: transient props (`$variant`, `$size`) so they aren't forwarded to the DOM.
- Keep semantic elements (`styled.button`, `styled.nav`); use `as` to change the element, not a `div` with a role.
- Global styles via one `createGlobalStyle` component, rendered once near the root.
