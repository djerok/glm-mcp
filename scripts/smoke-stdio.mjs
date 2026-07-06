#!/usr/bin/env node
// scripts/smoke-stdio.mjs
//
// Keyless MCP introspection smoke test for the GLM MCP server.
//
// Spawns `node claude/glm-mcp/src/index.js` in a FRESH temp directory with NO GLM_API_KEY
// in its environment (and no .env on disk to be picked up), then performs the MCP stdio
// handshake (initialize -> notifications/initialized -> tools/list) and asserts the server
// advertises EXACTLY the four glm_* tools: glm_delegate, glm_agent, glm_recommend, glm_status.
//
// No deps. No network. No key. The server boots and answers introspection without one
// (a key is only needed for actual GLM calls), which is exactly what this proves.
//
// Usage:
//   node scripts/smoke-stdio.mjs                      # default: <repo>/claude/glm-mcp/src/index.js
//   node scripts/smoke-stdio.mjs /path/to/index.js    # custom server entry

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DEFAULT_SERVER = join(REPO_ROOT, "claude", "glm-mcp", "src", "index.js");

// Optional first positional arg -> a different server entry (absolute, or relative to cwd).
const arg = process.argv[2];
const SERVER_PATH = arg
  ? isAbsolute(arg) ? arg : resolve(process.cwd(), arg)
  : DEFAULT_SERVER;

const TIMEOUT_MS = 15000;
// Exact set of tools the server must advertise. Order-independent.
const EXPECTED_TOOLS = ["glm_delegate", "glm_agent", "glm_recommend", "glm_status"];

// Fresh temp dir as cwd so the server cannot pick up a stray .env from the repo.
const workdir = mkdtempSync(join(tmpdir(), "glm-mcp-smoke-"));

// child env = process.env MINUS the GLM key. glmClient.js treats GLM_API_KEY and
// ANTHROPIC_AUTH_TOKEN as equivalent keys, so strip both to truly prove keyless boot.
const env = { ...process.env };
delete env.GLM_API_KEY;
delete env.ANTHROPIC_AUTH_TOKEN;

const child = spawn(process.execPath, [SERVER_PATH], {
  cwd: workdir,
  env,
  stdio: ["pipe", "pipe", "pipe"],
});

let stdoutBuf = "";
let stderrBuf = "";
const pending = new Map(); // jsonrpc id -> { resolve, reject }
let nextId = 1;
let handshakeDone = false; // did we reach the tools/list stage?

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + "\n");
}

function request(method, params) {
  const id = nextId++;
  return new Promise((resolveP, rejectP) => {
    pending.set(id, { resolve: resolveP, reject: rejectP });
    send({ jsonrpc: "2.0", id, method, params });
  });
}

function notify(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

function handleLine(line) {
  if (!line) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return; // not a JSON-RPC line (server log noise, etc.)
  }
  if (msg.id !== undefined && pending.has(msg.id)) {
    const { resolve: res, reject: rej } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) rej(new Error("JSON-RPC error " + JSON.stringify(msg.error)));
    else res(msg.result);
  }
}

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdoutBuf += chunk;
  let idx;
  while ((idx = stdoutBuf.indexOf("\n")) >= 0) {
    const line = stdoutBuf.slice(0, idx).trim();
    stdoutBuf = stdoutBuf.slice(idx + 1);
    handleLine(line);
  }
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderrBuf += chunk;
});

function cleanup(code) {
  clearTimeout(watchdog);
  try {
    child.kill("SIGKILL");
  } catch {}
  process.exit(code);
}

function fail(reason) {
  console.error("SMOKE FAIL — " + reason);
  console.error("  server : " + SERVER_PATH);
  console.error("  cwd    : " + workdir);
  if (stderrBuf.trim()) console.error("--- captured stderr ---\n" + stderrBuf.trim());
  cleanup(1);
}

const watchdog = setTimeout(() => {
  fail("timed out after " + TIMEOUT_MS + "ms waiting for the MCP handshake");
}, TIMEOUT_MS);

child.on("error", (e) => fail("could not spawn server: " + e.message));

child.on("exit", (code, signal) => {
  if (!handshakeDone) {
    fail("server exited (code=" + code + ", signal=" + signal + ") before tools/list completed");
  }
});

try {
  // 1. initialize (protocolVersion 2024-11-05) -> await id:1 result.
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "glm-smoke", version: "1.0.0" },
  });

  // 2. notifications/initialized (notification; no id, no response).
  notify("notifications/initialized", {});

  // 3. tools/list (id:2) -> await result, assert the tool set.
  const result = await request("tools/list", {});
  handshakeDone = true;

  const got = (result.tools || []).map((t) => t.name).sort();
  const want = [...EXPECTED_TOOLS].sort();
  const ok = got.length === want.length && got.every((n, i) => n === want[i]);

  if (!ok) {
    fail(
      "tool set mismatch\n  expected: " + want.join(", ") +
      "\n  got:      " + (got.length ? got.join(", ") : "(none)")
    );
  }

  console.log("SMOKE PASS — tools: " + got.join(", "));
  cleanup(0);
} catch (e) {
  fail(e.message);
}
