import { App } from "@microsoft/teams.apps";
import { DoStuffActionHandler } from "./cardActions/doStuffActionHandler";
import { GenericCommandHandler } from "./commands/genericCommandHandler";
import { HelloWorldCommandHandler } from "./commands/helloworldCommandHandler";
import { TokenCredentials, stripMentionsText } from "@microsoft/teams.api";
import { ManagedIdentityCredential } from "@azure/identity";
import config from "./internal/config";

// Create the app with logger

const createTokenFactory = () => {
  return async (scope: string | string[], tenantId?: string): Promise<string> => {
    const managedIdentityCredential = new ManagedIdentityCredential({
      clientId: process.env.CLIENT_ID,
    });
    const scopes = Array.isArray(scope) ? scope : [scope];
    const tokenResponse = await managedIdentityCredential.getToken(scopes, {
      tenantId: tenantId,
    });

    return tokenResponse.token;
  };
};

// Configure authentication using TokenCredentials
const tokenCredentials: TokenCredentials = {
  clientId: process.env.CLIENT_ID || "",
  token: createTokenFactory(),
};

const credentialOptions =
  config.MicrosoftAppType === "UserAssignedMsi" ? { ...tokenCredentials } : undefined;

// Create the app
export const app = new App({
  ...credentialOptions,
  skipAuth: !process.env.CLIENT_ID,
});

// Initialize command handlers
const helloworldCommandHandler = new HelloWorldCommandHandler();
const genericCommandHandler = new GenericCommandHandler();
const doStuffActionHandler = new DoStuffActionHandler();

app.on("message", async ({ activity, send }) => {
  const text: string = stripMentionsText(activity);
  if (helloworldCommandHandler.shouldTrigger(text)) {
    const response = await helloworldCommandHandler.handleCommandReceived(text);
    if (response) {
      await send(response);
    }
    return;
  }

  const response = await genericCommandHandler.handleCommandReceived(text);
  if (response) {
    await send(response);
  }
});

// Handle adaptive card actions
app.on("card.action", async ({ activity, send }) => {
  const verb = activity.value?.action?.verb;
  if (verb === doStuffActionHandler.triggerVerb) {
    const response = await doStuffActionHandler.handleActionInvoked();
    await send(response);
  } else {
    return {
      statusCode: 400,
      type: "application/vnd.microsoft.error",
      value: {
        code: "BadRequest",
        message: "Unknown action",
        innerHttpError: {
          statusCode: 400,
          body: { error: "Unknown action" },
        },
      },
    };
  }
});
