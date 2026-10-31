import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { createDashboardHandler, type DashboardOptions } from "./dashboard.js";
import { handleChatMessage, startChatListener } from "./chat-listener.js";
import { appendQueueEntry } from "./queue-store.js";

interface ClipBountyServerOptions extends DashboardOptions {
  overlayPath?: string;
  enableTestHarness?: boolean;
}

export function createClipBountyServer(options: ClipBountyServerOptions = {}) {
  let websocketServer: WebSocketServer;
  const dashboard = createDashboardHandler(options, (event) => {
    const message = JSON.stringify(event);
    for (const client of websocketServer.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    }
  });

  const httpServer = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && (url.pathname === "/overlay" || url.pathname === "/overlay/")) {
      void readFile(options.overlayPath ?? resolve(process.cwd(), "overlay/index.html"), "utf8")
        .then((html) => sendHtml(response, html))
        .catch((error: unknown) => {
          response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
          response.end(error instanceof Error ? error.message : "Unable to load overlay");
        });
      return;
    }
    if (request.method === "POST" && url.pathname === "/__test/chat" && options.enableTestHarness) {
      void replayTestMessage(request, response, options.queuePath).catch((error: unknown) => {
        const status = error instanceof SyntaxError || error instanceof InvalidTestMessage ? 400 : 500;
        response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
        response.end(error instanceof Error ? error.message : "Unable to replay test message");
      });
      return;
    }
    void dashboard(request, response);
  });

  websocketServer = new WebSocketServer({ server: httpServer, path: "/ws" });
  return { httpServer, websocketServer };
}

class InvalidTestMessage extends Error {}

async function replayTestMessage(
  request: IncomingMessage,
  response: ServerResponse,
  queuePath?: string,
): Promise<void> {
  const remoteAddress = request.socket.remoteAddress ?? "";
  if (!(remoteAddress === "::1" || remoteAddress === "127.0.0.1" || remoteAddress.startsWith("127.") || remoteAddress.startsWith("::ffff:127."))) {
    response.writeHead(403);
    response.end("Test feed is only available over loopback");
    return;
  }

  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > 8192) {
      response.writeHead(413);
      response.end("Request too large");
      return;
    }
    chunks.push(buffer);
  }

  const payload: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!payload || typeof payload !== "object") throw new InvalidTestMessage("Request body must be an object");
  const message = payload as Record<string, unknown>;
  const { runId, index, viewer, text, timestamp } = message;
  if (typeof runId !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(runId)
    || typeof index !== "number" || !Number.isInteger(index) || index < 0
    || typeof viewer !== "string" || !viewer.trim()
    || typeof text !== "string"
    || typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) {
    throw new InvalidTestMessage("Invalid test message payload");
  }

  const eventTime = new Date(timestamp);
  const indexString = String(index);
  await handleChatMessage("#harness", { username: viewer }, text, eventTime, console.log, async (name, createdAt) => {
    const id = `harness-${runId}-${indexString}`;
    await appendQueueEntry({
      id,
      viewer: name,
      timestamp: createdAt.toISOString(),
      clip_url: `https://clips.twitch.tv/${id}`,
      status: "pending",
    }, queuePath);
  });

  response.writeHead(204);
  response.end();
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(html);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const queuePath = process.env.QUEUE_PATH ? resolve(process.env.QUEUE_PATH) : undefined;
  const { httpServer } = createClipBountyServer({
    queuePath,
    enableTestHarness: process.env.ENABLE_TEST_HARNESS === "true",
  });
  httpServer.listen(port, () => {
    console.log(`ClipBounty dashboard listening at http://localhost:${port}`);
  });

  void startChatListener().catch((error: unknown) => {
    console.error(`Twitch chat listener failed: ${error instanceof Error ? error.message : String(error)}`);
    httpServer.close();
    process.exitCode = 1;
  });
}
