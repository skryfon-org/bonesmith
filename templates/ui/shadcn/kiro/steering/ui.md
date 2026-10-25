---
inclusion: fileMatch
fileMatchPattern: ["src/components/**", "src/lib/utils.ts", "components.json"]
---

# UI: shadcn/ui

- Components are copied into `src/components/ui/` and owned by this project. Add new ones with `{{pmExec}} shadcn add <name>` (or the `shadcn` MCP server), then review the diff.
- Primitives come from `radix-ui`; variants are `class-variance-authority` (`cva`); merge classes with `cn()` from `@/lib/utils`.
- Theme colours are CSS variables in `src/index.css` (`--primary`, `--background`, …) mapped to Tailwind tokens in `@theme inline`; change the variables, not the component classes.
- Compose app components from `ui/` primitives in `src/components/`; keep `ui/` close to upstream so later `add` diffs stay readable.
- Icons: `lucide-react`. Icon-only buttons need an `aria-label`.
