// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert } from "chai";
import "mocha";
import fs from "fs-extra";
import path from "path";
import { createSandbox } from "sinon";
import {
  TeamsManifestWrapper,
  DefaultInstallScope,
  StaticTabScope,
  ConfigurableTabScope,
  ComposeExtensionTypeEnum,
} from "../../src/wrappers/TeamsManifestWrapper";

describe("TeamsManifestWrapper", () => {
  const sandbox = createSandbox();
  const testManifestPath = path.resolve(__dirname, "../manifest.json");

  afterEach(() => {
    sandbox.restore();
  });

  describe("create", () => {
    it("should create a new manifest with required fields", () => {
      const manifest = TeamsManifestWrapper.create({
        manifestVersion: "1.19",
        id: "test-id-12345",
        version: "1.0.0",
        name: { short: "Test App", full: "Test Application Full Name" },
        description: { short: "Short description", full: "Full description" },
        developer: {
          name: "Test Developer",
          websiteUrl: "https://example.com",
          privacyUrl: "https://example.com/privacy",
          termsOfUseUrl: "https://example.com/terms",
        },
      });

      assert.equal(manifest.manifestVersion, "1.19");
      assert.equal(manifest.id, "test-id-12345");
      assert.equal(manifest.version, "1.0.0");
      assert.equal(manifest.name.short, "Test App");
      assert.equal(manifest.description.short, "Short description");
      assert.isFalse(manifest.isDirty);
      assert.isUndefined(manifest.filePath);
    });

    it("should use custom accent color if provided", () => {
      const manifest = TeamsManifestWrapper.create({
        manifestVersion: "1.19",
        id: "test-id",
        version: "1.0.0",
        name: { short: "Test" },
        description: { short: "Short", full: "Full" },
        developer: {
          name: "Dev",
          websiteUrl: "https://example.com",
          privacyUrl: "https://example.com/privacy",
          termsOfUseUrl: "https://example.com/terms",
        },
        accentColor: "#FF0000",
      });

      assert.equal(manifest.data.accentColor, "#FF0000");
    });
  });

  describe("read", () => {
    it("should read manifest from file", async () => {
      const manifest = await TeamsManifestWrapper.read(testManifestPath);

      assert.equal(manifest.manifestVersion, "1.11");
      assert.equal(manifest.id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
      assert.equal(manifest.name.short, "aaa-local-debug");
      assert.equal(manifest.filePath, testManifestPath);
      assert.isFalse(manifest.isDirty);
    });
  });

  describe("readSync", () => {
    it("should read manifest from file synchronously", () => {
      const manifest = TeamsManifestWrapper.readSync(testManifestPath);

      assert.equal(manifest.manifestVersion, "1.11");
      assert.equal(manifest.id, "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
      assert.equal(manifest.filePath, testManifestPath);
    });
  });

  describe("fromJSON", () => {
    it("should create wrapper from JSON string", () => {
      const json = JSON.stringify({
        $schema:
          "https://developer.microsoft.com/en-us/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
        manifestVersion: "1.19",
        id: "json-test-id",
        version: "1.0.0",
        name: { short: "JSON App", full: "JSON App Full Name" },
        description: { short: "Short", full: "Full" },
        developer: {
          name: "Dev",
          websiteUrl: "https://example.com",
          privacyUrl: "https://example.com/privacy",
          termsOfUseUrl: "https://example.com/terms",
        },
        icons: { color: "color.png", outline: "outline.png" },
        accentColor: "#FFFFFF",
      });

      const manifest = TeamsManifestWrapper.fromJSON(json);

      assert.equal(manifest.manifestVersion, "1.19");
      assert.equal(manifest.id, "json-test-id");
      assert.isUndefined(manifest.filePath);
    });
  });

  describe("fluent setters", () => {
    it("should set id and mark dirty", () => {
      const manifest = createTestManifest();
      assert.isFalse(manifest.isDirty);

      manifest.setId("new-id");
      assert.equal(manifest.id, "new-id");
      assert.isTrue(manifest.isDirty);
    });

    it("should set version and mark dirty", () => {
      const manifest = createTestManifest();
      manifest.setVersion("2.0.0");
      assert.equal(manifest.version, "2.0.0");
      assert.isTrue(manifest.isDirty);
    });

    it("should set name and mark dirty", () => {
      const manifest = createTestManifest();
      manifest.setName("New Short", "New Full Name");
      assert.equal(manifest.name.short, "New Short");
      assert.equal(manifest.name.full, "New Full Name");
      assert.isTrue(manifest.isDirty);
    });

    it("should set description and mark dirty", () => {
      const manifest = createTestManifest();
      manifest.setDescription("New Short Desc", "New Full Description");
      assert.equal(manifest.description.short, "New Short Desc");
      assert.equal(manifest.description.full, "New Full Description");
      assert.isTrue(manifest.isDirty);
    });

    it("should set developer and mark dirty", () => {
      const manifest = createTestManifest();
      manifest.setDeveloper({
        name: "New Developer",
        websiteUrl: "https://new.com",
        privacyUrl: "https://new.com/privacy",
        termsOfUseUrl: "https://new.com/terms",
      });
      assert.equal(manifest.developer.name, "New Developer");
      assert.isTrue(manifest.isDirty);
    });

    it("should set icons and mark dirty", () => {
      const manifest = createTestManifest();
      manifest.setIcons("new-color.png", "new-outline.png");
      assert.equal(manifest.icons.color, "new-color.png");
      assert.equal(manifest.icons.outline, "new-outline.png");
      assert.isTrue(manifest.isDirty);
    });

    it("should set accent color and mark dirty", () => {
      const manifest = createTestManifest();
      manifest.setAccentColor("#00FF00");
      assert.equal(manifest.data.accentColor, "#00FF00");
      assert.isTrue(manifest.isDirty);
    });

    it("should set default install scope and mark dirty", () => {
      const manifest = createTestManifest();
      manifest.setDefaultInstallScope(DefaultInstallScope.personal);
      assert.isTrue(manifest.isDirty);
    });

    it("should support method chaining", () => {
      const manifest = createTestManifest();
      const result = manifest
        .setId("chained-id")
        .setVersion("3.0.0")
        .setName("Chained Name")
        .setAccentColor("#0000FF");

      assert.strictEqual(result, manifest);
      assert.equal(manifest.id, "chained-id");
      assert.equal(manifest.version, "3.0.0");
      assert.equal(manifest.name.short, "Chained Name");
    });
  });

  describe("valid domain operations", () => {
    it("should add valid domain", () => {
      const manifest = createTestManifest();
      manifest.addValidDomain("example.com");

      assert.include(manifest.validDomains, "example.com");
      assert.isTrue(manifest.isDirty);
    });

    it("should not add duplicate domain", () => {
      const manifest = createTestManifest();
      manifest.addValidDomain("example.com").addValidDomain("example.com");

      const count = manifest.validDomains.filter((d) => d === "example.com").length;
      assert.equal(count, 1);
    });

    it("should remove valid domain", () => {
      const manifest = createTestManifest();
      manifest.addValidDomain("example.com").addValidDomain("test.com");
      manifest.removeValidDomain("example.com");

      assert.notInclude(manifest.validDomains, "example.com");
      assert.include(manifest.validDomains, "test.com");
    });
  });

  describe("bot operations", () => {
    it("should add bot", () => {
      const manifest = createTestManifest();
      manifest.addBot("bot-id-123", ["personal", "team"]);

      assert.isTrue(manifest.hasBot("bot-id-123"));
      assert.equal(manifest.bots.length, 1);
      assert.equal(manifest.getBot("bot-id-123")?.botId, "bot-id-123");
      assert.isTrue(manifest.isDirty);
    });

    it("should not add duplicate bot", () => {
      const manifest = createTestManifest();
      manifest.addBot("bot-id", ["personal"]).addBot("bot-id", ["team"]);

      assert.equal(manifest.bots.length, 1);
    });

    it("should remove bot", () => {
      const manifest = createTestManifest();
      manifest.addBot("bot1", ["personal"]).addBot("bot2", ["team"]);
      manifest.removeBot("bot1");

      assert.isFalse(manifest.hasBot("bot1"));
      assert.isTrue(manifest.hasBot("bot2"));
    });

    it("should get bot IDs", () => {
      const manifest = createTestManifest();
      manifest.addBot("bot1", ["personal"]).addBot("bot2", ["team"]);

      const ids = manifest.getBotIds();
      assert.deepEqual(ids, ["bot1", "bot2"]);
    });

    it("should replace the first bot command suggestions", () => {
      const manifest = createTestManifest();
      manifest.addBot("bot1", ["personal"]);

      manifest.setFirstBotCommandSuggestions(
        [{ title: "Find pets", description: "Find available pets" }],
        true
      );

      assert.deepEqual(manifest.bots[0].commandLists, [
        {
          scopes: ["personal", "copilot"],
          commands: [{ title: "Find pets", description: "Find available pets" }],
        },
      ]);
      assert.isTrue(manifest.isDirty);
    });

    it("should reject command suggestions when the manifest has no bot", () => {
      const manifest = createTestManifest();

      assert.throws(() => manifest.setFirstBotCommandSuggestions([], false));
    });
  });

  describe("static tab operations", () => {
    it("should add static tab", () => {
      const manifest = createTestManifest();
      manifest.addStaticTab("home", "Home", "https://example.com/home");

      assert.isTrue(manifest.hasStaticTab("home"));
      assert.equal(manifest.staticTabs.length, 1);
      assert.equal(manifest.getStaticTab("home")?.name, "Home");
      assert.isTrue(manifest.isDirty);
    });

    it("should not add duplicate static tab", () => {
      const manifest = createTestManifest();
      manifest
        .addStaticTab("tab1", "Tab 1", "https://example.com/1")
        .addStaticTab("tab1", "Tab 1 Again", "https://example.com/1again");

      assert.equal(manifest.staticTabs.length, 1);
      assert.equal(manifest.getStaticTab("tab1")?.name, "Tab 1");
    });

    it("should remove static tab", () => {
      const manifest = createTestManifest();
      manifest
        .addStaticTab("tab1", "Tab 1", "https://example.com/1")
        .addStaticTab("tab2", "Tab 2", "https://example.com/2");
      manifest.removeStaticTab("tab1");

      assert.isFalse(manifest.hasStaticTab("tab1"));
      assert.isTrue(manifest.hasStaticTab("tab2"));
    });

    it("should get static tab entity IDs", () => {
      const manifest = createTestManifest();
      manifest
        .addStaticTab("tab1", "Tab 1", "https://example.com/1")
        .addStaticTab("tab2", "Tab 2", "https://example.com/2");

      const ids = manifest.getStaticTabEntityIds();
      assert.deepEqual(ids, ["tab1", "tab2"]);
    });
  });

  describe("configurable tab operations", () => {
    it("should add configurable tab", () => {
      const manifest = createTestManifest();
      manifest.addConfigurableTab("https://example.com/config");

      assert.equal(manifest.configurableTabs.length, 1);
      assert.isTrue(manifest.isDirty);
    });

    it("should remove configurable tab", () => {
      const manifest = createTestManifest();
      manifest
        .addConfigurableTab("https://example.com/config1")
        .addConfigurableTab("https://example.com/config2");
      manifest.removeConfigurableTab("https://example.com/config1");

      assert.equal(manifest.configurableTabs.length, 1);
      assert.equal(manifest.configurableTabs[0].configurationUrl, "https://example.com/config2");
    });
  });

  describe("compose extension operations", () => {
    it("should add bot-based compose extension", () => {
      const manifest = createTestManifest();
      manifest.addBotBasedComposeExtension("me-bot-id");

      assert.equal(manifest.composeExtensions.length, 1);
      assert.equal(manifest.composeExtensions[0].botId, "me-bot-id");
      assert.equal(manifest.composeExtensions[0].composeExtensionType, "botBased");
      assert.isTrue(manifest.isDirty);
    });

    it("should add API-based compose extension", () => {
      const manifest = createTestManifest();
      manifest.addApiBasedComposeExtension("openapi.yaml");

      assert.equal(manifest.composeExtensions.length, 1);
      assert.equal(manifest.composeExtensions[0].apiSpecificationFile, "openapi.yaml");
      assert.equal(manifest.composeExtensions[0].composeExtensionType, "apiBased");
    });

    it("should remove compose extension by bot ID", () => {
      const manifest = createTestManifest();
      manifest.addBotBasedComposeExtension("bot1").addBotBasedComposeExtension("bot2");
      manifest.removeComposeExtensionByBotId("bot1");

      assert.equal(manifest.composeExtensions.length, 1);
      assert.equal(manifest.composeExtensions[0].botId, "bot2");
    });
  });

  describe("web application info operations", () => {
    it("should set web application info", () => {
      const manifest = createTestManifest();
      manifest.setWebApplicationInfo("app-id-123", "https://example.com/resource");

      assert.equal(manifest.webApplicationInfo?.id, "app-id-123");
      assert.equal(manifest.webApplicationInfo?.resource, "https://example.com/resource");
      assert.isTrue(manifest.isDirty);
    });

    it("should remove web application info", () => {
      const manifest = createTestManifest();
      manifest.setWebApplicationInfo("app-id");
      manifest.removeWebApplicationInfo();

      assert.isUndefined(manifest.webApplicationInfo);
    });
  });

  describe("copilot agents operations", () => {
    it("should add declarative agent", () => {
      const manifest = createTestManifest();
      manifest.addDeclarativeAgent("agent1", "declarativeAgent.json");

      assert.isTrue(manifest.hasDeclarativeAgent("agent1"));
      assert.equal(manifest.declarativeAgents.length, 1);
      assert.equal(manifest.getDeclarativeAgent("agent1")?.file, "declarativeAgent.json");
      assert.isTrue(manifest.isDirty);
    });

    it("should not add duplicate declarative agent", () => {
      const manifest = createTestManifest();
      manifest
        .addDeclarativeAgent("agent1", "file1.json")
        .addDeclarativeAgent("agent1", "file2.json");

      assert.equal(manifest.declarativeAgents.length, 1);
    });

    it("should remove declarative agent", () => {
      const manifest = createTestManifest();
      manifest.addDeclarativeAgent("a1", "f1.json").addDeclarativeAgent("a2", "f2.json");
      manifest.removeDeclarativeAgent("a1");

      assert.isFalse(manifest.hasDeclarativeAgent("a1"));
      assert.isTrue(manifest.hasDeclarativeAgent("a2"));
    });

    it("should get declarative agent paths", () => {
      const manifest = createTestManifest();
      manifest.addDeclarativeAgent("a1", "path1.json").addDeclarativeAgent("a2", "path2.json");

      const paths = manifest.getDeclarativeAgentPaths();
      assert.deepEqual(paths, ["path1.json", "path2.json"]);
    });

    it("should get legacy copilotExtensions declarative copilot paths", () => {
      const manifest = TeamsManifestWrapper.fromJSON(
        JSON.stringify({
          copilotExtensions: {
            declarativeCopilots: [{ file: "legacy-agent.json" }],
          },
        })
      );

      assert.deepEqual(manifest.getDeclarativeAgentPaths(), ["legacy-agent.json"]);
    });

    it("should get top-level declarative agent paths", () => {
      const manifest = TeamsManifestWrapper.fromJSON(
        JSON.stringify({ declarativeAgents: [{ file: "top-level-agent.json" }] })
      );

      assert.deepEqual(manifest.getDeclarativeAgentPaths(), ["top-level-agent.json"]);
    });

    it("should add custom engine agent", () => {
      const manifest = createTestManifest();
      manifest.addCustomEngineAgent("cea-bot-id");

      assert.equal(manifest.customEngineAgents.length, 1);
      assert.equal(manifest.customEngineAgents[0].id, "cea-bot-id");
      assert.isTrue(manifest.isDirty);
    });

    it("should not add duplicate custom engine agent", () => {
      const manifest = createTestManifest();
      manifest.addCustomEngineAgent("cea1").addCustomEngineAgent("cea1");

      assert.equal(manifest.customEngineAgents.length, 1);
    });

    it("should remove custom engine agent", () => {
      const manifest = createTestManifest();
      manifest.addCustomEngineAgent("cea1").addCustomEngineAgent("cea2");
      manifest.removeCustomEngineAgent("cea1");

      assert.equal(manifest.customEngineAgents.length, 1);
      assert.equal(manifest.customEngineAgents[0].id, "cea2");
    });

    it("should check if has copilot agents", () => {
      const manifest = createTestManifest();
      assert.isFalse(manifest.hasCopilotAgents());

      manifest.addDeclarativeAgent("a1", "f1.json");
      assert.isTrue(manifest.hasCopilotAgents());
    });
  });

  describe("extension runtime operations", () => {
    it("should add collision-safe actions to the runtime for a command script", () => {
      const manifest = TeamsManifestWrapper.fromJSON(
        JSON.stringify({
          id: "app-id",
          extensions: [
            {
              runtimes: [
                {
                  code: { script: "commands.js" },
                  actions: [{ id: "addfooter", type: "executeDataFunction" }],
                },
              ],
            },
          ],
        })
      );

      const ids = manifest.addExtensionRuntimeActions("commands.js", [
        { baseId: "addfooter", type: "executeDataFunction" },
        { baseId: "fillcolor", type: "executeDataFunction" },
      ]);

      assert.deepEqual(ids, ["addfooter1", "fillcolor"]);
      const data: unknown = JSON.parse(manifest.toJSON());
      if (typeof data !== "object" || data === null || Array.isArray(data)) {
        assert.fail("expected Teams manifest object");
      }
      assert.deepNestedInclude(data, {
        "extensions[0].runtimes[0].actions[1]": {
          id: "addfooter1",
          type: "executeDataFunction",
        },
        "extensions[0].runtimes[0].actions[2]": {
          id: "fillcolor",
          type: "executeDataFunction",
        },
      });
      assert.isTrue(manifest.isDirty);
    });
  });

  describe("clone", () => {
    it("should create independent copy", () => {
      const original = createTestManifest();
      original.setName("Original Name", "Original Full Name");

      const cloned = original.clone();
      cloned.setName("Cloned Name", "Cloned Full Name");

      assert.equal(original.name.short, "Original Name");
      assert.equal(cloned.name.short, "Cloned Name");
    });
  });

  describe("cloneWith", () => {
    it("should create clone with modifications", () => {
      const original = createTestManifest();
      const modified = original.cloneWith({ id: "new-clone-id" });

      assert.notEqual(original.id, modified.id);
      assert.equal(modified.id, "new-clone-id");
      assert.isTrue(modified.isDirty);
      assert.isFalse(original.isDirty);
    });
  });

  describe("mutableData", () => {
    it("should return mutable data and mark dirty", () => {
      const manifest = createTestManifest();
      assert.isFalse(manifest.isDirty);

      const data = manifest.mutableData;
      data.id = "mutated-id";

      assert.isTrue(manifest.isDirty);
      assert.equal(manifest.id, "mutated-id");
    });
  });

  describe("toJSON", () => {
    it("should convert manifest to JSON string", () => {
      const manifest = createTestManifest();
      const json = manifest.toJSON();

      assert.isString(json);
      const parsed = JSON.parse(json);
      assert.equal(parsed.id, manifest.id);
    });
  });

  // describe("validate", () => {
  //   it("should return empty array for valid manifest", async () => {
  //     const manifest = await TeamsManifestWrapper.read(testManifestPath);
  //     const errors = await manifest.validate();

  //     assert.isArray(errors);
  //     assert.isEmpty(errors);
  //   });
  // });

  describe("save", () => {
    it("should throw if no file path", async () => {
      const manifest = createTestManifest();

      try {
        await manifest.save();
        assert.fail("Should have thrown");
      } catch (e: unknown) {
        assert.include((e as Error).message, "No file path");
      }
    });

    it("should save and reset dirty flag", async () => {
      const writeStub = sandbox.stub(fs, "writeFile").resolves();
      const manifest = createTestManifest();

      manifest.setName("Modified", "Modified Full Name");
      await manifest.save("/path/to/manifest.json");

      assert.isTrue(writeStub.calledOnce);
      assert.equal(manifest.filePath, "/path/to/manifest.json");
      assert.isFalse(manifest.isDirty);
    });
  });

  describe("enums", () => {
    it("should have correct DefaultInstallScope values", () => {
      assert.equal(DefaultInstallScope.personal, "personal");
      assert.equal(DefaultInstallScope.team, "team");
      assert.equal(DefaultInstallScope.groupChat, "groupChat");
      assert.equal(DefaultInstallScope.meetings, "meetings");
      assert.equal(DefaultInstallScope.copilot, "copilot");
    });

    it("should have correct StaticTabScope values", () => {
      assert.equal(StaticTabScope.personal, "personal");
      assert.equal(StaticTabScope.team, "team");
      assert.equal(StaticTabScope.groupChat, "groupChat");
    });

    it("should have correct ConfigurableTabScope values", () => {
      assert.equal(ConfigurableTabScope.team, "team");
      assert.equal(ConfigurableTabScope.groupChat, "groupChat");
    });

    it("should have correct ComposeExtensionTypeEnum values", () => {
      assert.equal(ComposeExtensionTypeEnum.botBased, "botBased");
      assert.equal(ComposeExtensionTypeEnum.apiBased, "apiBased");
    });
  });

  // Helper function
  function createTestManifest(): TeamsManifestWrapper {
    return TeamsManifestWrapper.create({
      manifestVersion: "1.19",
      id: "test-id",
      version: "1.0.0",
      name: { short: "Test", full: "Test Full Name" },
      description: { short: "Short", full: "Full" },
      developer: {
        name: "Dev",
        websiteUrl: "https://example.com",
        privacyUrl: "https://example.com/privacy",
        termsOfUseUrl: "https://example.com/terms",
      },
    });
  }

  describe("Agent Skills", () => {
    it("skills getter returns empty array when no agentSkills", () => {
      const wrapper = createTestManifest();
      assert.deepEqual(wrapper.skills, []);
    });

    it("addSkill adds a skill entry", () => {
      const wrapper = createTestManifest();
      wrapper.addSkill("skills/my-skill");
      assert.equal(wrapper.skills.length, 1);
      assert.equal(wrapper.skills[0].folder, "skills/my-skill");
      assert.isTrue(wrapper.isDirty);
    });

    it("addSkill ignores duplicates", () => {
      const wrapper = createTestManifest();
      wrapper.addSkill("skills/my-skill");
      wrapper.addSkill("skills/my-skill");
      assert.equal(wrapper.skills.length, 1);
    });

    it("removeSkill removes a skill", () => {
      const wrapper = createTestManifest();
      wrapper.addSkill("skills/a");
      wrapper.addSkill("skills/b");
      wrapper.removeSkill("skills/a");
      assert.equal(wrapper.skills.length, 1);
      assert.equal(wrapper.skills[0].folder, "skills/b");
    });

    it("hasSkill checks existence", () => {
      const wrapper = createTestManifest();
      wrapper.addSkill("skills/my-skill");
      assert.isTrue(wrapper.hasSkill("skills/my-skill"));
      assert.isFalse(wrapper.hasSkill("skills/other"));
    });

    it("getSkillFolders returns folder paths", () => {
      const wrapper = createTestManifest();
      wrapper.addSkill("skills/a");
      wrapper.addSkill("skills/b");
      assert.deepEqual(wrapper.getSkillFolders(), ["skills/a", "skills/b"]);
    });

    it("addSkill respects max limit of 20", () => {
      const wrapper = createTestManifest();
      for (let i = 0; i < 20; i++) {
        wrapper.addSkill(`skills/skill-${i}`);
      }
      wrapper.addSkill("skills/overflow");
      assert.equal(wrapper.skills.length, 20);
      assert.isFalse(wrapper.hasSkill("skills/overflow"));
    });
  });
});
