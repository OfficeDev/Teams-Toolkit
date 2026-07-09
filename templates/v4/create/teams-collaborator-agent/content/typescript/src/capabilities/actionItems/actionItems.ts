import { ChatPrompt } from "@microsoft/teams.ai";
import { ILogger } from "@microsoft/teams.common";
import { OpenAIChatModel } from "@microsoft/teams.openai";
import { MessageContext } from "../../utils/messageContext";
import { BaseCapability, CapabilityDefinition } from "../capability";
import { ACTION_ITEMS_PROMPT } from "./prompt";

export class ActionItemsCapability extends BaseCapability {
  readonly name = "action_items";

  createPrompt(context: MessageContext): ChatPrompt {
    const actionItemsModelConfig = this.getModelConfig("actionItems");

    const prompt = new ChatPrompt({
      instructions: ACTION_ITEMS_PROMPT,
      model: new OpenAIChatModel({
        model: actionItemsModelConfig.model,
        apiKey: actionItemsModelConfig.apiKey,
        endpoint: actionItemsModelConfig.endpoint,
        apiVersion: actionItemsModelConfig.apiVersion,
      }),
    }).function(
      "generate_action_items",
      "Generate a list of action items based on the conversation",
      async () => {
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
      }
    );

    this.logger.debug(
      `Initialized Action Items Capability using ${context.members.length} members from context`
    );
    return prompt;
  }
}

// Capability definition for manager registration
export const ACTION_ITEMS_CAPABILITY_DEFINITION: CapabilityDefinition = {
  name: "action_items",
  manager_desc: `**Action Items**: Use for requests like:
- "next steps", "to-do", "assign task", "my tasks", "what needs to be done"`,
  handler: async (context: MessageContext, logger: ILogger) => {
    const actionItemsCapability = new ActionItemsCapability(logger);
    const result = await actionItemsCapability.processRequest(context);
    if (result.error) {
      logger.error(`Error in Action Items Capability: ${result.error}`);
      return `Error in Action Items Capability: ${result.error}`;
    }
    return result.response || "No response from Action Items Capability";
  },
};
