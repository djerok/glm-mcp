# GitHub Copilot / VS Code Custom Agents & Subagents — Build Reference (2026)

Research compiled from official docs (VS Code + GitHub Docs), current as of 2026-07.
Goal of this doc: everything needed to hand-write a `.agent.md` custom agent that is
**restricted to a single MCP server's tools** and **usable as a subagent**.

## Sources

- VS Code — Custom agents: https://code.visualstudio.com/docs/agent-customization/custom-agents
- VS Code docs raw: https://raw.githubusercontent.com/microsoft/vscode-docs/main/docs/agent-customization/custom-agents.md
- GitHub Docs — Custom agents configuration: https://docs.github.com/en/copilot/reference/custom-agents-configuration
- GitHub Docs raw: https://raw.githubusercontent.com/github/docs/main/content/copilot/reference/custom-agents-configuration.md
- GitHub Docs — About custom agents (subagents concept): https://docs.github.com/en/copilot/concepts/agents/cloud-agent/about-custom-agents
- GitHub Docs — Create custom agents (repo/org/enterprise paths): https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-custom-agents

---

## TL;DR (the load-bearing facts)

- **File extension:** `.agent.md` (current). Renamed from `.chatmode.md`. Old `.chatmode.md` files should be renamed to `.agent.md`. GitHub Docs also accepts a bare `.md` in the agents folders.
- **Workspace location:** `.github/agents/` (also `.claude/agents/` for Claude-format agents).
- **Global (all workspaces):** `~/.copilot/agents/` (VS Code user-profile agents dir). Add extra dirs with the `chat.agentFilesLocations` setting.
- **MCP tool syntax in `tools:`** — `serverName/toolName` for one tool, `serverName/*` for the whole server. Example: `tools: ['glm/glm_agent']` or `tools: ['glm/*']`. (**Not** `mcp__glm__glm_agent` — that Claude-style prefix form is NOT the Copilot syntax.)
- **Subagents:** put `'agent'` in `tools:` and list callable agents in `agents:` (`['*']` = all, `[]` = none).

---

## 1. Custom agent file

### 1a. Extension / rename

> "Custom agents were previously known as custom chat modes."
> Existing `.chatmode.md` files should be renamed to `.agent.md` to convert them to the new format.

- Current extension: **`.agent.md`**
- Legacy extension: `.chatmode.md` (rename to migrate)
- GitHub Docs lists the extension as **`.md` or `.agent.md`** (a plain `.md` inside `.github/agents/` also works on the GitHub side). For VS Code, use `.agent.md`.

Each agent is a Markdown file with **YAML frontmatter** + a Markdown body.

### 1b. YAML frontmatter fields (complete)

Combined from the VS Code reference table and the GitHub Docs schema. Fields marked
GitHub-only or VS Code-only are noted; unmarked fields work in VS Code.

| Field | Type | What it does |
|---|---|---|
| `description` | string (**required** per GitHub Docs) | Brief description of the agent. In VS Code, shown as placeholder text in the chat input. On GitHub, used for model-based routing. |
| `name` | string (optional) | Display name. If omitted, the file name is used. |
| `tools` | string list (or comma-separated string) | Tools / tool sets available to this agent. Built-in tools, tool-set names, MCP tools, and extension-contributed tools. Restricts the agent to exactly this set. See §4. |
| `agents` | string list | Agent names allowed as **subagents**. `['*']` = allow all, `[]` = block all. Requires `'agent'` in `tools`. See §3. |
| `model` | string OR array | Model to run with. Single name, or a prioritized array (tries each until one is available). See §5. |
| `argument-hint` | string | Hint text shown in the chat input to guide the user. (VS Code / IDEs; **ignored** by Copilot cloud agent on GitHub.com.) |
| `handoffs` | list | Suggested next agents / prompts shown as buttons after a response. See §3b. (**ignored** by Copilot cloud agent on GitHub.com.) |
| `user-invocable` | boolean (default `true`) | Whether the agent appears in the chat agents dropdown / can be picked by a user. |
| `disable-model-invocation` | boolean (default `false`) | Prevents the agent being auto-invoked as a subagent / by task-based routing. Must then be selected manually. |
| `target` | string | Target environment: `vscode` or `github-copilot`. If unset, defaults to both. |
| `mcp-servers` | object | Inline MCP server config(s) the agent should use (define + restrict a server right in the file). GitHub Docs primary; also honored in VS Code frontmatter. See §4c. |
| `metadata` | object | Arbitrary annotation data on the agent (GitHub Docs). |
| `hooks` | object | Hook commands scoped to this agent (VS Code, Preview; needs `chat.useCustomAgentHooks`). |
| `infer` | boolean | **Retired / deprecated.** Use `disable-model-invocation` + `user-invocable` instead. |

