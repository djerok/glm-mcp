# GitHub Copilot / VS Code Copilot Chat — MCP, Custom Instructions & Agent Mode

**Research date:** 2026-07-02
**Purpose:** Exact, current facts for an installer that configures VS Code Copilot to use a **local MCP server** and to apply **global custom instructions** (delegate-to-cheaper-model workflow).
**Scope:** Stable VS Code + GitHub Copilot Chat, as of mid-2026 (docs reflect VS Code 1.102+ era customization model). All facts cited to official docs (`code.visualstudio.com`, `docs.github.com`) plus one GitHub community confirmation for the OS paths.

> **TL;DR for the installer**
> - **User (global) MCP config file:** `%APPDATA%\Code\User\mcp.json` (Win) · `~/Library/Application Support/Code/User/mcp.json` (macOS) · `~/.config/Code/User/mcp.json` (Linux). Top-level key is **`"servers"`** (plus optional `"inputs"`). Command to open it: **`MCP: Open User Configuration`**.
> - **Global custom instructions (current, non-deprecated way):** create a `*.instructions.md` file with `applyTo: '**'` and put it in a **user-level** instructions folder that is registered in the `chat.instructionsFilesLocations` setting (e.g. `~/.copilot/instructions`, or add your own path with value `true`). The old `github.copilot.chat.codeGeneration.instructions` **settings array is deprecated as of VS Code 1.102**.

---

## 1. MCP configuration

### 1.1 Exact file paths

**User-level (global) `mcp.json`** — the file behind **`MCP: Open User Configuration`**. It lives directly in the profile's `Code/User/` directory (NOT under a `profiles/<id>/` subfolder, unlike `settings.json`):

| OS | Path |
|----|------|
| **Windows** | `%APPDATA%\Code\User\mcp.json`  →  `C:\Users\<you>\AppData\Roaming\Code\User\mcp.json` |
| **macOS** | `~/Library/Application Support/Code/User/mcp.json`  →  `/Users/<you>/Library/Application Support/Code/User/mcp.json` |
| **Linux** | `~/.config/Code/User/mcp.json`  →  `$HOME/.config/Code/User/mcp.json` |

**VS Code Insiders** substitutes `Code - Insiders` for `Code` in all three paths (e.g. `%APPDATA%\Code - Insiders\User\mcp.json`).

> Docs quote: *"MCP server configuration is stored in the `mcp.json` JSON file. This file can be in your workspace (`.vscode/mcp.json`) or in your user profile."* — The official docs deliberately steer you to the **`MCP: Open User Configuration`** command rather than a hardcoded path, but the OS paths above are confirmed by the community discussion and match VS Code's user-data layout. **Recommended installer behavior:** write the file at the OS path above, but also document the command as the user-facing "source of truth."

**Workspace-level `mcp.json`:**
```
<workspace-root>/.vscode/mcp.json
```

**Related location note:** `settings.json` for a non-default profile lives under `Code/User/profiles/<profile ID>/settings.json` — but `mcp.json` for the default profile sits at `Code/User/mcp.json`. Don't confuse the two.

### 1.2 JSON schema

**Top-level keys:**
- **`"servers"`** — object; map of `serverName → serverConfig`. (This is the key. Note: the older/global VS Code *settings.json* used `"mcp": { "servers": {...} }`, but the dedicated `mcp.json` file uses `"servers"` at the top level.)
- **`"inputs"`** — optional array; placeholder prompts for secrets (see 1.3).
- **`"sandbox"`** — optional object; macOS/Linux only.

**stdio server fields:** `type` (`"stdio"`), `command`, `args`, `cwd`, `env`, `envFile`, `dev`, `sandboxEnabled`.

