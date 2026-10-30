import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { startChatListener } from "../src/chat-listener.js";

test("logs chat messages with an ISO timestamp", async () => {
  class MockClient extends EventEmitter {
    async connect() {}
  }

  const client = new MockClient();
  const lines: string[] = [];
  await startChatListener("#dev", client, (line) => lines.push(line), () => new Date("2025-01-02T03:04:05.000Z"));
  client.emit("message", "#dev", { username: "viewer" }, "found a bug", false);

  assert.deepEqual(lines, ["2025-01-02T03:04:05.000Z #dev <viewer> found a bug"]);
});
