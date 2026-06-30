#!/usr/bin/env node
// index.js -- GLM MCP server.
// Exposes GLM (Zhipu/Z.ai) as a delegation subagent for Claude Code via three tools:
//   glm_delegate   -- run a self-contained subtask on GLM and get the result
//   glm_recommend  -- advisory: should this task go to GLM or Opus? which model?
//   glm_status     -- peak window, model picks, cost multipliers, config sanity
//
// Design notes baked in (see docs/research):
//   * "auto" model selection defaults to GLM-5.2 in both windows; since GLM-5.2 carries the
//     ~3x peak surcharge, the router routes less work to GLM during peak.
//   * Calls are serialized through a concurrency gate to respect GLM's ~1-in-flight cap.
//   * Output stays high-signal: a short metadata header + GLM's answer, capped.

import "./loadEnv.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { glmMessage, config } from "./glmClient.js";
import {
  resolveModel,
  recommend,
  isPeak,
  chinaHour,
  peakMultiplier,
  estimateCost,
  MODELS,
  resolveMaxTokens,
  MAXTOK,
  USE_HAIKU,
} from "./router.js";
import { runGlmAgent } from "./glmAgent.js";

const CHARACTER_LIMIT = 50000;

const server = new McpServer({ name: "glm-mcp", version: "1.0.0" });

const TASK_TYPES = [
  // strong GLM
  "frontend", "ui", "boilerplate", "scaffolding", "config", "crud", "regex",
  "docs", "i18n", "type_lint", "unit_test", "refactor_local", "prototype", "toolcall_single",
  // mild GLM
  "sql", "etl", "cicd", "cli", "notebook", "integration_test",
  "algorithm", "research", "summarization", "toolcall_fanout",
  // neutral
  "general", "ml_training",
  // lean / strong Opus
  "iac", "dependency_upgrade", "debugging", "code_review", "perf", "api_integration",
  "migration", "systems", "refactor_large", "architecture", "security",
  "agentic_loop", "toolcall_heavy",
];

// ----------------------------- glm_delegate -----------------------------
server.registerTool(
  "glm_delegate",
  {
    title: "Delegate a subtask to GLM",
    description:
      "Run a SELF-CONTAINED subtask on the GLM model (Zhipu/Z.ai) and return its result. " +
      "Use this to offload cheap, well-specified work (frontend/UI, boilerplate, scaffolding, " +
      "CRUD, local refactors, docs, summarization, algorithmic codegen) from Opus and save cost. " +
      "GLM cannot call Claude's tools, so pass everything it needs in `task` + `context` " +
      "(paste the relevant code/specs). It returns text only. " +
      "Model defaults to 'auto' (GLM-5.2; since GLM-5.2 costs ~3x at China peak, the router routes less to GLM during peak). " +
      "Do NOT use for security-sensitive/proprietary code, subtle long debugging, large multi-step " +
      "refactors, or anything needing parallel agents -- keep those on Opus (call glm_recommend if unsure).",
    inputSchema: {
      task: z
        .string()
        .min(1)
        .describe("The instruction for GLM. Be explicit and self-contained, e.g. 'Write a React component that...'."),
      context: z
        .string()
        .optional()
        .describe("Supporting material GLM needs: code to modify, file contents, specs, examples. GLM has no file access."),
      model: z
        .string()
        .optional()
        .describe("Model id or 'auto' (default). e.g. glm-5.2, glm-4.7, glm-4.5-air. 'auto' picks peak-aware."),
      system: z.string().optional().describe("Optional system prompt to steer GLM's role/format."),
      thinking: z.boolean().optional().describe("Enable GLM reasoning mode for harder tasks (slower). Default false."),
      max_tokens: z.number().int().min(256).max(131072).optional().describe("Max output tokens for this call (a ceiling, not a target — you pay for actual output). By default the cap is OFF (up to 131072, generous). Set GLM_CAP=on in .env to enforce GLM_MAX_TOKENS instead."),
      format: z
        .enum(["concise", "detailed"])
        .optional()
        .describe("'concise' (default) = answer + 1-line meta. 'detailed' = full cost/usage/peak metadata."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async ({ task, context, model = "auto", system, thinking = false, max_tokens, format = "concise" }) => {
    const now = new Date();
    const chosen = resolveModel(model, now);

    const userContent = context ? `${task}\n\n--- CONTEXT ---\n${context}` : task;
    try {
      const { text, usage } = await glmMessage({
        model: chosen,
        system,
        messages: [{ role: "user", content: userContent }],
        maxTokens: resolveMaxTokens(max_tokens),
        thinking,
      });

      const inTok = usage.input_tokens ?? 0;
      const outTok = usage.output_tokens ?? 0;
      const totalTok = inTok + outTok;
      const cost = estimateCost(chosen, inTok, outTok, now);
      const opusCost = estimateCost("claude-opus", inTok, outTok, now);

      // Every output reports how many tokens were delegated to GLM.
      const tokLine = `[GLM delegated ${totalTok} tokens (${inTok} in / ${outTok} out) to ${chosen} — est $${cost}]`;

      let out;
      if (format === "detailed") {
        out =
          `${tokLine}\n[peak=${isPeak(now)} (CN ${chinaHour(now)}:00) | Opus would be ~$${opusCost}, ` +
          `~${opusCost && cost ? Math.round(opusCost / cost) : "?"}x more]\n\n${text}`;
      } else {
        out = `${tokLine}\n\n${text}`;
      }
      return { content: [{ type: "text", text: clip(out) }] };
    } catch (e) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              `GLM delegation failed: ${e.message}\n\n` +
              `Suggested next steps:\n` +
              `- If 'concurrency'/'Too much concurrency': retry shortly; GLM caps in-flight requests (~1). Avoid parallel glm_delegate calls.\n` +
              `- If auth error: check GLM_API_KEY in glm-mcp/.env or .mcp.json env.\n` +
              `- If the task is hard/critical, do it on Opus directly instead of GLM.`,
          },
        ],
      };
    }
  }
);