**Minimal stdio example (verbatim from docs):**
```json
{
  "servers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

**Fuller stdio example with explicit type + env (recommended shape for the installer):**
```json
{
  "servers": {
    "glm": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\path\\to\\glm-mcp\\server.js"],
      "env": {
        "GLM_API_KEY": "${input:glm-key}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "glm-key",
      "description": "GLM (Zhipu/Z.ai) API Key",
      "password": true
    }
  ]
}
```
> Note: `type` may be omitted for stdio (it is the default when `command` is present), but including `"type": "stdio"` is explicit and safe. On Windows JSON, backslashes in paths must be escaped (`\\`) or use forward slashes.

**HTTP / SSE server fields:** `type` (`"http"` or `"sse"`), `url`, `headers`, `oauth`. The `oauth` object takes `clientId` (required) and `enterpriseManaged` (optional boolean).

**HTTP example (verbatim from docs):**
```json
{
  "servers": {
    "slack": {
      "type": "http",
      "url": "https://mcp.slack.com/mcp",
      "oauth": {
        "clientId": "example-client-id"
      }
    }
  }
}
```

**Dev-mode fields (`dev` key on a server):** `watch` (glob pattern[s] to restart on file change) and `debug` (Node.js/Python only). Useful if the installer targets local dev of the MCP server itself.

### 1.3 Inputs (secrets / prompts)

`"inputs"` is an array of input definitions referenced elsewhere via `${input:<id>}`. Purpose (docs): *"Input variables let you define placeholders for configuration values, avoiding the need to hardcode sensitive information like API keys or passwords directly in the server configuration."*

Input `type` values: **`promptString`**, **`pickString`**, **`command`**.

**Verbatim docs example:**
```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "perplexity-key",
      "description": "Perplexity API Key",
      "password": true
    }
  ],
  "servers": {
    "perplexity": {
      "type": "stdio",
      "command": "npx",
      "env": {
        "PERPLEXITY_API_KEY": "${input:perplexity-key}"
      }
    }
  }
}
```
For a **local** server with a key from the environment, an alternative to `inputs` is `envFile` (point at a `.env`), or just inline non-secret `env`. For secrets, prefer `inputs` + `${input:...}` so nothing is stored in plaintext in the JSON.

### 1.4 How servers start (autostart / manual / trust)

- **No silent autostart by default.** Docs: *"When you add an MCP server or change its configuration, VS Code needs to (re)start the server."* There is an **experimental `chat.mcp.autoStart` setting** to auto-start servers; otherwise start is user-initiated (via the CodeLens/Start action in `mcp.json`, or `MCP: List Servers`).
- **Trust prompt on first run.** Docs: *"VS Code shows a dialog to confirm that you trust the server when you start a server for the first time. In the dialog, select the link to the MCP server to review its configuration."* If declined: *"it will not be started, and chat requests will continue without using the tools."*
- **Exception:** *"If you start the MCP server directly from the `mcp.json` file, you will not be prompted to trust the server configuration"* (editing + starting from the file is treated as implicit trust).
- **Management commands:**
  - **`MCP: Open User Configuration`** — open the user-profile `mcp.json`.
  - **`MCP: Add Server`** — guided add; choose **Workspace** or **Global** as target.
  - **`MCP: List Servers`** — *"List all configured MCP servers and perform actions like start, stop, restart."*
  - **`MCP: Reset Trust`** — *"reset trust decisions for MCP servers, requiring re-confirmation on next start."*
  - **`MCP: Reset Cached Tools`** — *"Clear the cached list of tools for MCP servers."*
- **CLI install (great for an installer):**
  ```bash
  code --add-mcp "{\"name\":\"my-server\",\"command\": \"uvx\",\"args\": [\"mcp-server-fetch\"]}"
  ```
  JSON form: `{"name":"server-name","command":...,"args":[...]}`. (On Windows, mind quote-escaping per shell.)

### 1.5 How MCP tools are named / surfaced in agent mode

- MCP tools appear in the **Tools picker** (open via the **Configure Tools** button in the chat input, in **Agent** mode). Tools are **grouped under their MCP server name**; you can enable/disable an entire server or individual tools.
- **Reference syntax:** type **`#`** in the chat input to list/insert tools (e.g. `#codebase`, `#web`); for MCP tools the reference follows the **server-name + tool-name** pattern.
- **Hard limit:** *"A chat request can have a maximum of 128 tools enabled at a time."* Error text: *"Cannot have more than 128 tools per request."* Mitigations: deselect tools/servers in the picker, or enable **virtual tools** via **`github.copilot.chat.virtualTools.threshold`** (auto-groups tools when the count is large; introduced v1.103).
- Tool sets can be defined in a `.jsonc` file to group tools (referenced like `#reader`).

---

## 2. Custom instructions — GLOBAL (all workspaces), current non-deprecated way

### 2.1 Deprecation status of the settings-array approach

- **`github.copilot.chat.codeGeneration.instructions`** (and the test-generation equivalent) is **DEPRECATED as of VS Code 1.102.** Docs: *"Settings-based code generation and test generation instructions are deprecated as of VS Code 1.102. Use file-based instructions instead."*
- **Replacement:** **file-based instructions** — `*.instructions.md` files (path-scoped via `applyTo`) and/or the repo-level `.github/copilot-instructions.md`.

### 2.2 `.instructions.md` files — frontmatter & the `applyTo` glob

Markdown files with the **`.instructions.md`** extension. Optional YAML frontmatter controls when they apply; body is Markdown.

**Frontmatter fields:**
- `name` — optional, display name (defaults to filename).
- `description` — optional, shown on hover.
- `applyTo` — optional **glob**; files the instructions auto-apply to. **Use `**` to always apply.** If `applyTo` is omitted, the file is **not** auto-applied.

