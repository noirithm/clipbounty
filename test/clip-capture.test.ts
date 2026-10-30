import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { captureBugClip } from "../src/clip-capture.js";

test("stubs Helix and appends the expected pending queue entry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "clipbounty-"));
  const queuePath = join(directory, "queue.json");
  try {
    const entry = await captureBugClip("viewer", new Date("2025-01-02T03:04:05.000Z"), {
      queuePath,
      createClip: async () => "test-clip-id",
    });

    assert.deepEqual(entry, {
      id: "test-clip-id",
      viewer: "viewer",
      timestamp: "2025-01-02T03:04:05.000Z",
      clip_url: "https://clips.twitch.tv/test-clip-id",
      status: "pending",
    });
    assert.deepEqual(JSON.parse(await readFile(queuePath, "utf8")), [entry]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
