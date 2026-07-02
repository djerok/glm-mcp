#!/usr/bin/env node
// glm_router_hook.mjs — PreToolUse hook for GitHub Copilot (VS Code agent hooks).
// The Copilot analog of the Claude Code glm_subagent_router hook: before the default
// model does work itself, it nudges delegating to GLM (glm_agent, ~10x cheaper).
// Non-blocking — it only injects advisory context, never denies a tool call.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let raw = "";
try { raw = readFileSync(0, "utf8"); } catch {}
let data = {};
try { data = JSON.parse(raw || "{}"); } catch {}

const tool = String(data.tool_name || "");
const sessionId = String(data.session_id || "");

// "Copilot is about to do real work itself" (not via GLM).
const WORK_TOOLS = new Set([
  "editFiles", "createFile", "deleteFile", "applyPatch",
  "runTerminalCommand", "runCommands", "runInTerminal",
]);

const allow = (extra) =>
  process.stdout.write(JSON.stringify({ continue: true, hookSpecificOutput: { permissionDecision: "allow", ...(extra || {}) }, ...(extra && extra.systemMessage ? { systemMessage: extra.systemMessage } : {}) }));

// Never interfere with GLM's own tools, reads, or anything that isn't direct work.
if (!WORK_TOOLS.has(tool) || /glm/i.test(tool)) { allow(); process.exit(0); }

// Advise only ONCE per session to avoid noise on every edit.
const marker = join(tmpdir(), "glm-router-" + (sessionId || "nosess") + ".flag");
if (sessionId && existsSync(marker)) { allow(); process.exit(0); }
try { if (sessionId) writeFileSync(marker, "1"); } catch {}

const context =
  "GLM router: the default model is about to do this work itself. If this is a well-specified, " +
  "self-contained coding / edit / refactor / test / docs task, delegate it to GLM instead — call " +
  "glm_agent with the goal + the absolute repo path (workdir) so it runs on GLM tokens (~10x cheaper), " +
  "then review the result. Keep sensitive/secret, vision, parallel, very-large-context (>128K), and " +
  "heavy dependent tool-loop work on the default model. Run glm_recommend if unsure.";

process.stdout.write(JSON.stringify({
  continue: true,
  systemMessage: "GLM router: consider delegating this to glm_agent (~10x cheaper).",
  hookSpecificOutput: { permissionDecision: "allow", additionalContext: context },
}));
process.exit(0);
