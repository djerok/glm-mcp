# GLM MCP for Codex

Use the shared `glm-mcp` server as a cost-aware delegate in Codex. The package adds a Codex MCP
registration, a `glm` custom agent, a `glm-delegate` skill, and optional advisory routing hooks. It
does not duplicate the MCP core: it depends on the same published `glm-mcp@1.2.0` runtime used by the
other editions.

## Install

From this repository:

```powershell
cd codex
npm install
node install-codex.mjs --key YOUR_ZAI_KEY
```

From npm:

```powershell
npm install -g glm-mcp-codex
glm-mcp-codex --key YOUR_ZAI_KEY
```

The installer writes only its marker-delimited section in `~/.codex/config.toml`, stores credentials
in `~/.codex/glm-mcp/.env`, adds `~/.codex/agents/glm.toml`, and adds the user skill at
`~/.agents/skills/glm-delegate`. It configures a 30-minute tool timeout and prompts before mutating
GLM tools. `glm_status` and `glm_recommend` are pre-approved because they are local read-only calls.

Restart Codex, review the optional hook with `/hooks`, and run `glm_status`. The ChatGPT desktop app,
Codex CLI, and IDE extension share the same MCP configuration.

### Project-scoped install

```powershell
node install-codex.mjs --project C:\path\to\project --key YOUR_ZAI_KEY
```

This writes `.codex/config.toml`, `.codex/agents/glm.toml`, `.codex/hooks/`, and
`.agents/skills/glm-delegate` inside that project. Codex must trust the project before using its
configuration.

## Use

- Ask Codex to use the **glm** agent for an explicit, self-contained subtask.
- Call `mcp__glm__glm_agent` for coding work. Always pass an absolute `workdir`; use `dry_run: true`
  when reviewing a proposed change first.
- Call `mcp__glm__glm_delegate` for text-only work.
- Call `mcp__glm__glm_recommend` when unsure; it does not call the GLM API.

Keep secrets, proprietary or security-sensitive material, images, architecture, highly parallel work,
very large context, and long dependent loops on Codex. Codex sandboxing does not automatically confine
an external MCP process, so grant `glm_agent` approval deliberately.

## Hook and plugin

The installer enables an advisory `UserPromptSubmit`/`PreToolUse` hook by default. It never blocks or
auto-runs GLM; it only suggests delegation. Use `--no-hook` to omit it.

`plugin/glm-mcp-codex/` is a valid Codex plugin bundle for the skill and hook. The npm installer remains
the runtime installation path because it manages the shared `glm-mcp` dependency and private credential
file. The plugin has no embedded credentials and must be trusted before its hook runs.

## Remove

```powershell
node uninstall-codex.mjs
node uninstall-codex.mjs --remove-data  # also delete the private .env and usage data
```

Uninstall removes only files and configuration marked as owned by `glm-mcp-codex`.
