import { assert } from "chai";
import "mocha";
import fs from "fs-extra";
import path from "path";
import { createSandbox } from "sinon";
import {
  DeclarativeAgentManifestWrapper,
  CapabilityName,
} from "../../src/wrappers/DeclarativeAgentManifestWrapper";

describe("DeclarativeAgentManifestWrapper", () => {
  const sandbox = createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  describe("create", () => {
    it("should create a new agent manifest with required fields", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test Agent",
        description: "A test agent",
      });

      assert.equal(agent.version, "v1.6");
      assert.equal(agent.name, "Test Agent");
      assert.equal(agent.description, "A test agent");
      assert.isFalse(agent.isDirty);
    });

    it("should include instructions if provided", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test Agent",
        description: "A test agent",
        instructions: "Be helpful",
      });

      assert.equal(agent.instructions, "Be helpful");
    });
  });

  describe("fromJSON", () => {
    it("should create wrapper from JSON string", () => {
      const json = JSON.stringify({
        version: "v1.6",
        name: "JSON Agent",
        description: "From JSON",
      });

      const agent = DeclarativeAgentManifestWrapper.fromJSON(json);

      assert.equal(agent.version, "v1.6");
      assert.equal(agent.name, "JSON Agent");
    });
  });

  describe("fluent setters", () => {
    it("should set properties and mark dirty", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      assert.isFalse(agent.isDirty);

      agent.setName("New Name");
      assert.equal(agent.name, "New Name");
      assert.isTrue(agent.isDirty);
    });

    it("should support method chaining", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      const result = agent
        .setName("Chained Name")
        .setDescription("Chained Desc")
        .setInstructions("Be helpful");

      assert.strictEqual(result, agent);
      assert.equal(agent.name, "Chained Name");
      assert.equal(agent.instructions, "Be helpful");
    });

    it("should set a sensitivity label and mark dirty", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      const result = agent.setSensitivityLabel("general-label-id");

      assert.strictEqual(result, agent);
      assert.deepEqual(agent.sensitivityLabel, { id: "general-label-id" });
      assert.isTrue(agent.isDirty);
    });
  });

  describe("action operations", () => {
    it("should add actions", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addAction("action1", "plugin.json");

      assert.isTrue(agent.hasAction("action1"));
      assert.equal(agent.actions.length, 1);
      assert.equal(agent.getAction("action1")?.file, "plugin.json");
    });

    it("should upsert an action by plugin path", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addAction("old-id", "plugin.json").upsertAction("new-id", "plugin.json");

      assert.equal(agent.actions.length, 1);
      assert.equal(agent.actions[0].id, "new-id");
      assert.equal(agent.actions[0].file, "plugin.json");
      assert.isTrue(agent.isDirty);
    });

    it("should remove actions", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addAction("a1", "p1.json").addAction("a2", "p2.json").removeAction("a1");

      assert.isFalse(agent.hasAction("a1"));
      assert.isTrue(agent.hasAction("a2"));
    });

    it("should get action plugin paths", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addAction("a1", "p1.json").addAction("a2", "p2.json");

      assert.deepEqual(agent.getActionPluginPaths(), ["p1.json", "p2.json"]);
    });
  });

  describe("capability operations", () => {
    it("should add capabilities", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addWebSearchCapability();

      assert.isTrue(agent.hasCapability(CapabilityName.WebSearch));
      assert.equal(agent.capabilities.length, 1);
    });

    it("should replace existing capability with same name", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addWebSearchCapability([{ url: "https://first.com" }]);
      agent.addWebSearchCapability([{ url: "https://second.com" }]);

      assert.equal(agent.capabilities.length, 1);
      const cap = agent.getCapability(CapabilityName.WebSearch) as {
        sites?: Array<{ url: string }>;
      };
      assert.equal(cap.sites?.[0].url, "https://second.com");
    });

    it("should remove capabilities", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addWebSearchCapability().addCodeInterpreterCapability();
      agent.removeCapability(CapabilityName.WebSearch);

      assert.isFalse(agent.hasCapability(CapabilityName.WebSearch));
      assert.isTrue(agent.hasCapability(CapabilityName.CodeInterpreter));
    });

    it("should add convenience capabilities", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent
        .addGraphConnectorsCapability(["conn1", "conn2"])
        .addEmbeddedKnowledgeCapability([{ file: "doc.pdf" }])
        .addGraphicArtCapability();

      assert.isTrue(agent.hasCapability(CapabilityName.GraphConnectors));
      assert.isTrue(agent.hasCapability(CapabilityName.EmbeddedKnowledge));
      assert.isTrue(agent.hasCapability(CapabilityName.GraphicArt));
    });
  });

  describe("conversation starter operations", () => {
    it("should add conversation starters", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addConversationStarter("Hello!", "Greeting");

      assert.equal(agent.conversationStarters.length, 1);
      assert.equal(agent.conversationStarters[0].text, "Hello!");
      assert.equal(agent.conversationStarters[0].title, "Greeting");
    });

    it("should not add duplicate starters", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addConversationStarter("Hello!").addConversationStarter("Hello!");

      assert.equal(agent.conversationStarters.length, 1);
    });

    it("should clear all starters", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addConversationStarter("A").addConversationStarter("B").clearConversationStarters();

      assert.equal(agent.conversationStarters.length, 0);
    });

    it("should not add more than 12 conversation starters", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      // Add 12 starters
      for (let i = 0; i < 12; i++) {
        agent.addConversationStarter(`Starter ${i}`);
      }
      assert.equal(agent.conversationStarters.length, 12);

      // Try to add 13th - should be ignored
      agent.addConversationStarter("Starter 12");
      assert.equal(agent.conversationStarters.length, 12);
    });

    it("should remove conversation starter by text", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent
        .addConversationStarter("Starter A")
        .addConversationStarter("Starter B")
        .removeConversationStarter("Starter A");

      assert.equal(agent.conversationStarters.length, 1);
      assert.equal(agent.conversationStarters[0].text, "Starter B");
    });
  });

  describe("worker agent operations", () => {
    it("should add worker agents", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addWorkerAgent("worker1");

      assert.equal(agent.workerAgents.length, 1);
      assert.equal(agent.workerAgents[0].id, "worker1");
    });

    it("should not add duplicate worker agents", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addWorkerAgent("w1").addWorkerAgent("w1");

      assert.equal(agent.workerAgents.length, 1);
    });

    it("should remove worker agents", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.addWorkerAgent("w1").addWorkerAgent("w2").removeWorkerAgent("w1");

      assert.equal(agent.workerAgents.length, 1);
      assert.equal(agent.workerAgents[0].id, "w2");
    });
  });

  describe("clone", () => {
    it("should create independent copy", () => {
      const original = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Original",
        description: "Test",
      });

      const cloned = original.clone();
      cloned.setName("Cloned");

      assert.equal(original.name, "Original");
      assert.equal(cloned.name, "Cloned");
    });
  });

  describe("save", () => {
    it("should throw if no file path", async () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      try {
        await agent.save();
        assert.fail("Should have thrown");
      } catch (e: unknown) {
        assert.include((e as Error).message, "No file path");
      }
    });

    it("should save and reset dirty flag", async () => {
      const writeStub = sandbox.stub(fs, "writeFile").resolves();
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      agent.setName("Modified");
      await agent.save("/path/to/agent.json");

      assert.isTrue(writeStub.calledOnce);
      assert.isFalse(agent.isDirty);
    });
  });

  describe("validate", () => {
    it("should return validation result", async () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test",
        description: "Test",
      });

      const errors = await agent.validate();
      assert.isArray(errors);
    });
  });

  describe("toJSON", () => {
    it("should convert manifest to JSON string", () => {
      const agent = DeclarativeAgentManifestWrapper.create({
        version: "v1.6",
        name: "Test Agent",
        description: "Test description",
      });

      const json = agent.toJSON();
      assert.isString(json);

      const parsed = JSON.parse(json);
      assert.equal(parsed.name, "Test Agent");
      assert.equal(parsed.description, "Test description");
    });
  });
});
