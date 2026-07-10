#!/usr/bin/env node
// Offline integration test for the Codex installer and its shared MCP launcher.

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), "glm-mcp-codex-test-"));
const userHome = join(root, "home");
const codexHome = join(root, "codex-home");
const config = join(codexHome, "config.toml");
const commonArgs = ["--user-home", userHome, "--codex-home", codexHome, "--key", "test-key-not-real"];

function run(script, extra = []) {
  const result = spawnSync(process.execPath, [join(SELF, script), ...commonArgs, ...extra], { encoding: "utf8" });
  assert.equal(result.status, 0, `${script} failed:\n${result.stdout}\n${result.stderr}`);
}

function callStatus(entry, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`MCP status timed out: ${stderr}`));
    }, 5000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        if (message.id === 2) {
          clearTimeout(timeout);
          child.kill();
          resolve(JSON.parse(message.result.content[0].text));
        }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "codex-installer-test", version: "1.0.0" } } }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "glm_status", arguments: {} } }) + "\n");
  });
}

run("install-codex.mjs");
writeFileSync(config, `model = "test-model"\n${readFileSync(config, "utf8")}`, "utf8");
run("install-codex.mjs");

const installed = readFileSync(config, "utf8");
assert.equal((installed.match(/# >>> glm-mcp-codex managed >>>/g) || []).length, 1, "installer must remain idempotent");
assert.match(installed, /tool_timeout_sec = 1800/);
assert.match(installed, /default_tools_approval_mode = "prompt"/);
assert.doesNotMatch(installed, /test-key-not-real/, "credentials must not be stored in config.toml");
const hookCommand = JSON.stringify(`node "${join(codexHome, "hooks", "glm_router_hook.mjs").replace(/\\/g, "/")}"`);
assert.ok(installed.includes(`command = ${hookCommand}`), "hook command must retain shell quotes around its path");
assert.match(readFileSync(join(codexHome, "glm-mcp", ".env"), "utf8"), /GLM_API_KEY=test-key-not-real/);
assert.ok(existsSync(join(codexHome, "agents", "glm.toml")));
assert.ok(existsSync(join(codexHome, "hooks", "glm_router_hook.mjs")));
assert.ok(existsSync(join(userHome, ".agents", "skills", "glm-delegate", "SKILL.md")));

const status = await callStatus(join(SELF, "glm-server.mjs"), join(codexHome, "glm-mcp"));
assert.equal(status.api_key_loaded, true, "launcher must load the private .env before starting glm-mcp");

run("uninstall-codex.mjs");
const removed = readFileSync(config, "utf8");
assert.match(removed, /model = "test-model"/, "uninstall must preserve unrelated config");
assert.doesNotMatch(removed, /glm-mcp-codex managed/);
assert.ok(!existsSync(join(codexHome, "agents", "glm.toml")));
assert.ok(!existsSync(join(codexHome, "hooks", "glm_router_hook.mjs")));
assert.ok(!existsSync(join(userHome, ".agents", "skills", "glm-delegate")));

const project = join(root, "project");
run("install-codex.mjs", ["--project", project]);
assert.ok(existsSync(join(project, ".codex", "config.toml")));
assert.ok(existsSync(join(project, ".codex", "agents", "glm.toml")));
assert.ok(existsSync(join(project, ".codex", "hooks", "glm_router_hook.mjs")));
assert.ok(existsSync(join(project, ".agents", "skills", "glm-delegate", "SKILL.md")));
run("uninstall-codex.mjs", ["--project", project]);
assert.doesNotMatch(readFileSync(join(project, ".codex", "config.toml"), "utf8"), /glm-mcp-codex managed/);

rmSync(root, { recursive: true, force: true });
console.log("CODEX INSTALL TEST PASS");
