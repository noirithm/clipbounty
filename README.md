# ClipBounty

Turns live chat bug-spotting during an indie devstream into a scored,
timestamped bounty board. A viewer flags a moment in chat, the tool
captures a real Twitch clip at that timestamp, the streamer confirms
it from a local dashboard, and an OBS overlay shows a claim animation
and a live leaderboard.

## Why

Devstream chat already spots bugs out loud for fun, unprompted. That
moment currently dies in chat scroll. ClipBounty catches it instead.

## How it works

1. A viewer types `!bug <description>` in chat.
2. The chat listener detects it and calls the Twitch Helix Create Clip
   endpoint to capture the moment.
3. The clip lands in a local pending queue.
4. The streamer confirms it from a small local dashboard.
5. The overlay, running as an OBS browser source, plays a claim
   animation with sound and updates a live leaderboard.

## Stack

TypeScript, Node, tmi.js for chat, the Twitch Helix API for clips, ws
for the overlay's live updates. No database, local JSON files only.

## Setup

Register an app at the Twitch Developer Console and fill in `.env`
with your client ID, client secret, broadcaster ID, a user access
token with the `clips:edit` scope, and your channel name.

```
npm install
npm run dev
```

The dashboard runs at `http://localhost:3001`, the overlay at
`http://localhost:3001/overlay`, meant to be added as an OBS browser
source.

## Tests

```
npm test
```

## Ground truth harness

A scripted fixture in `fixtures/chat-replay.json` replays known chat
lines, including known bug flags, against a running server and
reports detection count, false positives, false negatives, and
average latency. Start the server with `ENABLE_TEST_HARNESS=true` set,
then run:

```
node --import tsx scripts/test-harness.ts fixtures/chat-replay.json --server http://127.0.0.1:3001
```

## Built with Codex

Built task by task through OpenAI Codex CLI sessions: chat listener,
clip capture and queue, dashboard, overlay and websocket sync, the
ground truth harness, then the claim animation and sound. Each task
was reviewed and tested against a running server before moving to
the next, not accepted on a green test alone.