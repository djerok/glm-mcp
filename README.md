# glm-mcp — run GLM as a cheap delegate for your AI coding agent

Use the **GLM** model (Zhipu / Z.ai) as a **~10× cheaper** delegate inside your AI coding tool.
Two editions, the **same GLM MCP server** underneath — pick your editor:

<p align="center">
  <a href="claude/"><img src="https://img.shields.io/badge/▶_Claude_Code-glm--mcp--claude-d97757?style=for-the-badge&logo=anthropic&logoColor=white" alt="Claude Code edition"></a>
  &nbsp;&nbsp;
  <a href="copilot/"><img src="https://img.shields.io/badge/▶_GitHub_Copilot-glm--mcp--copilot-24292e?style=for-the-badge&logo=githubcopilot&logoColor=white" alt="GitHub Copilot edition"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/glm-mcp-claude"><img src="https://img.shields.io/npm/v/glm-mcp-claude?label=glm-mcp-claude&color=cb3837&logo=npm" alt="glm-mcp-claude"></a>
  <a href="https://www.npmjs.com/package/glm-mcp-copilot"><img src="https://img.shields.io/npm/v/glm-mcp-copilot?label=glm-mcp-copilot&color=cb3837&logo=npm" alt="glm-mcp-copilot"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
</p>

## Pick your editor

| | 🟠 **Claude Code** → [`claude/`](claude/) | ⚫ **GitHub Copilot (VS Code)** → [`copilot/`](copilot/) |
|---|---|---|
| npm package | `glm-mcp-claude` | `glm-mcp-copilot` |
| Install | `npx glm-mcp-claude --key YOUR_ZAI_KEY` | `npx glm-mcp-copilot --key YOUR_ZAI_KEY` |
| Integration | MCP server + full-tool `glm` subagent + auto-delegation hook + `glm-code` full-GLM launcher | MCP server in **agent mode** + `GLM` custom agent (subagent) + `.instructions.md` delegation policy |
| Tools | `glm_agent` · `glm_delegate` · `glm_recommend` · `glm_status` | *same* |
| Docs | **[claude/README.md](claude/README.md)** | **[copilot/README.md](copilot/README.md)** |

> Copilot **does** have subagents (custom agents), so that edition ships a `GLM` subagent too — it just
> lacks Claude Code's PreToolUse *hook*, so delegation is driven by the subagent + instructions instead of
> auto-routing. Everything downstream (GLM agent loop, peak-aware routing, cost bias, token cap, usage
> ledger, dry-run oversight) is the **same server**, so behavior is identical once a tool runs.

### Global vs per-project
- **Claude Code** installs **globally by default** (user-scoped MCP server + `~/.claude` agent/hook) — works in every project.
- **GitHub Copilot** — add **`--global`** to configure every workspace at once (writes VS Code's user `mcp.json` + `settings.json`); omit it to set up just the current project:
  ```bash
  npx glm-mcp-copilot --global --key YOUR_ZAI_KEY
  ```

## What it does (both editions)
- Offloads well-specified coding work to GLM — **`glm_agent`** lets GLM read/write/edit/run your repo
  directly, on GLM tokens (~10× cheaper). Your main model orchestrates + verifies.
- **Peak-aware model picks**, a **cost bias** that keeps GLM the default, a **token cap** toggle, a
  **usage ledger** (proof of GLM tokens), and **dry-run** oversight (preview a diff before applying).

## Requirements
- A **Z.ai / Zhipu GLM Coding Plan** API key — https://z.ai (the only paid key needed).
- **Node.js ≥ 18**, plus the editor (Claude Code app, or VS Code + Copilot with agent mode).

## License
[MIT](LICENSE) © [djerok](https://github.com/djerok) · Canonical repo: https://github.com/djerok/glm-mcp
