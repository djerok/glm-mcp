#!/usr/bin/env node
// Install GLM MCP for Codex with a stable private runtime and no keys in config.toml.
// The generated block is marker-delimited, so reinstallation and removal are idempotent.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = dirname(fileURLToPath(import.meta.url));
const RUNTIME_VERSION = "1.2.0";
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const flag = (name) => args.includes(name);

if (flag("--help") || flag("-h")) {
  console.log("Usage: glm-mcp-codex [--key KEY] [--project PATH] [--codex-home PATH] [--user-home PATH] [--no-hook]");
  process.exit(0);
}

const USER_HOME = resolve(option("--user-home") || homedir());
const GLOBAL_CODEX_HOME = resolve(option("--codex-home") || process.env.CODEX_HOME || join(USER_HOME, ".codex"));
const PROJECT = option("--project") ? resolve(option("--project")) : null;
const TARGET_CODEX_HOME = PROJECT ? join(PROJECT, ".codex") : GLOBAL_CODEX_HOME;
const CONFIG = join(TARGET_CODEX_HOME, "config.toml");
const DATA_HOME = resolve(option("--data-dir") || join(GLOBAL_CODEX_HOME, "glm-mcp"));
const SKILL_ROOT = PROJECT ? join(PROJECT, ".agents", "skills") : join(USER_HOME, ".agents", "skills");
const AGENT_DEST = join(TARGET_CODEX_HOME, "agents", "glm.toml");
const HOOK_DEST = join(TARGET_CODEX_HOME, "hooks", "glm_router_hook.mjs");
const SKILL_DEST = join(SKILL_ROOT, "glm-delegate");
const KEY = option("--key") || process.env.GLM_API_KEY || "";
const INSTALL_HOOK = !flag("--no-hook");

const START = "# >>> glm-mcp-codex managed >>>";
const END = "# <<< glm-mcp-codex managed <<<";
const MANAGED = "# Managed by glm-mcp-codex";
const normalize = (path) => path.replace(/\\/g, "/");
const tomlString = (value) => JSON.stringify(normalize(value));

function removeManagedBlock(text) {
  const escapedStart = START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`\\r?\\n?${escapedStart}[\\s\\S]*?${escapedEnd}\\r?\\n?`, "g"), "")
    .replace(/\n{3,}/g, "\n\n");
}

function atomicWrite(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, path);
}

function backup(path) {
  if (existsSync(path)) copyFileSync(path, `${path}.bak-${Date.now()}`);
}

function copyManaged(source, destination) {
  if (existsSync(destination) && !readFileSync(destination, "utf8").includes(MANAGED)) {
    console.log(`  left existing unmanaged file untouched: ${destination}`);
    return false;
  }
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return true;
}

function writeEnv() {
  const envPath = join(DATA_HOME, ".env");
  mkdirSync(DATA_HOME, { recursive: true });
  if (!existsSync(envPath)) {
    atomicWrite(envPath, "# GLM MCP credentials. This file is not read by Codex itself.\nGLM_API_KEY=\nGLM_BASE_URL=https://api.z.ai/api/anthropic\nGLM_MAX_CONCURRENT=1\n");
  }
  if (KEY) {
    let env = readFileSync(envPath, "utf8");
    env = /^GLM_API_KEY=/m.test(env)
      ? env.replace(/^GLM_API_KEY=.*$/m, "GLM_API_KEY=" + KEY)
      : "GLM_API_KEY=" + KEY + "\n" + env;
    atomicWrite(envPath, env);
    console.log("  stored GLM_API_KEY in the private glm-mcp .env file");
  } else if (!/^GLM_API_KEY=\S+/m.test(readFileSync(envPath, "utf8"))) {
    console.log(`  no API key set; add GLM_API_KEY to ${envPath} before delegation`);
  }
  return envPath;
}

