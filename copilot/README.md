# glm-mcp-copilot — GLM as a cheap delegate for GitHub Copilot (VS Code)

Use the **GLM** model (Zhipu / Z.ai) as a **~10× cheaper delegate** inside **GitHub Copilot / Copilot
Chat** (VS Code agent mode). It's the **same GLM MCP server** used by the Claude Code version — Copilot
calls `glm_agent` / `glm_delegate` / `glm_recommend` / `glm_status` to offload work to GLM.

> Sibling package: **[glm-mcp-claude](../claude/README.md)** (the Claude Code version). Same server, different host.

## What you get
- The **glm MCP server** registered in VS Code (agent mode) — tools:
  - **`glm_agent`** — GLM works your repo directly (read/write/edit/run), returns a concise summary + stats.
  - **`glm_delegate`** — GLM drafts text you place.
  - **`glm_recommend`** — free advisory: GLM vs the default model.
  - **`glm_status`** — usage ledger (proof of GLM tokens spent) + config.
- A **`GLM` custom agent (subagent)** — restricted to the `glm` tools, so it *must* delegate to GLM
  (the Copilot analog of the Claude `glm` subagent). Pick it from the chat mode dropdown or hand off to it.
- A **delegation-policy instructions file** so Copilot offloads to GLM automatically.
- A **PreToolUse auto-routing hook** (`glm_router_hook.mjs`) — fires before the default model does work
  itself and nudges delegating to GLM (the Copilot analog of the Claude `glm_subagent_router` hook).
  Installed to `.github/hooks/glm.hooks.json` per-project, or `~/.copilot/hooks/glm.hooks.json` globally.
  Non-blocking (always allows the tool call). VS Code **preview feature**.

## Prerequisites
- **VS Code** with **GitHub Copilot + Copilot Chat**, and **Agent mode** available (MCP support).
- **Node.js ≥ 18**.
- A **Z.ai / Zhipu GLM Coding Plan** API key — https://z.ai (the only paid key needed).

## Install
```bash
# from npm:
npx glm-mcp-copilot --key YOUR_ZAI_API_KEY

# or clone the repo and run the Copilot installer:
git clone https://github.com/djerok/glm-mcp
node glm-mcp/copilot/install-copilot.mjs --key YOUR_ZAI_API_KEY
```
Run it **from your project folder** (it sets up that workspace). It:
1. installs the GLM MCP server to `~/.glm-mcp/glm-mcp/` and runs `npm install`,
2. writes your key to that server's `.env`,
3. registers the server in `.vscode/mcp.json` (VS Code's `servers` format),
4. installs the **`GLM` custom agent** → `.github/agents/glm.agent.md`,
5. writes `.github/copilot-instructions.md` (the delegation policy),
6. installs the **PreToolUse auto-routing hook** → `.github/hooks/glm.hooks.json`.

### Global (all projects)
Set it up once for **every** workspace with `--global`:
```bash
npx glm-mcp-copilot --global --key YOUR_ZAI_API_KEY
```
Global mode writes to VS Code's **user config** instead of one workspace:
- the `glm` server → the **user `mcp.json`** (all workspaces),
- the **`GLM` custom agent** → `~/.copilot/agents/glm.agent.md`,
- the delegation policy → `~/.copilot/instructions/glm.instructions.md` (with `applyTo: '**'`),
- the **PreToolUse auto-routing hook** → `~/.copilot/hooks/glm.hooks.json`,
- and it registers those locations + enables agent mode in **user `settings.json`**
  (`chat.agentFilesLocations`, `chat.instructionsFilesLocations`, `chat.agent.enabled`).

> Uses the current (non-deprecated) instructions mechanism — `.instructions.md` files, **not** the old
> `codeGeneration.instructions` settings array (deprecated in VS Code 1.102; the installer migrates off it).
> Use `--vscode-user-dir PATH` if your VS Code User folder isn't auto-detected (Insiders/VSCodium/portable).

Then in VS Code: **Reload Window → open Copilot Chat → Agent mode → start the `glm` server** (`MCP: List
Servers`). Ask Copilot to do a coding task; it will call `glm_agent`.

## How it differs from the Claude Code version
**Essentially full parity** — Copilot now has all three primitives:
- **`glm_*` MCP tools** in **agent mode** (same server as the Claude edition).
- A **`GLM` custom agent (subagent)** restricted to the `glm` tools — the analog of the Claude `glm`
  subagent (forced to delegate to GLM). Invoke it from the mode dropdown or via an agent handoff.
- A **PreToolUse agent hook** (`glm_router_hook.mjs`) that auto-nudges delegation — the analog of the
  Claude `glm_subagent_router` hook: before the default model does work itself, it suggests delegating
  to `glm_agent` (non-blocking; it only injects advisory context, never denies a tool call).
- **Instructions files** steer delegation (the CLAUDE.md equivalent).

Small differences that remain:
- VS Code hooks **ignore the matcher**, so the hook fires on *every* tool call and filters by
  `tool_name` internally (and advises at most once per session to stay quiet).
- VS Code **hooks are a preview feature**; flip them on in Copilot settings if your build hides them.
- There is **no separate `glm-code` full-GLM launcher** (Claude's standalone all-GLM entry point).

Everything else — the GLM agent loop, peak-aware model pick, cost bias, token cap, usage ledger,
`dry_run` oversight — is the **same server**, so it behaves identically once a tool is called.

## Configuration
Same `.env` knobs as the Claude version, in `~/.glm-mcp/glm-mcp/.env`:
`GLM_API_KEY`, `GLM_BASE_URL`, `GLM_COST_BIAS`, `GLM_CAP`, `GLM_MAX_TOKENS`, `GLM_OFFPEAK_MODEL` /
`GLM_PEAK_MODEL`, etc. See `glm-mcp/.env.example`.

## Verifying GLM usage
`glm_status` (or `~/.glm-mcp/glm-mcp/usage.jsonl`) logs every GLM call (model + tokens) — independent
proof that work ran on GLM, not Copilot's default model.

## Security
- Your key lives in `~/.glm-mcp/glm-mcp/.env` (git-ignored) — not committed, not in the npm package.
- GLM routes through servers in China — keep secrets/regulated code on the default model.

## License
[MIT](LICENSE) © [djerok](https://github.com/djerok) · Canonical repo: https://github.com/djerok/glm-mcp
