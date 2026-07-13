---
name: glm-delegate
description: Delegate well-specified, non-sensitive coding, testing, documentation, or text tasks to the GLM MCP server. Use when GLM can own a self-contained subtask; do not use for secrets, security work, images, architecture, parallel work, huge context, or long dependent loops.
---

# GLM delegation

1. Check the task is safe to send to GLM. Keep credentials, proprietary or security-sensitive material, screenshots, architecture decisions, highly parallel work, very large context, and long debugging loops in Codex.
2. For repo work, call `mcp__glm__glm_agent` with an explicit task and absolute `workdir`. Use `dry_run: true` first when a patch needs review.
3. Text-only work also goes through `mcp__glm__glm_agent` (give it a task with no file edits). (`mcp__glm__glm_delegate` exists only when the server is started with GLM_DELEGATE=on.)
4. If fit is unclear, call the free local `mcp__glm__glm_recommend` tool before delegating.
5. Report GLM's summary, changed files, and token/cost statistics. Verify important changes with the repository's normal tests.

Do not claim that GLM changed files unless `glm_agent` reported that it did.
