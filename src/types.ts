export interface ChatInfo {
  id: string;
  title: string;
  type: "user" | "group" | "channel";
  username?: string;
}

export interface MessageData {
  id: number;
  date: string;
  senderId: string;
  senderName: string;
  text: string;
  hasMedia: boolean;
  mediaType?: "photo" | "document" | "video" | "voice" | "sticker" | "other";
  mediaFilename?: string;
  replyToId?: number;
}

export interface SyncResult {
  chatId: string;
  chatTitle: string;
  totalMessages: number;
  mediaFiles: number;
  syncedAt: string;
  messagesFile: string;
  mediaDir: string;
}

export interface MediaFile {
  messageId: number;
  filename: string;
  path: string;
  mimeType?: string;
  size?: number;
  date: string;
  caption?: string;
}

export interface SyncState {
  chatId: string;
  lastMessageId: number;
  lastSyncAt: string;
  totalSynced: number;
}
