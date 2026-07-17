import { assert } from "chai";
import "mocha";
import fs from "fs-extra";
import { createSandbox } from "sinon";
import { APIPluginManifestWrapper, RuntimeType } from "../../src/wrappers/APIPluginManifestWrapper";

describe("APIPluginManifestWrapper", () => {
  const sandbox = createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  describe("create", () => {
    it("should create a new plugin manifest with required fields", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test Plugin",
        descriptionForHuman: "A test plugin",
      });

      assert.equal(plugin.schemaVersion, "v2.4");
      assert.equal(plugin.nameForHuman, "Test Plugin");
      assert.equal(plugin.descriptionForHuman, "A test plugin");
      assert.equal(plugin.namespace, "Test_Plugin");
      assert.isFalse(plugin.isDirty);
    });

    it("should use custom namespace if provided", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test Plugin",
        descriptionForHuman: "A test plugin",
        namespace: "custom_ns",
      });

      assert.equal(plugin.namespace, "custom_ns");
    });
  });

  describe("fromJSON", () => {
    it("should create wrapper from JSON string", () => {
      const json = JSON.stringify({
        schema_version: "v2.4",
        name_for_human: "JSON Plugin",
        description_for_human: "From JSON",
        namespace: "json_plugin",
      });

      const plugin = APIPluginManifestWrapper.fromJSON(json);

      assert.equal(plugin.schemaVersion, "v2.4");
      assert.equal(plugin.nameForHuman, "JSON Plugin");
      assert.isUndefined(plugin.filePath);
    });
  });

  describe("fluent setters", () => {
    it("should set properties and mark dirty", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      assert.isFalse(plugin.isDirty);

      plugin.setNameForHuman("New Name");
      assert.equal(plugin.nameForHuman, "New Name");
      assert.isTrue(plugin.isDirty);
    });

    it("should support method chaining", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      const result = plugin
        .setNameForHuman("Chained Name")
        .setDescriptionForHuman("Chained Description")
        .setDescriptionForModel("Model description")
        .setNamespace("chained_ns");

      assert.strictEqual(result, plugin);
      assert.equal(plugin.nameForHuman, "Chained Name");
      assert.equal(plugin.descriptionForHuman, "Chained Description");
      assert.equal(plugin.namespace, "chained_ns");
    });
  });

  describe("function operations", () => {
    it("should add functions", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      plugin.addFunction("getUser", "Get user by ID");

      assert.isTrue(plugin.hasFunction("getUser"));
      assert.equal(plugin.functions.length, 1);
      assert.equal(plugin.getFunction("getUser")?.description, "Get user by ID");
    });

    it("should not add duplicate functions", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      plugin.addFunction("getUser", "First").addFunction("getUser", "Second");

      assert.equal(plugin.functions.length, 1);
      assert.equal(plugin.getFunction("getUser")?.description, "First");
    });

    it("should remove functions", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      plugin.addFunction("func1").addFunction("func2").removeFunction("func1");

      assert.isFalse(plugin.hasFunction("func1"));
      assert.isTrue(plugin.hasFunction("func2"));
    });
  });

  describe("runtime operations", () => {
    it("should add OpenAPI runtime", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      plugin.addOpenApiRuntime("openapi.yaml", "None", ["*"]);

      assert.equal(plugin.runtimes.length, 1);
      assert.equal(plugin.runtimes[0].type, RuntimeType.OpenApi);
    });

    it("should get API spec paths", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      plugin.addOpenApiRuntime("spec1.yaml").addOpenApiRuntime("spec2.yaml");

      const paths = plugin.getApiSpecPaths();
      assert.deepEqual(paths, ["spec1.yaml", "spec2.yaml"]);
    });

    it("should remove runtime by spec URL", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      plugin.addOpenApiRuntime("keep.yaml").addOpenApiRuntime("remove.yaml");
      plugin.removeRuntimeBySpecUrl("remove.yaml");

      assert.deepEqual(plugin.getApiSpecPaths(), ["keep.yaml"]);
    });

    it("should materialize Remote MCP tools by replacing functions and runtimes", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });
      plugin.addFunction("old").addOpenApiRuntime("old.yaml");

      plugin.materializeRemoteMcpTools(
        [{ name: "search", description: "Search records" }],
        "https://api.example.com/mcp",
        "mcp-tools-1.json"
      );

      assert.deepEqual(plugin.functions, [{ name: "search", description: "Search records" }]);
      assert.deepEqual(plugin.runtimes, [
        {
          type: "RemoteMCPServer",
          auth: { type: "None" },
          spec: {
            url: "https://api.example.com/mcp",
            mcp_tool_description: { file: "mcp-tools-1.json" },
          },
          run_for_functions: ["search"],
        },
      ]);
      assert.isTrue(plugin.isDirty);
    });

    it("should return plugin conversation starter text", () => {
      const plugin = APIPluginManifestWrapper.fromJSON(
        JSON.stringify({
          schema_version: "v2.4",
          name_for_human: "Test",
          description_for_human: "Test",
          namespace: "test",
          functions: [],
          runtimes: [],
          capabilities: {
            conversation_starters: [{ text: "Find pets" }, { text: "List owners" }],
          },
        })
      );

      assert.deepEqual(plugin.getConversationStarterTexts(), ["Find pets", "List owners"]);
    });
  });

  describe("runtime operations - LocalPlugin", () => {
    it("should add LocalPlugin runtime", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      plugin.addLocalPluginRuntime("Microsoft.Office.Addin", ["myFunction"]);

      assert.equal(plugin.runtimes.length, 1);
      assert.equal(plugin.runtimes[0].type, RuntimeType.LocalPlugin);
    });

    it("should add LocalPlugin runtime with default run_for_functions", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      plugin.addLocalPluginRuntime("Microsoft.Office.Addin");

      assert.equal(plugin.runtimes.length, 1);
      assert.equal(plugin.runtimes[0].type, RuntimeType.LocalPlugin);
    });
  });

  describe("clone", () => {
    it("should create independent copy", () => {
      const original = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Original",
        descriptionForHuman: "Test",
      });

      const cloned = original.clone();
      cloned.setNameForHuman("Cloned");

      assert.equal(original.nameForHuman, "Original");
      assert.equal(cloned.nameForHuman, "Cloned");
    });
  });

  describe("cloneWith", () => {
    it("should create clone with modifications", () => {
      const original = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Original",
        descriptionForHuman: "Test",
      });

      const modified = original.cloneWith({ name_for_human: "Modified" });

      assert.equal(original.nameForHuman, "Original");
      assert.equal(modified.nameForHuman, "Modified");
      assert.isTrue(modified.isDirty);
      assert.isFalse(original.isDirty);
    });
  });

  describe("mutableData", () => {
    it("should return mutable data and mark dirty", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      assert.isFalse(plugin.isDirty);

      const data = plugin.mutableData;
      data.name_for_human = "Mutated";

      assert.isTrue(plugin.isDirty);
      assert.equal(plugin.nameForHuman, "Mutated");
    });
  });

  describe("validate", () => {
    it("should return validation result", async () => {
      const json = JSON.stringify({
        $schema: "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.2/schema.json",
        schema_version: "v2.2",
        name_for_human: "Test",
        description_for_human: "Test",
        namespace: "test",
      });

      const plugin = APIPluginManifestWrapper.fromJSON(json);
      const errors = await plugin.validate();
      assert.isArray(errors);
    });
  });

  describe("toJSON", () => {
    it("should convert manifest to JSON string", () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test desc",
      });

      const json = plugin.toJSON();
      assert.isString(json);

      const parsed = JSON.parse(json);
      assert.equal(parsed.name_for_human, "Test");
      assert.equal(parsed.description_for_human, "Test desc");
    });
  });

  describe("save", () => {
    it("should throw if no file path", async () => {
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      try {
        await plugin.save();
        assert.fail("Should have thrown");
      } catch (e: unknown) {
        assert.include((e as Error).message, "No file path");
      }
    });

    it("should save to specified path", async () => {
      const writeStub = sandbox.stub(fs, "writeFile").resolves();
      const plugin = APIPluginManifestWrapper.create({
        schemaVersion: "v2.4",
        nameForHuman: "Test",
        descriptionForHuman: "Test",
      });

      plugin.setNameForHuman("Modified");
      await plugin.save("/path/to/plugin.json");

      assert.isTrue(writeStub.calledOnce);
      assert.equal(plugin.filePath, "/path/to/plugin.json");
      assert.isFalse(plugin.isDirty);
    });
  });
});
