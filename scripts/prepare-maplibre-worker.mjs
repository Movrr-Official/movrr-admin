import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(require.resolve(`maplibre-gl/dist/${file}`), new URL(`../public/${file}`, import.meta.url));
}
