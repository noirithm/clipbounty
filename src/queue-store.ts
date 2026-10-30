import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface QueueEntry {
  id: string;
  viewer: string;
  timestamp: string;
  clip_url: string;
  status: "pending" | "confirmed";
}

export async function appendQueueEntry(
  entry: QueueEntry,
  queuePath = resolve(process.cwd(), "queue.json"),
): Promise<void> {
  let entries: QueueEntry[];
  try {
    entries = JSON.parse(await readFile(queuePath, "utf8")) as QueueEntry[];
    if (!Array.isArray(entries)) throw new Error("queue.json must contain an array");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    entries = [];
  }
  entries.push(entry);
  await writeFile(queuePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}
