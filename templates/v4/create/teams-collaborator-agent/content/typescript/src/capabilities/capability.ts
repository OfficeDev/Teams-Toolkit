import { ChatPrompt } from "@microsoft/teams.ai";
import { ILogger } from "@microsoft/teams.common";
import { getModelConfig } from "../utils/config";
import { MessageContext } from "../utils/messageContext";

/**
 * Interface for capability definition used by the manager
 */
export interface CapabilityDefinition {
  name: string;
  manager_desc: string;
  handler: (context: MessageContext, logger: ILogger) => Promise<string>;
}

/**
 * Result interface for capability responses
 */
export interface CapabilityResult {
  response: string;
  error?: string;
}

/**
 * Base interface that all capabilities must implement
 */
export interface Capability {
  /**
   * The name/type of this capability
   */
  readonly name: string;

  /**
   * Create a ChatPrompt instance for this capability
   */
  createPrompt(context: MessageContext): ChatPrompt;

  /**
   * Process a user request using this capability
   */
  processRequest(context: MessageContext): Promise<CapabilityResult>;
}

/**
 * Abstract base class that provides common functionality for all capabilities
 */
export abstract class BaseCapability implements Capability {
  abstract readonly name: string;

  constructor(public logger: ILogger) {}

  abstract createPrompt(context: MessageContext): ChatPrompt;

  /**
   * Default implementation of processRequest that creates a prompt and sends the request
   */
  async processRequest(context: MessageContext): Promise<CapabilityResult> {
    try {
      const prompt = this.createPrompt(context);

      const response = await prompt.send(context.text);

      return {
        response: response.content || "No response generated",
      };
    } catch (error) {
      return {
        response: "",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Helper method to get model configuration
   */
  protected getModelConfig(configKey: string) {
    return getModelConfig(configKey);
  }
}
