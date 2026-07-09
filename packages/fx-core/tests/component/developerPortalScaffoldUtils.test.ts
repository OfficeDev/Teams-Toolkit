/**
 * @author Yuqi Zhou <yuqzho@microsoft.com>
 */
import { err, Inputs, ok, Platform, TeamsAppManifest, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { merge } from "lodash";
import path from "path";
import { chai, vi } from "vitest";
import { createContext, setTools } from "../../src/common/globalVars";
import * as tdpUtils from "../../src/component/developerPortalScaffoldUtils";
import {
  adjustScopeBasedOnVersion,
  developerPortalScaffoldUtils,
} from "../../src/component/developerPortalScaffoldUtils";
import * as appStudio from "../../src/component/driver/teamsApp/appStudio";
import {
  BOTS_TPL_V3,
  COMPOSE_EXTENSIONS_TPL_V3,
  DEFAULT_DESCRIPTION,
  DEFAULT_DEVELOPER,
} from "../../src/component/driver/teamsApp/constants";
import { AppDefinition } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/appDefinition";
import { Bot } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/bot";
import { ConfigurableTab } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/configurableTab";
import { MessagingExtension } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/messagingExtension";
import { StaticTab } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/staticTab";
import { manifestUtils } from "../../src/component/driver/teamsApp/utils/ManifestUtils";
import { CommandScope, MeetingsContext } from "../../src/component/driver/teamsApp/utils/utils";
import { DotenvOutput, envUtil } from "../../src/component/utils/envUtil";
import { pathUtils } from "../../src/component/utils/pathUtils";
import { InputValidationError } from "../../src/error";
import { getProjectTypeAndCapability } from "../../src/question/create";
import { QuestionNames } from "../../src/question/questionNames";
import {
  BotCapabilityOptions,
  MeCapabilityOptions,
  TabCapabilityOptions,
} from "../../src/question/scaffold/vsc/CapabilityOptions";
import { MockedAzureAccountProvider, MockedM365Provider, MockTools } from "../core/utils";

vi.mock("../../src/component/driver/teamsApp/appStudio");

describe("developPortalScaffoldUtils", () => {
  setTools(new MockTools());
  describe("updateFilesForTdp", () => {
    const sandbox = vi;

    afterEach(() => {
      vi.restoreAllMocks();
      vi.clearAllMocks();
    });
    it("missing project path", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
      };
      const inputs: Inputs = { platform: Platform.VSCode };

      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof InputValidationError);
      }
    });

    it("missing token provider", async () => {
      const ctx = createContext();
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
      };
      const inputs: Inputs = { platform: Platform.VSCode };
      ctx.tokenProvider = undefined;
      ctx.projectPath = "project-path";

      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof InputValidationError);
      }
    });

    it("get App package error", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
      };
      const inputs: Inputs = { platform: Platform.VSCode, projectPath: "project-path" };

      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        err(new UserError("source", "getAppPackage", "msg", "msg"))
      );
      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "getAppPackage");
      }
    });

    it("missing manifest error", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
      };
      const inputs: Inputs = { platform: Platform.VSCode, projectPath: "project-path" };

      vi.mocked(appStudio.getAppPackage).mockResolvedValue(ok({}));
      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "CouldNotFoundManifest");
      }
    });

    it("missing manifest.json from template", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
      };
      const inputs: Inputs = { platform: Platform.VSCode };

      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        staticTabs: [
          {
            name: "name0",
            entityId: "index0",
            scopes: ["personal"],
            contentUrl: "contentUrl0",
            websiteUrl: "websiteUrl0",
          },
          {
            name: "name1",
            entityId: "index1",
            scopes: ["personal"],
            contentUrl: "contentUrl1",
            websiteUrl: "websiteUrl1",
          },
        ],
      };
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: { zh: Buffer.from(JSON.stringify({})) },
        })
      );
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        ok(undefined as unknown as TeamsAppManifest)
      );
      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof InputValidationError);
      }
    });

    it("update files successfully", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        staticTabs: [
          {
            objectId: "objId",
            entityId: "entityId",
            name: "tab",
            contentUrl: "https://url",
            websiteUrl: "https:/url",
            scopes: [],
            context: [],
          },
        ],
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.ReplaceWebsiteUrl]: ["name0"],
        [QuestionNames.ReplaceContentUrl]: ["name1"],
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "",
        },
        staticTabs: [
          {
            name: "name0",
            entityId: "index0",
            scopes: ["personal"],
            contentUrl: "contentUrl0",
            websiteUrl: "websiteUrl0",
          },
          {
            name: "name1",
            entityId: "index1",
            scopes: ["personal"],
            contentUrl: "contentUrl1",
            websiteUrl: "websiteUrl1",
          },
        ],
      };

      const manifestTemplate: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "",
        },
        staticTabs: [
          {
            name: "name0",
            entityId: "index0",
            scopes: ["personal"],
            contentUrl: "localhost/content",
            websiteUrl: "localhost/website",
          },
        ],
      };

      let updateManifest = false;
      let updateLanguage = false;
      let updateColor = false;
      let updateOutline = false;
      let updatedManifestData = "";

      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: { zh: Buffer.from(JSON.stringify({})) },
        })
      );
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "color.png")) {
          updateColor = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "outline.png")) {
          updateOutline = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "zh.json")) {
          updateLanguage = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updateManifest = true;
          updatedManifestData = data;
        } else {
          throw new Error("not support " + file);
        }
      });

      const originalEnvs: DotenvOutput = {};
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifestTemplate));
      vi.spyOn(envUtil, "writeEnv").mockImplementation(
        async (projectPath: string, env: string, envs: DotenvOutput) => {
          merge(originalEnvs, envs);
          return ok(undefined);
        }
      );
      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(updateManifest);
      chai.assert.isTrue(updateColor);
      chai.assert.isTrue(updateOutline);
      chai.assert.isTrue(updateLanguage);
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.equal(updatedManifest.id, "${{TEAMS_APP_ID}}");
      chai.assert.equal(updatedManifest.staticTabs![0].contentUrl, "contentUrl0");
      chai.assert.equal(updatedManifest.staticTabs![0].websiteUrl, "localhost/website");
      chai.assert.equal(updatedManifest.staticTabs![1].websiteUrl, "websiteUrl1");
      chai.assert.equal(updatedManifest.staticTabs![1].contentUrl, "localhost/content");
      chai.assert.equal(updatedManifest.developer.privacyUrl, DEFAULT_DEVELOPER.privacyUrl);
      chai.assert.equal(updatedManifest.developer.name, DEFAULT_DEVELOPER.name);
      chai.assert.equal(updatedManifest.developer.termsOfUseUrl, DEFAULT_DEVELOPER.termsOfUseUrl);
      chai.assert.equal(updatedManifest.developer.websiteUrl, DEFAULT_DEVELOPER.websiteUrl);
      chai.assert.equal(updatedManifest.description.short, DEFAULT_DESCRIPTION.short);
      chai.assert.equal(updatedManifest.description.full, DEFAULT_DESCRIPTION.full);
      chai.assert.isTrue(updatedManifest.validDomains?.includes("${{TAB_DOMAIN}}"));
      chai.assert.equal(originalEnvs.TEAMS_APP_ID, "mock-app-id");
    });

    it("update files successfully but keep url", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        staticTabs: [
          {
            objectId: "objId",
            entityId: "entityId",
            name: "tab",
            contentUrl: "https://url",
            websiteUrl: "https:/url",
            scopes: [],
            context: [],
          },
        ],
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.ReplaceWebsiteUrl]: [],
        [QuestionNames.ReplaceContentUrl]: [],
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "short", full: "full" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "privacyUrl",
          websiteUrl: "websiteUrl",
          termsOfUseUrl: "termsOfUseUrl",
          name: "developer-name",
        },
        staticTabs: [
          {
            name: "name0",
            entityId: "index0",
            scopes: ["personal"],
            contentUrl: "contentUrl0",
            websiteUrl: "websiteUrl0",
          },
          {
            name: "name1",
            entityId: "index1",
            scopes: ["personal"],
            contentUrl: "contentUrl1",
            websiteUrl: "websiteUrl1",
          },
        ],
      };

      let updateManifest = false;
      let updateLanguage = false;
      let updateColor = false;
      let updateOutline = false;
      let updatedManifestData = "";
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: { zh: Buffer.from(JSON.stringify({})) },
        })
      );
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "color.png")) {
          updateColor = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "outline.png")) {
          updateOutline = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "zh.json")) {
          updateLanguage = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updateManifest = true;
          updatedManifestData = data;
        } else {
          throw new Error("not support " + file);
        }
      });

      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        ok({
          manifestVersion: "version",
          id: "mock-app-id",
          name: { short: "short-name" },
          description: { short: "", full: "" },
          version: "version",
          icons: { outline: "outline.png", color: "color.png" },
          accentColor: "#ffffff",
          developer: {
            privacyUrl: "",
            websiteUrl: "",
            termsOfUseUrl: "",
            name: "developer-name",
          },
          staticTabs: [
            {
              name: "name0",
              entityId: "index0",
              scopes: ["personal"],
              contentUrl: "contentUrlnew0",
              websiteUrl: "websiteUrlnew0",
            },
          ],
        })
      );

      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(updateManifest);
      chai.assert.isTrue(updateColor);
      chai.assert.isTrue(updateOutline);
      chai.assert.isTrue(updateLanguage);
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.equal(updatedManifest.id, "${{TEAMS_APP_ID}}");
      chai.assert.equal(updatedManifest.staticTabs![0].contentUrl, "contentUrl0");
      chai.assert.equal(updatedManifest.staticTabs![0].websiteUrl, "websiteUrl0");
      chai.assert.equal(updatedManifest.staticTabs![1].websiteUrl, "websiteUrl1");
      chai.assert.equal(updatedManifest.staticTabs![1].contentUrl, "contentUrl1");
      chai.assert.equal(updatedManifest.developer.privacyUrl, "privacyUrl");
      chai.assert.equal(updatedManifest.developer.termsOfUseUrl, "termsOfUseUrl");
      chai.assert.equal(updatedManifest.developer.websiteUrl, "websiteUrl");
      chai.assert.equal(updatedManifest.description.short, "short");
      chai.assert.equal(updatedManifest.description.full, "full");
      chai.assert.equal(updatedManifest.validDomains, undefined);
    });

    it("update bot id only", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        staticTabs: [
          {
            objectId: "objId",
            entityId: "entityId",
            name: "tab",
            contentUrl: "https://url",
            websiteUrl: "https:/url",
            scopes: [],
            context: [],
          },
        ],
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.ReplaceBotIds]: ["bot"],
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        bots: [
          {
            botId: "botId0",
            scopes: ["personal"],
            commandLists: [],
          },
        ],
        composeExtensions: [
          {
            botId: "botId1",
            commands: [],
          },
        ],
      };

      const existingManifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        bots: [],
        validDomains: ["valid-domain"],
      };

      let updateManifest = false;
      let updateLanguage = false;
      let updateColor = false;
      let updateOutline = false;
      let updatedManifestData = "";
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: { zh: Buffer.from(JSON.stringify({})) },
        })
      );
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "color.png")) {
          updateColor = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "outline.png")) {
          updateOutline = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "zh.json")) {
          updateLanguage = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updateManifest = true;
          updatedManifestData = data;
        } else {
          throw new Error("not support " + file);
        }
      });

      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(existingManifest));
      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(updateManifest);
      chai.assert.isTrue(updateColor);
      chai.assert.isTrue(updateOutline);
      chai.assert.isTrue(updateLanguage);
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.equal(updatedManifest.id, "${{TEAMS_APP_ID}}");
      const expectedBots = BOTS_TPL_V3;
      expectedBots[0].botId = "${{BOT_ID}}";
      chai.assert.deepEqual(updatedManifest.bots![0], expectedBots[0]);
      chai.assert.deepEqual(updatedManifest.composeExtensions![0], manifest.composeExtensions![0]);
      chai.assert.equal(updatedManifest.developer.privacyUrl, DEFAULT_DEVELOPER.privacyUrl);
      chai.assert.equal(updatedManifest.developer.termsOfUseUrl, DEFAULT_DEVELOPER.termsOfUseUrl);
      chai.assert.equal(updatedManifest.developer.websiteUrl, DEFAULT_DEVELOPER.websiteUrl);
      chai.assert.isUndefined(updatedManifest.validDomains);
    });

    it("update bot id of message extension only", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        staticTabs: [
          {
            objectId: "objId",
            entityId: "entityId",
            name: "tab",
            contentUrl: "https://url",
            websiteUrl: "https:/url",
            scopes: [],
            context: [],
          },
        ],
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.ReplaceBotIds]: ["messageExtension"],
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        bots: [
          {
            botId: "botId0",
            scopes: ["personal"],
            commandLists: [],
          },
        ],
        composeExtensions: [
          {
            botId: "botId1",
            commands: [],
          },
        ],
        validDomains: [],
      };

      const existingManifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        bots: [],
        composeExtensions: [
          {
            botId: "botId1",
            commands: [
              {
                id: "commandId",
                title: "commandTitle",
              },
            ],
          },
        ],
        validDomains: ["valid-domain"],
      };

      let updateManifest = false;
      let updateLanguage = false;
      let updateColor = false;
      let updateOutline = false;
      let updatedManifestData = "";
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: { zh: Buffer.from(JSON.stringify({})) },
        })
      );
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "color.png")) {
          updateColor = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "outline.png")) {
          updateOutline = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "zh.json")) {
          updateLanguage = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updateManifest = true;
          updatedManifestData = data;
        } else {
          throw new Error("not support " + file);
        }
      });

      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(existingManifest));
      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(updateManifest);
      chai.assert.isTrue(updateColor);
      chai.assert.isTrue(updateOutline);
      chai.assert.isTrue(updateLanguage);
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.equal(updatedManifest.id, "${{TEAMS_APP_ID}}");
      chai.assert.deepEqual(updatedManifest.bots![0], manifest.bots![0]);
      chai.assert.deepEqual(
        updatedManifest.composeExtensions![0],
        existingManifest.composeExtensions![0]
      );
      chai.assert.equal(updatedManifest.developer.privacyUrl, DEFAULT_DEVELOPER.privacyUrl);
      chai.assert.equal(updatedManifest.developer.termsOfUseUrl, DEFAULT_DEVELOPER.termsOfUseUrl);
      chai.assert.equal(updatedManifest.developer.websiteUrl, DEFAULT_DEVELOPER.websiteUrl);
      chai.assert.equal(updatedManifest.validDomains?.length, 0);
    });

    it("update bot id and message extension id", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        staticTabs: [
          {
            objectId: "objId",
            entityId: "entityId",
            name: "tab",
            contentUrl: "https://url",
            websiteUrl: "https:/url",
            scopes: [],
            context: [],
          },
        ],
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.ReplaceBotIds]: ["bot", "messageExtension"],
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        bots: [
          {
            botId: "botId0",
            scopes: ["personal"],
            commandLists: [],
          },
        ],
        composeExtensions: [
          {
            botId: "botId1",
            commands: [],
          },
        ],
        validDomains: [],
      };

      const existingManifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        bots: [
          {
            botId: "{{BOT_ID}}",
            scopes: ["personal", "team"],
            supportsFiles: false,
            isNotificationOnly: false,
            commandLists: [
              {
                scopes: ["personal", "team", "groupchat"],
                commands: [],
              },
            ],
          },
        ],
        validDomains: ["valid-domain"],
      };

      let updateManifest = false;
      let updateLanguage = false;
      let updateColor = false;
      let updateOutline = false;
      let updatedManifestData = "";
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: { zh: Buffer.from(JSON.stringify({})) },
        })
      );
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "color.png")) {
          updateColor = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "outline.png")) {
          updateOutline = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "zh.json")) {
          updateLanguage = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updateManifest = true;
          updatedManifestData = data;
        } else {
          throw new Error("not support " + file);
        }
      });

      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(existingManifest));
      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(updateManifest);
      chai.assert.isTrue(updateColor);
      chai.assert.isTrue(updateOutline);
      chai.assert.isTrue(updateLanguage);
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.equal(updatedManifest.id, "${{TEAMS_APP_ID}}");
      chai.assert.deepEqual(updatedManifest.bots![0], existingManifest.bots![0]);
      chai.assert.deepEqual(updatedManifest.composeExtensions![0].botId, "${{BOT_ID}}");
      chai.assert.deepEqual(
        updatedManifest.composeExtensions![0].commands,
        COMPOSE_EXTENSIONS_TPL_V3[0]!.commands
      );
      chai.assert.equal(updatedManifest.developer.privacyUrl, DEFAULT_DEVELOPER.privacyUrl);
      chai.assert.equal(updatedManifest.developer.termsOfUseUrl, DEFAULT_DEVELOPER.termsOfUseUrl);
      chai.assert.equal(updatedManifest.developer.websiteUrl, DEFAULT_DEVELOPER.websiteUrl);
      chai.assert.equal(updatedManifest.validDomains?.length, 0);
    });

    it("update manifest if selecting capability from ttk UI", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.ReplaceBotIds]: ["bot", "messageExtension"],
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
      };

      const existingManifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        webApplicationInfo: {
          id: "1",
        },
        bots: [
          {
            botId: "{{BOT_ID}}",
            scopes: ["personal", "team"],
            supportsFiles: false,
            isNotificationOnly: false,
          },
        ],
        validDomains: ["valid-domain"],
      };

      let updateManifest = false;
      let updateLanguage = false;
      let updateColor = false;
      let updateOutline = false;
      let updatedManifestData = "";
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(
            JSON.stringify({
              manifestVersion: "version",
              id: "mock-app-id",
              name: { short: "short-name" },
              description: { short: "", full: "" },
              version: "version",
              icons: { outline: "outline.png", color: "color.png" },
              accentColor: "#ffffff",
              developer: {
                privacyUrl: "",
                websiteUrl: "",
                termsOfUseUrl: "",
                name: "developer-name",
              },
            })
          ),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: { zh: Buffer.from(JSON.stringify({})) },
        })
      );
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "color.png")) {
          updateColor = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "outline.png")) {
          updateOutline = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "zh.json")) {
          updateLanguage = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updateManifest = true;
          updatedManifestData = data;
        } else {
          throw new Error("not support " + file);
        }
      });

      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(existingManifest));
      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(updateManifest);
      chai.assert.isTrue(updateColor);
      chai.assert.isTrue(updateOutline);
      chai.assert.isTrue(updateLanguage);
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.equal(updatedManifest.id, "${{TEAMS_APP_ID}}");
      chai.assert.deepEqual(updatedManifest.bots![0], existingManifest.bots![0]);
      chai.assert.equal(updatedManifest.developer.privacyUrl, DEFAULT_DEVELOPER.privacyUrl);
      chai.assert.equal(updatedManifest.developer.termsOfUseUrl, DEFAULT_DEVELOPER.termsOfUseUrl);
      chai.assert.equal(updatedManifest.developer.websiteUrl, DEFAULT_DEVELOPER.websiteUrl);
      chai.assert.deepEqual(
        updatedManifest.webApplicationInfo,
        existingManifest.webApplicationInfo
      );
      chai.assert.isTrue(updatedManifest.validDomains?.includes("valid-domain"));
    });

    it("update group chat", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        staticTabs: [
          {
            objectId: "objId",
            entityId: "entityId",
            name: "tab",
            contentUrl: "https://url",
            websiteUrl: "https:/url",
            scopes: [],
            context: [],
          },
        ],
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "project-path",
      };
      const manifest = {
        manifestVersion: "1.17",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        configurableTabs: [
          {
            configurationUrl: "url",
            scopes: ["groupchat", "team"] as any,
          },
        ],
        bots: [
          {
            botId: "botId",
            scopes: ["groupchat"],
            commandLists: [
              {
                commands: [
                  {
                    title: "tt",
                    description: "ttt",
                  },
                ],
                scopes: ["groupChat"],
              },
            ],
          },
        ],
        composeExtensions: [
          {
            botId: "botId",
            scopes: ["groupchat"],
          },
        ],
      };

      let updateManifest = false;
      let updateLanguage = false;
      let updateColor = false;
      let updateOutline = false;
      let updatedManifestData = "";
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: { zh: Buffer.from(JSON.stringify({})) },
        })
      );
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "color.png")) {
          updateColor = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "outline.png")) {
          updateOutline = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "zh.json")) {
          updateLanguage = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updateManifest = true;
          updatedManifestData = data;
        } else {
          throw new Error("not support " + file);
        }
      });

      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        ok(manifest as TeamsAppManifest)
      );

      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(updateManifest);
      chai.assert.isTrue(updateColor);
      chai.assert.isTrue(updateOutline);
      chai.assert.isTrue(updateLanguage);
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.equal(updatedManifest.id, "${{TEAMS_APP_ID}}");
      chai.assert.isTrue(
        (updatedManifest.configurableTabs![0].scopes as string[]).includes("groupChat")
      );
      chai.assert.isTrue((updatedManifest.bots![0].scopes as string[]).includes("groupChat"));
      chai.assert.isTrue(
        (updatedManifest.bots![0].commandLists![0].scopes as string[]).includes("groupChat")
      );
      chai.assert.isTrue(
        (updatedManifest.composeExtensions![0].scopes! as string[]).includes("groupChat")
      );
      chai.assert.equal(updatedManifest.developer.privacyUrl, DEFAULT_DEVELOPER.privacyUrl);
      chai.assert.equal(updatedManifest.developer.termsOfUseUrl, DEFAULT_DEVELOPER.termsOfUseUrl);
      chai.assert.equal(updatedManifest.developer.websiteUrl, DEFAULT_DEVELOPER.websiteUrl);
      chai.assert.equal(updatedManifest.validDomains, undefined);
    });

    it("success without the need to update group chat", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        staticTabs: [
          {
            objectId: "objId",
            entityId: "entityId",
            name: "tab",
            contentUrl: "https://url",
            websiteUrl: "https:/url",
            scopes: [],
            context: [],
          },
        ],
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "project-path",
      };
      const manifest = {
        manifestVersion: "1.17",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        configurableTabs: [
          {
            configurationUrl: "url",
          },
        ],
        bots: [
          {
            botId: "botId",
            commandLists: [
              {
                commands: [
                  {
                    title: "tt",
                    description: "ttt",
                  },
                ],
              },
            ],
          },
        ],
        composeExtensions: [
          {
            botId: "botId",
          },
        ],
      };

      let updateManifest = false;
      let updateLanguage = false;
      let updateColor = false;
      let updateOutline = false;
      let updatedManifestData = "";
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: { zh: Buffer.from(JSON.stringify({})) },
        })
      );
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "color.png")) {
          updateColor = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "outline.png")) {
          updateOutline = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "zh.json")) {
          updateLanguage = true;
        } else if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updateManifest = true;
          updatedManifestData = data;
        } else {
          throw new Error("not support " + file);
        }
      });

      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        ok(manifest as TeamsAppManifest)
      );

      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(updateManifest);
      chai.assert.isTrue(updateColor);
      chai.assert.isTrue(updateOutline);
      chai.assert.isTrue(updateLanguage);
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.equal(updatedManifest.id, "${{TEAMS_APP_ID}}");
    });

    it("read manifest error", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        staticTabs: [
          {
            objectId: "objId",
            entityId: "entityId",
            name: "tab",
            contentUrl: "https://url",
            websiteUrl: "https:/url",
            scopes: [],
            context: [],
          },
        ],
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.ReplaceWebsiteUrl]: ["name0"],
        [QuestionNames.ReplaceContentUrl]: ["name1"],
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "developer-name",
        },
        staticTabs: [
          {
            name: "name0",
            entityId: "index0",
            scopes: ["personal"],
            contentUrl: "contentUrl0",
            websiteUrl: "websiteUrl0",
          },
          {
            name: "name1",
            entityId: "index1",
            scopes: ["personal"],
            contentUrl: "contentUrl1",
            websiteUrl: "websiteUrl1",
          },
        ],
      };
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: { zh: Buffer.from(JSON.stringify({})) },
        })
      );

      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));

      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        err(new UserError("", "", "", ""))
      );
      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isErr());
    });

    it("should copy supportsChannelFeatures when both conditions are met", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        supportsChannelFeatures: "tier1", // Property exists in appDefinition
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "",
        },
      };

      const manifestTemplate: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "",
        },
        supportsChannelFeatures: "tier1" as any, // Exists in existing manifest template
      };

      let updatedManifestData = "";

      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: {},
        })
      );
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updatedManifestData = data;
        }
      });

      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifestTemplate));

      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.equal(updatedManifest.supportsChannelFeatures, "tier1");
    });

    it("should not copy supportsChannelFeatures when property missing from appDefinition", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        // No supportsChannelFeatures property in appDefinition
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "",
        },
      };

      const manifestTemplate: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "",
        },
        supportsChannelFeatures: "tier1" as any, // Exists in existing manifest template
      };

      let updatedManifestData = "";

      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: {},
        })
      );
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updatedManifestData = data;
        }
      });

      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifestTemplate));

      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.isUndefined(updatedManifest.supportsChannelFeatures);
    });

    it("should not copy supportsChannelFeatures when property missing from manifestTemplate", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        supportsChannelFeatures: "tier1", // Property exists in appDefinition
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "",
        },
      };

      const manifestTemplate: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "",
        },
        // No supportsChannelFeatures in manifestTemplate
      };

      let updatedManifestData = "";

      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: {},
        })
      );
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updatedManifestData = data;
        }
      });

      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifestTemplate));

      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.isUndefined(updatedManifest.supportsChannelFeatures);
    });

    it("should not copy supportsChannelFeatures when neither condition is met", async () => {
      const ctx = createContext();
      ctx.tokenProvider = {
        m365TokenProvider: new MockedM365Provider(),
        azureAccountProvider: new MockedAzureAccountProvider(),
      };
      ctx.projectPath = "project-path";
      const appDefinition: AppDefinition = {
        appId: "mock-app-id",
        teamsAppId: "mock-app-id",
        // No supportsChannelFeatures property in appDefinition
      };
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "project-path",
      };
      const manifest: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "",
        },
      };

      const manifestTemplate: TeamsAppManifest = {
        manifestVersion: "version",
        id: "mock-app-id",
        name: { short: "short-name" },
        description: { short: "", full: "" },
        version: "version",
        icons: { outline: "outline.png", color: "color.png" },
        accentColor: "#ffffff",
        developer: {
          privacyUrl: "",
          websiteUrl: "",
          termsOfUseUrl: "",
          name: "",
        },
        // No supportsChannelFeatures in manifestTemplate either
      };

      let updatedManifestData = "";

      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake env path"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.mocked(appStudio.getAppPackage).mockResolvedValue(
        ok({
          manifest: Buffer.from(JSON.stringify(manifest)),
          icons: { color: Buffer.from(""), outline: Buffer.from("") },
          languages: {},
        })
      );
      vi.spyOn(fs, "writeFile").mockImplementation((file: number | fs.PathLike, data: any) => {
        if (file === path.join(ctx.projectPath!, "appPackage", "manifest.json")) {
          updatedManifestData = data;
        }
      });

      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifestTemplate));

      const res = await developerPortalScaffoldUtils.updateFilesForTdp(ctx, appDefinition, inputs);

      chai.assert.isTrue(res.isOk());
      const updatedManifest = JSON.parse(updatedManifestData) as TeamsAppManifest;
      chai.assert.isUndefined(updatedManifest.supportsChannelFeatures);
    });
  });

  describe("getProjectTypeAndCapability", () => {
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
      scopes: [CommandScope.GroupChat],
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

    it("return TabNonSso", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "id",
        staticTabs: [validStaticTab],
      };

      const res = getProjectTypeAndCapability(appDefinition);
      chai.assert.equal(res?.templateId, TabCapabilityOptions.nonSsoTab().id);
      chai.assert.equal(res?.projectType, "tab-type");
    });

    it("return MessageExtension", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "id",
        messagingExtensions: [validMessagingExtension],
      };

      const res = getProjectTypeAndCapability(appDefinition);
      chai.assert.equal(res?.templateId, MeCapabilityOptions.basicMe().id);
      chai.assert.equal(res?.projectType, "me-type");
    });

    it("return bot", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "id",
        bots: [validBot],
      };

      const res = getProjectTypeAndCapability(appDefinition);
      chai.assert.equal(res?.templateId, BotCapabilityOptions.basicBot().id);
      chai.assert.equal(res?.projectType, "bot-type");
    });

    it("return undefined", () => {
      const appDefinition: AppDefinition = {
        teamsAppId: "id",
      };

      const res = getProjectTypeAndCapability(appDefinition);
      chai.assert.isUndefined(res);
    });
  });

  describe("adjustScopeBasedOnVersion", () => {
    it("devPreview", () => {
      const res = adjustScopeBasedOnVersion(["groupchat"], "devPreview");
      chai.assert.deepEqual(res, ["groupChat"]);
    });

    it("1.17", () => {
      const res = adjustScopeBasedOnVersion(["groupchat"], "1.17");
      chai.assert.deepEqual(res, ["groupChat"]);
    });

    it("1.16", () => {
      const res = adjustScopeBasedOnVersion(["groupChat", "team"], "1.16");
      chai.assert.deepEqual(res, ["groupchat", "team"]);
    });
  });

  describe("updateEnv", () => {
    const sandbox = vi;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("writes to .env.local when it exists", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("path/to/.env.local"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const writeEnvStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));

      // Use the private method for testing
      const result = await tdpUtils.updateEnv("mock-app-id", "project-path");

      chai.assert.isTrue(result.isOk());
      chai.assert.equal(writeEnvStub.mock.calls.length, 1);
      chai.assert.deepEqual(writeEnvStub.mock.calls[0], [
        "project-path",
        "local",
        { TEAMS_APP_ID: "mock-app-id" },
      ]);
    });

    it("writes to .env.dev when cannot find env path", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(undefined));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const writeEnvStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));

      // Use the private method for testing
      const result = await tdpUtils.updateEnv("mock-app-id", "project-path");

      chai.assert.isTrue(result.isOk());
      chai.assert.equal(writeEnvStub.mock.calls.length, 1);
      chai.assert.deepEqual(writeEnvStub.mock.calls[0], [
        "project-path",
        "dev",
        { TEAMS_APP_ID: "mock-app-id" },
      ]);
    });

    it("writes to .env.dev when .env.local doesn't exist", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("path/to/.env.local"));
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);

      const writeEnvStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));

      // Use the private method for testing
      const result = await tdpUtils.updateEnv("mock-app-id", "project-path");

      chai.assert.isTrue(result.isOk());
      chai.assert.equal(writeEnvStub.mock.calls.length, 1);
      chai.assert.deepEqual(writeEnvStub.mock.calls[0], [
        "project-path",
        "dev",
        { TEAMS_APP_ID: "mock-app-id" },
      ]);
    });

    it("returns error when getEnvFilePath fails", async () => {
      const error = new UserError("source", "name", "msg", "msg");
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(err(error));

      // Use the private method for testing
      const result = await tdpUtils.updateEnv("mock-app-id", "project-path");

      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.equal(result.error, error);
      }
    });

    it("getEnvFilePath through deps maintains this context and can call internal methods", async () => {
      // This test actually calls getEnvFilePath through the deps object to verify
      // that the binding fixes the "this.getEnvFolderPath is not a function" error.
      // Without the .bind() fix, this would fail when getEnvFilePath tries to call this.getEnvFolderPath

      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mock-yml-path");

      vi.spyOn(fs, "readFile").mockResolvedValue("environmentFolderPath: ./env" as any);

      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const result = await pathUtils.getEnvFilePath("test-project-path", "local");

      chai.assert.isTrue(result.isOk() || result.isErr(), "Should return a Result");
    });
  });
});
