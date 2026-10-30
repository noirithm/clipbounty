import tmi from "tmi.js";

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
): Promise<ChatClient> {
  if (!channel) {
    throw new Error("TWITCH_CHANNEL must be set");
  }

  client.on("message", (messageChannel, tags, message) => {
    log(formatChatMessage(messageChannel, tags.username ?? "unknown", message, now()));
  });
  await client.connect();
  return client;
}