GitHub-side hard limit: the prompt body can be a **maximum of 30,000 characters**.

### 1c. Markdown body

Everything after the frontmatter is the agent's system prompt / persona / instructions —
plain Markdown, natural language. Example bodies from the docs:

```markdown
# Planning instructions
You are in planning mode. Your task is to generate an implementation plan for a new
feature or for refactoring existing code.
Don't make any code edits, just generate a plan.
```

---

## 2. File locations

| Scope | Location | Notes |
|---|---|---|
| **Workspace** | `.github/agents/<NAME>.agent.md` | Primary project-level location in VS Code. |
| Workspace (Claude format) | `.claude/agents/<NAME>.md` | VS Code also reads Claude-format subagents here. |
| **User / global (all workspaces)** | `~/.copilot/agents/<NAME>.agent.md` | User-profile agents dir; available in every workspace. (Stored with your VS Code user profile data.) |
| Extra custom dirs | via `chat.agentFilesLocations` setting | Adds more workspace-relative folders VS Code scans for agent files. |
| Repository (GitHub cloud agent) | `.github/agents/<NAME>.md` | Repo-level, for Copilot coding agent on GitHub.com. |
| Organization (GitHub) | `agents/<NAME>.md` in the org's `.github` or `.github-private` repo | Org-wide availability. |
| Enterprise (GitHub) | `/agents/<NAME>.md` in the designated `.github-private` repo | Enterprise-wide availability. |

### Relevant VS Code settings

- **`chat.agentFilesLocations`** — configure additional folders for workspace agent files.
- `chat.useCustomizationsInParentRepositories` — discover agents from a parent repo root (monorepos).
- `chat.useCustomAgentHooks` — enable the Preview `hooks` field.
- `github.copilot.chat.organizationCustomAgents.enabled` — enable org-level agent discovery.

> Historical note: the older *chat modes* feature used the `chat.modeFilesLocations`
> setting and `.github/chatmodes/`. With the rename, the current setting is
> **`chat.agentFilesLocations`** and the folder is **`.github/agents/`**.

---

## 3. Subagents (one agent invoking another)

### 3a. The `agents:` field + the `agent` tool

Two things are required to let an agent call other agents as subagents:

1. Include the built-in **`agent`** tool in `tools:`.
2. List the callable agents in **`agents:`**.

> "If you specify `agents`, ensure the `agent` tool is included in the `tools` property."

- `agents: ['*']` — allow invoking any available agent.
- `agents: []` — block all subagent use.
- `agents: ['Researcher', 'Implementer']` — restrict to named agents.

Each subagent runs in **its own separate context window**, so heavy/irrelevant work is
offloaded without cluttering the main agent's context — the main agent stays focused on
planning/coordination.

**Concrete orchestration example (verbatim from VS Code docs):**

```markdown
---
name: Feature Builder
description: Build features by researching first, then implementing
tools: ['agent']
agents: ['Researcher', 'Implementer']
---
You are a feature builder. For each task:
1. Use the Researcher agent to gather context and find relevant patterns
2. Use the Implementer agent to make actual code changes
```

