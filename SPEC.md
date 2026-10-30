# clipbounty

## Goal
Turn live chat bug-spotting during an indie devstream into a scored,
timestamped bounty board. A viewer flags a moment in chat, the tool
captures a Twitch clip at that timestamp, the streamer confirms it
live, chat sees a bounty-claimed animation and a leaderboard update.

## Components
1. chat-listener: connects to Twitch chat via tmi.js, watches for
   the trigger command.
2. clip-capture: on trigger, calls the Twitch Helix Create Clip
   endpoint, writes a queue entry.
3. queue-store: a local JSON file holding pending and confirmed
   entries. No database.
4. dashboard: a minimal local web page for the streamer. Lists
   pending entries with clip links, one button each to confirm or
   dismiss.
5. overlay: a static HTML page used as an OBS browser source. Opens
   a WebSocket to the server, plays a short claim animation and
   updates a live leaderboard when an entry is confirmed.
6. test-harness: a script that replays a scripted sequence of fake
   chat messages at known timestamps, including known bug flags,
   against the running server, then diffs what the tool actually
   detected against the known list and reports latency, false
   positives, and false negatives.

## Data flow
chat message -> chat-listener matches trigger -> clip-capture calls
Create Clip -> queue-store appends {id, viewer, timestamp, clip_url,
status: pending} -> dashboard shows pending entries -> streamer
clicks confirm -> queue-store marks confirmed, increments that
viewer's leaderboard score -> server pushes a confirm event over
WebSocket -> overlay plays the claim animation and redraws the
leaderboard.

## Trigger
A chat message starting with "!bug" followed by free text. Exact
string match on the command, case-insensitive. No NLP in v1.

## Twitch APIs needed
Chat (read): tmi.js over IRC, anonymous read is enough for the
listener itself.
Helix Create Clip: needs broadcaster_id and an OAuth token with the
clips:edit scope, from the streamer's own account.

## Out of scope for v1
No Twitch Extension. No channel points. No automatic bug detection
from game state. No mobile.

## Ground truth test
A fixture file lists N scripted chat lines with relative timestamps,
M of which are real bug flags at known times. The harness replays
these against a local mock feed and reports: detection count, false
positive count, false negative count, average latency from flag to
clip entry created.
