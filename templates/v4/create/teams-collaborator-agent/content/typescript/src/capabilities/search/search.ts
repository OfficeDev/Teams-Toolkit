import { ChatPrompt } from "@microsoft/teams.ai";
import { CitationAppearance } from "@microsoft/teams.api";
import { ILogger } from "@microsoft/teams.common";
import { OpenAIChatModel } from "@microsoft/teams.openai";
import { MessageRecord } from "../../storage/types";
import { MessageContext } from "../../utils/messageContext";
import { BaseCapability, CapabilityDefinition } from "../capability";
import { SEARCH_PROMPT } from "./prompt";
import { SEARCH_MESSAGES_SCHEMA, SearchMessagesArgs } from "./schema";

const dateFormat = new Intl.DateTimeFormat("en-US");

export class SearchCapability extends BaseCapability {
  readonly name = "search";

  createPrompt(context: MessageContext): ChatPrompt {
    const searchModelConfig = this.getModelConfig("search");

    const prompt = new ChatPrompt({
      instructions: SEARCH_PROMPT,
      model: new OpenAIChatModel({
        model: searchModelConfig.model,
        apiKey: searchModelConfig.apiKey,
        endpoint: searchModelConfig.endpoint,
        apiVersion: searchModelConfig.apiVersion,
      }),
    }).function(
      "search_messages",
      "Search the conversation for relevant messages",
      SEARCH_MESSAGES_SCHEMA,
      async ({ keywords, participants, max_results }: SearchMessagesArgs) => {
        const selected = await context.memory.getFilteredMessages(
          context.conversationId,
          keywords,
          context.startTime,
          context.endTime,
          participants,
          max_results
        );
        this.logger.debug(selected);

        if (selected.length === 0) {
          return "No matching messages found.";
        }

        // Create and store citations
        const citations = selected.map((msg) =>
          createCitationFromRecord(msg, context.conversationId)
        );
        context.citations.push(...citations);

        // Return formatted message list with links
        return selected
          .map((msg) => {
            const date = new Date(msg.timestamp).toLocaleString();
            const preview = msg.content.slice(0, 100);
            const citation = citations.find((c) => c.keywords?.includes(msg.name));
            const link = citation?.url || "#";
            return `• [${msg.name}](${link}) at ${date}: "${preview}"`;
          })
          .join("\n");
      }
    );

    this.logger.debug("Initialized Search Capability!");
    return prompt;
  }
}

function createDeepLink(activityId: string, conversationId: string): string {
  const contextParam = encodeURIComponent(JSON.stringify({ contextType: "chat" }));
  return `https://teams.microsoft.com/l/message/${encodeURIComponent(
    conversationId
  )}/${activityId}?context=${contextParam}`;
}

function createCitationFromRecord(
  message: MessageRecord,
  conversationId: string
): CitationAppearance {
  const date = new Date(message.timestamp);
  const formatted = dateFormat.format(date);
  const preview =
    message.content.length > 120 ? message.content.slice(0, 120) + "..." : message.content;
  const deepLink = createDeepLink(message.activity_id!, conversationId);

  return {
    name: `Message from ${message.name}`,
    url: deepLink,
    abstract: `${formatted}: "${preview}"`,
    keywords: [message.name],
  };
}

// Capability definition for manager registration
export const SEARCH_CAPABILITY_DEFINITION: CapabilityDefinition = {
  name: "search",
  manager_desc: `**Search**: Use for:
- "find", "search", "show me", "conversation with", "where did [person] say", "messages from last week"`,
  handler: async (context: MessageContext, logger: ILogger) => {
    const searchCapability = new SearchCapability(logger);
    const result = await searchCapability.processRequest(context);
    if (result.error) {
      logger.error(`❌ Error in Search Capability: ${result.error}`);
      return `Error in Search Capability: ${result.error}`;
    }
    return result.response || "No response from Search Capability";
  },
};