Here `Feature Builder` is the main agent; `Researcher` and `Implementer` are separate
`.agent.md` files it delegates to. Because `tools: ['agent']` and `agents: [...]` are set,
Copilot spins up each as a subagent.

### 3b. Handoffs

Handoffs are *user-facing* guided transitions (not autonomous calls): after a response,
**buttons** appear to move to a next agent with preserved context and a pre-filled prompt.
Good for Plan → Implement → Review workflows where a human approves each step.

Handoff sub-fields:

- `label` — button text.
- `agent` — target agent id to switch to (use `agent` for the built-in default agent).
- `prompt` — prompt pre-filled / sent to the target.
- `send` — `false` (default) = pre-fill, user clicks send; `true` = auto-submit.
- `model` — optional model override for that step, in `Model Name (vendor)` form.

**Verbatim example:**

```markdown
handoffs:
  - label: Start Implementation
    agent: implementation
    prompt: Now implement the plan outlined above.
    send: false
    model: GPT-5.2 (copilot)
```

Full planning-agent file using a handoff (verbatim):

```markdown
---
description: Generate an implementation plan for new features or refactoring existing code.
name: Planner
tools: ['web/fetch', 'search/codebase', 'search/usages']
model: ['Claude Opus 4.5', 'GPT-5.2']
handoffs:
  - label: Implement Plan
    agent: agent
    prompt: Implement the plan outlined above.
    send: false
---
# Planning instructions
You are in planning mode. Your task is to generate an implementation plan for a new feature or for refactoring existing code.
Don't make any code edits, just generate a plan.
```

> Compatibility: `argument-hint` and `handoffs` are **not supported for the Copilot cloud
> agent on GitHub.com** — they are ignored there. `agents:`/subagents and `handoffs`
> work in VS Code (and agent profiles also apply in JetBrains, Eclipse, Xcode; some
> properties may behave differently or be ignored per environment).

---

## 4. Tools restriction

### 4a. How `tools:` limits capability

`tools:` is an allowlist. The agent may use **only** the tools/tool-sets listed. It can
contain built-in tools, tool-set names, MCP tools, and extension-contributed tools.
Accepts a YAML string array or a comma-separated string.

Built-in / tool-set example (verbatim):

```yaml
tools: ['web/fetch', 'search/codebase', 'search/usages']
```

### 4b. EXACT MCP tool naming (critical)

Reference MCP tools by **server name + slash**:

- **One tool:** `serverName/toolName`
- **Whole server:** `serverName/*`

> "To include all tools of an MCP server, use the `<server name>/*` format."

Verbatim GitHub-Docs example that mixes a normal tool with an MCP tool:

```yaml
tools: ['tool-a', 'tool-b', 'custom-mcp/tool-1']
```

**For an MCP server named `glm` exposing `glm_agent`, `glm_delegate`, etc.:**

- Only the delegate tool:
  ```yaml
  tools: ['glm/glm_agent']
  ```
- Only two specific glm tools:
  ```yaml
  tools: ['glm/glm_agent', 'glm/glm_delegate']
  ```
- The entire glm server (all its tools) and nothing else:
  ```yaml
  tools: ['glm/*']
  ```

Do **NOT** use the Claude Code style `mcp__glm__glm_agent`. In Copilot/VS Code the form is
`glm/glm_agent`. The prefix before the slash is the **MCP server name** as configured
(in `.vscode/mcp.json`, user MCP config, or the inline `mcp-servers` frontmatter), not a
tool-set name and not the `mcp__…` string.

### 4c. Defining + restricting a server inline (`mcp-servers`)

You can declare the MCP server and cap its exposed tools right in the frontmatter, then
allowlist them in `tools:` (verbatim GitHub-Docs example):

