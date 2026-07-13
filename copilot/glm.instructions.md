---
applyTo: '**'
---

# GLM delegation

The **glm** MCP server is available in agent mode (`glm_agent`, `glm_delegate`, `glm_recommend`,
`glm_status`). GLM (Zhipu/Z.ai) is **~10× cheaper** than the default model — offload work to it.

- For any implementation / codegen / edit / refactor / test / docs task, call **`glm_agent`** with the
  goal + the absolute repo path (`workdir`) so GLM does it end-to-end on **GLM tokens** — or hand it to
  the **GLM** custom agent (subagent). Prefer this over doing the file work yourself.
- Text-only subtasks also go through **`glm_agent`** (`glm_delegate` is opt-in via GLM_DELEGATE=on).
- **To actually spend GLM tokens (not the default model's), call the glm tools — don't do the work
  inline yourself.**
- Keep on the default model: sensitive/secret code, vision/images, parallel work, very large context
  (>128K), and heavy dependent tool-loops. Unsure? call **`glm_recommend`**.
- `glm_status` shows the GLM usage ledger — proof of GLM tokens spent.
