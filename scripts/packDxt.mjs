import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import bestzip from "bestzip";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

await import("./buildDxt.mjs");

const manifest = JSON.parse(
  await readFile(path.join(repoRoot, "dxt", "manifest.json"), "utf8")
);

const artifactsDir = path.join(repoRoot, "artifacts");
await mkdir(artifactsDir, { recursive: true });

const destination = path.join(artifactsDir, `${manifest.name}-${manifest.version}.dxt`);

await bestzip({
  cwd: path.join(repoRoot, "build", "dxt"),
  source: ["manifest.json", "README.md", "dist"],
  destination
});

console.log(`DXT package created at ${destination}`);
