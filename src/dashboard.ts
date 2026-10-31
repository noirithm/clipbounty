import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { confirmQueueEntry, readQueue, type QueueEntry } from "./queue-store.js";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function renderDashboard(entries: QueueEntry[]): string {
  const pending = entries.filter((entry) => entry.status === "pending");
  const rows = pending.map((entry) => `
    <li class="entry">
      <div><strong>${escapeHtml(entry.viewer)}</strong><time>${escapeHtml(entry.timestamp)}</time></div>
      <a href="${escapeHtml(entry.clip_url)}" target="_blank" rel="noopener noreferrer">Watch clip</a>
      <form method="post" action="/confirm/${encodeURIComponent(entry.id)}"><button type="submit">Confirm</button></form>
    </li>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ClipBounty dashboard</title><style>
body{font:16px system-ui,sans-serif;max-width:760px;margin:3rem auto;padding:0 1rem;background:#10131a;color:#f2f4f8}
h1{font-size:1.7rem}.entry{display:flex;align-items:center;gap:1.25rem;padding:1rem;margin:.75rem 0;background:#1b202b;border-radius:.6rem}
.entry div{flex:1}time{display:block;color:#aeb7c7;font-size:.85rem;margin-top:.25rem}a{color:#9cc5ff}button{padding:.55rem .9rem;border:0;border-radius:.35rem;background:#7ee0b0;color:#10251c;font-weight:700;cursor:pointer}
.empty{color:#aeb7c7}@media(max-width:560px){.entry{align-items:flex-start;flex-wrap:wrap}.entry div{flex-basis:100%}}
</style></head><body><h1>Pending bug clips</h1>
${rows ? `<ul style="padding:0;list-style:none">${rows}</ul>` : '<p class="empty">No pending clips.</p>'}
</body></html>`;
}

function send(response: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, { "Content-Type": contentType, "X-Content-Type-Options": "nosniff" });
  response.end(body);
}

export function createDashboardServer(options: {
  queuePath?: string;
  leaderboardPath?: string;
} = {}) {
  return createServer(async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/") {
      try {
        send(response, 200, renderDashboard(await readQueue(options.queuePath)), "text/html; charset=utf-8");
      } catch (error) {
        send(response, 500, error instanceof Error ? error.message : "Unable to read queue");
      }
      return;
    }

    const confirmMatch = request.method === "POST" && url.pathname.match(/^\/confirm\/([^/]+)$/);
    if (confirmMatch) {
      let id: string;
      try {
        id = decodeURIComponent(confirmMatch[1]);
        const confirmed = await confirmQueueEntry(id, options.queuePath, options.leaderboardPath);
        if (!confirmed) {
          send(response, 404, "Pending queue entry not found");
          return;
        }
        response.writeHead(303, { Location: "/" });
        response.end();
      } catch (error) {
        send(response, 500, error instanceof Error ? error.message : "Unable to confirm entry");
      }
      return;
    }

    send(response, 404, "Not found");
  });
}
