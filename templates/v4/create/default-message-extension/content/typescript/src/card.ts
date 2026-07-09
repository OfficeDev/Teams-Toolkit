import { Account, Message, TeamsChannelAccount, ThumbnailCard } from "@microsoft/teams.api";
import {
  ActionSet,
  AdaptiveCard,
  CardElement,
  Image,
  OpenUrlAction,
  TextBlock,
} from "@microsoft/teams.cards";

const IMAGE_URL =
  "https://github.com/OfficeDev/microsoft-365-agents-toolkit/raw/release/6.4/templates/vsc/ts/message-extension-v2/appPackage/color.png";

// :snippet-start: message-ext-create-card
interface IFormData {
  title: string;
  subtitle: string;
  text: string;
}

export function createCard(data: IFormData) {
  return new AdaptiveCard(
    new Image(IMAGE_URL),
    new TextBlock(data.title, {
      size: "Large",
      weight: "Bolder",
      color: "Accent",
      style: "heading",
    }),
    new TextBlock(data.subtitle, {
      size: "Small",
      weight: "Lighter",
      color: "Good",
    }),
    new TextBlock(data.text, {
      wrap: true,
      spacing: "Medium",
    })
  );
}
// :snippet-end: message-ext-create-card

// :snippet-start: message-ext-create-message-details-card
export function createMessageDetailsCard(messagePayload: Message) {
  const cardElements: CardElement[] = [
    new TextBlock("Message Details", {
      size: "Large",
      weight: "Bolder",
      color: "Accent",
      style: "heading",
    }),
  ];

  if (messagePayload?.body?.content) {
    cardElements.push(
      new TextBlock("Content", {
        size: "Medium",
        weight: "Bolder",
        spacing: "Medium",
      }),
      new TextBlock(messagePayload.body.content)
    );
  }

  if (messagePayload?.attachments?.length) {
    cardElements.push(
      new TextBlock("Attachments", {
        size: "Medium",
        weight: "Bolder",
        spacing: "Medium",
      }),
      new TextBlock(`Number of attachments: ${messagePayload.attachments.length}`, {
        wrap: true,
        spacing: "Small",
      })
    );
  }

  if (messagePayload?.createdDateTime) {
    cardElements.push(
      new TextBlock("Created Date", {
        size: "Medium",
        weight: "Bolder",
        spacing: "Medium",
      }),
      new TextBlock(messagePayload.createdDateTime, {
        wrap: true,
        spacing: "Small",
      })
    );
  }

  if (messagePayload?.linkToMessage) {
    cardElements.push(
      new TextBlock("Message Link", {
        size: "Medium",
        weight: "Bolder",
        spacing: "Medium",
      }),
      new ActionSet(
        new OpenUrlAction(messagePayload.linkToMessage, {
          title: "Go to message",
        })
      )
    );
  }

  return new AdaptiveCard(...cardElements);
}
// :snippet-end: message-ext-create-message-details-card

// :snippet-start: message-ext-create-conversation-members-card
export function createConversationMembersCard(members: (Account | TeamsChannelAccount)[]) {
  const membersList = members.map((member) => member.name).join(", ");

  return new AdaptiveCard(
    new TextBlock("Conversation members", {
      size: "Medium",
      weight: "Bolder",
      color: "Accent",
      style: "heading",
    }),
    new TextBlock(membersList, {
      wrap: true,
      spacing: "Small",
    })
  );
}
// :snippet-end: message-ext-create-conversation-members-card

// :snippet-start: message-ext-create-dummy-cards
export async function createDummyCards(searchQuery: string) {
  const dummyItems = [
    {
      title: "Item 1",
      description: `This is the first item and this is your search query: ${searchQuery}`,
    },
    { title: "Item 2", description: "This is the second item" },
    { title: "Item 3", description: "This is the third item" },
    { title: "Item 4", description: "This is the fourth item" },
    { title: "Item 5", description: "This is the fifth item" },
  ];

  const cards = dummyItems.map((item) => {
    return {
      card: new AdaptiveCard(
        new TextBlock(item.title, {
          size: "Large",
          weight: "Bolder",
          color: "Accent",
          style: "heading",
        }),
        new TextBlock(item.description, {
          wrap: true,
          spacing: "Medium",
        })
      ),
      thumbnail: {
        title: item.title,
        text: item.description,
        images: [
          {
            url: IMAGE_URL,
          },
        ],
        // When a user clicks on a list item in Teams:
        // - If the thumbnail has a `tap` property: Teams will trigger the `message.ext.select-item` activity
        // - If no `tap` property: Teams will insert the full adaptive card into the compose box
        // tap: {
        //   type: "invoke",
        //   title: item.title,
        //   value: {
        //     "option": index,
        //   },
        // },
      },
    };
  });

  return cards;
}
// :snippet-end: message-ext-create-dummy-cards

// :snippet-start: message-ext-create-link-unfurl-card
export function createLinkUnfurlCard(url: string) {
  const thumbnail = {
    title: "Unfurled Link",
    text: url,
    images: [
      {
        url: IMAGE_URL,
      },
    ],
  } as ThumbnailCard;

  const card = new AdaptiveCard(
    new TextBlock("Unfurled Link", {
      size: "Large",
      weight: "Bolder",
      color: "Accent",
      style: "heading",
    }),
    new TextBlock(url, {
      size: "Small",
      weight: "Lighter",
      color: "Good",
    })
  );

  return {
    card,
    thumbnail,
  };
}
// :snippet-end: message-ext-create-link-unfurl-card
