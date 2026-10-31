import { readFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";
import { createDashboardHandler, type DashboardOptions } from "./dashboard.js";
import { startChatListener } from "./chat-listener.js";

export function createClipBountyServer(options: DashboardOptions & { overlayPath?: string } = {}) {
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
    void dashboard(request, response);
  });

  websocketServer = new WebSocketServer({ server: httpServer, path: "/ws" });
  return { httpServer, websocketServer };
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
  const { httpServer } = createClipBountyServer();
  httpServer.listen(port, () => {
    console.log(`ClipBounty dashboard listening at http://localhost:${port}`);
  });

  void startChatListener().catch((error: unknown) => {
    console.error(`Twitch chat listener failed: ${error instanceof Error ? error.message : String(error)}`);
    httpServer.close();
    process.exitCode = 1;
  });
}
