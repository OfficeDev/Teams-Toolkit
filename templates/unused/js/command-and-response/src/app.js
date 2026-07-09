const { ManagedIdentityCredential } = require("@azure/identity");
const { App } = require("@microsoft/teams.apps");
const { stripMentionsText } = require("@microsoft/teams.api");
const { HelloWorldCommandHandler } = require("./helloworldCommandHandler");
const { GenericCommandHandler } = require("./genericCommandHandler");
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

const app = new App({ ...credentialOptions, skipAuth: !process.env.CLIENT_ID });

// Initialize command handlers
const helloWorldHandler = new HelloWorldCommandHandler();
const genericHandler = new GenericCommandHandler();

// Register message handler
app.on("message", async ({ activity, send }) => {
  const text = stripMentionsText(activity);

  // Check if helloWorld command
  if (helloWorldHandler.canHandle(text)) {
    const reply = await helloWorldHandler.handleCommandReceived(text);
    if (reply) {
      await send(reply);
    }
    return;
  }

  // Handle all other messages with generic handler
  const reply = await genericHandler.handleCommandReceived(text);
  if (reply) {
    await send(reply);
  }
});

module.exports = app;
