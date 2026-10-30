import tmi from "tmi.js";
import { captureBugClip } from "./clip-capture.js";

type ChatTags = { username?: string };

export interface ChatClient {
  connect(): Promise<unknown>;
  on(
    event: "message",
    listener: (channel: string, tags: ChatTags, message: string, self: boolean) => void,
  ): unknown;
}

export function formatChatMessage(
  channel: string,
  username: string,
  message: string,
  timestamp: Date = new Date(),
): string {
  return `${timestamp.toISOString()} ${channel} <${username}> ${message}`;
}

export async function startChatListener(
  channel = process.env.TWITCH_CHANNEL,
  client: ChatClient = new tmi.Client({ channels: channel ? [channel] : [] }),
  log: (line: string) => void = console.log,
  now: () => Date = () => new Date(),
  onBug: (viewer: string, timestamp: Date) => Promise<unknown> = (viewer, timestamp) =>
    captureBugClip(viewer, timestamp),
): Promise<ChatClient> {
  if (!channel) {
    throw new Error("TWITCH_CHANNEL must be set");
  }

  client.on("message", (messageChannel, tags, message) => {
    const timestamp = now();
    const username = tags.username ?? "unknown";
    log(formatChatMessage(messageChannel, username, message, timestamp));
    if (/^!bug\s+\S[\s\S]*$/i.test(message)) {
      void onBug(username, timestamp).catch((error: unknown) => {
        log(`Failed to capture bug clip: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  });
  await client.connect();
  return client;
}
