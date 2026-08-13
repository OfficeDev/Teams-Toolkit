import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { AzureChatOpenAI, ChatOpenAI } from "@langchain/openai";
import { ActivityTypes } from "@microsoft/agents-activity";
import {
  AgentApplicationBuilder,
  MessageFactory,
  TurnContext,
} from "@microsoft/agents-hosting";
import * as fs from "fs";
import * as path from "path";
import { dateTool } from "./tools/dateTimeTool";
import { getWeatherTool } from "./tools/getWeatherTool";

function isSupportsFilesEnabled(): boolean {
  const candidates = [
    path.resolve(process.cwd(), "appPackage/manifest.json"),
    path.resolve(__dirname, "../appPackage/manifest.json"),
    path.resolve(__dirname, "../../appPackage/manifest.json"),
  ];
  for (const manifestPath of candidates) {
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        const bots = manifest.bots;
        if (Array.isArray(bots)) {
          return bots.some((bot: any) => bot.supportsFiles === true);
        }
      } catch {
        // Ignore parse errors and try next candidate
      }
    }
  }
  return false;
}

export const weatherAgent = new AgentApplicationBuilder().build();

const supportsFilesWarning = isSupportsFilesEnabled()
  ? `⚠️ Notice: The "supportsFiles" option is currently enabled in the app manifest, ` +
    `but file attachment handling is not a supported feature for Custom Engine Agents at this time. ` +
    `Please refer to the known issues documentation for more details: ` +
    `https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/known-issues#custom-engine-agents`
  : "";
let supportsFilesWarned = false;

weatherAgent.onConversationUpdate(
  "membersAdded",
  async (context: TurnContext) => {
    await context.sendActivity(
      `Hello and Welcome! I'm here to help with all your weather forecast needs!`
    );
    if (supportsFilesWarning && !supportsFilesWarned) {
      supportsFilesWarned = true;
      await context.sendActivity(supportsFilesWarning);
    }
  }
);

type WeatherForecastAgentResponse =
  | { contentType: "Text"; content: string }
  | { contentType: "AdaptiveCard"; content: string | Record<string, unknown> };

{{#useOpenAI}}
const agentModel = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4o-mini",
  temperature: 0,
});
{{/useOpenAI}}
{{#useAzureOpenAI}}
const agentModel = new AzureChatOpenAI({
  azureOpenAIApiVersion: "2024-12-01-preview",
  azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
  azureOpenAIEndpoint: process.env.AZURE_OPENAI_ENDPOINT,
  azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
  temperature: 0,
});
{{/useAzureOpenAI}}

const agentTools = [getWeatherTool, dateTool];
const agentCheckpointer = new MemorySaver();
const agent = createReactAgent({
  llm: agentModel,
  tools: agentTools,
  checkpointSaver: agentCheckpointer,
});

const sysMessage = new SystemMessage(`
You are a friendly assistant that helps people find a weather forecast for a given time and place.
You may ask follow up questions until you have enough informatioon to answer the customers question,
but once you have a forecast forecast, make sure to format it nicely using an adaptive card.

Respond in JSON format with the following JSON schema, and do not use markdown in the response:

{
    "contentType": "'Text' or 'AdaptiveCard' only",
    "content": "{The content of the response, may be plain text, or JSON based adaptive card}"
}

For Text responses, content must be a string.
For AdaptiveCard responses, content must be a JSON object, not a JSON-encoded string.`);

weatherAgent.onActivity(ActivityTypes.Message, async (context, state) => {
  if (supportsFilesWarning && !supportsFilesWarned) {
    supportsFilesWarned = true;
    await context.sendActivity(supportsFilesWarning);
  }
  const llmResponse = await agent.invoke(
    {
      messages: [sysMessage, new HumanMessage(context.activity.text!)],
    },
    {
      configurable: { thread_id: context.activity.conversation!.id },
    }
  );

  const llmResponseContent: WeatherForecastAgentResponse = JSON.parse(
    llmResponse.messages[llmResponse.messages.length - 1].content as string
  );

  if (llmResponseContent.contentType === "Text") {
    await context.sendActivity(llmResponseContent.content);
  } else if (llmResponseContent.contentType === "AdaptiveCard") {
    const adaptiveCardContent =
      typeof llmResponseContent.content === "string"
        ? JSON.parse(llmResponseContent.content)
        : llmResponseContent.content;
    const response = MessageFactory.attachment({
      contentType: "application/vnd.microsoft.card.adaptive",
      content: adaptiveCardContent,
    });
    await context.sendActivity(response);
  }
});
