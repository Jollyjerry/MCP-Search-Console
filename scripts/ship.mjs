#!/usr/bin/env node
//
// scripts/ship.mjs — orchestrate the full Search Console MCP ship flow.
//
// Default flow (one shot): pre-flight → bump DXT → push branch → PR → merge to main
//                          → SSH server upgrade + /health → build + pack DXT.
//
// Same shape as the ga4-mcp-integration ship script, only the env defaults differ
// (port 3001, server path ~/apps/MCP-Search-Console).
//
// Flags:
//   --resume                 skip Phase 1, run server deploy + DXT pack only
//   --bump=patch|minor|major bump dxt/manifest.json (default: patch)
//   --no-bump                skip the version bump
//   --no-typecheck           skip tsc --noEmit
//   --no-merge               push branch + create PR but do not merge
//   --force                  bypass dirty-tree check (avoid)
//
// Env overrides (set in .env.ship at the repo root):
//   GSC_SSH_CMD       full ssh invocation, default "ssh ga4"
//   GSC_SERVER_PATH   repo path on server, default "~/apps/MCP-Search-Console"
//   GSC_HEALTH_URL    health URL on server, default "http://127.0.0.1:3001/health"

import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(repoRoot, ".env.ship"), override: false, quiet: true });

if (process.platform === "win32") {
  try {
    execSync("gh --version", { stdio: "ignore", cwd: repoRoot });
  } catch {
    for (const dir of ["C:\\Program Files\\GitHub CLI", "C:\\Program Files (x86)\\GitHub CLI"]) {
      if (existsSync(path.join(dir, "gh.exe"))) {
        process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ""}`;
        break;
      }
    }
  }
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => !a.includes("=")));
const kv = Object.fromEntries(
  argv.filter((a) => a.includes("=")).map((a) => {
    const [k, v] = a.split("=");
    return [k.replace(/^--/, ""), v];
  })
);

const RESUME = flags.has("--resume");
const NO_BUMP = flags.has("--no-bump");
const NO_TYPECHECK = flags.has("--no-typecheck");
const NO_MERGE = flags.has("--no-merge");
const FORCE = flags.has("--force");
const BUMP_KIND = kv.bump ?? "patch";

const SSH_CMD = process.env.GSC_SSH_CMD ?? "ssh ga4";
const SERVER_PATH = process.env.GSC_SERVER_PATH ?? "~/apps/MCP-Search-Console";
const HEALTH_URL = process.env.GSC_HEALTH_URL ?? "http://127.0.0.1:3001/health";

const manifestPath = path.join(repoRoot, "dxt", "manifest.json");

function run(cmd, { silent = false } = {}) {
  return execSync(cmd, {
    cwd: repoRoot,
    stdio: silent ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8"
  });
}

function capture(cmd) {
  return execSync(cmd, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
}

function tryCapture(cmd) {
  try {
    return capture(cmd);
  } catch {
    return null;
  }
}

function step(label) {
  console.log(`\n→ ${label}`);
}

function fail(msg) {
  console.error(`\n[ship] ${msg}`);
  process.exit(1);
}

function ok(msg) {
  console.log(`[ship] ${msg}`);
}

function bumpVersion(current, kind) {
  const [maj, min, pat] = current.split(".").map((n) => parseInt(n, 10));
  if ([maj, min, pat].some((n) => Number.isNaN(n))) {
    fail(`Cannot parse current DXT version "${current}" — expected semver MAJOR.MINOR.PATCH`);
  }
  if (kind === "major") return `${maj + 1}.0.0`;
  if (kind === "minor") return `${maj}.${min + 1}.0`;
  if (kind === "patch") return `${maj}.${min}.${pat + 1}`;
  fail(`Unknown --bump kind "${kind}". Use patch|minor|major.`);
}

function readManifest() {
  return JSON.parse(readFileSync(manifestPath, "utf8"));
}

function repoSlug() {
  const url = capture("git remote get-url origin");
  return url
    .replace(/^git@github\.com:/, "")
    .replace(/^https:\/\/github\.com\//, "")
    .replace(/\.git$/, "");
}

function hasGh() {
  return tryCapture("gh --version") !== null;
}

function phase1() {
  step("Phase 1 — pre-flight + push + merge");

  const dirty = capture("git status --porcelain");
  if (dirty && !FORCE) {
    fail(`Working tree is dirty:\n${dirty}\n\nCommit or stash first. Pass --force to override (not recommended).`);
  }

  const branch = capture("git rev-parse --abbrev-ref HEAD");
  if (branch === "main" || branch === "HEAD") {
    fail(`Refusing to ship from "${branch}". Switch to a feature branch.`);
  }

  step("Fetch origin");
  run("git fetch origin --prune", { silent: true });

  const ahead = capture(`git rev-list --count origin/main..HEAD`);
  if (ahead === "0") {
    fail(`Branch '${branch}' has no commits beyond origin/main. Nothing to ship.`);
  }
  ok(`branch '${branch}' is ${ahead} commit(s) ahead of origin/main`);

  if (!NO_TYPECHECK) {
    step("Type-check (tsc --noEmit)");
    try {
      run("npx tsc --noEmit");
    } catch {
      fail("Type-check failed. Fix errors or pass --no-typecheck.");
    }
  } else {
    ok("typecheck skipped (--no-typecheck)");
  }

  if (!NO_BUMP) {
    step(`DXT version bump (${BUMP_KIND})`);
    const mainManifest = JSON.parse(capture("git show origin/main:dxt/manifest.json"));
    const current = readManifest();
    if (current.version !== mainManifest.version) {
      ok(`DXT already bumped (${mainManifest.version} → ${current.version}). Skipping.`);
    } else {
      const next = bumpVersion(current.version, BUMP_KIND);
      const updated = { ...current, version: next };
      writeFileSync(manifestPath, JSON.stringify(updated, null, 2) + "\n");
      run("git add dxt/manifest.json");
      run(`git commit -m "Bump DXT manifest to ${next}"`);
      ok(`bumped ${current.version} → ${next}`);
    }
  } else {
    ok("DXT version bump skipped (--no-bump)");
  }

  step(`Push '${branch}' to origin`);
  run(`git push -u origin ${branch}`);

  const slug = repoSlug();
  const compareUrl = `https://github.com/${slug}/compare/main...${branch}?expand=1`;

  if (NO_MERGE) {
    ok(`merge skipped (--no-merge). PR URL: ${compareUrl}`);
    return false;
  }

  if (!hasGh()) {
    console.log(`\n[ship] gh CLI not installed — open the PR manually:\n  ${compareUrl}\n`);
    console.log("Once merged, re-run: npm run ship -- --resume");
    return false;
  }

  step("Create or find PR");
  let prNumber = null;
  const existing = tryCapture(`gh pr view ${branch} --json number --jq '.number'`);
  if (existing) {
    prNumber = existing;
    ok(`PR exists: #${prNumber}`);
  } else {
    try {
      const created = capture(`gh pr create --base main --head ${branch} --fill`);
      console.log(created);
      prNumber = (created.match(/\/pull\/(\d+)/) || [])[1];
    } catch {
      fail(`gh pr create failed. Open manually: ${compareUrl}`);
    }
  }

  step(`Merge PR #${prNumber} (squash + delete branch)`);
  try {
    run(`gh pr merge ${prNumber} --squash --delete-branch`);
    ok(`PR #${prNumber} merged`);
  } catch {
    fail(`gh pr merge failed. Merge manually, then run: npm run ship -- --resume`);
  }

  step("Sync local main");
  run("git checkout main");
  run("git pull --ff-only origin main");

  return true;
}

function phase2() {
  step("Phase 2 — server deploy + DXT release");

  step("Fetch origin");
  run("git fetch origin --prune", { silent: true });
  const mainHead = capture("git rev-parse origin/main");
  ok(`origin/main HEAD: ${mainHead.slice(0, 12)}`);

  step(`SSH server upgrade (${SSH_CMD})`);
  const remote = [
    `cd ${SERVER_PATH}`,
    "git fetch --all --prune",
    "git checkout main",
    "git pull --ff-only",
    "git rev-parse HEAD",
    "docker compose up -d --build",
    "docker compose ps",
    `curl -sS --max-time 30 --retry 10 --retry-delay 2 --retry-all-errors ${HEALTH_URL}`
  ].join(" && ");

  const sshArgs = SSH_CMD.split(/\s+/);
  const sshBin = sshArgs.shift();
  const result = spawnSync(sshBin, [...sshArgs, remote], { stdio: ["inherit", "pipe", "pipe"], encoding: "utf8" });

  if (result.error) fail(`SSH spawn error: ${result.error.message}`);
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.status !== 0) fail(`Server deploy exited with status ${result.status}.`);

  const healthOk = (result.stdout || "").match(/"ok"\s*:\s*true/);
  if (!healthOk) fail(`/health did not return {"ok":true,...}. Aborting — investigate the server.`);
  ok("/health returned ok:true");

  const serverHead = ((result.stdout || "").match(/^[a-f0-9]{40}$/m) || [])[0];
  if (serverHead && serverHead !== mainHead) {
    fail(`Server HEAD (${serverHead.slice(0, 12)}) does not match origin/main (${mainHead.slice(0, 12)}). Did the pull succeed?`);
  }
  if (serverHead) ok(`server HEAD matches origin/main (${serverHead.slice(0, 12)})`);

  step("Build DXT");
  run("npm run build:dxt");

  step("Pack DXT");
  run("npm run pack:dxt");

  const manifest = readManifest();
  const artifactName = `${manifest.name}-${manifest.version}.dxt`;
  const artifactPath = path.join(repoRoot, "artifacts", artifactName);
  if (!existsSync(artifactPath)) fail(`Expected artifact missing: ${artifactPath}`);

  console.log("\n✅ Ship complete.");
  console.log(`  Server : deployed; /health ok`);
  console.log(`  DXT    : ${artifactPath}`);
  console.log(`\nLoad the .dxt in Claude Desktop (Settings → Extensions → Load from file).`);
}

if (RESUME) {
  phase2();
} else {
  const merged = phase1();
  if (merged) phase2();
}
