import { mkdir, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const buildRoot = path.join(repoRoot, "build", "dxt");
const distRoot = path.join(buildRoot, "dist");
const dxtRoot = path.join(repoRoot, "dxt");

await rm(buildRoot, { recursive: true, force: true });
await mkdir(distRoot, { recursive: true });

await build({
  entryPoints: [path.join(dxtRoot, "server", "index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  outfile: path.join(distRoot, "index.js"),
  sourcemap: false
});

await cp(path.join(dxtRoot, "manifest.json"), path.join(buildRoot, "manifest.json"));
await cp(path.join(dxtRoot, "README.md"), path.join(buildRoot, "README.md"));

console.log(`DXT build prepared in ${buildRoot}`);
