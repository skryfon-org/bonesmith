---
inclusion: always
---

# Tech

React 19, TypeScript strict, Vitest + React Testing Library. Package manager: {{pm}}.

- No `any`; use `unknown` and narrow.
- Dependencies are pinned to exact versions. Add new ones with an exact version and only when the stack doesn't already cover the need.
- A change is done when `{{pmRun}} build`, `{{pmRun}} lint` and `{{pmRun}} test` all pass.

<!-- bonesmith:sections -->
