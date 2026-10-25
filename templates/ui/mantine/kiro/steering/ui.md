---
inclusion: fileMatch
fileMatchPattern: ["src/**/*.tsx", "src/theme.ts", "src/**/*.module.css"]
---

# UI: Mantine

- Import components and hooks from `@mantine/core` / `@mantine/hooks`. `@mantine/core/styles.css` is imported once in `src/main.tsx`.
- Theme (`createTheme`) lives in `src/theme.ts` and is passed to `MantineProvider`; set colours, radius and component `defaultProps` there.
- Style with component props (`c`, `p`, `gap`), `classNames` / `styles` API, or CSS modules processed by `postcss-preset-mantine` (`rem()`, `light-dark()`, breakpoint mixins). No Tailwind.
- Layout with `Stack`, `Group`, `Grid`, `AppShell`.
- Use the `mantine` MCP server to look up current component props before guessing.
- Tests render inside `<MantineProvider theme={theme}>`; `vitest.setup.ts` stubs `matchMedia` and `ResizeObserver` for jsdom.
