---
name: glm-delegate
description: Delegate well-specified, non-sensitive coding, testing, documentation, or text tasks to the GLM MCP server. Do not use for secrets, security work, images, architecture, parallel work, huge context, or long dependent loops.
---

# GLM delegation

Use `mcp__glm__glm_agent` for repository tasks and pass an absolute `workdir`. Use `dry_run: true` when the proposed patch needs review. Use `mcp__glm__glm_delegate` for text-only work. If uncertain, call `mcp__glm__glm_recommend` first.

Never send credentials, proprietary/security-sensitive material, screenshots, or user data to GLM. Report the returned GLM summary and verify important changes with normal project tests.
