import { ILogger } from "@microsoft/teams.common";
import Database from "better-sqlite3";
import path from "node:path";
import { IDatabase } from "./database";
import { MessageRecord } from "./types";

export class SqliteKVStore implements IDatabase {
  private db: Database.Database;

  constructor(
    private logger: ILogger,
    dbPath?: string
  ) {
    // Use environment variable if set, otherwise use provided dbPath, otherwise use default relative to project root
    const resolvedDbPath = process.env.CONVERSATIONS_DB_PATH
      ? path.resolve(process.env.CONVERSATIONS_DB_PATH)
      : dbPath
        ? dbPath
        : path.resolve(__dirname, "../../src/storage/conversations.db");
    this.db = new Database(resolvedDbPath);
    this.initializeDatabase();
  }

  async initialize(): Promise<void> {
    // SQLite initialization is done in constructor, so this is a no-op for compatibility
    return Promise.resolve();
  }
  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        activity_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        blob TEXT NOT NULL
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversation_id ON conversations(conversation_id);
    `);
    this.db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
    reply_to_id  TEXT    NOT NULL,                -- the Teams message ID you replied to
    reaction     TEXT    NOT NULL CHECK (reaction IN ('like','dislike')),
    feedback     TEXT,                           -- JSON or plain text
    created_at   TEXT    NOT NULL DEFAULT (CURRENT_TIMESTAMP)
  );
    `);
  }

  clearAll(): void {
    this.db.exec("DELETE FROM conversations; VACUUM;");
    this.logger.debug("🧹 Cleared all conversations from SQLite store.");
  }

  get(conversationId: string): MessageRecord[] {
    const stmt = this.db.prepare<unknown[], { blob: string }>(
      "SELECT blob FROM conversations WHERE conversation_id = ? ORDER BY timestamp ASC"
    );
    return stmt.all(conversationId).map((row) => JSON.parse(row.blob) as MessageRecord);
  }

  getMessagesByTimeRange(
    conversationId: string,
    startTime: string,
    endTime: string
  ): MessageRecord[] {
    const stmt = this.db.prepare<unknown[], { blob: string }>(
      "SELECT blob FROM conversations WHERE conversation_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC"
    );
    return stmt
      .all([conversationId, startTime, endTime])
      .map((row) => JSON.parse(row.blob) as MessageRecord);
  }

  getRecentMessages(conversationId: string, limit = 10): MessageRecord[] {
    const messages = this.get(conversationId);
    return messages.slice(-limit);
  }

  clearConversation(conversationId: string): void {
    const stmt = this.db.prepare("DELETE FROM conversations WHERE conversation_id = ?");
    stmt.run(conversationId);
  }

  addMessages(messages: MessageRecord[]): void {
    const stmt = this.db.prepare(
      "INSERT INTO conversations (conversation_id, role, name, content, activity_id, timestamp, blob) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const message of messages) {
      stmt.run(
        message.conversation_id,
        message.role,
        message.name,
        message.content,
        message.activity_id,
        message.timestamp,
        JSON.stringify(message)
      );
    }
  }

  countMessages(conversationId: string): number {
    const stmt = this.db.prepare(
      "SELECT COUNT(*) as count FROM conversations WHERE conversation_id = ?"
    );
    const result = stmt.get(conversationId) as { count: number };
    return result.count;
  }

  // Clear all messages for debugging (optional utility method)
  clearAllMessages(): void {
    try {
      const stmt = this.db.prepare("DELETE FROM conversations");
      const result = stmt.run();
      this.logger.debug(
        `🧹 Cleared all conversations from database. Deleted ${result.changes} records.`
      );
    } catch (error) {
      this.logger.error("❌ Error clearing all conversations:", error);
    }
  }

  getFilteredMessages(
    conversationId: string,
    keywords: string[],
    startTime: string,
    endTime: string,
    participants?: string[],
    maxResults?: number
  ): MessageRecord[] {
    const keywordClauses = keywords.map(() => `content LIKE ?`).join(" OR ");
    const participantClauses = participants?.map(() => `name LIKE ?`).join(" OR ");

    // Base where clauses
    const whereClauses = [
      `conversation_id = ?`,
      `timestamp >= ?`,
      `timestamp <= ?`,
      `(${keywordClauses})`,
    ];

    // Values for the prepared statement
    const values: (string | number)[] = [
      conversationId,
      startTime,
      endTime,
      ...keywords.map((k) => `%${k.toLowerCase()}%`),
    ];

    // Add participant filters if present
    if (participants && participants.length > 0) {
      whereClauses.push(`(${participantClauses})`);
      values.push(...participants.map((p) => `%${p.toLowerCase()}%`));
    }

    const limit = maxResults && typeof maxResults === "number" ? maxResults : 5;
    values.push(limit);

    const query = `
  SELECT blob FROM conversations
  WHERE ${whereClauses.join(" AND ")}
  ORDER BY timestamp DESC
  LIMIT ?
`;

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...values) as Array<{ blob: string }>;
    return rows.map((row) => JSON.parse(row.blob) as MessageRecord);
  }
  // ===== FEEDBACK MANAGEMENT =====

  // Initialize feedback record for a message with optional delegated capability
  // Insert one row per submission
  recordFeedback(
    replyToId: string,
    reaction: "like" | "dislike" | string,
    feedbackJson?: unknown
  ): boolean {
    try {
      const stmt = this.db.prepare(`
      INSERT INTO feedback (reply_to_id, reaction, feedback)
      VALUES (?, ?, ?)
    `);
      const result = stmt.run(
        replyToId,
        reaction,
        feedbackJson ? JSON.stringify(feedbackJson) : null
      );
      return result.changes > 0;
    } catch (err) {
      this.logger.error(`❌ recordFeedback error:`, err);
      return false;
    }
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.logger.debug("🔌 Closed SQLite database connection");
    }
  }
}
