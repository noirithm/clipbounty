import { createDashboardServer } from "./dashboard.js";
import { startChatListener } from "./chat-listener.js";

const port = Number(process.env.PORT ?? 3000);
const server = createDashboardServer();

server.listen(port, () => {
  console.log(`ClipBounty dashboard listening at http://localhost:${port}`);
});

void startChatListener().catch((error: unknown) => {
  console.error(`Twitch chat listener failed: ${error instanceof Error ? error.message : String(error)}`);
  server.close();
  process.exitCode = 1;
});
