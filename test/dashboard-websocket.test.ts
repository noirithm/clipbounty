import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WebSocket } from "ws";
import { createClipBountyServer } from "../src/server.js";

test("serves the overlay and broadcasts a confirmed bounty over WebSocket", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "clipbounty-dashboard-"));
  const queuePath = join(directory, "queue.json");
  const leaderboardPath = join(directory, "leaderboard.json");
  await writeFile(queuePath, JSON.stringify([{
    id: "entry-1",
    viewer: "bug-finder",
    timestamp: "2025-01-02T03:04:05.000Z",
    clip_url: "https://clips.twitch.tv/example",
    status: "pending",
  }]));

  const app = createClipBountyServer({ queuePath, leaderboardPath });
  await new Promise<void>((resolve, reject) => {
    app.httpServer.once("error", reject);
    app.httpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = app.httpServer.address();
  assert(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let client: WebSocket | undefined;

  t.after(async () => {
    client?.terminate();
    await new Promise<void>((resolve) => {
      app.websocketServer.close(() => {
        if (app.httpServer.listening) app.httpServer.close(() => resolve());
        else resolve();
      });
    });
    await rm(directory, { recursive: true, force: true });
  });

  const overlay = await fetch(`${baseUrl}/overlay`);
  assert.equal(overlay.status,  200);
  assert.match(await overlay.text(), /Bug bounty leaderboard/);

  client = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
  await once(client, "open");
  const eventReceived = once(client, "message");
  const confirmation = await fetch(`${baseUrl}/confirm/entry-1`, { method: "POST", redirect: "manual" });
  assert.equal(confirmation.status, 303);
  const [payload] = await eventReceived;

  assert.deepEqual(JSON.parse(payload.toString()), {
    type: "confirmed",
    viewer: "bug-finder",
    leaderboard: { "bug-finder": 1 },
  });
});