function ensureStableRuntime() {
  const packageJson = join(DATA_HOME, "node_modules", "glm-mcp", "package.json");
  const runtime = join(DATA_HOME, "node_modules", "glm-mcp", "src", "index.js");
  const launcher = join(DATA_HOME, "glm-server.mjs");
  let installedVersion = "";
  try {
    installedVersion = JSON.parse(readFileSync(packageJson, "utf8")).version;
  } catch {}

  if (installedVersion !== RUNTIME_VERSION || !existsSync(runtime)) {
    console.log(`  installing stable glm-mcp@${RUNTIME_VERSION} runtime in ${DATA_HOME}`);
    const inheritedNpmCli = process.env.npm_execpath;
    const bundledNpmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
    const npmCli = inheritedNpmCli && existsSync(inheritedNpmCli)
      ? inheritedNpmCli
      : process.platform === "win32" && existsSync(bundledNpmCli)
        ? bundledNpmCli
        : null;
    const command = npmCli ? process.execPath : "npm";
    const commandArgs = npmCli ? [npmCli] : [];
    execFileSync(command, [...commandArgs,
      "install",
      "--prefix", DATA_HOME,
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      "--ignore-scripts",
      "--package-lock=false",
      `glm-mcp@${RUNTIME_VERSION}`,
    ], { stdio: "inherit" });
  }

  copyFileSync(join(SELF, "glm-server.mjs"), launcher);
  return { launcher, runtime };
}

console.log("GLM MCP for Codex");
console.log(`  scope  : ${PROJECT ? `project (${PROJECT})` : "user"}`);
console.log(`  config : ${CONFIG}`);

const envPath = writeEnv();
const stable = ensureStableRuntime();
console.log(`  runtime: ${stable.runtime}`);
copyManaged(join(SELF, "agents", "glm.toml"), AGENT_DEST);
if (INSTALL_HOOK) copyManaged(join(SELF, "hooks", "glm_router_hook.mjs"), HOOK_DEST);

if (existsSync(SKILL_DEST) && !existsSync(join(SKILL_DEST, ".glm-mcp-codex"))) {
  console.log(`  left existing unmanaged skill untouched: ${SKILL_DEST}`);
} else {
  mkdirSync(SKILL_DEST, { recursive: true });
  copyFileSync(join(SELF, "skills", "glm-delegate", "SKILL.md"), join(SKILL_DEST, "SKILL.md"));
  atomicWrite(join(SKILL_DEST, ".glm-mcp-codex"), "glm-mcp-codex\n");
}

const lines = [
  START,
  "# Generated by glm-mcp-codex. Credentials live in " + normalize(envPath) + ".",
  "[mcp_servers.glm]",
  "command = \"node\"",
  "args = [" + tomlString(stable.launcher) + "]",
  "cwd = " + tomlString(DATA_HOME),
  "env_vars = [\"GLM_API_KEY\", \"ANTHROPIC_AUTH_TOKEN\"]",
  "startup_timeout_sec = 20",
  "tool_timeout_sec = 1800",
  "default_tools_approval_mode = \"prompt\"",
  "required = false",
  "",
  "[mcp_servers.glm.tools.glm_status]",
  "approval_mode = \"approve\"",
  "",
  "[mcp_servers.glm.tools.glm_recommend]",
  "approval_mode = \"approve\"",
];

if (INSTALL_HOOK) {
  const hookCommand = "node \"" + normalize(HOOK_DEST) + "\"";
  lines.push(
    "",
    "[[hooks.UserPromptSubmit]]",
    "[[hooks.UserPromptSubmit.hooks]]",
    "type = \"command\"",
    "command = " + tomlString(hookCommand),
    "timeout = 5",
    "statusMessage = \"Considering GLM delegation\"",
    "",
    "[[hooks.PreToolUse]]",
    "matcher = \"^(Bash|apply_patch)$\"",
    "[[hooks.PreToolUse.hooks]]",
    "type = \"command\"",
    "command = " + tomlString(hookCommand),
    "timeout = 5",
    "statusMessage = \"Considering GLM delegation\"",
  );
}
lines.push(END, "");

const previous = existsSync(CONFIG) ? readFileSync(CONFIG, "utf8") : "";
if (existsSync(CONFIG)) backup(CONFIG);
const prefix = removeManagedBlock(previous).trimEnd();
atomicWrite(CONFIG, prefix + (prefix ? "\n\n" : "") + lines.join("\n"));

console.log("\nInstalled:");
console.log(`  MCP config  ${CONFIG}`);
console.log(`  GLM agent   ${AGENT_DEST}`);
console.log(`  GLM skill   ${SKILL_DEST}`);
if (INSTALL_HOOK) console.log(`  router hook ${HOOK_DEST}`);
console.log("\nNext: restart Codex, review the hook in /hooks, then run glm_status. The server prompts before any mutating GLM tool.");
