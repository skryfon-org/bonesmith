// Writes templates/layer.schema.json for editor support (`npm run schema`).
// Needs the real option folders under templates/ (added in specs 04/05).
import { loadAxes } from "../src/axes.ts";
import { emitJsonSchema } from "../src/layers.ts";
import { templatesRoot } from "../src/paths.ts";

const file = emitJsonSchema(loadAxes(templatesRoot()));
console.log(`wrote ${file}`);
