import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as fs from "fs";
import * as path from "path";
import {
  ListChatsInputSchema,
  FindChatInputSchema,
  GetHistoryInputSchema,
  SyncChatInputSchema,
  DownloadMediaInputSchema,
  GetSyncStatusInputSchema,
  ListMediaInputSchema,
} from "../schemas/inputs.js";
import {
  listDialogs,
  findChat,
  getChatHistory,
  syncChat,
  downloadMedia,
} from "../services/telegram.js";
import type { SyncState, MediaFile } from "../types.js";

const DATA_DIR = process.env.DATA_DIR || "./data";

export function registerTools(server: McpServer): void {
  // --- telegram_list_chats ---
  server.registerTool(
    "telegram_list_chats",
    {
      title: "List Telegram Chats",
      description:
        "List your Telegram dialogs (chats, groups, channels). " +
        "Returns chat ID, title, type, and username. " +
        "Use this to find the chat_id needed for other tools.",
      inputSchema: ListChatsInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const { limit } = ListChatsInputSchema.parse(params);
      const chats = await listDialogs(limit);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(chats, null, 2),
          },
        ],
      };
    }
  );

  // --- telegram_find_chat ---
  server.registerTool(
    "telegram_find_chat",
    {
      title: "Find Telegram Chat",
      description:
        "Search for a specific chat by name, username, or ID. " +
        "Returns the matching chat info or null if not found.",
      inputSchema: FindChatInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const { query } = FindChatInputSchema.parse(params);
      const chat = await findChat(query);
      if (!chat) {
        return {
          content: [
            {
              type: "text",
              text: `No chat found matching "${query}". Try telegram_list_chats to see available chats.`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(chat, null, 2),
          },
        ],
      };
    }
  );

  // --- telegram_get_history ---
  server.registerTool(
    "telegram_get_history",
    {
      title: "Get Chat History",
      description:
        "Fetch messages from a Telegram chat. Returns message text, sender, date, " +
        "and media info. Does NOT download media files — use telegram_sync_chat for that. " +
        "Useful for previewing chat contents before a full sync.",
      inputSchema: GetHistoryInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const { chat_id, limit, offset_id } = GetHistoryInputSchema.parse(params);
      const messages = await getChatHistory(chat_id, limit, offset_id);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                count: messages.length,
                messages,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- telegram_sync_chat ---
  server.registerTool(
    "telegram_sync_chat",
    {
      title: "Sync Telegram Chat",
      description:
        "Full sync: downloads all messages and media files from a chat to local storage. " +
        "Supports incremental sync — on subsequent runs, only fetches new messages. " +
        "Files are saved to data/raw/{chat_id}/. " +
        "This is the main tool for extracting chat data including photos and documents. " +
        "Use since_date to limit the sync range, or omit for full/incremental sync.",
      inputSchema: SyncChatInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const { chat_id, since_date } = SyncChatInputSchema.parse(params);
      const result = await syncChat(chat_id, since_date);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                newMessages: result.messages.length,
                newMediaFiles: result.mediaFiles.length,
                outputDir: result.outputDir,
                mediaFiles: result.mediaFiles.map((f) => ({
                  messageId: f.messageId,
                  filename: f.filename,
                  type: f.mimeType,
                  date: f.date,
                  caption: f.caption,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // --- telegram_download_media ---
  server.registerTool(
    "telegram_download_media",
    {
      title: "Download Single Media",
      description:
        "Download media from a specific message. Use this for targeted downloads " +
        "instead of a full sync. Returns file path and metadata.",
      inputSchema: DownloadMediaInputSchema.shape,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      const { chat_id, message_id, output_dir } =
        DownloadMediaInputSchema.parse(params);
      const dir = output_dir || path.join(DATA_DIR, "raw", chat_id, "media");
      const file = await downloadMedia(chat_id, message_id, dir);
      if (!file) {
        return {
          content: [
            {
              type: "text",
              text: `No media found in message ${message_id}`,
            },
          ],
        };
      }
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(file, null, 2),
          },
        ],
      };
    }
  );

  // --- telegram_sync_status ---
  server.registerTool(
    "telegram_sync_status",
    {
      title: "Get Sync Status",
      description:
        "Check the sync status for a chat: last sync date, total synced messages, " +
        "last message ID. Useful before deciding whether to run a new sync.",
      inputSchema: GetSyncStatusInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const { chat_id } = GetSyncStatusInputSchema.parse(params);
      const stateFile = path.join(DATA_DIR, "raw", chat_id, "sync_state.json");

      if (!fs.existsSync(stateFile)) {
        return {
          content: [
            {
              type: "text",
              text: `No sync data found for chat ${chat_id}. Run telegram_sync_chat first.`,
            },
          ],
        };
      }

      const state: SyncState = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(state, null, 2),
          },
        ],
      };
    }
  );

  // --- telegram_list_media ---
  server.registerTool(
    "telegram_list_media",
    {
      title: "List Synced Media",
      description:
        "List all media files that have been downloaded for a chat. " +
        "Requires a previous telegram_sync_chat run. " +
        "Filter by type: photo, document, video, voice, or all.",
      inputSchema: ListMediaInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const { chat_id, media_type } = ListMediaInputSchema.parse(params);
      const indexFile = path.join(DATA_DIR, "raw", chat_id, "media_index.json");

      if (!fs.existsSync(indexFile)) {
        return {
          content: [
            {
              type: "text",
              text: `No media index found for chat ${chat_id}. Run telegram_sync_chat first.`,
            },
          ],
        };
      }

      const allMedia: MediaFile[] = JSON.parse(
        fs.readFileSync(indexFile, "utf-8")
      );

      const filtered =
        media_type === "all"
          ? allMedia
          : allMedia.filter((m) => {
              if (media_type === "photo") return m.mimeType?.startsWith("image/");
              if (media_type === "document")
                return (
                  m.mimeType?.includes("pdf") ||
                  m.mimeType?.includes("document") ||
                  m.mimeType?.includes("text")
                );
              if (media_type === "video") return m.mimeType?.startsWith("video/");
              if (media_type === "voice")
                return (
                  m.mimeType?.startsWith("audio/") ||
                  m.mimeType?.includes("ogg")
                );
              return true;
            });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total: filtered.length,
                files: filtered.map((f) => ({
                  messageId: f.messageId,
                  filename: f.filename,
                  path: f.path,
                  type: f.mimeType,
                  size: f.size,
                  date: f.date,
                  caption: f.caption,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
