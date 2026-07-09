import { IDatabase } from "./database";
import { MessageRecord } from "./types";

export class ConversationMemory {
  constructor(
    private store: IDatabase,
    private conversationId: string
  ) {}

  async addMessages(messages: MessageRecord[]): Promise<void> {
    await this.store.addMessages(messages);
  }

  async values(): Promise<MessageRecord[]> {
    const result = this.store.get(this.conversationId);
    return Promise.resolve(result).then((messages) => messages || []);
  }

  async length(): Promise<number> {
    const result = this.store.countMessages(this.conversationId);
    return Promise.resolve(result);
  }

  async clear(): Promise<void> {
    await this.store.clearConversation(this.conversationId);
  }

  async getMessagesByTimeRange(startTime: string, endTime: string): Promise<MessageRecord[]> {
    const result = this.store.getMessagesByTimeRange(this.conversationId, startTime, endTime);
    return Promise.resolve(result);
  }

  async getRecentMessages(limit: number): Promise<MessageRecord[]> {
    const result = this.store.getRecentMessages(this.conversationId, limit);
    return Promise.resolve(result);
  }

  async getFilteredMessages(
    conversationId: string,
    keywords: string[],
    startTime: string,
    endTime: string,
    participants?: string[],
    maxResults?: number
  ): Promise<MessageRecord[]> {
    const result = this.store.getFilteredMessages(
      conversationId,
      keywords,
      startTime,
      endTime,
      participants,
      maxResults
    );
    return Promise.resolve(result);
  }
}
