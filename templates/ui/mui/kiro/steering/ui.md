---
inclusion: fileMatch
fileMatchPattern: ["src/**/*.tsx", "src/theme.ts"]
---

# UI: MUI (Material UI)

- Import components from `@mui/material` (`import { Button, Stack } from "@mui/material"`).
- Theme lives in `src/theme.ts` (`createTheme` with CSS variables and light/dark schemes) and is provided once in `src/main.tsx`; change palette, typography and component defaults there, not per component.
- Style with the `sx` prop or `styled()` from `@mui/material/styles` (Emotion). No Tailwind or other CSS-in-JS libraries alongside MUI.
- Layout with `Stack`, `Box` and `Grid` instead of custom flex CSS.
- Use the `mui` MCP server for current component APIs before guessing props.
- Tests render components inside `<ThemeProvider theme={theme}>`.
