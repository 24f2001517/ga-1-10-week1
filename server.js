const http = require("node:http");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const EMAIL = "24f2001517@ds.study.iitm.ac.in";
const PROTOCOL_VERSION = "2025-03-26";

function jsonRpc(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function errorRpc(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function sendJson(res, body, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function toolResult(text) {
  return {
    content: [{ type: "text", text }],
    isError: false,
  };
}

const server = http.createServer(async (req, res) => {
  // Basic CORS support for browser-based MCP clients.
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, X-Exam-Challenge, X-Exam-Timestamp, X-Exam-Signature",
      "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
    });
    return res.end();
  }

  if (req.url === "/health" && req.method === "GET") {
    return sendJson(res, { ok: true, service: "exam-mcp-server" });
  }

  if (req.url !== "/mcp") {
    return sendJson(res, { error: "Not found. MCP endpoint is /mcp." }, 404);
  }

  if (req.method !== "POST") {
    res.writeHead(405, {
      "Content-Type": "application/json",
      "Allow": "POST, OPTIONS",
      "Access-Control-Allow-Origin": "*",
    });
    return res.end(JSON.stringify({ error: "Use POST for MCP requests." }));
  }

  let message;
  try {
    message = await readBody(req);
  } catch {
    return sendJson(res, errorRpc(null, -32700, "Parse error"), 400);
  }

  const id = message.id;
  const method = message.method;

  // MCP initialization handshake.
  if (method === "initialize") {
    const requested = message.params?.protocolVersion;
    const version = requested || PROTOCOL_VERSION;
    return sendJson(res, jsonRpc(id, {
      protocolVersion: version,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "exam-challenge-mcp", version: "1.0.0" },
      instructions: "Call solve_challenge. The challenge is read from request headers on every call.",
    }));
  }

  // Notifications do not have an id and must not receive a JSON-RPC result.
  if (method === "notifications/initialized" || method === "notifications/cancelled") {
    res.writeHead(202, { "Access-Control-Allow-Origin": "*" });
    return res.end();
  }

  if (method === "ping") {
    return sendJson(res, jsonRpc(id, {}));
  }

  if (method === "tools/list") {
    return sendJson(res, jsonRpc(id, {
      tools: [{
        name: "solve_challenge",
        description: "Returns the challenge-specific SHA-256 digest using the registered exam email.",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: true
        }
      }]
    }));
  }

  if (method === "tools/call") {
    const name = message.params?.name;
    if (name !== "solve_challenge") {
      return sendJson(res, errorRpc(id, -32602, "Unknown tool"));
    }

    // Intentionally use fresh HTTP headers for every call, never JSON body arguments.
    const challenge = req.headers["x-exam-challenge"];
    if (typeof challenge !== "string" || !/^[0-9a-f]{32}$/.test(challenge)) {
      return sendJson(res, jsonRpc(id, toolResult("Missing or invalid X-Exam-Challenge header.")));
    }

    const normalizedEmail = EMAIL.trim().toLowerCase();
    const digest = crypto
      .createHash("sha256")
      .update(`${challenge}:${normalizedEmail}`, "utf8")
      .digest("hex")
      .slice(0, 16);

    return sendJson(res, jsonRpc(id, toolResult(digest)));
  }

  if (typeof method === "string" && method.startsWith("notifications/")) {
    res.writeHead(202, { "Access-Control-Allow-Origin": "*" });
    return res.end();
  }

  return sendJson(res, errorRpc(id, -32601, `Method not found: ${method || ""}`), 404);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`MCP server listening on port ${PORT}`);
});
