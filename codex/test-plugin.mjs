#!/usr/bin/env node
// Lightweight structural validation for the plugin bundle without external Python dependencies.

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SELF = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SELF, "plugin", "glm-mcp-codex");
const manifestPath = join(ROOT, ".codex-plugin", "plugin.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

assert.equal(manifest.name, "glm-mcp-codex");
assert.equal(manifest.version, "1.2.0");
assert.equal(manifest.skills, "./skills/");
assert.equal(typeof manifest.description, "string");
assert.ok(manifest.description.length > 20);
assert.ok(existsSync(join(ROOT, "hooks", "hooks.json")));
assert.ok(existsSync(join(ROOT, "skills", "glm-delegate", "SKILL.md")));

const hooks = JSON.parse(readFileSync(join(ROOT, "hooks", "hooks.json"), "utf8"));
const command = hooks.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command;
assert.match(command, /\$\{PLUGIN_ROOT\}\/hooks\/glm_router_hook\.mjs/);

const skill = readFileSync(join(ROOT, "skills", "glm-delegate", "SKILL.md"), "utf8");
assert.match(skill, /^---\nname: glm-delegate\ndescription: .+\n---/);

console.log("CODEX PLUGIN TEST PASS");
