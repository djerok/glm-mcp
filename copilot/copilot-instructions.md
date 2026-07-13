<!-- GLM delegation policy for GitHub Copilot / Copilot Chat (agent mode). -->
<!-- Installed to .github/copilot-instructions.md so Copilot reads it automatically. -->

# GLM delegation

You have the **glm** MCP server available in agent mode, with these tools:
`glm_agent`, `glm_delegate`, `glm_recommend`, `glm_status`. GLM (Zhipu/Z.ai) is **~10× cheaper**
than the default Copilot model — offload work to it to save cost.

- For **any** implementation / codegen / edit / refactor / test / docs task, call **`glm_agent`**
  with the goal + the absolute repo path (`workdir`). GLM reads, writes, edits, and runs the files
  itself, end-to-end, on **GLM tokens**. Prefer this over doing the file work yourself.
- Text-only subtasks also go through **`glm_agent`** (`glm_delegate` is opt-in via GLM_DELEGATE=on).
- **To actually spend GLM tokens (not Copilot's), you must call the glm tools — don't do the work
  inline yourself.** Doing it yourself spends the default model's tokens, not GLM's.
- Keep on the **default model** for: sensitive/secret code, vision/images, parallel work, very large
  context (>128K), and heavy dependent tool-loops. Unsure? call **`glm_recommend`** (free, local).
- `glm_status` shows the GLM usage ledger — proof of how many GLM tokens were actually spent.

Note: for oversight, `glm_agent` supports `dry_run: true` (propose a diff without writing) and returns
a concise summary + stats after each run.
