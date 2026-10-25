---
inclusion: fileMatch
fileMatchPattern: ["src/**/*.tsx", "src/**/*.css"]
---

# Styling: Tailwind CSS v4

- Style with utility classes in `className`. No `tailwind.config.js`: configuration is CSS-first in `src/index.css` (`@import "tailwindcss";`, `@theme { … }` for tokens, `@utility` / `@custom-variant` for extensions).
- The Vite plugin (`@tailwindcss/vite`) is registered in `vite.config.ts`; there is no PostCSS config.
- Prefer theme tokens (`bg-primary`, `text-muted-foreground`) over arbitrary values (`bg-[#123456]`).
- Build class lists conditionally with template literals or a `cn()` helper; never construct class names from string fragments (Tailwind can't see them).
- Responsive and state variants (`md:`, `hover:`, `focus-visible:`, `dark:`) instead of custom CSS.
