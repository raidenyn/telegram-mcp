import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Api } from "telegram/tl/index.js";
import * as fs from "fs";
import * as path from "path";
import type { MessageData, ChatInfo, MediaFile, SyncState } from "../types.js";

const SESSION_FILE = process.env.TELEGRAM_SESSION_PATH || "./telegram.session";
const DATA_DIR = process.env.DATA_DIR || "./data";

let client: TelegramClient | null = null;

function getSessionString(): string {
  if (fs.existsSync(SESSION_FILE)) {
    return fs.readFileSync(SESSION_FILE, "utf-8").trim();
  }
  return "";
}

function saveSessionString(session: string): void {
  fs.writeFileSync(SESSION_FILE, session, "utf-8");
}

export async function getClient(): Promise<TelegramClient> {
  if (client?.connected) {
    return client;
  }

  const apiId = parseInt(process.env.TELEGRAM_API_ID || "0");
  const apiHash = process.env.TELEGRAM_API_HASH || "";

  if (!apiId || !apiHash) {
    throw new Error(
      "TELEGRAM_API_ID and TELEGRAM_API_HASH must be set. " +
      "Get them from https://my.telegram.org. " +
      "Run 'npm run auth' to authenticate first."
    );
  }

  const sessionString = getSessionString();
  if (!sessionString) {
    throw new Error(
      "No Telegram session found. Run 'npm run auth' first to authenticate."
    );
  }

  const session = new StringSession(sessionString);
  client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 3,
  });

  await client.connect();

  // Save session in case it was updated
  const newSession = client.session.save() as unknown as string;
  saveSessionString(newSession);

  return client;
}

export async function listDialogs(limit: number = 50): Promise<ChatInfo[]> {
  const tg = await getClient();
  const dialogs = await tg.getDialogs({ limit });

  return dialogs.map((d) => {
    let type: ChatInfo["type"] = "user";
    if (d.isGroup) type = "group";
    if (d.isChannel) type = "channel";

    return {
      id: d.id?.toString() || "",
      title: d.title || d.name || "Unknown",
      type,
      username: (d.entity as { username?: string })?.username,
    };
  });
}

export async function findChat(query: string): Promise<ChatInfo | null> {
  const dialogs = await listDialogs(200);
  const q = query.toLowerCase();

  return (
    dialogs.find(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.username?.toLowerCase().includes(q) ||
        d.id === query
    ) || null
  );
}

function getMediaType(
  media: Api.TypeMessageMedia | undefined
): MessageData["mediaType"] | undefined {
  if (!media) return undefined;
  if (media instanceof Api.MessageMediaPhoto) return "photo";
  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc instanceof Api.Document) {
      const mimeType = doc.mimeType || "";
      if (mimeType.startsWith("video/")) return "video";
      if (mimeType.startsWith("audio/") || mimeType === "audio/ogg")
        return "voice";
      if (mimeType.includes("sticker")) return "sticker";
      return "document";
    }
    return "document";
  }
  return "other";
}

function getMediaFilename(
  media: Api.TypeMessageMedia | undefined,
  messageId: number
): string | undefined {
  if (!media) return undefined;

  if (media instanceof Api.MessageMediaPhoto) {
    return `photo_${messageId}.jpg`;
  }

  if (media instanceof Api.MessageMediaDocument) {
    const doc = media.document;
    if (doc instanceof Api.Document) {
      // Try to get original filename from attributes
      for (const attr of doc.attributes) {
        if (attr instanceof Api.DocumentAttributeFilename) {
          return attr.fileName;
        }
      }
      // Fallback based on mime type
      const ext = doc.mimeType?.split("/")[1] || "bin";
      return `doc_${messageId}.${ext}`;
    }
  }

  return `media_${messageId}`;
}

export async function getChatHistory(
  chatId: string,
  limit: number = 100,
  offsetId: number = 0
): Promise<MessageData[]> {
  const tg = await getClient();
  const entity = await tg.getEntity(chatId);

  const messages = await tg.getMessages(entity, {
    limit,
    offsetId: offsetId || undefined,
  });

  return messages
    .filter((m) => m.id !== undefined)
    .map((m) => {
      const sender = m.sender;
      let senderName = "Unknown";
      if (sender) {
        if ("firstName" in sender) {
          senderName = [sender.firstName, sender.lastName]
            .filter(Boolean)
            .join(" ");
        } else if ("title" in sender) {
          senderName = sender.title || "Unknown";
        }
      }

      return {
        id: m.id,
        date: new Date((m.date || 0) * 1000).toISOString(),
        senderId: m.senderId?.toString() || "",
        senderName,
        text: m.text || "",
        hasMedia: !!m.media,
        mediaType: getMediaType(m.media),
        mediaFilename: getMediaFilename(m.media, m.id),
        replyToId: m.replyTo instanceof Api.MessageReplyHeader
          ? m.replyTo.replyToMsgId
          : undefined,
      };
    });
}

