#!/usr/bin/env node
// Remove only files and config blocks owned by glm-mcp-codex. Credentials are preserved by default.

import { existsSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const flag = (name) => args.includes(name);
const USER_HOME = resolve(option("--user-home") || homedir());
const GLOBAL_CODEX_HOME = resolve(option("--codex-home") || process.env.CODEX_HOME || join(USER_HOME, ".codex"));
const PROJECT = option("--project") ? resolve(option("--project")) : null;
const TARGET_CODEX_HOME = PROJECT ? join(PROJECT, ".codex") : GLOBAL_CODEX_HOME;
const CONFIG = join(TARGET_CODEX_HOME, "config.toml");
const DATA_HOME = resolve(option("--data-dir") || join(GLOBAL_CODEX_HOME, "glm-mcp"));
const SKILL_ROOT = PROJECT ? join(PROJECT, ".agents", "skills") : join(USER_HOME, ".agents", "skills");
const START = "# >>> glm-mcp-codex managed >>>";
const END = "# <<< glm-mcp-codex managed <<<";
const MANAGED_MARKERS = ["# Managed by glm-mcp-codex", "// Managed by glm-mcp-codex"];

function removeBlock(text) {
  const escapedStart = START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`\\r?\\n?${escapedStart}[\\s\\S]*?${escapedEnd}\\r?\\n?`, "g"), "")
    .replace(/\n{3,}/g, "\n\n");
}

function atomicWrite(path, content) {
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, path);
}

function removeManagedFile(path) {
  if (existsSync(path) && MANAGED_MARKERS.some((marker) => readFileSync(path, "utf8").includes(marker))) {
    unlinkSync(path);
    console.log(`  removed ${path}`);
  }
}

if (existsSync(CONFIG)) {
  const current = readFileSync(CONFIG, "utf8");
  const next = removeBlock(current);
  if (next !== current) {
    atomicWrite(CONFIG, next);
    console.log(`  removed managed config from ${CONFIG}`);
  }
}

removeManagedFile(join(TARGET_CODEX_HOME, "agents", "glm.toml"));
removeManagedFile(join(TARGET_CODEX_HOME, "hooks", "glm_router_hook.mjs"));

const skill = join(SKILL_ROOT, "glm-delegate");
if (existsSync(join(skill, ".glm-mcp-codex"))) {
  rmSync(skill, { recursive: true, force: true });
  console.log(`  removed ${skill}`);
}

if (flag("--remove-data")) {
  rmSync(DATA_HOME, { recursive: true, force: true });
  console.log(`  removed ${DATA_HOME}`);
} else {
  console.log(`  kept credentials and usage data at ${DATA_HOME} (pass --remove-data to delete it)`);
}
