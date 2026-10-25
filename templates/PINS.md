# Version pins

Recorded 2026-10-24 with `npm view <pkg> version`, peers checked with `npm view <pkg>@<ver> peerDependencies`.
Every version in a `layer.json` must come from this table. Update the table and the layers together.

| Package | Pin | Used by | Notes |
|---|---|---|---|
| react, react-dom | 19.3.1 | base (`app` variant) | |
| @types/react, @types/react-dom | 19.3.0 | base | |
| typescript | 6.0.3 | base | 7.0.2 is latest, but `typescript-eslint@8.72.0` needs `<6.1.0` |
| vitest | 5.0.5 | base | same version vite-plus bundles; `@testing-library/jest-dom/vitest` imports `vitest` |
| @testing-library/react | 16.3.3 | base | |
| @testing-library/dom | 10.4.2 | base | peer of RTL and jest-dom |
| @testing-library/jest-dom | 7.0.1 | base | peers `vitest >=0.32`, `@testing-library/dom >=10 <11` |
| @testing-library/user-event | 14.6.8 | base | |
| jsdom | 29.1.1 | base | 30.1.3 is latest but needs Node `^24.15.0`; 29 supports `>=24.0.0` |
| @vitejs/plugin-react | 6.1.2 | base | peer `vite ^8`; vite-plus-core reports itself as vite 8.3.5 |
| vite-plus | 1.4.0 | toolchain/vite-plus | engines `^22.18.0 \|\| ^24.11.0 \|\| >=26.0.0`; bins `vp`, `vpr`, `vpx` |
| @voidzero-dev/vite-plus-core | 1.4.0 | toolchain/vite-plus (`overrides` alias for `vite`) | must match vite-plus |
| vite | 8.3.5 | toolchain/vite | |
| eslint | 10.13.0 | toolchain/vite | |
| @eslint/js | 10.0.1 | toolchain/vite | |
| typescript-eslint | 8.72.0 | toolchain/vite | peer `typescript <6.1.0` |
| eslint-plugin-react-hooks | 7.1.1 | toolchain/vite | |
| globals | 17.13.0 | toolchain/vite | |
| prettier | 3.9.10 | toolchain/vite | |
| react-router | 7.18.4 | routing/react-router | v7 per spec (8.5.0 is latest) |
| @tanstack/react-router | 1.170.46 | routing/tanstack-router | code-based routes |
| zustand | 5.0.16 | state/zustand | |
| @reduxjs/toolkit | 2.13.0 | state/redux-toolkit | |
| react-redux | 9.3.0 | state/redux-toolkit | |
| tailwindcss, @tailwindcss/vite | 4.3.3 | styling/tailwind | peer `vite ^5.2 \|\| ^6 \|\| ^7 \|\| ^8` |
| styled-components | 6.6.0 | styling/css-in-js | CSS-in-JS choice, confirmed 2026-10-25 |
| class-variance-authority | 0.7.1 | ui/shadcn | |
| clsx | 2.1.1 | ui/shadcn | |
| tailwind-merge | 3.7.0 | ui/shadcn | |
| radix-ui | 1.8.1 | ui/shadcn | current shadcn `button` imports `radix-ui` (not `@radix-ui/react-slot`) |
| lucide-react | 1.61.0 | ui/shadcn | shadcn's default icon library |
| shadcn | 4.22.1 | ui/shadcn (devDependency for `shadcn add`, and the MCP pin) | |
| tw-animate-css | 1.4.0 | ui/shadcn | imported by the shadcn theme CSS |
| @mui/material | 9.5.0 | ui/mui | peers `@emotion/react ^11.5`, `@emotion/styled ^11.3` |
| @emotion/react | 11.14.0 | ui/mui | |
| @emotion/styled | 11.14.1 | ui/mui | |
| @mantine/core, @mantine/hooks | 9.7.3 | ui/mantine | peer `react ^19.2.0` |
| postcss | 8.5.31 | ui/mantine | |
| postcss-preset-mantine | 1.18.0 | ui/mantine | |
| postcss-simple-vars | 7.0.1 | ui/mantine | |
| @mui/mcp | 0.1.8 | ui/mui (MCP pin only) | |
| @mantine/mcp-server | 9.7.3 | ui/mantine (MCP pin only) | |
| storybook | 10.6.3 | addons/storybook | optional peer `vite-plus ^0.1.15 \|\| ^0.2.0` is unmet by 1.4.0; warning only |
| @storybook/react-vite | 10.6.3 | addons/storybook | peer `vite ^5–^8` |
| @storybook/addon-vitest | 10.6.3 | addons/storybook | peers `vitest ^4 \|\| ^5`, `@vitest/browser-playwright ^4 \|\| ^5` |
| @storybook/addon-mcp | 10.6.3 | addons/storybook | serves `http://localhost:6006/mcp` while `storybook dev` runs |
| @vitest/browser-playwright | 5.0.5 | addons/storybook (both toolchains) | peer `vitest 5.0.5`; `vite-plus/test/browser-playwright` only re-exports it, so it must be installed |
| playwright | 1.64.1 | addons/storybook | `postInstall`: `playwright install chromium` |
| vite-plugin-dts | 5.1.2 | base (`vite-library` variant) | |
| @tailwindcss/cli | 4.3.3 | styling/tailwind (library + vite-plus) | `vp pack` ignores Vite plugins; the CLI builds `dist/styles.css` from `onSuccess` |

## MCP servers

Each was started with a JSON-RPC `initialize` request on 2026-10-24 and answered.

| Server | Entry | Package engines |
|---|---|---|
| `shadcn` | `npx -y shadcn@4.22.1 mcp` | `>=20.18.1` |
| `mui` | `npx -y @mui/mcp@0.1.8` | `>=22.12` |
| `mantine` | `npx -y @mantine/mcp-server@9.7.3` | `>=22` |

## Commands confirmed

- `vp test` runs once by default; `vp test run` is the explicit one-shot form (used in scripts).
- `vp lint` (Oxlint), `vp fmt` (Oxfmt), `vp build`, `vp dev`.
- vite-plus needs package-manager overrides so dependencies share its Vite and Vitest
  (`vite` → `npm:@voidzero-dev/vite-plus-core@1.4.0`, `vitest` → `5.0.5`). Without them a second
  `vite@8.3.5` is installed and `vite.config.ts` fails to typecheck. pnpm reads overrides only from
  `pnpm-workspace.yaml`; npm and bun from `package.json` `overrides`; yarn from `resolutions`.
