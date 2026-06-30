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
- A **`.github/copilot-instructions.md`** delegation policy so Copilot offloads to GLM automatically.

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
4. writes `.github/copilot-instructions.md` (the delegation policy).

### Global (all projects)
Set it up once for **every** workspace with `--global`:
```bash
npx glm-mcp-copilot --global --key YOUR_ZAI_API_KEY
```
Global mode writes to VS Code's **user config** instead of one workspace:
- the `glm` server → the **user `mcp.json`** (available in all workspaces), and
- the delegation policy → **user `settings.json`** (`github.copilot.chat.codeGeneration.instructions`).

> The global **server** is reliable across VS Code versions. The global **instructions** setting is
> VS-Code-version-dependent (its exact key is evolving) — if Copilot ignores it in your version, the
> tools are still there; just nudge it ("use glm_agent to…"), or add a repo `.github/copilot-instructions.md`.
> Use `--vscode-user-dir PATH` if your VS Code User folder isn't auto-detected (Insiders/VSCodium/portable).

Then in VS Code: **Reload Window → open Copilot Chat → Agent mode → start the `glm` server** (`MCP: List
Servers`). Ask Copilot to do a coding task; it will call `glm_agent`.

## How it differs from the Claude Code version
Copilot doesn't have Claude Code's *subagents* or *PreToolUse hooks*, so there's no auto-routing hook or
`glm` subagent. Instead:
- **MCP tools** (`glm_*`) are available in **agent mode** and Copilot calls them.
- **`.github/copilot-instructions.md`** steers Copilot to delegate to GLM (the CLAUDE.md equivalent).

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
