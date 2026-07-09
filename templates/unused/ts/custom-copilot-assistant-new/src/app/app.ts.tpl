import { App } from '@microsoft/teams.apps';
import { ChatPrompt } from '@microsoft/teams.ai';
import { OpenAIChatModel} from '@microsoft/teams.openai';
import config from '../config';
import { MessageActivity, TokenCredentials } from '@microsoft/teams.api';
import { ManagedIdentityCredential } from '@azure/identity';
import * as fs from 'fs';
import * as path from 'path';
import { createTaskHandler, deleteTaskHandler, taskStorage } from './taskHandlers';

// Load function definitions from JSON file
const loadFunctionDefinitions = () => {
  const functionsPath = path.join(__dirname, 'functions.json');
  return JSON.parse(fs.readFileSync(functionsPath, 'utf8'));
};

// Function to read AI instructions from file
const getAIInstructions = (): string => {
  const instructionsPath = path.join(__dirname, 'instructions.txt');
  return fs.readFileSync(instructionsPath, 'utf8');
};

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

// Create the main App instance
const app = new App({...credentialOptions, skipAuth: !process.env.CLIENT_ID});

const instructions = getAIInstructions();

// Handle messages with AI and task management
app.on('message', async ({ send, activity }) => {
  await send({ type: 'typing' });

  // Handle reset command
  if (activity.text === 'reset') {
    const conversationId = activity.conversation.id;
    taskStorage.delete(conversationId);
    await send('Ok lets start this over.');
    return;
  }

  try {
    const conversationId = activity.conversation.id;
    const functionDefs = loadFunctionDefinitions();
    const currentTasks = taskStorage.get(conversationId);
    
    // Create a new ChatPrompt with conversation-specific functions
    const conversationPrompt = new ChatPrompt(
      {
        instructions: `${instructions}\ncurrent tasks: ${JSON.stringify(currentTasks)}`,
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
      }
    ).function(
        functionDefs.createTask.name,
        functionDefs.createTask.description,
        functionDefs.createTask.parameters,
        async (parameters: { title: string; description: string }) => {
          return await createTaskHandler(parameters, conversationId);
        }
      )
      .function(
        functionDefs.deleteTask.name,
        functionDefs.deleteTask.description,
        functionDefs.deleteTask.parameters,
        async (parameters: { title: string }) => {
          return await deleteTaskHandler(parameters, conversationId);
        }
      );

    // Send message to AI
    const response = await conversationPrompt.send(activity.text);

    const responseActivity = new MessageActivity(response.content).addAiGenerated().addFeedback();
    await send(responseActivity);
  } catch (error) {
    console.error('Error processing message:', error);
    await send('Sorry, I encountered an error processing your request.');
  }
});

app.on("conversationUpdate", async ({ send, activity }) => {
  const welcomeText = "How can I help you today?";
  
  if (activity.membersAdded && activity.membersAdded.length > 0) {
    for (const member of activity.membersAdded) {
      if (member.id !== activity.recipient?.id) {
        await send(welcomeText);
      }
    }
  }
})

app.on('message.submit.feedback', async ({ activity }) => {
  //add custom feedback process logic here
  console.log("Your feedback is " + JSON.stringify(activity.value));
})

export default app;