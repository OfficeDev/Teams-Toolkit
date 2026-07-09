import { Message } from "@microsoft/teams.ai";

interface MessageRecordExtension {
  id?: number;
  conversation_id?: string;
  content: string;
  name: string;
  timestamp: string;
  activity_id?: string; // used to create deeplink for Search Capability
}

export type MessageRecord = Message & MessageRecordExtension;

export interface FeedbackRecord {
  id: number;
  reply_to_id: string;
  reaction: "like" | "dislike" | string;
  feedback: string | null;
  created_at: string;
}
