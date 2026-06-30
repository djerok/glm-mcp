#!/usr/bin/env node
// install-copilot.mjs — set up GLM as a delegate for GitHub Copilot / Copilot Chat (VS Code agent mode).
// Installs the shared GLM MCP server, registers it in the workspace .vscode/mcp.json (VS Code's
// "servers" format), and writes .github/copilot-instructions.md so Copilot delegates to GLM.
// It does NOT touch any Claude Code setup.
//
// Usage:
//   node install-copilot.mjs --key YOUR_ZAI_KEY          # set up in the current workspace
//   node install-copilot.mjs --global --key YOUR_ZAI_KEY # set up for ALL workspaces (VS Code user config)
//   node install-copilot.mjs --workspace PATH            # target another project folder (workspace mode)
//   node install-copilot.mjs --server-dir PATH           # where to install the server (default ~/.glm-mcp)
//   node install-copilot.mjs --vscode-user-dir PATH      # override VS Code User dir (for --global)
//   node install-copilot.mjs --skip-npm

import { cpSync, mkdirSync, existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const SELF = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getFlag = (n) => args.includes(n);
const getOpt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };

const SERVER_HOME = getOpt("--server-dir") || join(homedir(), ".glm-mcp");
const WORKSPACE = getOpt("--workspace") || process.cwd();
const KEY = getOpt("--key") || process.env.GLM_API_KEY || "";
const SKIP_NPM = getFlag("--skip-npm");
const GLOBAL = getFlag("--global");

const log = (s) => console.log(s);
const step = (s) => console.log("\n→ " + s);

// Resolve the VS Code User config dir (for --global). Prefers stable "Code", falls back to Insiders.
function vscodeUserDir() {
  const override = getOpt("--vscode-user-dir");
  if (override) return override;
  const home = homedir();
  const roots =
    process.platform === "win32"
      ? [process.env.APPDATA || join(home, "AppData", "Roaming")]
      : process.platform === "darwin"
      ? [join(home, "Library", "Application Support")]
      : [join(home, ".config")];
  const cands = [];
  for (const r of roots) for (const app of ["Code", "Code - Insiders", "VSCodium"]) cands.push(join(r, app, "User"));
  return cands.find(existsSync) || cands[0];
}

log("GLM-for-Copilot installer" + (GLOBAL ? " (GLOBAL — all workspaces)" : ""));
log("  server    : " + join(SERVER_HOME, "glm-mcp"));
log(GLOBAL ? "  scope     : all VS Code workspaces (user config)" : "  workspace : " + WORKSPACE);

// 1. Install the shared MCP server (skip node_modules/.env/usage.jsonl).
step("Installing the GLM MCP server");
mkdirSync(SERVER_HOME, { recursive: true });
cpSync(join(SELF, "glm-mcp"), join(SERVER_HOME, "glm-mcp"), {
  recursive: true,
  filter: (src) => {
    const b = src.split(/[\\/]/).pop();
    return b !== "node_modules" && b !== ".env" && b !== "usage.jsonl";
  },
});

// 2. .env (API key)
step("Setting up .env");
const envPath = join(SERVER_HOME, "glm-mcp", ".env");
if (!existsSync(envPath)) copyFileSync(join(SERVER_HOME, "glm-mcp", ".env.example"), envPath);
if (KEY) {
  let env = readFileSync(envPath, "utf8");
  env = /^GLM_API_KEY=/m.test(env) ? env.replace(/^GLM_API_KEY=.*$/m, "GLM_API_KEY=" + KEY) : "GLM_API_KEY=" + KEY + "\n" + env;
  writeFileSync(envPath, env);
  log("  wrote GLM_API_KEY into .env");
} else if (!/^GLM_API_KEY=\S+/m.test(readFileSync(envPath, "utf8"))) {
  log("  ⚠ No API key yet — edit " + envPath + " and set GLM_API_KEY=... (a Z.ai GLM Coding Plan key).");
}

