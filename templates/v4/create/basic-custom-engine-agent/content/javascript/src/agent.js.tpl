const { ActivityTypes } = require("@microsoft/agents-activity");
const { AgentApplication, MemoryStorage } = require("@microsoft/agents-hosting");
const { AzureOpenAI, OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

const config = require("./config");

{{#useOpenAI}}
const client = new OpenAI({
  apiKey: config.openAIKey,
});
{{/useOpenAI}}
{{#useAzureOpenAI}}
const client = new AzureOpenAI({
  apiVersion: "2024-12-01-preview",
  apiKey: config.azureOpenAIKey,
  endpoint: config.azureOpenAIEndpoint,
  deployment: config.azureOpenAIDeploymentName,
});
{{/useAzureOpenAI}}
const systemPrompt = "You are an AI agent that can chat with users.";

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

// Define storage and application
const storage = new MemoryStorage();
const agentApp = new AgentApplication({
  storage,
});

const supportsFilesWarning = isSupportsFilesEnabled()
  ? `⚠️ Notice: The "supportsFiles" option is currently enabled in the app manifest, ` +
    `but file attachment handling is not a supported feature for Custom Engine Agents at this time. ` +
    `Please refer to the known issues documentation for more details: ` +
    `https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/known-issues#custom-engine-agents`
  : "";
let supportsFilesWarned = false;

agentApp.onConversationUpdate("membersAdded", async (context) => {
  await context.sendActivity(`Hi there! I'm an agent to chat with you.`);
  if (supportsFilesWarning && !supportsFilesWarned) {
    supportsFilesWarned = true;
    await context.sendActivity(supportsFilesWarning);
  }
});

// Listen for ANY message to be received. MUST BE AFTER ANY OTHER MESSAGE HANDLERS
agentApp.onActivity(ActivityTypes.Message, async (context) => {
  if (supportsFilesWarning && !supportsFilesWarned) {
    supportsFilesWarned = true;
    await context.sendActivity(supportsFilesWarning);
  }
  // Echo back users request
  const result = await client.chat.completions.create({
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: context.activity.text,
      },
    ],
    {{#useOpenAI}}
    model: config.openAIModelName
    {{/useOpenAI}}
    {{#useAzureOpenAI}}
    model: "",
    {{/useAzureOpenAI}}
  });
  let answer = "";
  for (const choice of result.choices) {
    answer += choice.message.content;
  }
  await context.sendActivity(answer);
});

module.exports = {
  agentApp,
};