const { ManagedIdentityCredential } = require("@azure/identity");
const { App } = require("@microsoft/teams.apps");
const { stripMentionsText } = require("@microsoft/teams.api");
const { DoStuffActionHandler } = require("./cardActions/doStuffActionHandler");
const { GenericCommandHandler } = require("./commands/genericCommandHandler");
const { HelloWorldCommandHandler } = require("./commands/helloworldCommandHandler");
const config = require("./internal/config");

const createTokenFactory = () => {
  return async (scope, tenantId) => {
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
const tokenCredentials = {
  clientId: process.env.CLIENT_ID || "",
  token: createTokenFactory(),
};

const credentialOptions =
  config.MicrosoftAppType === "UserAssignedMsi" ? { ...tokenCredentials } : undefined;

// Create the app with logger
const app = new App({ ...credentialOptions, skipAuth: !process.env.CLIENT_ID });

// Initialize command handlers
const helloworldCommandHandler = new HelloWorldCommandHandler();
const genericCommandHandler = new GenericCommandHandler();
const doStuffActionHandler = new DoStuffActionHandler();

app.on("message", async ({ activity, send }) => {
  const text = stripMentionsText(activity);
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

// Export the app
module.exports = { app };