// 3. npm install
if (!SKIP_NPM) {
  step("Installing dependencies (npm install)");
  execSync("npm install --no-audit --no-fund", { cwd: join(SERVER_HOME, "glm-mcp"), stdio: "inherit" });
}

// 4 & 5. Register the server + delegation policy — globally (all workspaces) or in this workspace.
const idx = join(SERVER_HOME, "glm-mcp", "src", "index.js").replace(/\\/g, "/");

function mergeMcp(mcpPath) {
  mkdirSync(dirname(mcpPath), { recursive: true });
  let mcp = {};
  if (existsSync(mcpPath)) {
    try { mcp = JSON.parse(readFileSync(mcpPath, "utf8")); } catch { mcp = {}; }
    writeFileSync(mcpPath + ".bak-" + Date.now(), readFileSync(mcpPath));
  }
  mcp.servers ||= {};
  mcp.servers.glm = { type: "stdio", command: "node", args: [idx] };
  writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + "\n");
  return mcpPath;
}

const CONCISE_POLICY =
  "GLM delegation: prefer the glm MCP tools. For any coding / edit / refactor / test / docs task, call " +
  "glm_agent with the goal + the absolute repo path (workdir) so GLM does it end-to-end on GLM tokens " +
  "(~10x cheaper) — don't do the file work yourself when GLM can. Use glm_delegate for pure text. Keep " +
  "sensitive/secret code, vision, parallel work, >128K context, and heavy dependent tool-loops on the " +
  "default model. Run glm_status for the GLM usage ledger.";

if (GLOBAL) {
  const userDir = vscodeUserDir();
  step("Registering glm GLOBALLY (VS Code user mcp.json) -> " + userDir);
  log("  " + mergeMcp(join(userDir, "mcp.json")));

  step("Adding GLOBAL Copilot instructions (VS Code user settings.json)");
  const setPath = join(userDir, "settings.json");
  let settings = {};
  if (existsSync(setPath)) {
    try { settings = JSON.parse(readFileSync(setPath, "utf8")); } catch { settings = {}; }
    writeFileSync(setPath + ".bak-" + Date.now(), readFileSync(setPath));
  }
  const K = "github.copilot.chat.codeGeneration.instructions";
  const arr = Array.isArray(settings[K]) ? settings[K] : [];
  if (!arr.some((e) => e && typeof e.text === "string" && e.text.includes("glm_agent"))) {
    arr.push({ text: CONCISE_POLICY });
    settings[K] = arr;
    writeFileSync(setPath, JSON.stringify(settings, null, 2) + "\n");
    log("  added to " + setPath);
  } else {
    log("  policy already present");
  }
} else {
  step("Registering the glm server in VS Code (workspace .vscode/mcp.json)");
  log("  " + mergeMcp(join(WORKSPACE, ".vscode", "mcp.json")));

  step("Adding delegation policy (workspace .github/copilot-instructions.md)");
  const ghDir = join(WORKSPACE, ".github");
  mkdirSync(ghDir, { recursive: true });
  const ciPath = join(ghDir, "copilot-instructions.md");
  const policy = readFileSync(join(SELF, "copilot-instructions.md"), "utf8");
  const existing = existsSync(ciPath) ? readFileSync(ciPath, "utf8") : "";
  if (!existing.includes("glm_agent")) {
    writeFileSync(ciPath, existing + (existing ? "\n\n" : "") + policy);
    log("  " + ciPath);
  } else {
    log("  policy already present (left as-is)");
  }
}

log("\n✅ Done. Next steps:");
log("  1. Ensure GLM_API_KEY is set in " + envPath);
log("  2. In VS Code: Reload Window, open Copilot Chat, switch to Agent mode.");
log("  3. Start the 'glm' server: run 'MCP: List Servers' (or VS Code will offer to start it).");
log("  4. Ask Copilot to do a coding task — it will call glm_agent. Run glm_status for the GLM usage ledger.");
log(
  GLOBAL
    ? "\nGLOBAL mode: the glm server + delegation policy now apply to ALL your VS Code workspaces."
    : "\nWorkspace mode: current project only. Re-run with --global to apply to every project."
);
