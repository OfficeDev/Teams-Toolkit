import { ManagedIdentityCredential } from "@azure/identity";
import { cardAttachment, TokenCredentials } from "@microsoft/teams.api";
import { App } from "@microsoft/teams.apps";
import { IAdaptiveCard } from "@microsoft/teams.cards";
import { ConsoleLogger } from "@microsoft/teams.common/logging";
import { DevtoolsPlugin } from "@microsoft/teams.dev";

import {
  createCard,
  createConversationMembersCard,
  createDummyCards,
  createLinkUnfurlCard,
  createMessageDetailsCard,
} from "./card";

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

// Use managed identity in cloud environment, otherwise use devtools plugin for local development
const options =
  process.env.BOT_TYPE === "UserAssignedMsi"
    ? { ...tokenCredentials }
    : { plugins: [new DevtoolsPlugin()] };

const app = new App({
  ...options,
  logger: new ConsoleLogger("{{appName}}", { level: "debug" }),
  skipAuth: !process.env.CLIENT_ID,
});

app.on("install.add", async ({ send }) => {
  const greeting = `
  Hi this app handles:<br>
    1. Basic message handling - echoing back what you say<br>
    2. Link unfurling - creating preview cards when you paste URLs<br>
    3. Message extension commands - handling card creation.
  `;
  await send(greeting);
});

app.on("message", async ({ send, activity }) => {
  await send({ type: "typing" });
  await send(`you said "${activity.text}"`);
});

// :snippet-start: message-ext-query-link
app.on("message.ext.query-link", async ({ activity }) => {
  const { url } = activity.value;

  if (!url) {
    return { status: 400 };
  }

  const { card, thumbnail } = createLinkUnfurlCard(url);
  const attachment = {
    ...cardAttachment("adaptive", card), // expanded card in the compose box...
    preview: cardAttachment("thumbnail", thumbnail), //preview card in the compose box...
  };

  return {
    composeExtension: {
      type: "result",
      attachmentLayout: "list",
      attachments: [attachment],
    },
  };
});
// :snippet-end: message-ext-query-link
// :snippet-start: message-ext-submit
app.on("message.ext.submit", async ({ activity }) => {
  const { commandId } = activity.value;
  let card: IAdaptiveCard;

  if (commandId === "createCard") {
    // activity.value.commandContext == "compose"
    card = createCard(activity.value.data);
  } else if (commandId === "getMessageDetails" && activity.value.messagePayload) {
    // activity.value.commandContext == "message"
    card = createMessageDetailsCard(activity.value.messagePayload);
  } else {
    throw new Error(`Unknown commandId: ${commandId}`);
  }

  return {
    composeExtension: {
      type: "result",
      attachmentLayout: "list",
      attachments: [cardAttachment("adaptive", card)],
    },
  };
});
// :snippet-end: message-ext-submit

// :snippet-start: message-ext-open
app.on("message.ext.open", async ({ activity, api }) => {
  const conversationId = activity.conversation.id;
  const members = await api.conversations.members(conversationId).get();
  const card = createConversationMembersCard(members);

  return {
    task: {
      type: "continue",
      value: {
        title: "Conversation members",
        height: "small",
        width: "small",
        card: cardAttachment("adaptive", card),
      },
    },
  };
});
// :snippet-end: message-ext-open

// :snippet-start: message-ext-query
app.on("message.ext.query", async ({ activity }) => {
  const { commandId } = activity.value;
  const searchQuery = activity.value.parameters![0].value;

  if (commandId == "searchQuery") {
    const cards = await createDummyCards(searchQuery);
    const attachments = cards.map(({ card, thumbnail }) => {
      return {
        ...cardAttachment("adaptive", card), // expanded card in the compose box...
        preview: cardAttachment("thumbnail", thumbnail), // preview card in the compose box...
      };
    });

    return {
      composeExtension: {
        type: "result",
        attachmentLayout: "list",
        attachments: attachments,
      },
    };
  }

  return { status: 400 };
});
// :snippet-end: message-ext-query

(async () => {
  await app.start();
})();
