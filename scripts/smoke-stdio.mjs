#!/usr/bin/env node
// scripts/smoke-stdio.mjs
//
// Keyless MCP introspection smoke test for the GLM MCP server.
//
// Spawns the server TWICE in fresh temp dirs with NO GLM_API_KEY in its environment (and no .env
// on disk to be picked up), performs the MCP stdio handshake (initialize -> notifications/
// initialized -> tools/list), and asserts the advertised tool set each time:
//   (1) default env (no GLM_DELEGATE)         -> glm_agent, glm_recommend, glm_status        (3 tools)
//   (2) GLM_DELEGATE=on                       -> glm_delegate, glm_agent, glm_recommend,
//                                                 glm_status                                  (4 tools)
//
// glm_delegate is OPT-IN (default OFF): orchestrators always use glm_agent, which also handles
// text-only tasks. No deps. No network. No key -- the server boots and answers MCP introspection
// without one (a key is only needed for actual GLM calls), which is exactly what this proves.
//
// Usage:
//   node scripts/smoke-stdio.mjs                      # default: <repo>/claude/glm-mcp/src/index.js
//   node scripts/smoke-stdio.mjs /path/to/index.js    # custom server entry (used by CI for codex/glm-server.mjs)

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

// Spawn the server with the given extra env, perform the MCP stdio handshake in a fresh temp cwd,
// and assert tools/list advertises EXACTLY expectedTools (sorted set equality). Resolves with the
// sorted tool list on success; rejects with a descriptive error on mismatch/timeout/early exit.
function runSmoke(extraEnv, expectedTools, label) {
  return new Promise((resolveP, rejectP) => {
    // Fresh temp dir as cwd so the server cannot pick up a stray .env from the repo.
    const workdir = mkdtempSync(join(tmpdir(), `glm-mcp-smoke-${label}-`));

    // child env = process.env MINUS the GLM key AND GLM_DELEGATE (so the "default" run is truly
    // off), then layer in extraEnv (e.g. GLM_DELEGATE=on). glmClient.js treats GLM_API_KEY and
    // ANTHROPIC_AUTH_TOKEN as equivalent keys, so strip both to truly prove keyless boot.
    const env = { ...process.env };
    delete env.GLM_API_KEY;
    delete env.ANTHROPIC_AUTH_TOKEN;
    delete env.GLM_DELEGATE;
    Object.assign(env, extraEnv);

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
      return new Promise((res, rej) => {
        pending.set(id, { resolve: res, reject: rej });
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
        if (msg.error) rej(new Error("[" + label + "] JSON-RPC error " + JSON.stringify(msg.error)));
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

    function killChild() {
      try {
        child.kill("SIGKILL");
      } catch {}
    }

    const watchdog = setTimeout(() => {
      rejectP(new Error("[" + label + "] timed out after " + TIMEOUT_MS + "ms waiting for the MCP handshake"));
      killChild();
    }, TIMEOUT_MS);

    child.on("error", (e) => rejectP(new Error("[" + label + "] could not spawn server: " + e.message)));

    child.on("exit", (code, signal) => {
      if (!handshakeDone) {
        rejectP(
          new Error(
            "[" + label + "] server exited (code=" + code + ", signal=" + signal + ") before tools/list completed" +
            (stderrBuf.trim() ? "\n--- captured stderr ---\n" + stderrBuf.trim() : "")
          )
        );
      }
    });

    (async () => {
      try {
        // 1. initialize (protocolVersion 2024-11-05).
        await request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "glm-smoke", version: "1.0.0" },
        });

        // 2. notifications/initialized (notification; no id, no response).
        notify("notifications/initialized", {});

        // 3. tools/list -> assert the exact tool set.
        const result = await request("tools/list", {});
        handshakeDone = true;
        clearTimeout(watchdog);
        killChild();

        const got = (result.tools || []).map((t) => t.name).sort();
        const want = [...expectedTools].sort();
        const ok = got.length === want.length && got.every((n, i) => n === want[i]);
        if (!ok) {
          throw new Error(
            "[" + label + "] tool set mismatch\n  expected: " + want.join(", ") +
            "\n  got:      " + (got.length ? got.join(", ") : "(none)")
          );
        }
        resolveP(got);
      } catch (e) {
        clearTimeout(watchdog);
        killChild();
        rejectP(e && e.message ? e : new Error(String(e)));
      }
    })();
  });
}

try {
  // (1) Default env (GLM_DELEGATE off) -> 3 tools; glm_delegate is hidden.
  await runSmoke({}, ["glm_agent", "glm_recommend", "glm_status"], "default");

  // (2) GLM_DELEGATE=on -> 4 tools; glm_delegate is exposed.
  await runSmoke({ GLM_DELEGATE: "on" }, ["glm_delegate", "glm_agent", "glm_recommend", "glm_status"], "GLM_DELEGATE=on");

  console.log("SMOKE PASS — default: 3 tools (delegate hidden); GLM_DELEGATE=on: 4 tools.");
  process.exit(0);
} catch (e) {
  console.error("SMOKE FAIL — " + (e && e.message ? e.message : e));
  console.error("  server : " + SERVER_PATH);
  process.exit(1);
}
