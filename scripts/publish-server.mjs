#!/usr/bin/env node
// scripts/publish-server.mjs
//
// Staging publisher for the standalone `glm-mcp` npm package.
// Builds a CLEAN publishable copy of the GLM MCP server into a temp dir
// WITHOUT touching the `claude/` or `copilot/` trees (or adding a root
// package.json). After staging it runs `npm pack --dry-run`, scans the
// resulting file list for secrets/junk, and prints the exact command for a
// human to run the actual `npm publish`.
//
// Run:  node scripts/publish-server.mjs

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SERVER_DIR = join(REPO_ROOT, "claude", "glm-mcp");
const PUBLISH_VERSION = "1.2.0"; // standalone glm-mcp npm version (claude/ package.json stays untouched)

// ---------------------------------------------------------------------------
// Sanity: the source server must exist where we expect it.
// ---------------------------------------------------------------------------
if (!existsSync(join(SERVER_DIR, "package.json"))) {
  console.error(`FATAL: ${join(SERVER_DIR, "package.json")} not found.`);
  process.exit(1);
}
if (!existsSync(join(SERVER_DIR, "src", "index.js"))) {
  console.error(`FATAL: ${join(SERVER_DIR, "src", "index.js")} not found.`);
  process.exit(1);
}
if (!existsSync(join(REPO_ROOT, "LICENSE"))) {
  console.error(`FATAL: repo-root LICENSE not found.`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Stage dir.
// ---------------------------------------------------------------------------
const ts = Date.now();
const STAGE = join(tmpdir(), `glm-mcp-publish-${ts}`);
mkdirSync(STAGE, { recursive: true });
console.log(`stage dir: ${STAGE}\n`);

// ---------------------------------------------------------------------------
// Copy: src/, package.json, .env.example (from the server tree),
// plus repo-root LICENSE and the generated README.md.
// ---------------------------------------------------------------------------
cpSync(join(SERVER_DIR, "src"), join(STAGE, "src"), { recursive: true });
cpSync(join(SERVER_DIR, "package.json"), join(STAGE, "package.json"));
cpSync(join(SERVER_DIR, ".env.example"), join(STAGE, ".env.example"));
cpSync(join(REPO_ROOT, "LICENSE"), join(STAGE, "LICENSE"));

// ---------------------------------------------------------------------------
// Rewrite the STAGED package.json (the original in claude/ is left untouched).
// Keep: name, version, type, bin, main, engines, dependencies, scripts.
// Add:  extended description, files, repository, homepage, bugs, license,
//       author, keywords.
// ---------------------------------------------------------------------------
const srcPkg = JSON.parse(readFileSync(join(STAGE, "package.json"), "utf8"));

const stagedPkg = {
  name: srcPkg.name, // "glm-mcp"
  mcpName: "io.github.djerok/glm-mcp", // MCP Registry ownership proof (must match server.json name)
  version: PUBLISH_VERSION,
  type: srcPkg.type, // "module"
  bin: srcPkg.bin, // { "glm-mcp": "src/index.js" }
  main: srcPkg.main, // "src/index.js"
  engines: srcPkg.engines, // { node: ">=18" }
  scripts: srcPkg.scripts || { start: "node src/index.js" },
  dependencies: srcPkg.dependencies, // @modelcontextprotocol/sdk + zod
  description:
    (srcPkg.description || "GLM MCP server.") +
    " Runs standalone via npx glm-mcp for any MCP client.",
  files: ["src/", ".env.example", "README.md", "LICENSE"],
  repository: {
    type: "git",
    url: "git+https://github.com/djerok/glm-mcp.git",
    directory: "claude/glm-mcp",
  },
  homepage: "https://github.com/djerok/glm-mcp#readme",
  bugs: { url: "https://github.com/djerok/glm-mcp/issues" },
  license: "MIT",
  author: "djerok",
  keywords: [
    "mcp",
    "model-context-protocol",
    "glm",
    "zhipu",
    "z.ai",
    "claude",
    "copilot",
    "cost-optimization",
  ],
};

writeFileSync(join(STAGE, "package.json"), JSON.stringify(stagedPkg, null, 2) + "\n");

// ---------------------------------------------------------------------------
// Generate a SHORT stage README.md (~30 lines) for the published package.
// ---------------------------------------------------------------------------
const README = `# glm-mcp

GLM (Zhipu / Z.ai) as a **cheap delegate** for any AI coding agent, exposed as an
[MCP](https://modelcontextprotocol.io) (Model Context Protocol) server over stdio.
This is the **standalone server** behind [\`glm-mcp-claude\`](https://www.npmjs.com/package/glm-mcp-claude)
and [\`glm-mcp-copilot\`](https://www.npmjs.com/package/glm-mcp-copilot) — usable by any MCP client
(Claude Desktop, Cursor, Windsurf, Glama, …).

## Quickstart (any MCP client)

\`\`\`json
{
  "mcpServers": {
    "glm": {
      "command": "npx",
      "args": ["-y", "glm-mcp"],
      "env": { "GLM_API_KEY": "YOUR_ZAI_KEY" }
    }
  }
}
\`\`\`

## Tools

- **\`glm_agent\`** — run GLM as a file-accessing coding agent (read/write/edit/run) on GLM tokens.
- **\`glm_delegate\`** — text-in/text-out subtask on GLM (no file access).
- **\`glm_recommend\`** — free advisory: GLM vs Opus, which model, and why.
- **\`glm_status\`** — free status: peak window, model picks, usage ledger, config health.

## Config

The server boots and answers MCP introspection **without** an API key, but every GLM call needs
\`GLM_API_KEY\` (your Z.ai / Zhipu GLM Coding Plan key — https://z.ai). See [\`.env.example\`](./.env.example)
for all tuning knobs (model picks, peak window, token cap, cost bias, …).

## Full docs

Repo + installers + design notes: **https://github.com/djerok/glm-mcp**

## License

MIT © [djerok](https://github.com/djerok)
`;

writeFileSync(join(STAGE, "README.md"), README);

// ---------------------------------------------------------------------------
// npm pack --dry-run in the stage dir, then SCAN the file list.
// We pass --ignore-scripts so no lifecycle scripts can run during packing.
// ---------------------------------------------------------------------------
// On Windows, npm is a .cmd batch wrapper; spawnSync of a .cmd needs `shell: true`
// (otherwise Node throws EINVAL). The explicit args still come through verbatim.
const pack = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts"], {
  cwd: STAGE,
  encoding: "utf8",
  shell: process.platform === "win32",
});

