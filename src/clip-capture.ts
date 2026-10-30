import { appendQueueEntry, type QueueEntry } from "./queue-store.js";

interface HelixClipResponse {
  data: Array<{ id: string }>;
}

export type CreateClip = (broadcasterId: string) => Promise<string>;

export async function createHelixClip(
  broadcasterId = process.env.TWITCH_BROADCASTER_ID,
  oauthToken = process.env.TWITCH_OAUTH_TOKEN,
  clientId = process.env.TWITCH_CLIENT_ID,
  request: typeof fetch = fetch,
): Promise<string> {
  if (!broadcasterId || !oauthToken || !clientId) {
    throw new Error("TWITCH_BROADCASTER_ID, TWITCH_OAUTH_TOKEN, and TWITCH_CLIENT_ID must be set");
  }

  const url = new URL("https://api.twitch.tv/helix/clips");
  url.searchParams.set("broadcaster_id", broadcasterId);
  const response = await request(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${oauthToken}`,
      "Client-Id": clientId,
    },
  });
  if (!response.ok) throw new Error(`Twitch Create Clip failed: ${response.status} ${response.statusText}`);
  const body = (await response.json()) as HelixClipResponse;
  const clipId = body.data?.[0]?.id;
  if (!clipId) throw new Error("Twitch Create Clip returned no clip ID");
  return clipId;
}

export async function captureBugClip(
  viewer: string,
  timestamp: Date,
  options: {
    createClip?: CreateClip;
    queuePath?: string;
    id?: string;
  } = {},
): Promise<QueueEntry> {
  const createClip = options.createClip ?? (() => createHelixClip());
  const clipId = await createClip(process.env.TWITCH_BROADCASTER_ID ?? "");
  const entry: QueueEntry = {
    id: options.id ?? clipId,
    viewer,
    timestamp: timestamp.toISOString(),
    clip_url: `https://clips.twitch.tv/${clipId}`,
    status: "pending",
  };
  await appendQueueEntry(entry, options.queuePath);
  return entry;
}
