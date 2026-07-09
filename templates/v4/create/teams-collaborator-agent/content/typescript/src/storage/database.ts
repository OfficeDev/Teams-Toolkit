import { MessageRecord } from "./types";

/**
 * Abstract database interface that both SQLite and MSSQL implementations follow
 */
export interface IDatabase {
  initialize(): Promise<void>;
  clearAll(): void | Promise<void>;
  get(conversationId: string): MessageRecord[] | Promise<MessageRecord[]>;
  getMessagesByTimeRange(
    conversationId: string,
    startTime: string,
    endTime: string
  ): MessageRecord[] | Promise<MessageRecord[]>;
  getRecentMessages(
    conversationId: string,
    limit?: number
  ): MessageRecord[] | Promise<MessageRecord[]>;
  clearConversation(conversationId: string): void | Promise<void>;
  addMessages(messages: MessageRecord[]): void | Promise<void>;
  countMessages(conversationId: string): number | Promise<number>;
  clearAllMessages(): void | Promise<void>;
  getFilteredMessages(
    conversationId: string,
    keywords: string[],
    startTime: string,
    endTime: string,
    participants?: string[],
    maxResults?: number
  ): MessageRecord[] | Promise<MessageRecord[]>;
  recordFeedback(
    replyToId: string,
    reaction: "like" | "dislike" | string,
    feedbackJson?: unknown
  ): boolean | Promise<boolean>;
  close(): void | Promise<void>;
}
