import "dotenv/config";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import * as fs from "fs";
import * as readline from "readline";

const SESSION_FILE = process.env.TELEGRAM_SESSION_PATH || "./telegram.session";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main(): Promise<void> {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
  const apiHash = process.env.TELEGRAM_API_HASH || "";

  if (!apiId || !apiHash) {
    console.error("Error: Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env");
    console.error("Get them from https://my.telegram.org");
    process.exit(1);
  }

  console.log("Telegram MCP Server — Authentication");
  console.log("=====================================\n");

  // Check for existing session
  let sessionString = "";
  if (fs.existsSync(SESSION_FILE)) {
    const existing = fs.readFileSync(SESSION_FILE, "utf-8").trim();
    if (existing) {
      const reuse = await ask("Existing session found. Reuse it? (y/n): ");
      if (reuse.toLowerCase() === "y") {
        sessionString = existing;
      }
    }
  }

  const session = new StringSession(sessionString);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.start({
    phoneNumber: async () => await ask("Enter your phone number (with country code): "),
    password: async () => await ask("Enter your 2FA password (if enabled): "),
    phoneCode: async () => await ask("Enter the code you received: "),
    onError: (err) => console.error("Auth error:", err),
  });

  // Save session
  const savedSession = client.session.save() as unknown as string;
  fs.writeFileSync(SESSION_FILE, savedSession, { encoding: "utf-8", mode: 0o600 });

  console.log("\n✅ Authentication successful!");
  console.log(`Session saved to ${SESSION_FILE}`);

  const me = await client.getMe();
  if (me && "firstName" in me) {
    console.log(`Logged in as: ${me.firstName} ${me.lastName || ""}`);
  }

  await client.disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
