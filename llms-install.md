# Installing glm-mcp (guide for AI agents / Cline)

`glm-mcp` is a local **stdio** MCP server published to npm. Install it by adding it to the
user's MCP configuration with `npx` — no clone, build, or global install required.

## Steps

1. Confirm Node.js >= 18 is available.
2. Add this entry to the user's MCP settings (for Cline: `cline_mcp_settings.json`; for other
   clients: their `mcpServers` config):

   ```json
   {
     "mcpServers": {
       "glm": {
         "command": "npx",
         "args": ["-y", "glm-mcp"],
         "env": { "GLM_API_KEY": "<user's Z.ai GLM Coding Plan key>" }
       }
     }
   }
   ```

3. Ask the user for their **Z.ai / Zhipu GLM Coding Plan** API key (https://z.ai) and place it in
   `GLM_API_KEY`. The server starts and lists its tools even without a key, but every GLM call needs it.

## Verify

The server answers the MCP handshake immediately — `initialize` then `tools/list` returns four tools:

- `glm_agent` — run GLM as a file-editing coding agent in a repo (read/write/edit/run), ~10x cheaper than the default model
- `glm_delegate` — text-in/text-out subtask on GLM
- `glm_recommend` — free advisory: GLM vs the default model
- `glm_status` — free: config, peak window, usage ledger

## Notes

- Optional env tuning (all have sane defaults): `GLM_COST_BIAS`, `GLM_CAP`, `GLM_MAX_TOKENS`,
  `GLM_PEAK_MODEL` / `GLM_OFFPEAK_MODEL`, `GLM_PEAK_START_CN` / `GLM_PEAK_END_CN`. See the repo README.
- GLM traffic goes to Z.ai (China) — keep secrets/regulated code on the user's default model.
