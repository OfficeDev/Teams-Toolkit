import { CitationAppearance, Client, IMessageActivity } from "@microsoft/teams.api";
import { ConversationMemory } from "../storage/conversationMemory";
import { IDatabase } from "../storage/database";

/**
 * Context object that stores all important information for processing a message
 */
export interface MessageContext {
  text: string;
  conversationId: string;
  userId?: string;
  userName: string;
  timestamp: string;
  isPersonalChat: boolean;
  activityId: string;
  members: Array<{ name: string; id: string }>; // Available conversation members
  memory: ConversationMemory; // get convo memory by agent type
  startTime: string;
  endTime: string;
  citations: CitationAppearance[];
}

async function getConversationParticipantsFromAPI(
  api: Client,
  conversationId: string
): Promise<Array<{ name: string; id: string }>> {
  try {
    const members = await api.conversations.members(conversationId).get();

    if (Array.isArray(members)) {
      const participants = members.map((member) => ({
        name: member.name || "Unknown",
        id: member.aadObjectId || member.id,
      }));
      return participants;
    } else {
      return [];
    }
  } catch (error) {
    return [];
  }
}

/**
 * Factory function to create a MessageContext from a Teams activity
 */
export async function createMessageContext(
  storage: IDatabase,
  activity: IMessageActivity,
  api?: Client
): Promise<MessageContext> {
  const text = activity.text || "";
  const conversationId = `${activity.conversation.id}`;
  const userId = activity.from.id;
  const userName = activity.from.name || "User";
  const timestamp = activity.timestamp?.toString() || "Unknown";
  const isPersonalChat = activity.conversation.conversationType === "personal";
  const activityId = activity.id;

  // Fetch members for group conversations
  let members: Array<{ name: string; id: string }> = [];
  if (api) {
    members = await getConversationParticipantsFromAPI(api, conversationId);
  }

  const memory = new ConversationMemory(storage, conversationId);

  const now = new Date();

  const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const endTime = now.toISOString();
  const citations: CitationAppearance[] = [];

  const context: MessageContext = {
    text,
    conversationId,
    userId,
    userName,
    timestamp,
    isPersonalChat,
    activityId,
    members,
    memory,
    startTime,
    endTime,
    citations,
  };

  return context;
}
