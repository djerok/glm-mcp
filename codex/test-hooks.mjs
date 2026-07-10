#!/usr/bin/env node
// Fixture tests for the advisory routing hook. No Codex host or GLM API key required.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = dirname(fileURLToPath(import.meta.url));

function run(file, input) {
  const result = spawnSync(process.execPath, [join(SELF, file)], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

const safe = run("hooks/glm_router_hook.mjs", {
  hook_event_name: "UserPromptSubmit",
  prompt: "Build a React component and add unit tests.",
});
assert.equal(safe.hookSpecificOutput.hookEventName, "UserPromptSubmit");
assert.match(safe.hookSpecificOutput.additionalContext, /glm_agent/);

const sensitive = run("hooks/glm_router_hook.mjs", {
  hook_event_name: "UserPromptSubmit",
  prompt: "Fix the security vulnerability using our private API key.",
});
assert.match(sensitive.hookSpecificOutput.additionalContext, /keep this task in Codex/);

assert.equal(run("hooks/glm_router_hook.mjs", {
  hook_event_name: "UserPromptSubmit",
  prompt: "Use Codex to fix this React component.",
}), null, "explicit user model choices must not be overridden");

const preTool = run("hooks/glm_router_hook.mjs", {
  hook_event_name: "PreToolUse",
  tool_name: "apply_patch",
  turn_id: `fixture-${Date.now()}`,
});
assert.equal(preTool.hookSpecificOutput.hookEventName, "PreToolUse");

const plugin = run("plugin/glm-mcp-codex/hooks/glm_router_hook.mjs", {
  hook_event_name: "UserPromptSubmit",
  prompt: "Refactor this small config file.",
});
assert.equal(plugin.hookSpecificOutput.hookEventName, "UserPromptSubmit");

console.log("CODEX HOOK TEST PASS");