export async function downloadMedia(
  chatId: string,
  messageId: number,
  outputDir: string
): Promise<MediaFile | null> {
  const tg = await getClient();
  const entity = await tg.getEntity(chatId);

  const messages = await tg.getMessages(entity, {
    ids: [messageId],
  });

  const msg = messages[0];
  if (!msg?.media) {
    return null;
  }

  const filename = getMediaFilename(msg.media, messageId) || `media_${messageId}`;
  const filePath = path.join(outputDir, filename);

  // Ensure output directory exists
  fs.mkdirSync(outputDir, { recursive: true });

  // Download
  const buffer = await tg.downloadMedia(msg, {});
  if (buffer && Buffer.isBuffer(buffer)) {
    fs.writeFileSync(filePath, buffer);
  } else if (typeof buffer === "string") {
    // GramJS sometimes returns a file path
    if (!fs.existsSync(filePath) && fs.existsSync(buffer)) {
      fs.copyFileSync(buffer, filePath);
    }
  } else {
    return null;
  }

  let mimeType: string | undefined;
  let size: number | undefined;
  if (msg.media instanceof Api.MessageMediaDocument) {
    const doc = msg.media.document;
    if (doc instanceof Api.Document) {
      mimeType = doc.mimeType;
      size = Number(doc.size);
    }
  } else if (msg.media instanceof Api.MessageMediaPhoto) {
    mimeType = "image/jpeg";
    size = fs.statSync(filePath).size;
  }

  return {
    messageId,
    filename,
    path: filePath,
    mimeType,
    size,
    date: new Date((msg.date || 0) * 1000).toISOString(),
    caption: msg.text || undefined,
  };
}

export async function syncChat(
  chatId: string,
  sinceDate?: string
): Promise<{
  messages: MessageData[];
  mediaFiles: MediaFile[];
  outputDir: string;
}> {
  const chatDir = path.join(DATA_DIR, "raw", chatId);
  const mediaDir = path.join(chatDir, "media");
  fs.mkdirSync(mediaDir, { recursive: true });

  // Load sync state
  const stateFile = path.join(chatDir, "sync_state.json");
  let state: SyncState | null = null;
  if (fs.existsSync(stateFile)) {
    state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
  }

  // Fetch all messages (in batches)
  const allMessages: MessageData[] = [];
  let offsetId = 0;
  const batchSize = 100;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await getChatHistory(chatId, batchSize, offsetId);
    if (batch.length === 0) break;

    // If incremental sync, stop when we reach already-synced messages
    if (state && sinceDate === undefined) {
      const newMessages = batch.filter((m) => m.id > state!.lastMessageId);
      allMessages.push(...newMessages);
      if (newMessages.length < batch.length) break;
    } else if (sinceDate) {
      const cutoff = new Date(sinceDate).getTime();
      const newMessages = batch.filter(
        (m) => new Date(m.date).getTime() >= cutoff
      );
      allMessages.push(...newMessages);
      if (newMessages.length < batch.length) break;
    } else {
      allMessages.push(...batch);
    }

    offsetId = batch[batch.length - 1].id;

    // Safety limit
    if (allMessages.length >= 5000) {
      console.error("Reached 5000 message limit, stopping sync");
      break;
    }
  }

  // Download media for messages that have it
  const mediaFiles: MediaFile[] = [];
  const mediaMessages = allMessages.filter((m) => m.hasMedia);

  for (const msg of mediaMessages) {
    try {
      const file = await downloadMedia(chatId, msg.id, mediaDir);
      if (file) {
        mediaFiles.push(file);
      }
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.error(`Failed to download media for message ${msg.id}:`, err);
    }
  }

  // Save messages
  const messagesFile = path.join(chatDir, "messages.json");

  // Merge with existing messages if any
  let existingMessages: MessageData[] = [];
  if (fs.existsSync(messagesFile)) {
    existingMessages = JSON.parse(fs.readFileSync(messagesFile, "utf-8"));
  }

  const existingIds = new Set(existingMessages.map((m) => m.id));
  const merged = [
    ...existingMessages,
    ...allMessages.filter((m) => !existingIds.has(m.id)),
  ].sort((a, b) => a.id - b.id);

  fs.writeFileSync(messagesFile, JSON.stringify(merged, null, 2));

  // Save media index
  const mediaIndexFile = path.join(chatDir, "media_index.json");
  let existingMedia: MediaFile[] = [];
  if (fs.existsSync(mediaIndexFile)) {
    existingMedia = JSON.parse(fs.readFileSync(mediaIndexFile, "utf-8"));
  }
  const existingMediaIds = new Set(existingMedia.map((m) => m.messageId));
  const mergedMedia = [
    ...existingMedia,
    ...mediaFiles.filter((m) => !existingMediaIds.has(m.messageId)),
  ];
  fs.writeFileSync(mediaIndexFile, JSON.stringify(mergedMedia, null, 2));

  // Update sync state
  const maxId = merged.length > 0 ? Math.max(...merged.map((m) => m.id)) : 0;
  const newState: SyncState = {
    chatId,
    lastMessageId: maxId,
    lastSyncAt: new Date().toISOString(),
    totalSynced: merged.length,
  };
  fs.writeFileSync(stateFile, JSON.stringify(newState, null, 2));

  return {
    messages: allMessages,
    mediaFiles,
    outputDir: chatDir,
  };
}