**Verbatim example:**
```markdown
---
name: 'Python Standards'
description: 'Coding conventions for Python files'
applyTo: '**/*.py'
---
# Python coding standards
- Follow the PEP 8 style guide.
- Use type hints for all function signatures.
```
Comma-separated globs are allowed, e.g. `applyTo: "**/*.ts,**/*.tsx"`.

### 2.3 Where instruction files live (workspace vs user/global) + `chat.instructionsFilesLocations`

- **Workspace scope (default):** `.github/instructions/` (files `*.instructions.md`). Applies only to that workspace.
- **User (global) scope:** available across all workspaces. Docs list these user-profile locations: **`~/.copilot/instructions`**, **`~/.claude/rules`**, *"or your user data (specific to your VS Code profile)."*

**Setting key:** **`chat.instructionsFilesLocations`** — an **object mapping folder-glob → boolean** (enable/disable each location).

**Default value:** `{ ".github/instructions": true }`.

**Example (verbatim shape from docs) enabling user-global folders:**
```json
"chat.instructionsFilesLocations": {
  ".github/instructions": true,
  ".claude/rules": true,
  "~/.copilot/instructions": true,
  "~/.claude/rules": true
}
```

**➡️ How to make instructions apply to EVERY workspace (recommended installer recipe):**
1. Set **`chat.instructionsFilesLocations`** in the **user** `settings.json` to include a user-level folder with value `true` — either use the built-in `~/.copilot/instructions`, or add your own absolute/`~` path.
2. Put a file like `delegate.instructions.md` in that folder with `applyTo: '**'` so it applies to all files in all workspaces.
3. (Alternative UI path) Run **`Chat: New Instructions File`** → choose **New Instructions (User)** to have VS Code create it in the user-data instructions location for the active profile.

> Caveat: because one user location is `~/.claude/rules`, and this repo already uses `~/.claude`, be careful not to collide with unrelated Claude rules. Prefer a dedicated folder (e.g. `~/.copilot/instructions`) that you explicitly register.

> `settings.json` (where you put `chat.instructionsFilesLocations`) user paths: `%APPDATA%\Code\User\settings.json` (Win), `~/Library/Application Support/Code/User/settings.json` (macOS), `~/.config/Code/User/settings.json` (Linux) for the default profile; non-default profiles nest under `User/profiles/<id>/settings.json`.

### 2.4 Workspace `.github/copilot-instructions.md` + `useInstructionFiles`

- **Behavior:** *"VS Code automatically detects a `.github/copilot-instructions.md` Markdown file in the root of your workspace and applies the instructions in this file to all chat requests within this workspace."* This is a single, whole-workspace instructions file (no `applyTo`; always applies within that repo). It is **workspace-only** — not a mechanism for global instructions.
- **Setting:** **`github.copilot.chat.codeGeneration.useInstructionFiles`** — gates the `.github/copilot-instructions.md` file. **Enabled by default** ("on out of the box"); you only touch it to **disable**. A workspace-level `false` overrides the default-on. It affects **chat / agent mode / code review only — NOT inline (ghost-text) completions.**
- This `useInstructionFiles` boolean is **distinct from** the deprecated `...codeGeneration.instructions` **array** (see 2.1). The boolean is current; the array is deprecated.
- **Companion toggles** (current): `chat.useAgentsMdFile` (enable `AGENTS.md`), `chat.useClaudeMdFile` (enable `CLAUDE.md`), `chat.useCustomizationsInParentRepositories` (monorepo parent discovery).

**Precedence / combination:** `.github/copilot-instructions.md`, matching `*.instructions.md` files, and (if enabled) `AGENTS.md`/`CLAUDE.md` are **combined**; no guaranteed ordering — keep instructions self-consistent. You can verify what got applied via the **"Used references"** list on a chat response.

---

## 3. Agent mode — enable + tool invocation/approval

### 3.1 Enable / select agent mode

- **Setting:** **`chat.agent.enabled`** (default effectively on in current builds; may be **org-managed** — an admin policy can disable it). Docs: *"Open the Chat view, sign in to GitHub, set `chat.agent.enabled`, and select **Agent** in the Chat mode dropdown. If you do not see the setting, make sure to reload VS Code after updating to the latest version."*
- **Select it:** open Chat view (**Ctrl+Alt+I** / **⌃⌘I**) and pick **Agent** from the mode/agent dropdown. Modes: **Ask / Edit / Agent** (all now agentic under the hood; "custom chat modes" were renamed **custom agents**).
- If an org policy disables it: the **Agent** option is hidden in the dropdown; only Ask/Edit remain.

### 3.2 How MCP tools are invoked & approved

