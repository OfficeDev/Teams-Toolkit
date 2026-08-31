import { assert } from "chai";
import "mocha";
import fs from "fs-extra";
import path from "path";
import { AppManifestUtils } from "../src";

/**
 * Guards the v2.4 API-plugin schema's discriminated `runtime.spec` union.
 *
 * `runtime.spec` is selected by the sibling `runtime.type` (OpenApi -> open-api-spec,
 * LocalPlugin -> local-plugin-spec, RemoteMCPServer -> mcp-execution-spec). Before the fix the
 * `spec` schemas were combined in a single undiscriminated `oneOf`, so a bare RemoteMCPServer
 * dynamic-tool-discovery spec `{ "url": "..." }` matched BOTH `open-api-spec` and
 * `mcp-execution-spec` and failed `oneOf`. This suite pins the intended behavior for every runtime
 * type, plus the `mcp_tool_description` file/inline disambiguation.
 */
describe("Copilot plugin v2.4 runtime spec discrimination", () => {
  const schema = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../src/json-schemas/copilot/plugin/v2.4/schema.json"),
      "utf8"
    )
  );

  const noneAuth = { type: "None" };

  function manifestWithRuntime(runtime: unknown): unknown {
    return {
      $schema: "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.4/schema.json",
      schema_version: "v2.4",
      name_for_human: "Test",
      namespace: "test",
      description_for_human: "Test",
      contact_email: "publisher@example.com",
      functions: [],
      runtimes: [runtime],
    };
  }

  async function validate(runtime: unknown): Promise<string[]> {
    return AppManifestUtils.validateAgainstSchema(manifestWithRuntime(runtime) as any, schema);
  }

  describe("valid runtimes", () => {
    it("accepts a RemoteMCPServer with a bare url spec (dynamic tool discovery)", async () => {
      const errors = await validate({
        type: "RemoteMCPServer",
        auth: noneAuth,
        spec: { url: "https://api.contoso.com/mcp" },
        run_for_functions: ["*"],
      });
      assert.deepEqual(errors, []);
    });

    it("accepts a RemoteMCPServer with a file-reference mcp_tool_description (static tools)", async () => {
      const errors = await validate({
        type: "RemoteMCPServer",
        auth: noneAuth,
        spec: {
          url: "https://api.contoso.com/mcp",
          mcp_tool_description: { file: "mcp-tools.json" },
        },
        run_for_functions: ["*"],
      });
      assert.deepEqual(errors, []);
    });

    it("accepts a RemoteMCPServer with inline mcp_tool_description (static tools)", async () => {
      const errors = await validate({
        type: "RemoteMCPServer",
        auth: noneAuth,
        spec: {
          url: "https://api.contoso.com/mcp",
          mcp_tool_description: { tools: [] },
        },
        run_for_functions: ["*"],
      });
      assert.deepEqual(errors, []);
    });

    it("accepts an OpenApi runtime with a url spec", async () => {
      const errors = await validate({
        type: "OpenApi",
        auth: noneAuth,
        spec: { url: "https://api.contoso.com/openapi.yaml" },
        run_for_functions: ["*"],
      });
      assert.deepEqual(errors, []);
    });

    it("accepts an OpenApi runtime with an api_description spec", async () => {
      const errors = await validate({
        type: "OpenApi",
        auth: noneAuth,
        spec: { api_description: "openapi: 3.0.0" },
        run_for_functions: ["*"],
      });
      assert.deepEqual(errors, []);
    });

    it("accepts a LocalPlugin runtime", async () => {
      const errors = await validate({
        type: "LocalPlugin",
        auth: noneAuth,
        spec: { local_endpoint: "Microsoft.Office.Addin" },
        run_for_functions: ["myFunction"],
      });
      assert.deepEqual(errors, []);
    });
  });

  describe("invalid runtimes", () => {
    it("rejects an OpenApi runtime whose spec carries mcp_tool_description", async () => {
      const errors = await validate({
        type: "OpenApi",
        auth: noneAuth,
        spec: {
          url: "https://api.contoso.com/openapi.yaml",
          mcp_tool_description: { file: "mcp-tools.json" },
        },
        run_for_functions: ["*"],
      });
      assert.isTrue(errors.length > 0);
    });

    it("rejects a RemoteMCPServer runtime whose spec is missing url", async () => {
      const errors = await validate({
        type: "RemoteMCPServer",
        auth: noneAuth,
        spec: {},
        run_for_functions: ["*"],
      });
      assert.isTrue(errors.length > 0);
    });

    it("rejects a RemoteMCPServer runtime carrying a local_endpoint spec", async () => {
      const errors = await validate({
        type: "RemoteMCPServer",
        auth: noneAuth,
        spec: { local_endpoint: "Microsoft.Office.Addin" },
        run_for_functions: ["*"],
      });
      assert.isTrue(errors.length > 0);
    });

    it("rejects a LocalPlugin runtime carrying a url spec", async () => {
      const errors = await validate({
        type: "LocalPlugin",
        auth: noneAuth,
        spec: { local_endpoint: "Microsoft.Office.Addin", url: "https://api.contoso.com" },
        run_for_functions: ["myFunction"],
      });
      assert.isTrue(errors.length > 0);
    });
  });
});