// ----------------------------- glm_agent -----------------------------
server.registerTool(
  "glm_agent",
  {
    title: "Run GLM as a file-accessing agent",
    description:
      "Run GLM as a REAL coding agent with direct filesystem access. Unlike glm_delegate " +
      "(text-in/text-out), this gives GLM its own tools -- read_file, write_file, edit_file, " +
      "list_dir, run_bash -- and loops, executing GLM's tool calls against your repo until it " +
      "finishes. Use this to hand GLM a self-contained coding task it should carry out end-to-end " +
      "(inspect files, make edits, run tests) at ~10x lower cost than Opus. " +
      "PASS `workdir` = the absolute path of the project/repo to work in. " +
      "Best for bounded, well-specified work; for long dependent agentic loops, large refactors, " +
      "or sensitive correctness-critical changes, prefer Opus (see glm_recommend).",
    inputSchema: {
      task: z.string().min(1).describe("The coding task for GLM to carry out end-to-end in the repo."),
      workdir: z
        .string()
        .optional()
        .describe("Absolute path to the project root GLM should operate in. Defaults to the server's cwd; always pass it explicitly."),
      context: z.string().optional().describe("Optional extra context/constraints (GLM can also read files itself)."),
      model: z.string().optional().describe("Model id or 'auto' (default, peak-aware)."),
      thinking: z.boolean().optional().describe("Enable GLM reasoning mode for harder tasks. Default false."),
      max_tokens: z.number().int().min(256).max(131072).optional().describe("Max output tokens per turn (a ceiling, not a target — you pay for actual output). By default the cap is OFF (up to 131072, generous). Set GLM_CAP=on in .env to enforce GLM_MAX_TOKENS instead."),
      dry_run: z
        .boolean()
        .optional()
        .describe("If true, GLM PROPOSES changes (returns a diff) and writes NOTHING to disk -- for Opus to review/approve before a real apply pass. bash is disabled. Default false."),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
  },
  async ({ task, workdir, context, model = "auto", thinking = false, max_tokens, dry_run = false }) => {
    const now = new Date();
    const chosen = resolveModel(model, now);
    try {
      const r = await runGlmAgent({ model: chosen, task, context, workdir, maxTokens: resolveMaxTokens(max_tokens), thinking, dryRun: dry_run });
      const inTok = r.usage.input_tokens || 0;
      const outTok = r.usage.output_tokens || 0;
      const totalTok = inTok + outTok;
      const cost = estimateCost(chosen, inTok, outTok, now);
      const opusCost = estimateCost("claude-opus", inTok, outTok, now);
      const xCheaper = cost > 0 ? Math.round(opusCost / cost) : "?";
      const banner = r.dryRun ? "*** DRY RUN — nothing was written; this is GLM's PROPOSED change for you to approve ***\n" : "";
      const header =
        `[GLM agent] ${chosen} | dir=${r.root} | ${r.iters} iterations${r.hitCap ? " (HIT CAP -- may be incomplete)" : ""} | ${r.actions.length} actions | ${r.changedFiles.length} files`;
      const actions = r.actions.length ? `\nActions:\n- ${r.actions.join("\n- ")}` : "";
      const diff = r.diff ? `\n\n=== DIFF (review this) ===\n${r.diff}` : "\n\n(no file changes)";
      const revert = !r.dryRun && r.git && r.git.revertHint ? `\n\nRevert: ${r.git.revertHint}` : "";
      // Prominent stats footer, shown after every glm_agent run finishes.
      const stats =
        `\n\n=== GLM STATS (this subagent) ===\n` +
        `model:      ${chosen}\n` +
        `tokens:     ${totalTok} delegated to GLM (${inTok} in / ${outTok} out)\n` +
        `iterations: ${r.iters}${r.hitCap ? " (hit cap)" : ""}   files changed: ${r.changedFiles.length}\n` +
        `est. cost:  $${cost}  (~${xCheaper}x cheaper than Opus)`;
      return { content: [{ type: "text", text: clip(`${banner}${header}${actions}${diff}${revert}\n\n=== GLM SUMMARY ===\n${r.text}${stats}`) }] };
    } catch (e) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text:
              `GLM agent failed: ${e.message}\n\n` +
              `- 'concurrency'/'Too much concurrency': retry shortly (GLM caps in-flight ~1).\n` +
              `- auth error: check GLM_API_KEY.\n` +
              `- If GLM is looping or the task is hard/critical, run it on Opus instead.`,
          },
        ],
      };
    }
  }
);

