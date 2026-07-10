#!/usr/bin/env node
// Codex launcher for the shared glm-mcp package.
// It loads a user-owned .env from the configured working directory before
// importing glm-mcp, so package upgrades never overwrite credentials.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function loadEnvFile(path) {
  try {
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch {
    // Credentials may instead be forwarded from the user's environment.
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));

const require = createRequire(import.meta.url);
const runtime = require.resolve("glm-mcp/src/index.js");
await import(pathToFileURL(runtime).href);