- **Default = manual approval.** *"By default, tool calls require your review... Every tool invocation is transparently displayed in the UI and requires your approval (except for read-only built-in tools)."* You can approve a tool **for this session, for this workspace, or always** (future invocations).
- **Auto-approve settings (use with caution — they remove security prompts):**
  - **`chat.tools.global.autoApprove`** — auto-approve **all** tools across all workspaces. Toggle from chat via **`/yolo`** or **`/autoApprove`** (disable with `/disableYolo` / `/disableAutoApprove`); first enable shows a warning dialog.
  - **`chat.tools.terminal.autoApprove`** — allow/deny lists for terminal commands (map `command → true/false`).
  - **`chat.tools.urls.autoApprove`** — URL allow patterns (boolean, or `{ approveRequest, approveResponse }`).
  - Permission levels **Bypass Approvals** / **Autopilot** (from the permissions picker) auto-approve all tools for the current session.
- **Reset:** **`Chat: Reset Tool Confirmations`** clears saved approvals.
- **Long-running/terminal note:** the **"Continue"** prompt (keep waiting vs move on after ~20s; monitored up to ~2 min) and **"Continue in Background"** relate to long processes, not to tool trust.

---

## 4. Other relevant functions (for a "delegate to another model" workflow)

### 4.1 Prompt files (`.prompt.md`)

- **Extension:** `.prompt.md`. **Locations:** workspace `.github/prompts/` (default) and user-profile data; additional locations via **`chat.promptFilesLocations`**.
- **Frontmatter fields:** `description`, `name` (invoked as `/name` in chat; defaults to filename), **`agent`** (`ask` | `agent` | `plan` | custom-agent name), **`model`** (which LLM runs it), **`tools`** (allowed tools), `argument-hint`.
  **Verbatim example:**
  ```markdown
  ---
  agent: 'agent'
  model: GPT-4o
  tools: ['search/codebase', 'vscode/askQuestions']
  description: 'Generate a new React form component'
  ---
  ```
- **Run a prompt file:** type `/<name>` in chat · **`Chat: Run Prompt`** from the Command Palette · or the ▶ play button in the `.prompt.md` editor title.

### 4.2 Model picker

- A **language-model picker** in the Chat view selects which model powers the conversation, **independent of the agent/mode**. A prompt file can also pin a model via the `model:` frontmatter field.

### 4.3 Wiring a cost-saving "delegate to another model" workflow (assembly notes)

To route work to a cheaper local model (e.g. a GLM MCP server) inside Copilot:
1. **Register the local MCP server** in the user `mcp.json` (§1.1–1.3) so its tools are available in every workspace; use `inputs` for the API key.
2. **Global custom instruction** (`applyTo: '**'`, in a user-level `chat.instructionsFilesLocations` folder, §2.3) telling the agent *when* to hand tasks to the GLM MCP tool vs. keep them on the premium model — mirrors the existing Claude/GLM router idea, but for Copilot.
3. Optionally ship a **prompt file** (`.prompt.md`) with `agent: 'agent'` + `tools: [...glm tools...]` (and a cheap `model:`) as a one-shot "delegate this" command.
4. In **Agent mode**, approve the GLM MCP tools once (session/workspace/always), or set a scoped auto-approve. Watch the **128-tool limit** if many MCP servers are enabled (use the tools picker or virtual-tools threshold).

---

## Sources

- MCP configuration reference — https://code.visualstudio.com/docs/agents/reference/mcp-configuration
- Add and manage MCP servers in VS Code — https://code.visualstudio.com/docs/agent-customization/mcp-servers
- Use MCP servers in VS Code (Copilot customization) — https://code.visualstudio.com/docs/copilot/customization/mcp-servers
- Use custom instructions in VS Code — https://code.visualstudio.com/docs/agent-customization/custom-instructions
- Customize AI responses / custom instructions (Copilot) — https://code.visualstudio.com/docs/copilot/customization/custom-instructions
- Use prompt files in VS Code — https://code.visualstudio.com/docs/copilot/customization/prompt-files
- Use chat / agent mode in VS Code — https://code.visualstudio.com/docs/copilot/chat/chat-agent-mode
- Use tools in chat (agent tools, 128-tool limit, auto-approve) — https://code.visualstudio.com/docs/copilot/agents/agent-tools
- AI settings reference — https://code.visualstudio.com/docs/copilot/reference/copilot-settings
- July 2025 (v1.103) release notes (virtual tools) — https://code.visualstudio.com/updates/v1_103
- Agent mode available to all users + MCP (blog) — https://code.visualstudio.com/blogs/2025/04/07/agentMode
- GitHub Docs — Adding repository custom instructions — https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions
- GitHub community discussion confirming `%APPDATA%\Code\User\mcp.json` — https://github.com/orgs/community/discussions/187954