```yaml
---
name: my-custom-agent-with-mcp
description: Custom agent description
tools: ['tool-a', 'tool-b', 'custom-mcp/tool-1']
mcp-servers:
  custom-mcp:
    type: 'local'
    command: 'some-command'
    args: ['--arg1', '--arg2']
    tools: ["*"]
    env:
      ENV_VAR_NAME: ${{ secrets.COPILOT_MCP_ENV_VAR_VALUE }}
---

Prompt with suggestions for behavior and output
```

Note the two `tools` here: `mcp-servers.custom-mcp.tools` says which tools the server may
surface; the top-level `tools:` says which of those the agent is allowed to call.

---

## 5. Model pinning

`model` accepts:

- **Single string:** `model: 'Claude Opus 4.5'`
- **Prioritized array:** `model: ['Claude Opus 4.5', 'GPT-5.2']` — tries each in order until an available one is found.
- **Vendor-qualified (used in handoffs):** `Model Name (vendor)`, e.g. `GPT-5.2 (copilot)`, `Claude Sonnet 4.5 (copilot)`.
- **Default:** if unset, the currently selected model in the model picker is used (or, on GitHub cloud agent, the inherited default).

Values are the model display names available in your Copilot model picker (they change as
Copilot adds/removes models), not raw API IDs.

---

## 6. Complete minimal working example

Restricted to a single MCP server (`glm`) and usable as a subagent by other agents.

**File:** `.github/agents/glm-delegate.agent.md` (workspace)
or `~/.copilot/agents/glm-delegate.agent.md` (global, all workspaces).

```markdown
---
name: GLM Delegate
description: Offloads well-specified, self-contained coding subtasks to the cheaper GLM model. Reads, edits, and runs files itself via the glm MCP server.
tools: ['glm/*']
model: 'Claude Opus 4.5'
user-invocable: true
disable-model-invocation: false
---
You are a delegation worker. You may use ONLY the tools from the `glm` MCP server.

For any implementation, codegen, edit, refactor, test, docs, or analysis task:
- Call `glm/glm_agent` with the goal and a `workdir`, and let GLM do the reading,
  writing, and running end-to-end.
- Use `glm/glm_delegate` for pure text/code generation that needs no repo access.
- Do not attempt work outside the glm tools; if a task needs other tools, say so and stop.

Report back a concise summary of what GLM changed and any follow-ups.
```

Why this satisfies the requirements:

- **Restricted to one MCP server:** `tools: ['glm/*']` allows every `glm` tool and nothing
  else (no file, terminal, or search tools). Swap to `tools: ['glm/glm_agent', 'glm/glm_delegate']`
  to narrow further.
- **Usable as a subagent:** `disable-model-invocation: false` (default) lets other agents
  invoke it; `user-invocable: true` also lets you pick it from the dropdown. A parent agent
  enables the call with `tools: ['agent']` + `agents: ['GLM Delegate']` (or `agents: ['*']`).

**Parent agent that delegates to it** — `.github/agents/orchestrator.agent.md`:

```markdown
---
name: Orchestrator
description: Plans work and delegates cheap subtasks to GLM Delegate.
tools: ['agent', 'search/codebase']
agents: ['GLM Delegate']
model: 'Claude Opus 4.5'
---
You coordinate work. Understand the request, then hand well-specified, self-contained
subtasks to the `GLM Delegate` subagent. Do minimal work yourself; delegate whole tasks.
```

---

## Version / naming differences to watch

- **`.chatmode.md` → `.agent.md`** (feature renamed "chat modes" → "custom agents"). Both
  historically exist; author new files as `.agent.md`. GitHub also accepts bare `.md`.
- **`chat.modeFilesLocations` → `chat.agentFilesLocations`**; **`.github/chatmodes/` → `.github/agents/`**.
- **`infer` is retired** → use `user-invocable` + `disable-model-invocation`.
- **`argument-hint` and `handoffs` are ignored by the Copilot cloud agent on GitHub.com**
  (they work in VS Code / IDEs).
- **MCP tool syntax is `server/tool` (or `server/*`)** in Copilot — not the Claude `mcp__server__tool` form.
