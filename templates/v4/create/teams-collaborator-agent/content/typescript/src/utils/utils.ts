import { IMessageActivity, MessageActivity } from "@microsoft/teams.api";
import { ILogger } from "@microsoft/teams.common";
import * as chrono from "chrono-node";
import { MessageRecord } from "../storage/types";
import { MessageContext } from "./messageContext";

/**
 * Helper function to finalize and send a prompt response with citations
 */
export function finalizePromptResponse(
  text: string,
  context: MessageContext,
  logger: ILogger
): MessageActivity {
  const messageActivity = new MessageActivity(text).addAiGenerated().addFeedback();

  // Add context.citations if provided
  if (context.citations && context.citations.length > 0) {
    logger.debug(`Adding ${context.citations.length} context.citations to message activity`);
    context.citations.forEach((citation, index) => {
      const citationNumber = index + 1;
      messageActivity.addCitation(citationNumber, citation);
      logger.debug(`Citation number ${citationNumber}`);
      logger.debug(citation);
      // The corresponding citation needs to be added in the message content
      messageActivity.text += ` [${citationNumber}]`;
    });
  }

  return messageActivity;
}

/**
 * Calculate start and end times based on lookback period
 */
export function extractTimeRange(
  phrase: string,
  now: Date = new Date()
): { from: Date; to: Date } | null {
  const results = chrono.parse(phrase, now);
  if (!results.length || !results[0].start) {
    return null;
  }

  const { start, end } = results[0];
  const from = start.date();
  const to = end?.date() ?? new Date(from.getTime() + 24 * 60 * 60 * 1000); // +1 day

  return { from, to };
}

export function createMessageRecords(activities: IMessageActivity[]): MessageRecord[] {
  const conversation_id = activities[0].conversation.id; // get conversation ID from user message no matter what
  return activities.map((activity) => ({
    conversation_id: conversation_id,
    role: activity.entities?.some((e: any) => e.additionalType?.includes("AIGeneratedContent"))
      ? "model"
      : "user",
    content: activity.text?.replace(/<\/?at>/g, "") || "",
    timestamp: activity.timestamp?.toString() || new Date().toISOString(),
    activity_id: activity.id,
    name: activity.from?.name || "Collaborator",
  }));
}
