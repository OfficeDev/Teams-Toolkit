import { ObjectSchema } from "@microsoft/teams.ai";

export interface SearchMessagesArgs {
  keywords: string[];
  participants?: string[];
  max_results?: number;
}

export const SEARCH_MESSAGES_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    keywords: {
      type: "array",
      items: { type: "string" },
      description: "Keywords to search for in the message content",
    },
    participants: {
      type: "array",
      items: { type: "string" },
      description: "Optional: list of participant names to filter messages by who said them",
    },
    max_results: {
      type: "number",
      description: "Optional: maximum number of results to return (default is 5)",
    },
  },
  required: ["keywords"],
};
