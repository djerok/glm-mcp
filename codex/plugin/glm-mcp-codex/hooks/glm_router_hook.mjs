#!/usr/bin/env node
// Advisory plugin hook. The npm installer supplies the MCP runtime itself.

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;

try {
  const event = JSON.parse(input || "{}");
  const prompt = String(event.prompt || "").toLowerCase();
  const safe = /\b(frontend|react|css|component|boilerplate|scaffold|crud|regex|docs?|readme|i18n|unit tests?|lint|refactor|prototype|config)\b/.test(prompt);
  const unsafe = /\b(secret|credential|password|token|api key|private key|security|vulnerab|proprietary|screenshot|image|architecture|parallel|whole codebase|long[- ]running)\b/.test(prompt);
  if (safe && !unsafe) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "GLM routing: this may be suitable for the glm MCP delegate. Use glm_agent for repository work or glm_delegate for text only; never delegate secrets or sensitive material.",
      },
    }));
  }
} catch {}
