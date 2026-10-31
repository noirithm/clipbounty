import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface QueueEntry {
  id: string;
  viewer: string;
  timestamp: string;
  clip_url: string;
  status: "pending" | "confirmed";
}

export type Leaderboard = Record<string, number>;

async function readJsonArray(path: string): Promise<QueueEntry[]> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(value)) throw new Error(`${path} must contain an array`);
    return value as QueueEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [];
  }
}

export async function readQueue(queuePath = resolve(process.cwd(), "queue.json")) {
  return readJsonArray(queuePath);
}

export async function appendQueueEntry(
  entry: QueueEntry,
  queuePath = resolve(process.cwd(), "queue.json"),
): Promise<void> {
  const entries = await readQueue(queuePath);
  entries.push(entry);
  await writeFile(queuePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
}

export async function confirmQueueEntry(
  id: string,
  queuePath = resolve(process.cwd(), "queue.json"),
  leaderboardPath = resolve(process.cwd(), "leaderboard.json"),
): Promise<boolean> {
  const entries = await readQueue(queuePath);
  const entry = entries.find((item) => item.id === id);
  if (!entry || entry.status !== "pending") return false;

  let leaderboard: Leaderboard;
  try {
    leaderboard = JSON.parse(await readFile(leaderboardPath, "utf8")) as Leaderboard;
    if (!leaderboard || Array.isArray(leaderboard) || typeof leaderboard !== "object") {
      throw new Error("leaderboard.json must contain a viewer-to-score object");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    leaderboard = {};
  }

  entry.status = "confirmed";
  leaderboard[entry.viewer] = (leaderboard[entry.viewer] ?? 0) + 1;
  await writeFile(queuePath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  await writeFile(leaderboardPath, `${JSON.stringify(leaderboard, null, 2)}\n`, "utf8");
  return true;
}
