import { App } from "@microsoft/teams.apps";
import { ChatPrompt } from "@microsoft/teams.ai";
import { LocalStorage } from "@microsoft/teams.common";
import { OpenAIChatModel } from "@microsoft/teams.openai";
import { MessageActivity, TokenCredentials } from '@microsoft/teams.api';
import { ManagedIdentityCredential } from '@azure/identity';
import * as fs from 'fs';
import * as path from 'path';
import config from "../config";
import { MyDataSource } from "./myDataSource";

// Create storage for conversation history
const storage = new LocalStorage();

// Initialize the standalone data source
const dataSource = new MyDataSource("company-knowledge");
dataSource.init();

// Load instructions from file on initialization
function loadInstructions(): string {
  const instructionPath = path.join(__dirname, 'instructions.txt');
  return fs.readFileSync(instructionPath, 'utf-8').trim();
}

// Load instructions once at startup
const instructions = loadInstructions();


const createTokenFactory = () => {
  return async (scope: string | string[], tenantId?: string): Promise<string> => {
    const managedIdentityCredential = new ManagedIdentityCredential({
        clientId: process.env.CLIENT_ID
      });
    const scopes = Array.isArray(scope) ? scope : [scope];
    const tokenResponse = await managedIdentityCredential.getToken(scopes, {
      tenantId: tenantId
    });
   
    return tokenResponse.token;
  };
};

// Configure authentication using TokenCredentials
const tokenCredentials: TokenCredentials = {
  clientId: process.env.CLIENT_ID || '',
  token: createTokenFactory()
};

const credentialOptions = config.MicrosoftAppType === "UserAssignedMsi" ? { ...tokenCredentials } : undefined;

const app = new App({
  ...credentialOptions,
  storage,
  skipAuth: !process.env.CLIENT_ID,
});


// Handle incoming messages
app.on('message', async ({ send, activity }) => {
  //Get conversation history
  const conversationKey = `${activity.conversation.id}/${activity.from.id}`;
  const messages = storage.get(conversationKey) || [];

  try {
    // Get relevant context from the data source
    const contextData = dataSource.renderContext(activity.text);
    
    // Build enhanced instructions that include context if available
    let enhancedInstructions = instructions;
    if (contextData.content) {
      enhancedInstructions += `\n\nAdditional Context (Sources: ${contextData.sources.join(', ')}):\n${contextData.content}`;
    }

    const prompt = new ChatPrompt({
      messages,
      instructions: enhancedInstructions,
      {{#useOpenAI}}
      model: new OpenAIChatModel({
        model: config.openAIModelName,
        apiKey: config.openAIKey
      })
      {{/useOpenAI}}
      {{#useAzureOpenAI}}
      model: new OpenAIChatModel({
        model: config.azureOpenAIDeploymentName,
        apiKey: config.azureOpenAIKey,
        endpoint: config.azureOpenAIEndpoint,
        apiVersion: "2024-10-21"
      })
      {{/useAzureOpenAI}}
    });

    const response = await prompt.send(activity.text);
    
    // Create response with AI generated indicator and add citations if we used context
    let result = null;
    
    try {
      result = JSON.parse(response.content);
    } catch (error) {
      console.error(`Response is not valid json, using raw text. error: ${error}`);
      await send(response.content);
      return;
    }

    // Process citations if they exist in the parsed response
    const citations: any[] = [];
    let position = 1;
    let content = "";

    if (result && result.results && result.results.length > 0) {
      result.results.forEach((contentItem: any) => {
        if (contentItem.citationTitle ) {
          const citation = {
            name: contentItem.citationTitle || `Document #${position}`,
            abstract: contentItem.citationContent ?? `Information from ${contentItem.citationTitle}`,
          };
          
         content += `${contentItem.answer}[${position}]<br>`;
          
          position++;
          citations.push(citation);
        } else {
          // Add content without citation
          content += `${contentItem.answer}<br>`;
        }
      });
    }
    
    const responseActivity = new MessageActivity(content).addAiGenerated();
    
    // Add citations from parsed response or fallback to context sources
    if (citations.length > 0) {
      citations.forEach((citation, index) => {
        responseActivity.addCitation(index + 1, {
          name: citation.name,
          abstract: `${citation.abstract}`
        });
      });
    } 
    
    await send(responseActivity);
    storage.set(conversationKey, messages);

  } catch (error) {
    console.error('Error processing message:', error);
    await send('Sorry, I encountered an error while processing your message.');
  }
});

export default app;