import { ChatPrompt } from "@microsoft/teams.ai";
import { ILogger } from "@microsoft/teams.common";
import { OpenAIChatModel } from "@microsoft/teams.openai";
import { MessageContext } from "../../utils/messageContext";
import { BaseCapability, CapabilityDefinition } from "../capability";
import { TEMPLATE_PROMPT } from "./prompt";
import { TEMPLATE_FUNCTION_SCHEMA, TemplateFunctionArgs } from "./schema";

/**
 * Template Capability - Replace this description with your capability's purpose
 *
 * This template provides the basic structure for creating a new capability.
 * Replace "Template" with your capability name throughout this file.
 *
 * Your capability should:
 * 1. Have a clear, single responsibility
 * 2. Process the user's request within its domain
 * 3. Return structured results
 * 4. Handle errors gracefully
 */
export class TemplateCapability extends BaseCapability {
  readonly name = "template";

  createPrompt(context: MessageContext): ChatPrompt {
    const templateModelConfig = this.getModelConfig("template");

    const prompt = new ChatPrompt({
      instructions: TEMPLATE_PROMPT,
      model: new OpenAIChatModel({
        model: templateModelConfig.model,
        apiKey: templateModelConfig.apiKey,
        endpoint: templateModelConfig.endpoint,
        apiVersion: templateModelConfig.apiVersion,
      }),
    }).function(
      "process_template_request",
      "Process a template-specific request",
      TEMPLATE_FUNCTION_SCHEMA,
      async (args: TemplateFunctionArgs) => {
        this.logger.debug(`🔧 Template Capability processing request with args:`, args);

        // TODO: Implement your capability's core logic here

        // Example: Basic request processing
        const userRequest = context.text;
        const userName = context.userName;
        const isPersonalChat = context.isPersonalChat;

        // TODO: Replace this with your actual processing logic
        const response = `Template capability received: "${userRequest}" from user ${userName} in ${
          isPersonalChat ? "personal" : "group"
        } chat. Args: ${JSON.stringify(args)}`;

        this.logger.debug(`✅ Template Capability completed successfully`);

        return response;
      }
    );

    this.logger.debug("Initialized Template Capability!");
    return prompt;
  }
}

// Capability definition for manager registration
export const TEMPLATE_CAPABILITY_DEFINITION: CapabilityDefinition = {
  name: "template",
  manager_desc: `**Template**: Use for:
- TODO: Add description of when to use this capability
- Example: "template requests", "custom processing", etc.`,
  handler: async (context: MessageContext, logger: ILogger) => {
    const templateCapability = new TemplateCapability(logger);
    const result = await templateCapability.processRequest(context);
    if (result.error) {
      logger.error(`❌ Error in Template Capability: ${result.error}`);
      return `Error in Template Capability: ${result.error}`;
    }
    return result.response || "No response from Template Capability";
  },
};
