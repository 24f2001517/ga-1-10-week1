# Exam Challenge MCP Server

Minimal stateless MCP-over-HTTP endpoint exposing exactly one tool: `solve_challenge`.

## Local run

Requires Node.js 20 or newer.

```bash
npm start
```

MCP endpoint: `http://localhost:3000/mcp`  
Health endpoint: `http://localhost:3000/health`

## Deploy on Render

1. Push these files to a GitHub repository.
2. In Render, choose **New → Blueprint** and select that repository.
3. Render detects `render.yaml`; create the service.
4. Wait until deployment succeeds.
5. Submit the public HTTPS endpoint URL ending in `/mcp`, for example `https://YOUR-SERVICE.onrender.com/mcp`.

## Behavior

- `initialize` returns MCP capabilities.
- `notifications/initialized` is accepted.
- `tools/list` exposes only `solve_challenge`.
- `tools/call` reads `X-Exam-Challenge` from that HTTP request's headers.
- The result is the first 16 lowercase hex characters of SHA-256 of
  `challenge:24f2001517@ds.study.iitm.ac.in`.

The challenge is not read from the JSON-RPC body. Signature verification is intentionally omitted because it is optional in the task.
