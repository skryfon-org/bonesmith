---
inclusion: fileMatch
fileMatchPattern: ["src/**/*.tsx", "src/**/*.css"]
---

# Styling: CSS Modules

- One `<Component>.module.css` next to each component; import it as `styles` and use `className={styles.name}`.
- Class names are camelCase (`.cardTitle` → `styles.cardTitle`) so they read as properties.
- Shared values are CSS custom properties defined once in `:root` in `src/index.css`; modules read them with `var(--name, fallback)`.
- Combine classes with a template literal or array join; don't reach into another component's module.
- No global selectors in modules except via `:global(...)`, and only when styling third-party markup.
