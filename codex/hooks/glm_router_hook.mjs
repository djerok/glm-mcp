#!/usr/bin/env node
// Managed by glm-mcp-codex
// Advisory-only Codex hook. It never blocks, rewrites, or auto-runs a GLM tool.

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let event = {};
try {
  event = JSON.parse(raw || "{}");
} catch {
  process.exit(0);
}

const text = String(event.prompt || "").toLowerCase();
const explicitChoice = /\b(use|with|via|delegate to|run on)\b[^.\n]*\b(glm|codex|gpt|opus|claude)\b/.test(text);
const sensitive = /\b(secret|credential|password|token|api key|private key|oauth|security|vulnerab|proprietary|customer data)\b/.test(text);
const keepOnCodex = sensitive || /\b(screenshot|image|vision|architecture|system design|parallel|multiple agents|entire repo|whole codebase|long[- ]running|heavy tool|agentic loop)\b/.test(text);
const glmFit = /\b(frontend|react|css|component|boilerplate|scaffold|crud|regex|docs?|readme|i18n|locali[sz]|unit tests?|jest|vitest|pytest|lint|typescript|refactor|prototype|config)\b/.test(text);

function emit(eventName, additionalContext) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: eventName, additionalContext },
  }));
}

if (event.hook_event_name === "UserPromptSubmit") {
  if (explicitChoice) process.exit(0);
  if (keepOnCodex) {
    emit("UserPromptSubmit", "GLM routing: keep this task in Codex. Do not send sensitive, visual, architecture-heavy, parallel, huge-context, or long dependent-loop work to GLM.");
  } else if (glmFit) {
    emit("UserPromptSubmit", "GLM routing: this appears well-specified and suitable for delegation. For repo work, consider mcp__glm__glm_agent with the absolute workdir (use dry_run:true for review); text-only work also goes through mcp__glm__glm_agent. If uncertain, call the free mcp__glm__glm_recommend tool. Never delegate secrets or sensitive data.");
  }
  process.exit(0);
}

if (event.hook_event_name === "PreToolUse" && /^(Bash|apply_patch)$/.test(String(event.tool_name || ""))) {
  const marker = join(tmpdir(), `glm-mcp-codex-${event.turn_id || event.session_id || "turn"}.seen`);
  if (!existsSync(marker)) {
    try { writeFileSync(marker, "1"); } catch {}
    emit("PreToolUse", "Before doing routine implementation work directly, consider whether mcp__glm__glm_agent can own the self-contained task. Keep sensitive, visual, architecture-heavy, parallel, and long dependent-loop work in Codex.");
  }
}
