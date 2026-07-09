const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { MemorySaver } = require("@langchain/langgraph");
const { createReactAgent } = require("@langchain/langgraph/prebuilt");
const { AzureChatOpenAI, ChatOpenAI } = require("@langchain/openai");
const { ActivityTypes } = require("@microsoft/agents-activity");
const { AgentApplicationBuilder, MessageFactory } = require("@microsoft/agents-hosting");
const fs = require("fs");
const path = require("path");
const { dateTool } = require("./tools/dateTimeTool");
const { getWeatherTool } = require("./tools/getWeatherTool");

function isSupportsFilesEnabled() {
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
          return bots.some((bot) => bot.supportsFiles === true);
        }
      } catch {
        // Ignore parse errors and try next candidate
      }
    }
  }
  return false;
}

const weatherAgent = new AgentApplicationBuilder().build();

const supportsFilesWarning = isSupportsFilesEnabled()
  ? `⚠️ Notice: The "supportsFiles" option is currently enabled in the app manifest, ` +
    `but file attachment handling is not a supported feature for Custom Engine Agents at this time. ` +
    `Please refer to the known issues documentation for more details: ` +
    `https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/known-issues#custom-engine-agents`
  : "";
let supportsFilesWarned = false;

weatherAgent.onConversationUpdate(
  "membersAdded",
  async (context) => {
    await context.sendActivity(
      `Hello and Welcome! I'm here to help with all your weather forecast needs!`
    );
    if (supportsFilesWarning && !supportsFilesWarned) {
      supportsFilesWarned = true;
      await context.sendActivity(supportsFilesWarning);
    }
  }
);

{{#useOpenAI}}
const agentModel = new ChatOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-3.5-turbo",
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
}`);

weatherAgent.onActivity(ActivityTypes.Message, async (context, state) => {
  if (supportsFilesWarning && !supportsFilesWarned) {
    supportsFilesWarned = true;
    await context.sendActivity(supportsFilesWarning);
  }
  const llmResponse = await agent.invoke(
    {
      messages: [sysMessage, new HumanMessage(context.activity.text)],
    },
    {
      configurable: { thread_id: context.activity.conversation.id },
    }
  );

  const llmResponseContent = JSON.parse(
    llmResponse.messages[llmResponse.messages.length - 1].content
  );

  if (llmResponseContent.contentType === "Text") {
    await context.sendActivity(llmResponseContent.content);
  } else if (llmResponseContent.contentType === "AdaptiveCard") {
    const response = MessageFactory.attachment({
      contentType: "application/vnd.microsoft.card.adaptive",
      content: llmResponseContent.content,
    });
    await context.sendActivity(response);
  }
});

module.exports = {
  weatherAgent,
};
