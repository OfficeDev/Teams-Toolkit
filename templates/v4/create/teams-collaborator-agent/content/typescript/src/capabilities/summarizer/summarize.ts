import { ChatPrompt } from "@microsoft/teams.ai";
import { ILogger } from "@microsoft/teams.common";
import { OpenAIChatModel } from "@microsoft/teams.openai";
import { MessageContext } from "../../utils/messageContext";
import { BaseCapability, CapabilityDefinition } from "../capability";
import { SUMMARY_PROMPT } from "./prompt";

export class SummarizerCapability extends BaseCapability {
  readonly name = "summarizer";

  createPrompt(context: MessageContext): ChatPrompt {
    const summarizerModelConfig = this.getModelConfig("summarizer");

    const prompt = new ChatPrompt({
      instructions: SUMMARY_PROMPT,
      model: new OpenAIChatModel({
        model: summarizerModelConfig.model,
        apiKey: summarizerModelConfig.apiKey,
        endpoint: summarizerModelConfig.endpoint,
        apiVersion: summarizerModelConfig.apiVersion,
      }),
    }).function("summarize_conversation", "Summarize the conversation history", async () => {
      const allMessages = await context.memory.getMessagesByTimeRange(
        context.startTime,
        context.endTime
      );
      return JSON.stringify({
        messages: allMessages.map((msg: any) => ({
          timestamp: msg.timestamp,
          name: msg.name,
          content: msg.content,
        })),
      });
    });

    this.logger.debug("Initialized Summarizer Capability!");
    return prompt;
  }
}

// Capability definition for manager registration
export const SUMMARIZER_CAPABILITY_DEFINITION: CapabilityDefinition = {
  name: "summarizer",
  manager_desc: `**Summarizer**: Use for keywords like:
- "summarize", "overview", "recap", "conversation history"
- "what did we discuss", "catch me up", "who said what", "recent messages"`,
  handler: async (context: MessageContext, logger: ILogger) => {
    const summarizerCapability = new SummarizerCapability(logger);
    const result = await summarizerCapability.processRequest(context);
    if (result.error) {
      logger.error(`Error in Summarizer Capability: ${result.error}`);
      return `Error in Summarizer Capability: ${result.error}`;
    }
    return result.response || "No response from Summarizer Capability";
  },
};
