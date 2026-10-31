import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

interface FixtureLine {
  at_ms: number;
  viewer: string;
  text: string;
  flagged: boolean;
}

interface Fixture {
  messages: FixtureLine[];
}

interface QueueEntry {
  id: string;
  viewer: string;
  timestamp: string;
  clip_url: string;
  status: string;
}

function usage(): never {
  console.error("Usage: npm run harness -- <fixture.json> [--server http://127.0.0.1:3000] [--queue queue.json]");
  process.exit(2);
}

function readArguments(args: string[]) {
  if (!args[0] || args[0].startsWith("--")) usage();
  let server = process.env.HARNESS_SERVER ?? "http://127.0.0.1:3000";
  let queuePath = resolve(process.env.QUEUE_PATH ?? "queue.json");
  for (let index = 1; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) usage();
    if (flag === "--server") server = value;
    else if (flag === "--queue") queuePath = resolve(value);
    else usage();
    index += 1;
  }
  return { fixturePath: resolve(args[0]), server: server.replace(/\/$/, ""), queuePath };
}

async function readQueue(path: string): Promise<QueueEntry[]> {
  try {
    const value: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(value)) throw new Error(`${path} must contain an array`);
    return value as QueueEntry[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function sleep(milliseconds: number): Promise<void> {
  if (milliseconds > 0) await new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

function validateFixture(value: unknown): Fixture {
  if (!value || typeof value !== "object" || !Array.isArray((value as Fixture).messages)) {
    throw new Error("Fixture must contain a messages array");
  }
  const messages = (value as Fixture).messages;
  let previousTime = -1;
  for (const [index, line] of messages.entries()) {
    if (!Number.isFinite(line.at_ms) || line.at_ms < 0 || line.at_ms < previousTime
      || typeof line.viewer !== "string" || !line.viewer.trim()
      || typeof line.text !== "string" || typeof line.flagged !== "boolean") {
      throw new Error(`Invalid fixture message at index ${index}; timestamps must be ordered, non-negative milliseconds`);
    }
    previousTime = line.at_ms;
  }
  return { messages };
}

async function main() {
  const { fixturePath, server, queuePath } = readArguments(process.argv.slice(2));
  const fixture = validateFixture(JSON.parse(await readFile(fixturePath, "utf8")));
  const runId = randomUUID();
  const startWallTime = Date.now();
  const startMonotonic = performance.now();
  const completionLatency = new Map<number, number>();

  try {
    for (const [index, line] of fixture.messages.entries()) {
      const scheduledTime = startMonotonic + line.at_ms;
      await sleep(scheduledTime - performance.now());
      const response = await fetch(`${server}/__test/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          index,
          viewer: line.viewer,
          text: line.text,
          timestamp: new Date(startWallTime + line.at_ms).toISOString(),
        }),
      });
      if (!response.ok) {
        throw new Error(`Replay failed (${response.status}): ${await response.text()}\nStart the server with ENABLE_TEST_HARNESS=true`);
      }
      completionLatency.set(index, Math.max(0, performance.now() - scheduledTime));
    }

    const prefix = `harness-${runId}-`;
    const entries = (await readQueue(queuePath)).filter((entry) => entry.id.startsWith(prefix));
    const actualIndices = entries.map((entry) => Number(entry.id.slice(prefix.length)));
    const detectedIndices = new Set(actualIndices);
    const seen = new Set<number>();
    let falsePositives = 0;
    for (const index of actualIndices) {
      if (!fixture.messages[index]?.flagged || seen.has(index)) falsePositives += 1;
      seen.add(index);
    }
    const falseNegatives = fixture.messages.filter((line, index) => line.flagged && !detectedIndices.has(index)).length;
    const truePositiveLatencies = fixture.messages
      .map((line, index) => line.flagged && detectedIndices.has(index) ? completionLatency.get(index) : undefined)
      .filter((latency): latency is number => latency !== undefined);
    const averageLatency = truePositiveLatencies.length
      ? truePositiveLatencies.reduce((total, latency) => total + latency, 0) / truePositiveLatencies.length
      : null;

    console.log(`Detection count: ${entries.length}`);
    console.log(`False positives: ${falsePositives}`);
    console.log(`False negatives: ${falseNegatives}`);
    console.log(`Average latency: ${averageLatency === null ? "n/a" : `${averageLatency.toFixed(2)} ms`}`);
  } finally {
    const queue = await readQueue(queuePath);
    const remaining = queue.filter((entry) => !entry.id.startsWith(`harness-${runId}-`));
    if (remaining.length !== queue.length) {
      await writeFile(queuePath, `${JSON.stringify(remaining, null, 2)}\n`, "utf8");
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
