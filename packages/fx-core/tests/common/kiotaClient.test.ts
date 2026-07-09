// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import os from "os";
import path from "path";
import { assert, vi } from "vitest";

vi.mock("@microsoft/kiota", () => ({
  setKiotaConfig: vi.fn(),
  searchDescription: vi.fn(),
  getKiotaTree: vi.fn(),
  generatePlugin: vi.fn(),
  ConsumerOperation: { Edit: "edit" },
}));

import * as kiota from "@microsoft/kiota";
import {
  kiotageneratePlugin,
  listAPITreeInfo,
  searchOpenAPISpec,
} from "../../src/common/kiotaClient";

const mockKiotaBinaryPath = path.join(os.tmpdir(), "fx-core-ut", "kiota");

describe("kiotaClient", () => {
  let originalPkg: any;

  beforeEach(() => {
    originalPkg = (process as any).pkg;
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalPkg !== undefined) {
      (process as any).pkg = originalPkg;
    } else {
      delete (process as any).pkg;
    }
    delete process.env.KIOTA_BINARY_PATH;
    delete process.env.TestEnv;
    delete process.env.operationId;
  });

  describe("setKiotaBinaryPath", () => {
    it("should set binary location from KIOTA_BINARY_PATH environment variable", async () => {
      process.env.KIOTA_BINARY_PATH = "/custom/path/to/kiota";
      vi.mocked(kiota.searchDescription).mockResolvedValue({} as any);

      await searchOpenAPISpec("test-query");

      assert.isTrue(vi.mocked(kiota.setKiotaConfig).mock.calls.length === 1);
      assert.deepEqual(vi.mocked(kiota.setKiotaConfig).mock.calls[0][0], {
        binaryLocation: "/custom/path/to/kiota",
      });
    });

    it("should set binary location to kiota-bin directory when running inside pkg", async () => {
      delete process.env.KIOTA_BINARY_PATH;
      (process as any).pkg = {};
      vi.mocked(kiota.searchDescription).mockResolvedValue({} as any);

      await searchOpenAPISpec("test-query");

      assert.isTrue(vi.mocked(kiota.setKiotaConfig).mock.calls.length === 1);
      const arg = vi.mocked(kiota.setKiotaConfig).mock.calls[0][0] as { binaryLocation: string };
      assert.isTrue(arg.binaryLocation.endsWith("kiota-bin"));
    });

    it("should not call setKiotaConfig when not in pkg and no env var set", async () => {
      delete process.env.KIOTA_BINARY_PATH;
      delete (process as any).pkg;
      vi.mocked(kiota.searchDescription).mockResolvedValue({} as any);

      await searchOpenAPISpec("test-query");

      assert.isTrue(vi.mocked(kiota.setKiotaConfig).mock.calls.length === 0);
    });

    it("should prioritize KIOTA_BINARY_PATH over pkg detection", async () => {
      process.env.KIOTA_BINARY_PATH = "/env/path/to/kiota";
      (process as any).pkg = {};
      vi.mocked(kiota.searchDescription).mockResolvedValue({} as any);

      await searchOpenAPISpec("test-query");

      assert.isTrue(vi.mocked(kiota.setKiotaConfig).mock.calls.length === 1);
      assert.deepEqual(vi.mocked(kiota.setKiotaConfig).mock.calls[0][0], {
        binaryLocation: "/env/path/to/kiota",
      });
    });
  });

  it("happy path: searchOpenAPISpec", async () => {
    process.env.KIOTA_BINARY_PATH = mockKiotaBinaryPath;
    vi.mocked(kiota.searchDescription).mockResolvedValue({
      "api-spec": {
        DescriptionUrl: "https://example.com/api-spec.json",
        Description: "API Spec description",
        Title: "API Spec Title",
      },
    } as any);

    const result = await searchOpenAPISpec("test-query");

    assert.isTrue(vi.mocked(kiota.setKiotaConfig).mock.calls.length === 1);
    assert.equal(result.length, 1);
    assert.equal(result[0].key, "api-spec");
    assert.equal(result[0].url, "https://example.com/api-spec.json");
    assert.equal(result[0].description, "API Spec description");
  });

  it("happy path: searchOpenAPISpec missing url", async () => {
    vi.mocked(kiota.searchDescription).mockResolvedValue({
      "api-spec": {
        Description: "API Spec description",
        Title: "API Spec Title",
      },
    } as any);

    const result = await searchOpenAPISpec("test-query");
    assert.equal(result.length, 0);
  });

  it("happy path: searchOpenAPISpec undefined result", async () => {
    vi.mocked(kiota.searchDescription).mockResolvedValue(undefined as any);

    const result = await searchOpenAPISpec("test-query");
    assert.equal(result.length, 0);
  });

  describe("listAPITreeInfo", () => {
    it("happy path: listAPITreeInfo with default parameters", async () => {
      const mockTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          children: [],
        },
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
      };
      process.env.KIOTA_BINARY_PATH = mockKiotaBinaryPath;
      vi.mocked(kiota.getKiotaTree).mockResolvedValue(mockTreeResult as any);

      const result = await listAPITreeInfo("path/to/spec");

      assert.deepEqual(result, mockTreeResult);
      assert.isTrue(vi.mocked(kiota.getKiotaTree).mock.calls.length === 1);
    });

    it("happy path: listAPITreeInfo with include and exclude filters", async () => {
      const mockTreeResult = {
        rootNode: { isOperation: false, path: "", segment: "", children: [] },
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
      };
      const includeFilters = ["GET /users"];
      const excludeFilters = ["DELETE /users"];
      vi.mocked(kiota.getKiotaTree).mockResolvedValue(mockTreeResult as any);

      const result = await listAPITreeInfo("path/to/spec", includeFilters, excludeFilters);

      assert.deepEqual(result, mockTreeResult);
      assert.deepEqual(vi.mocked(kiota.getKiotaTree).mock.calls[0][0], {
        includeFilters,
        descriptionPath: "path/to/spec",
        excludeFilters,
        clearCache: true,
        includeKiotaValidationRules: true,
      });
    });

    it("listAPITreeInfo should throw error if contains logs level >= 4", async () => {
      vi.mocked(kiota.getKiotaTree).mockResolvedValue({
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          children: [],
        },
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [
          { level: 4, message: "Error parsing OpenAPI spec" },
          { level: 5, message: "Fatal error" },
        ],
      } as any);

      try {
        await listAPITreeInfo("path/to/spec");
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.equal(error.message, "Error parsing OpenAPI spec\nFatal error");
      }
    });

    it("edge case: ListAPITreeInfo contains environment variables", async () => {
      process.env.TestEnv = "test-env";
      process.env.operationId = "test-operation-id";
      vi.mocked(kiota.getKiotaTree).mockResolvedValue({
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "${{operationId}}",
          children: [],
        },
        servers: ["https://api.example.com/${{TestEnv}}/"],
        security: [],
        securitySchemes: {},
        logs: [],
      } as any);

      const result = await listAPITreeInfo("path/to/spec");
      assert.equal(result.servers[0], "https://api.example.com/test-env/");
      assert.equal(result.rootNode.operationId, "test-operation-id");
    });

    it("edge case: listAPITreeInfo returns undefined", async () => {
      vi.mocked(kiota.getKiotaTree).mockResolvedValue(undefined as any);

      try {
        await listAPITreeInfo("path/to/spec");
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.equal(error.message, "Get empty result when parser OpenAPI description file.");
      }
    });

    it("error path: listAPITreeInfo throws exception", async () => {
      vi.mocked(kiota.getKiotaTree).mockRejectedValue(new Error("Failed to parse OpenAPI spec"));

      try {
        await listAPITreeInfo("path/to/spec");
        assert.fail("Should have thrown an error");
      } catch (error: any) {
        assert.equal(error.message, "Failed to parse OpenAPI spec");
      }
    });
  });
});

