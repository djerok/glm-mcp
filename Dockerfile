# builds the GLM MCP server (stdio); pass GLM_API_KEY via env.
# Container image of the standalone glm-mcp server (no installer deps):
#   docker build -t glm-mcp .
#   docker run --rm -i -e GLM_API_KEY=... glm-mcp
FROM node:22-alpine
WORKDIR /app
COPY claude/glm-mcp/package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY claude/glm-mcp/src ./src
ENV NODE_ENV=production
ENTRYPOINT ["node", "src/index.js"]