if (pack.status !== 0) {
  console.error("`npm pack --dry-run` failed:");
  console.error(pack.stdout);
  console.error(pack.stderr);
  process.exit(1);
}

// npm writes the "npm notice <size> <file>" lines to STDERR, and the final
// tarball filename to STDOUT. Combine both for display + parsing.
const combined = `${pack.stdout || ""}\n${pack.stderr || ""}`;
console.log("=== npm pack --dry-run output ===");
console.log(combined.trim());
console.log("");

// Pull out the trailing path token of each "npm notice <size> <file>" line.
const fileList = [];
for (const line of combined.split(/\r?\n/)) {
  const m = line.match(/^npm notice\s+\d+(\.\d+)?[a-zA-Z]*\s+(.+)$/);
  if (m && m[2]) {
    const p = m[2].trim();
    if (p) fileList.push(p);
  }
}

console.log("=== packed files ===");
for (const f of fileList) console.log("  " + f);
console.log("");

// ---------------------------------------------------------------------------
// Secret / junk scan: fail loudly if anything forbidden slips into the tarball.
// ---------------------------------------------------------------------------
const FORBIDDEN = [/(^|\/)\.env$/i, /(^|\/)usage\.jsonl$/i, /(^|\/)node_modules(\/|$)/i];
const offenders = fileList.filter((f) => FORBIDDEN.some((re) => re.test(f)));

if (offenders.length) {
  console.error("SECRET/JUNK SCAN FAILED — refusing to publish:");
  for (const o of offenders) console.error("  " + o);
  process.exit(1);
}
console.log("Secret/junk scan: PASSED (no .env, no usage.jsonl, no node_modules).");
console.log("");

// ---------------------------------------------------------------------------
// Hand off to the human.
// ---------------------------------------------------------------------------
console.log("==========================================================");
console.log("Ready to publish. Stage dir:");
console.log("  " + STAGE);
console.log("");
console.log("Publish with:");
console.log(`  cd "${STAGE}" && npm publish --access public`);
console.log("==========================================================");
