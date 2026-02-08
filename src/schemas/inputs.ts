import { z } from "zod";

export const ListChatsInputSchema = z
  .object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe("Maximum number of chats to return"),
  })
  .strict();

export const FindChatInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        "Search query: chat name, username, or numeric ID. Example: 'Mom', '@username', '123456789'"
      ),
  })
  .strict();

export const GetHistoryInputSchema = z
  .object({
    chat_id: z
      .string()
      .min(1)
      .describe("Chat ID (get from telegram_list_chats or telegram_find_chat)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(100)
      .describe("Maximum number of messages to return"),
    offset_id: z
      .number()
      .int()
      .default(0)
      .describe("Message ID to start from (for pagination, 0 = latest)"),
  })
  .strict();

export const SyncChatInputSchema = z
  .object({
    chat_id: z
      .string()
      .min(1)
      .describe("Chat ID to sync"),
    since_date: z
      .string()
      .refine((val) => !isNaN(new Date(val).getTime()), {
        message: "Invalid date format. Expected ISO 8601 (e.g. '2024-01-01' or '2024-01-01T00:00:00Z').",
      })
      .optional()
      .describe(
        "Only sync messages after this date (ISO 8601). Omit for full sync or incremental from last sync."
      ),
  })
  .strict();

export const DownloadMediaInputSchema = z
  .object({
    chat_id: z
      .string()
      .min(1)
      .describe("Chat ID containing the message"),
    message_id: z
      .number()
      .int()
      .positive()
      .describe("Message ID to download media from"),
    output_dir: z
      .string()
      .optional()
      .describe("Custom output directory (default: ./data/raw/{chat_id}/media)"),
  })
  .strict();

export const GetSyncStatusInputSchema = z
  .object({
    chat_id: z
      .string()
      .min(1)
      .describe("Chat ID to check sync status for"),
  })
  .strict();

export const ListMediaInputSchema = z
  .object({
    chat_id: z
      .string()
      .min(1)
      .describe("Chat ID to list media for"),
    media_type: z
      .enum(["photo", "document", "video", "voice", "all"])
      .default("all")
      .describe("Filter by media type"),
  })
  .strict();
