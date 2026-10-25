import { fileURLToPath } from "node:url";

/** Absolute path of the bundled `templates/` directory (sibling of `dist/` and `src/`). */
export function templatesRoot(): string {
  return fileURLToPath(new URL("../templates/", import.meta.url));
}