describe("generatePlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.KIOTA_BINARY_PATH;
  });

  it("happy path: generatePlugin", async () => {
    vi.mocked(kiota.generatePlugin).mockResolvedValue({
      aiPlugin: "mocked-ai-plugin",
      openAPISpec: "mocked-openapi-spec",
      isSuccess: true,
      logs: [],
    } as any);

    const res = await kiotageneratePlugin(
      "specPath",
      "outputPath",
      "pluginName",
      "workingDirectory",
      undefined,
      undefined,
      undefined,
      undefined,
      true
    );

    assert.equal(res.isSuccess, true);
    assert.isTrue(vi.mocked(kiota.generatePlugin).mock.calls.length === 1);
  });

  it("happy path: generatePlugin with binary path specified", async () => {
    process.env.KIOTA_BINARY_PATH = mockKiotaBinaryPath;
    vi.mocked(kiota.generatePlugin).mockResolvedValue({
      aiPlugin: "mocked-ai-plugin",
      openAPISpec: "mocked-openapi-spec",
      isSuccess: true,
      logs: [],
    } as any);

    await kiotageneratePlugin("specPath", "outputPath", "pluginName", "workingDirectory");

    assert.isTrue(vi.mocked(kiota.setKiotaConfig).mock.calls.length === 1);
    assert.isTrue(vi.mocked(kiota.generatePlugin).mock.calls.length === 1);
  });

  it("should throw error if kiota return unedfined", async () => {
    vi.mocked(kiota.generatePlugin).mockResolvedValue(undefined as any);

    try {
      await kiotageneratePlugin("specPath", "outputPath", "pluginName", "workingDirectory");
      assert.fail("Should throw");
    } catch (error: any) {
      assert.equal(
        error.message,
        "Unable to generate plugin manifest file using Kiota. Error: Get empty result from kiota"
      );
      assert.equal(error.source, "kiota");
    }
  });

  it("should throw error if kiota throw error", async () => {
    vi.mocked(kiota.generatePlugin).mockResolvedValue({
      aiPlugin: "mocked-ai-plugin",
      openAPISpec: "mocked-openapi-spec",
      isSuccess: false,
      logs: [{ level: 4, message: "Error parsing OpenAPI spec" }],
    } as any);

    try {
      await kiotageneratePlugin("specPath", "outputPath", "pluginName", "workingDirectory");
      assert.fail("Should throw");
    } catch (error: any) {
      assert.equal(
        error.message,
        "Unable to generate plugin manifest file using Kiota. Error: Error parsing OpenAPI spec"
      );
      assert.equal(error.source, "kiota");
    }
  });

  it("should throw error if kiota throw error", async () => {
    vi.mocked(kiota.generatePlugin).mockImplementation(() => {
      throw new Error("mocked error");
    });

    try {
      await kiotageneratePlugin(
        "specPath",
        "outputPath",
        "pluginName",
        "workingDirectory",
        "OAuthPluginVault" as any,
        "mockedRefId",
        ["includePattern"],
        ["excludePattern"]
      );
      assert.fail("Should throw");
    } catch (error: any) {
      assert.equal(
        error.message,
        "Unable to generate plugin manifest file using Kiota. Error: mocked error"
      );
      assert.equal(error.source, "kiota");
    }
  });
});
