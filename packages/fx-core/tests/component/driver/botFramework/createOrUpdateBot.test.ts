// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as util from "util";
import { teamsDevPortalClient } from "../../../../src/client/teamsDevPortalClient";
import * as localizeUtils from "../../../../src/common/localizeUtils";
import { CreateOrUpdateBotFrameworkBotDriver } from "../../../../src/component/driver/botFramework/createOrUpdateBot";
import { IBotRegistration } from "../../../../src/component/resource/botService/appStudio/interfaces/IBotRegistration";
import { InvalidActionInputError, UnhandledError } from "../../../../src/error/common";
import { MockedLogProvider } from "../../../plugins/solution/util";
import { MockedM365Provider } from "../../../core/utils";
import { chai, vi } from "vitest";

describe("CreateOrUpdateM365BotDriver", () => {
  const mockedDriverContext: any = {
    logProvider: new MockedLogProvider(),
    m365TokenProvider: new MockedM365Provider(),
  };
  const driver = new CreateOrUpdateBotFrameworkBotDriver();

  beforeEach(() => {
    vi.spyOn(localizeUtils, "getDefaultString").mockImplementation((key, ...params) => {
      if (key === "error.yaml.InvalidActionInputError") {
        return util.format(
          "Following parameter is missing or invalid for %s action: %s.",
          ...params
        );
      } else if (key === "error.common.UnhandledError") {
        return util.format("Unhandled error happened in %s action: %s", ...params);
      } else if (key === "driver.botFramework.summary.create") {
        return util.format("The bot registration has been created successfully (%s).", ...params);
      } else if (key === "driver.botFramework.summary.update") {
        return util.format("The bot registration has been updated successfully (%s).", ...params);
      }
      return "";
    });
    vi.spyOn(localizeUtils, "getLocalizedString").mockImplementation((key, ...params) =>
      localizeUtils.getDefaultString(key, ...params)
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("run", () => {
    it("invalid args: missing botId", async () => {
      const args: any = {
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert(result.error instanceof InvalidActionInputError);
      }
    });

    it("invalid args: missing name", async () => {
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert(result.error instanceof InvalidActionInputError);
      }
    });

    it("invalid args: missing messagingEndpoint", async () => {
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert(result.error instanceof InvalidActionInputError);
      }
    });

    it("invalid args: description not string", async () => {
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        description: 123,
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert(result.error instanceof InvalidActionInputError);
      }
    });

    it("invalid args: iconUrl not string", async () => {
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        iconUrl: 123,
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert(result.error instanceof InvalidActionInputError);
      }
    });

    it("invalid args: channels not list", async () => {
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        channels: "channels",
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert(result.error instanceof InvalidActionInputError);
      }
    });

    it("invalid args: channel name invalid", async () => {
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        channels: [
          {
            name: "name",
          },
        ],
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert(result.error instanceof InvalidActionInputError);
      }
    });

    it("invalid args: teams channel callingWebhook is not string", async () => {
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        channels: [
          {
            name: "msteams",
            callingWebhook: 123,
          },
        ],
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert(result.error instanceof InvalidActionInputError);
      }
    });

    it("exception", async () => {
      vi.spyOn(teamsDevPortalClient, "getBotRegistration").mockImplementation(() => {
        throw new Error("exception");
      });
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert(result.error instanceof UnhandledError);
        const message = "Unhandled error happened in botFramework/create action: exception.";
        chai.assert(result.error.message, message);
      }
    });

    it("happy path: create", async () => {
      vi.spyOn(teamsDevPortalClient, "getBotRegistration").mockReturnValue(
        Promise.resolve(undefined)
      );
      let createBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "createBotRegistration").mockImplementation(async () => {
        createBotRegistrationCalled = true;
      });
      let updateBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "updateBotRegistration").mockImplementation(async () => {
        updateBotRegistrationCalled = true;
      });
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        channels: [
          {
            name: "msteams",
            callingWebhook: "",
          },
          {
            name: "m365extensions",
          },
        ],
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isOk());
      chai.assert(createBotRegistrationCalled);
      chai.assert(!updateBotRegistrationCalled);
      if (result.isOk()) {
        chai.assert.equal(result.value.size, 0);
      }
    });

    it("happy path: update", async () => {
      const botRegistration: IBotRegistration = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        description: "",
        iconUrl: "",
        callingEndpoint: "",
      };
      vi.spyOn(teamsDevPortalClient, "getBotRegistration").mockImplementation(
        async (token, botId) => {
          return botId === botRegistration.botId ? botRegistration : undefined;
        }
      );
      let createBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "createBotRegistration").mockImplementation(async () => {
        createBotRegistrationCalled = true;
      });
      let updateBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "updateBotRegistration").mockImplementation(async () => {
        updateBotRegistrationCalled = true;
      });
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        description: "test-description",
        iconUrl: "test-iconUrl",
      };
      const result = await driver.run(args, mockedDriverContext);
      chai.assert(result.isOk());
      chai.assert(!createBotRegistrationCalled);
      chai.assert(updateBotRegistrationCalled);
      if (result.isOk()) {
        chai.assert.equal(result.value.size, 0);
      }
    });
  });

  describe("execute", () => {
    it("happy path: create", async () => {
      vi.spyOn(teamsDevPortalClient, "getBotRegistration").mockReturnValue(
        Promise.resolve(undefined)
      );
      let createBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "createBotRegistration").mockImplementation(async () => {
        createBotRegistrationCalled = true;
      });
      let updateBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "updateBotRegistration").mockImplementation(async () => {
        updateBotRegistrationCalled = true;
      });
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
      };
      const executionResult = await driver.execute(args, mockedDriverContext);
      chai.assert(executionResult.result.isOk());
      chai.assert(createBotRegistrationCalled);
      chai.assert(!updateBotRegistrationCalled);
      if (executionResult.result.isOk()) {
        chai.assert.equal(executionResult.result.value.size, 0);
      }
      chai.assert.equal(executionResult.summaries.length, 1);
      chai.assert.equal(
        executionResult.summaries[0],
        "The bot registration has been created successfully (https://dev.botframework.com/bots?id=550e8400-e29b-41d4-a716-446655440000)."
      );
    });

    it("happy path: update", async () => {
      const botRegistration: IBotRegistration = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        description: "",
        iconUrl: "",
        callingEndpoint: "",
      };
      vi.spyOn(teamsDevPortalClient, "getBotRegistration").mockImplementation(
        async (token, botId) => {
          return botId === botRegistration.botId ? botRegistration : undefined;
        }
      );
      let createBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "createBotRegistration").mockImplementation(async () => {
        createBotRegistrationCalled = true;
      });
      let updateBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "updateBotRegistration").mockImplementation(async () => {
        updateBotRegistrationCalled = true;
      });
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        description: "test-description",
        iconUrl: "test-iconUrl",
      };
      const executionResult = await driver.execute(args, mockedDriverContext);
      chai.assert(executionResult.result.isOk());
      chai.assert(!createBotRegistrationCalled);
      chai.assert(updateBotRegistrationCalled);
      if (executionResult.result.isOk()) {
        chai.assert.equal(executionResult.result.value.size, 0);
      }
      chai.assert.equal(executionResult.summaries.length, 1);
      chai.assert.equal(
        executionResult.summaries[0],
        "The bot registration has been updated successfully (https://dev.botframework.com/bots?id=550e8400-e29b-41d4-a716-446655440000)."
      );
    });

    it("botId is not a valid GUID", async () => {
      const args: any = {
        botId: "test-bot-id",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        description: "test-description",
        iconUrl: "test-iconUrl",
      };
      const executionResult = await driver.execute(args, mockedDriverContext);
      chai.assert(executionResult.result.isErr());
      if (executionResult.result.isErr()) {
        chai.assert(executionResult.result.error.name === "InvalidBotId");
      }
    });
  });

  describe("undefined logger", () => {
    it("happy path: create", async () => {
      const contextWithoutLogger: any = {
        logProvider: undefined,
        m365TokenProvider: new MockedM365Provider(),
      };
      vi.spyOn(teamsDevPortalClient, "getBotRegistration").mockReturnValue(
        Promise.resolve(undefined)
      );
      let createBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "createBotRegistration").mockImplementation(async () => {
        createBotRegistrationCalled = true;
      });
      let updateBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "updateBotRegistration").mockImplementation(async () => {
        updateBotRegistrationCalled = true;
      });
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
      };
      const executionResult = await driver.execute(args, contextWithoutLogger);
      chai.assert(executionResult.result.isOk());
      chai.assert(createBotRegistrationCalled);
      chai.assert(!updateBotRegistrationCalled);
    });

    it("happy path: update", async () => {
      const contextWithoutLogger: any = {
        logProvider: undefined,
        m365TokenProvider: new MockedM365Provider(),
      };
      const botRegistration: IBotRegistration = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        description: "",
        iconUrl: "",
        callingEndpoint: "",
      };
      vi.spyOn(teamsDevPortalClient, "getBotRegistration").mockImplementation(
        async (token, botId) => {
          return botId === botRegistration.botId ? botRegistration : undefined;
        }
      );
      let createBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "createBotRegistration").mockImplementation(async () => {
        createBotRegistrationCalled = true;
      });
      let updateBotRegistrationCalled = false;
      vi.spyOn(teamsDevPortalClient, "updateBotRegistration").mockImplementation(async () => {
        updateBotRegistrationCalled = true;
      });
      const args: any = {
        botId: "550e8400-e29b-41d4-a716-446655440000",
        name: "test-bot",
        messagingEndpoint: "https://test.ngrok.io/api/messages",
        description: "test-description",
        iconUrl: "test-iconUrl",
      };
      const executionResult = await driver.execute(args, contextWithoutLogger);
      chai.assert(executionResult.result.isOk());
      chai.assert(!createBotRegistrationCalled);
      chai.assert(updateBotRegistrationCalled);
    });
  });
});
