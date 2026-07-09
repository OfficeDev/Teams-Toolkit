import { ObjectSchema } from "@microsoft/teams.ai";

/**
 * Template Function Arguments Interface
 * Define the shape of arguments that your capability expects
 */
export interface TemplateFunctionArgs {
  // TODO: Add your capability-specific parameters here
  // Examples:

  // For a document capability:
  // document_type: string;
  // format_preference?: string;

  // For a calendar capability:
  // meeting_duration?: number;
  // preferred_time?: string;

  // For now, using a generic message parameter
  message?: string;
  action?: string;
}

/**
 * Template Function Schema
 * This schema defines the function parameters that will be available to the AI model
 */
export const TEMPLATE_FUNCTION_SCHEMA: ObjectSchema = {
  type: "object",
  properties: {
    // TODO: Add your capability-specific parameters here
    // Examples:

    // For a document capability:
    // document_type: {
    //     type: 'string',
    //     description: 'Type of document to work with (e.g., "report", "meeting-notes", "proposal")',
    //     enum: ['report', 'meeting-notes', 'proposal', 'other']
    // },
    // format_preference: {
    //     type: 'string',
    //     description: 'Preferred output format (e.g., "markdown", "json", "plain-text")'
    // },

    // For a calendar capability:
    // meeting_duration: {
    //     type: 'number',
    //     description: 'Duration of the meeting in minutes'
    // },
    // preferred_time: {
    //     type: 'string',
    //     description: 'Preferred time for the meeting (e.g., "morning", "afternoon", "evening")'
    // },

    // Generic parameters for now
    message: {
      type: "string",
      description: "Optional message or additional context for the template capability",
    },
    action: {
      type: "string",
      description: "Optional action to perform with the template capability",
    },
  },
  required: [], // TODO: Specify which parameters are required
};
