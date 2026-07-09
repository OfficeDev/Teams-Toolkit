import { AppDefinition } from "../../../../src/component/driver/teamsApp/interfaces/appdefinitions/appDefinition";
import { Bot } from "../../../../src/component/driver/teamsApp/interfaces/appdefinitions/bot";
import { ConfigurableTab } from "../../../../src/component/driver/teamsApp/interfaces/appdefinitions/configurableTab";
import { MessagingExtension } from "../../../../src/component/driver/teamsApp/interfaces/appdefinitions/messagingExtension";
import { StaticTab } from "../../../../src/component/driver/teamsApp/interfaces/appdefinitions/staticTab";
import { chai } from "vitest";
import {
  CommandScope,
  containsUnsupportedFeature,
  getFeaturesFromAppDefinition,
  hasMeetingExtension,
  MeetingsContext,
  needBotCode,
  needTabCode,
} from "../../../../src/component/driver/teamsApp/utils/utils";

describe("utils", () => {
  const validBot: Bot = {
    botId: "botId",
    isNotificationOnly: false,
    needsChannelSelector: false,
    personalCommands: [{ title: "title", description: "description" }],
    supportsFiles: false,
    supportsCalling: false,
    supportsVideo: false,
    teamCommands: [{ title: "title", description: "description" }],
    groupChatCommands: [{ title: "title", description: "description" }],
    scopes: ["scope"],
  };

  const validConfigurableTabForTabCode: ConfigurableTab = {
    objectId: "objId",
    configurationUrl: "https://url",
    canUpdateConfiguration: false,
    scopes: ["groupChat"],
    context: [MeetingsContext.ChannelTab],
    sharePointPreviewImage: "img",
    supportedSharePointHosts: [],
  };

  const validStaticTab: StaticTab = {
    objectId: "objId",
    entityId: "entityId",
    name: "tab",
    contentUrl: "https://url",
    websiteUrl: "https:/url",
    scopes: [],
    context: [],
  };

  const validMessagingExtension: MessagingExtension = {
    objectId: "objId",
    botId: "botId",
    canUpdateConfiguration: true,
    commands: [],
    messageHandlers: [],
  };

  const validConfigurableTabForMeetingExtension: ConfigurableTab = {
    objectId: "objId",
    configurationUrl: "https://url",
    canUpdateConfiguration: false,
    scopes: ["groupChat", CommandScope.Team],
    context: [MeetingsContext.SidePanel],
    sharePointPreviewImage: "img",
    supportedSharePointHosts: [],
  };

  describe("needTabCode", () => {
    it("undefined property: returns false", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        bots: [validBot],
      };

      const needTab = needTabCode(appDefinition);

      chai.assert.isFalse(needTab);
    });

    it("length is 0: returns false", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [],
        staticTabs: [],
        bots: [validBot],
      };

      const needTab = needTabCode(appDefinition);

      chai.assert.isFalse(needTab);
    });

    it("invalid group app context: returns false", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [
          { ...validConfigurableTabForTabCode, context: [MeetingsContext.SidePanel] },
        ],
        staticTabs: [],
        bots: [validBot],
      };

      const needTab = needTabCode(appDefinition);

      chai.assert.isFalse(needTab);
    });

    it("invalid group app scope: returns false", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [{ ...validConfigurableTabForTabCode, scopes: [CommandScope.Personal] }],
        staticTabs: [],
        bots: [validBot],
      };

      const needTab = needTabCode(appDefinition);

      chai.assert.isFalse(needTab);
    });

    it("valid static tab: returns true", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        staticTabs: [validStaticTab],
        bots: [],
      };

      const needTab = needTabCode(appDefinition);

      chai.assert.isTrue(needTab);
    });

    it("static tabs with reserved entity id: returns false", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        staticTabs: [{ ...validStaticTab, entityId: "about" }],
        bots: [],
      };

      const needTab = needTabCode(appDefinition);

      chai.assert.isFalse(needTab);
    });

    it("channel tab, group channel scope: returns true", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [validConfigurableTabForTabCode],
        bots: [],
      };

      const needTab = needTabCode(appDefinition);

      chai.assert.isTrue(needTab);
    });

    it("private chat tab, team scope: returns true", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [
          {
            ...validConfigurableTabForTabCode,
            context: [MeetingsContext.PrivateChatTab],
            scopes: [CommandScope.Team],
          },
        ],
        bots: [],
      };

      const needTab = needTabCode(appDefinition);

      chai.assert.isTrue(needTab);
    });

    it("private chat tab, team scope: returns true", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [
          {
            ...validConfigurableTabForTabCode,
            context: [MeetingsContext.PrivateChatTab],
            scopes: [CommandScope.Team],
          },
        ],
        bots: [],
      };

      const needTab = needTabCode(appDefinition);

      chai.assert.isTrue(needTab);
    });
  });

  describe("needBot", () => {
    it("undefined property: returns false", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
      };

      const needBot = needBotCode(appDefinition);

      chai.assert.isFalse(needBot);
    });

    it("length is 0: returns false", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        bots: [],
      };

      const needBot = needBotCode(appDefinition);

      chai.assert.isFalse(needBot);
    });

    it("has bot: returns true", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        bots: [validBot],
      };

      const needBot = needBotCode(appDefinition);

      chai.assert.isTrue(needBot);
    });

    it("has bot: returns true", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        bots: [validBot],
        messagingExtensions: [],
      };

      const needBot = needBotCode(appDefinition);

      chai.assert.isTrue(needBot);
    });

    it("has messaging extension: returns true", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        messagingExtensions: [validMessagingExtension],
      };

      const needBot = needBotCode(appDefinition);

      chai.assert.isTrue(needBot);
    });
  });

  describe("hasMeetingExtension", () => {
    it("undefined property: returns false", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        bots: [validBot],
      };

      const res = hasMeetingExtension(appDefinition);

      chai.assert.isFalse(res);
    });

    it("length is 0: returns false", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [],
        staticTabs: [],
        bots: [validBot],
      };

      const res = hasMeetingExtension(appDefinition);

      chai.assert.isFalse(res);
    });

    it("side panel: returns true", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [validConfigurableTabForMeetingExtension],
        staticTabs: [],
        bots: [validBot],
      };

      const res = hasMeetingExtension(appDefinition);

      chai.assert.isTrue(res);
    });

    it("details tab: returns true", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [
          { ...validConfigurableTabForMeetingExtension, context: [MeetingsContext.DetailsTab] },
        ],
        staticTabs: [],
        bots: [validBot],
      };

      const res = hasMeetingExtension(appDefinition);

      chai.assert.isTrue(res);
    });

    it("missing scope: returns false", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [
          {
            ...validConfigurableTabForMeetingExtension,
            context: [MeetingsContext.DetailsTab],
            scopes: [],
          },
        ],
        staticTabs: [],
        bots: [validBot],
      };

      const res = hasMeetingExtension(appDefinition);

      chai.assert.isFalse(res);
    });

    it("chat tab: returns true", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [
          { ...validConfigurableTabForMeetingExtension, context: [MeetingsContext.ChatTab] },
        ],
        staticTabs: [],
        bots: [validBot],
      };

      const res = hasMeetingExtension(appDefinition);

      chai.assert.isTrue(res);
    });
  });

  describe("unsupported features", () => {
    it("contains scene", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        meetingExtensionDefinition: {
          scenes: [
            {
              id: "mock-id",
              file: "mock-file",
              name: "mock-name",
              preview: "preview",
              maxAudience: 10,
              seatsReservedForOrganizersOrPresenters: 1,
            },
          ],
        },
      };

      const res = containsUnsupportedFeature(appDefinition);
      chai.assert.isTrue(res);
    });

    it("contains connector", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        connectors: [{ name: "name", configurationUrl: "url", scopes: [] }],
      };

      const res = containsUnsupportedFeature(appDefinition);
      chai.assert.isTrue(res);
    });

    it("contains SME", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        messagingExtensions: [
          {
            messagingExtensionServiceType: "ApiBased",
            commands: [],
            canUpdateConfiguration: false,
            messageHandlers: [],
          },
        ],
      };

      const res = containsUnsupportedFeature(appDefinition);
      chai.assert.isTrue(res);
    });

    it("contains meeting extension", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [
          {
            objectId: "81747dd8-0e3c-4a25-beda-604db9699bb8",
            configurationUrl: "https://www.test.com",
            canUpdateConfiguration: false,
            context: ["meetingSidePanel"],
            scopes: ["groupChat"],
            sharePointPreviewImage: "",
            supportedSharePointHosts: [],
          },
        ],
      };

      const res = containsUnsupportedFeature(appDefinition);
      chai.assert.isTrue(res);
    });

    it("contains activities", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        activities: {
          activityTypes: [
            {
              type: "type",
              description: "description",
              templateText: "text",
            },
          ],
        },
      };

      const res = containsUnsupportedFeature(appDefinition);
      chai.assert.isTrue(res);
    });
  });

  describe("getFeaturesFromAppDefinition", () => {
    it("get features", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "mockAppId",
        tenantId: "mockTenantId",
        configurableTabs: [validConfigurableTabForTabCode],
        staticTabs: [validStaticTab],
        bots: [validBot],
        messagingExtensions: [validMessagingExtension],
      };
      const res = getFeaturesFromAppDefinition(appDefinition);
      chai.assert.equal(res.length, 4);
      chai.assert.isTrue(res.includes("personal-tab"));
      chai.assert.isTrue(res.includes("group-tab"));
      chai.assert.isTrue(res.includes("bot"));
      chai.assert.isTrue(res.includes("messaging-extension"));
    });
  });
});