// ----------------------------- glm_recommend -----------------------------
server.registerTool(
  "glm_recommend",
  {
    title: "Recommend GLM vs Opus for a task",
    description:
      "Cheap, no-API advisory. Given a task profile, returns whether to route to GLM or Opus, " +
      "which GLM model to use, a confidence score, and reasons. Call this before delegating when " +
      "unsure. It factors in task type, complexity, sensitivity, parallelism needs, and the current " +
      "China peak-billing window. Runs locally -- no tokens spent on GLM.",
    inputSchema: {
      task_type: z.enum(TASK_TYPES).optional().describe("Closest task category. Default 'general'. Note tool-calling splits into toolcall_single/toolcall_fanout (GLM-ok) vs toolcall_heavy/agentic_loop (Opus)."),
      complexity: z.enum(["low", "medium", "high"]).optional().describe("Default 'medium'."),
      sensitive: z.boolean().optional().describe("True if proprietary/security-critical (forces Opus)."),
      needs_parallel: z.boolean().optional().describe("True if it needs several concurrent agents (forces Opus)."),
      long_horizon: z.boolean().optional().describe("True if many sequential steps / multi-hour autonomy."),
      latency_sensitive: z.boolean().optional().describe("True if a tight interactive loop (forces Opus)."),
      vision: z.boolean().optional().describe("True if input includes images/screenshots/GUI/computer-use (forces Opus)."),
      input_tokens: z.number().int().optional().describe("Approx context size needed. >128K forces Opus (GLM degrades past ~100K)."),
      steps: z.number().int().optional().describe("Approx number of dependent sequential steps. >20 forces Opus (goal drift)."),
      tool_pattern: z.enum(["none", "single", "fanout", "heavy"]).optional().describe("Tool-use shape: single one-shot call / short independent fanout (GLM-ok) vs heavy dependent agentic loop (forces Opus)."),
      unfamiliar_api: z.boolean().optional().describe("True if it uses a niche/post-cutoff/internal API GLM can't know (-2; paste docs or use Opus)."),
      chinese: z.boolean().optional().describe("True if Chinese or Chinese-English bilingual (GLM strength, +1)."),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ task_type, complexity, sensitive, needs_parallel, long_horizon, latency_sensitive, vision, input_tokens, steps, tool_pattern, unfamiliar_api, chinese }) => {
    const now = new Date();
    const rec = recommend(
      {
        taskType: task_type,
        complexity,
        sensitive,
        needsParallel: needs_parallel,
        longHorizon: long_horizon,
        latencySensitive: latency_sensitive,
        vision,
        inputTokens: input_tokens,
        steps,
        toolPattern: tool_pattern,
        unfamiliarApi: unfamiliar_api,
        chinese,
      },
      now
    );
    const body = {
      decision: rec.engine.toUpperCase(),
      glm_model: rec.engine === "glm" ? rec.model : null,
      confidence: rec.confidence,
      peak_now: isPeak(now),
      china_hour: chinaHour(now),
      reasons: rec.reasons,
    };
    return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
  }
);

// ----------------------------- glm_status -----------------------------
server.registerTool(
  "glm_status",
  {
    title: "GLM status & config",
    description:
      "Report current peak window, peak-aware model picks, cost multiplier, and config sanity " +
      "(base URL, whether an API key is loaded, concurrency cap). No GLM tokens spent.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const now = new Date();
    const status = {
      china_hour: chinaHour(now),
      peak_now: isPeak(now),
      flagship_multiplier: `${peakMultiplier(now)}x`,
      auto_model_now: resolveModel("auto", now),
      models: { offpeak: MODELS.OFFPEAK_MODELS.join(", "), peak: MODELS.PEAK_MODELS.join(", "), cheap: MODELS.CHEAP_MODEL },
      base_url: config.BASE_URL,
      api_key_loaded: config.hasKey,
      max_concurrent: config.MAX_CONCURRENT,
      use_haiku_subagent: USE_HAIKU,
      orchestration: USE_HAIKU
        ? "Haiku `glm` subagent allowed (spends some Claude tokens to orchestrate)."
        : "Direct GLM only (GLM_USE_HAIKU=off) -> call glm_agent directly; keeps all tokens on GLM.",
      max_tokens: {
        cap_enabled: MAXTOK.capEnabled,
        default_per_call: resolveMaxTokens(undefined),
        cap_value_when_on: MAXTOK.capValue,
        hard_ceiling: MAXTOK.uncappedMax,
      },
      note: config.hasKey
        ? "Ready."
        : "No API key loaded -- set GLM_API_KEY in glm-mcp/.env or .mcp.json env before delegating.",
    };
    return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
  }
);

function clip(s) {
  return s.length > CHARACTER_LIMIT ? s.slice(0, CHARACTER_LIMIT) + "\n…[truncated to fit context]" : s;
}

const transport = new StdioServerTransport();
await server.connect(transport);
