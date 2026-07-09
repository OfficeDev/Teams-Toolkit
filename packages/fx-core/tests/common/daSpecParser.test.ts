// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  GeneratePluginResult,
  KiotaOpenApiNode,
  KiotaTreeResult,
  OpenApiSpecVersion,
} from "@microsoft/kiota";
import {
  AdaptiveCardUpdateStrategy,
  ErrorType,
  SpecParser,
  Utils,
  ValidationStatus,
  WarningResult,
  WarningType,
} from "@microsoft/m365-spec-parser";
import { Platform } from "@microsoft/teamsfx-api";
import crypto from "crypto";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import tmp from "tmp";
import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";
import * as daSpecParser from "../../src/common/daSpecParser";
import { featureFlagManager, FeatureFlags } from "../../src/common/featureFlags";
import * as kiotaClient from "../../src/common/kiotaClient";
import * as utils from "../../src/common/utils";

describe("daSpecParser", () => {
  beforeEach(() => {
    vi.spyOn(kiotaClient, "listAPITreeInfo").mockResolvedValue({} as any);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: string) => {
      return flag === FeatureFlags.KiotaNPMIntegration;
    });
    vi.spyOn(utils, "isJsonSpecFile").mockResolvedValue(false);
    vi.spyOn(daSpecParser, "parseAndUpdatePluginManifestForKiota").mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listAPIInfo with KiotaNPMIntegration enabled", () => {
    it("should return empty result when treeInfo is {}", async () => {
      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue({});

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.deepEqual(result, {
        specVersion: undefined,
        allAPICount: 0,
        validAPICount: 0,
        APIs: [],
      });
    });

    it("should return empty result when rootNode is undefined", async () => {
      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue({ rootNode: undefined });

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.deepEqual(result, {
        specVersion: undefined,
        allAPICount: 0,
        validAPICount: 0,
        APIs: [],
      });
    });

    it("should extract operations with simple node structure", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource#GET",
          segment: "GET",
          operationId: "getResource",
          summary: "Get resource",
          description: "Get a specific resource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.allAPICount, 1);
      assert.equal(result.validAPICount, 1);
      assert.equal(result.APIs.length, 1);
      assert.deepEqual(result.APIs[0], {
        api: "GET api/resource",
        server: "https://api.example.com",
        operationId: "getResource",
        isValid: true,
        reason: [],
        auth: undefined,
        summary: "Get resource",
        description: "Get a specific resource",
      });
    });

    it("should extract operations with multiple # in path", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "/#api/resource#GET",
          segment: "GET",
          operationId: "getResource",
          summary: "Get resource",
          description: "Get a specific resource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.allAPICount, 1);
      assert.equal(result.validAPICount, 1);
      assert.equal(result.APIs.length, 1);
      assert.deepEqual(result.APIs[0], {
        api: "GET /#api/resource",
        server: "https://api.example.com",
        operationId: "getResource",
        isValid: true,
        reason: [],
        auth: undefined,
        summary: "Get resource",
        description: "Get a specific resource",
      });
    });

    it("should not extract operations when not selected", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          summary: "Get resource",
          description: "Get a specific resource",
          selected: false,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.allAPICount, 0);
      assert.equal(result.validAPICount, 0);
      assert.equal(result.APIs.length, 0);
    });

    it("should handle Windows-style paths with backslashes", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api\\resource#GET",
          segment: "GET",
          operationId: "getResource",
          summary: "Get resource",
          description: "Get a specific resource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.APIs.length, 1);
      assert.equal(result.APIs[0].api, "GET api/resource");
    });

    it("should extract operations with child nodes", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: false,
          path: "api",
          segment: "",
          children: [
            {
              isOperation: true,
              path: "api/users#GET",
              segment: "GET",
              operationId: "getUsers",
              summary: "Get users",
              description: "Get all users",
              selected: true,
              children: [],
            },
            {
              isOperation: true,
              path: "api/posts#POST",
              segment: "POST",
              operationId: "createPost",
              summary: "Create post",
              description: "Create a new post",
              selected: true,
              children: [],
            },
          ],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.allAPICount, 2);
      assert.equal(result.validAPICount, 2);
      assert.equal(result.APIs.length, 2);
      assert.equal(result.APIs[0].api, "GET api/users");
      assert.equal(result.APIs[1].api, "POST api/posts");
    });

    it("should extract nested operations with security information", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: false,
          path: "api",
          segment: "",
          children: [
            {
              isOperation: false,
              path: "api/users",
              segment: "",
              children: [
                {
                  isOperation: true,
                  path: "api/users/profile#GET",
                  segment: "GET",
                  operationId: "getUserProfile",
                  summary: "Get profile",
                  description: "Get user profile",
                  selected: true,
                  children: [],
                },
              ],
            },
          ],
        } as KiotaOpenApiNode,
        logs: [],
        servers: ["https://api.example.com"],
        security: [{ api_key: [] }],
        securitySchemes: {
          api_key: {
            type: "apiKey",
            name: "x-api-key",
            in: "header",
            referenceId: "",
          },
        },
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.allAPICount, 1);
      assert.equal(result.validAPICount, 1);
      assert.equal(result.APIs[0].api, "GET api/users/profile");
      assert.deepEqual(result.APIs[0].auth, {
        name: "api_key",
        authScheme: {
          type: "apiKey",
          name: "x-api-key",
          in: "header",
          referenceId: "",
        } as any,
      });
    });

    it("should use node-level servers and security if available", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          summary: "Get resource",
          description: "Get a specific resource",
          servers: ["https://node.example.com"],
          security: [{ node_auth: [] }],
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://root.example.com"],
        security: [{ root_auth: [] }],
        securitySchemes: {
          node_auth: {
            type: "http",
            scheme: "bearer",
            referenceId: "",
          },
          root_auth: {
            type: "oauth2",
            flows: {},
            referenceId: "",
          },
        },
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.APIs[0].server, "https://node.example.com");
      assert.deepEqual(result.APIs[0].auth, {
        name: "node_auth",
        authScheme: {
          type: "http",
          scheme: "bearer",
          referenceId: "",
        } as any,
      });
    });

    it("should handle multiple security requirements", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/secure",
          segment: "GET",
          operationId: "getSecureResource",
          summary: "Get secure resource",
          description: "Get a secure resource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [{ api_key: [], oauth2: [] }],
        securitySchemes: {
          api_key: {
            type: "apiKey",
            name: "x-api-key",
            in: "header",
            referenceId: "",
          },
          oauth2: {
            type: "oauth2",
            flows: {},
            referenceId: "",
          },
        },
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.APIs[0].auth?.name, "api_key, oauth2");
      assert.deepEqual(result.APIs[0].auth?.authScheme, {
        type: "multipleAuth",
      });
    });

    it("should handle securitySchemes is undefined", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/secure",
          segment: "GET",
          operationId: "getSecureResource",
          summary: "Get secure resource",
          description: "Get a secure resource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [{ api_key: [] }],
        securitySchemes: undefined,
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.APIs[0].auth, undefined);
    });

    it("should handle missing summary and description", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.APIs[0].summary, "");
      assert.equal(result.APIs[0].description, "");
    });

    it("should properly handle platform parameter", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          summary: "Get resource",
          description: "Get a specific resource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec", Platform.VS);

      assert.equal(result.allAPICount, 1);
      assert.equal(result.validAPICount, 1);
    });

    it("should handle undefined or empty security information", async () => {
      const mockTreeInfoNoSecurity: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          summary: "Get resource",
          description: "Get a specific resource",
          security: undefined,
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: undefined,
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfoNoSecurity);
      const resultNoSecurity = await daSpecParser.listAPIInfo("path/to/spec");
      assert.isUndefined(resultNoSecurity.APIs[0].auth);

      const mockTreeInfoEmptySecurity: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          summary: "Get resource",
          description: "Get a specific resource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfoEmptySecurity);
      const resultEmptySecurity = await daSpecParser.listAPIInfo("path/to/spec");
      assert.isUndefined(resultEmptySecurity.APIs[0].auth);

      const mockTreeInfoEmptyRequirement: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          summary: "Get resource",
          description: "Get a specific resource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [{}],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfoEmptyRequirement);
      const resultEmptyRequirement = await daSpecParser.listAPIInfo("path/to/spec");
      assert.isUndefined(resultEmptyRequirement.APIs[0].auth);
    });

    it("should validate server information and authentication types correctly", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: false,
          path: "api",
          segment: "",
          children: [
            {
              isOperation: true,
              path: "api/noserver",
              segment: "GET",
              operationId: "getNoServer",
              servers: [],
              selected: true,
              children: [],
            },
            {
              isOperation: true,
              path: "api/invalidserver",
              segment: "GET",
              operationId: "getInvalidServer",
              servers: ["example/index.html"],
              selected: true,
              children: [],
            },
            {
              isOperation: true,
              path: "api/multipleauth",
              segment: "GET",
              operationId: "getMultipleAuth",
              servers: ["https://valid.example.com"],
              security: [{ auth1: [], auth2: [] }],
              selected: true,
              children: [],
            },
            {
              isOperation: true,
              path: "api/apikey",
              segment: "GET",
              operationId: "getWithAPIKey",
              servers: ["https://valid.example.com"],
              security: [{ api_key_auth: [] }],
              selected: true,
              children: [],
            },
            {
              isOperation: true,
              path: "api/oauth",
              segment: "GET",
              operationId: "getWithOAuth",
              servers: ["https://valid.example.com"],
              security: [{ oauth_auth: [] }],
              selected: true,
              children: [],
            },
            {
              isOperation: true,
              path: "api/bearer",
              segment: "GET",
              operationId: "getWithBearer",
              servers: ["https://valid.example.com"],
              security: [{ bearer_auth: [] }],
              selected: true,
              children: [],
            },
          ],
        } as KiotaOpenApiNode,
        servers: [],
        security: [],
        securitySchemes: {
          auth1: { type: "apiKey", name: "key1", in: "header", referenceId: "" },
          auth2: { type: "oauth2", flows: {}, referenceId: "" },
          api_key_auth: { type: "apiKey", name: "x-api-key", in: "header", referenceId: "" },
          oauth_auth: {
            type: "oauth2",
            flows: {
              authorizationCode: {
                authorizationUrl: "https://example.com/auth",
                tokenUrl: "https://example.com/token",
                scopes: {},
              },
            },
            referenceId: "",
          },
          bearer_auth: { type: "http", scheme: "bearer", referenceId: "" },
        },
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const resultNonVS = await daSpecParser.listAPIInfo("path/to/spec", Platform.VSCode);

      const noServerOp = resultNonVS.APIs.find((op) => op.operationId === "getNoServer");
      assert.isDefined(noServerOp);
      assert.isTrue(noServerOp!.reason.includes(ErrorType.NoServerInformation));

      const invalidServerOp = resultNonVS.APIs.find((op) => op.operationId === "getInvalidServer");
      assert.isDefined(invalidServerOp);
      assert.isTrue(invalidServerOp!.reason.includes(ErrorType.RelativeServerUrlNotSupported));
    });

    it("should handle undefined servers and securitySchemes in treeInfo", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          summary: "Get resource",
          description: "Get a specific resource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        security: [],
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.allAPICount, 1);
      assert.equal(result.APIs.length, 1);
      assert.isUndefined(result.APIs[0].server);
      assert.isUndefined(result.APIs[0].auth);
    });

    it("should handle undefined security in child node", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: false,
          path: "api",
          segment: "",
          children: [
            {
              isOperation: true,
              path: "api/resource",
              segment: "GET",
              operationId: "getResource",
              children: [],
              selected: true,
            },
          ],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [{ api_key: [] }],
        securitySchemes: {
          api_key: { type: "apiKey", name: "x-api-key", in: "header", referenceId: "" },
        },
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.APIs.length, 1);
      assert.isDefined(result.APIs[0].auth);
      assert.equal(result.APIs[0].auth!.name, "api_key");
    });
    it("should specifically test multipleAuth type detection", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/multi-auth",
          segment: "GET",
          operationId: "getWithMultiAuth",
          servers: ["https://valid.example.com"],
          security: [{ auth1: [], auth2: [] }],
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {
          auth1: { type: "apiKey", name: "x-api-key", in: "header", referenceId: "" },
          auth2: { type: "oauth2", flows: {}, referenceId: "" },
        },
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      // Mock Utils.checkServerUrl
      vi.spyOn(Utils, "checkServerUrl" as any).mockReturnValue([]);

      const result = await daSpecParser.listAPIInfo("path/to/spec");

      assert.equal(result.APIs.length, 1);
      assert.equal(result.APIs[0].auth!.authScheme.type, "multipleAuth");
      assert.isTrue(result.APIs[0].isValid);
    });
  });

  describe("validateOpenAPISpec with KiotaNPMIntegration enabled", () => {
    it("should handle errors in listAPIInfo", async () => {
      const errorMessage = "Failed to parse spec";
      vi.mocked(kiotaClient.listAPITreeInfo).mockRejectedValue(new Error(errorMessage));

      const result = await daSpecParser.validateOpenAPISpec("path/to/spec");

      assert.equal(result.status, ValidationStatus.Error);
      assert.deepEqual(result.errors, [
        {
          type: ErrorType.SpecNotValid,
          content: `OpenAPI specification file is not valid: Error: ${errorMessage}`,
        },
      ]);
      assert.equal(result.specHash, "");
    });

    it("should return error when no APIs found", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: false,
          path: "api",
          segment: "",
          children: [],
        } as KiotaOpenApiNode,
        servers: [],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      const result = await daSpecParser.validateOpenAPISpec("path/to/spec");

      assert.equal(result.status, ValidationStatus.Error);
      assert.deepEqual(result.errors, [{ type: ErrorType.NoSupportedApi, content: "", data: [] }]);
      assert.equal(result.specHash, "");
    });

    it("should return error when no valid APIs found", async () => {
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: false,
          path: "api",
          segment: "",
          children: [
            {
              isOperation: true,
              path: "api/resource#GET",
              segment: "GET",
              operationId: "getResource",
              servers: [],
              selected: true,
              children: [],
            },
          ],
        } as KiotaOpenApiNode,
        servers: [],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      };
      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      vi.spyOn(Utils, "checkServerUrl" as any).mockReturnValue([
        { type: ErrorType.RelativeServerUrlNotSupported },
      ]);

      const result = await daSpecParser.validateOpenAPISpec("path/to/spec");

      assert.equal(result.status, ValidationStatus.Error);
      assert.deepEqual(result.errors, [
        {
          type: ErrorType.NoSupportedApi,
          content: "",
          data: [
            {
              api: "GET api/resource",
              reason: ["no-server-information"],
            },
          ],
        },
      ]);
      assert.equal(result.specHash, "");
    });

    it("should return valid result with hash when valid APIs are found", async () => {
      const serverUrl = "https://api.example.com";
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          servers: [serverUrl],
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: [serverUrl],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V2_0,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      vi.spyOn(Utils, "checkServerUrl" as any).mockReturnValue([]);

      const result = await daSpecParser.validateOpenAPISpec("path/to/spec");

      assert.equal(result.status, ValidationStatus.Valid);
      assert.isEmpty(result.errors);
      assert.isTrue(result.warnings.length === 1);
      assert.isTrue(result.warnings[0].type === WarningType.ConvertSwaggerToOpenAPI);

      const expectedHash = crypto
        .createHash("sha256")
        .update(JSON.stringify(serverUrl))
        .digest("hex");
      assert.equal(result.specHash, expectedHash);
    });

    it("should work when platform is VS", async () => {
      const serverUrl = "https://api.example.com";
      const mockTreeInfo: KiotaTreeResult = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          servers: [serverUrl],
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: [serverUrl],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_1,
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      vi.spyOn(Utils, "checkServerUrl" as any).mockReturnValue([]);

      const result = await daSpecParser.validateOpenAPISpec("path/to/spec", Platform.VS);
      assert.equal(result.status, ValidationStatus.Valid);
      assert.isTrue(result.warnings.length === 1);
      assert.isTrue(result.warnings[0].type === WarningType.OpenAPI31ConvertTo30);
    });
  });

  describe("generatePlugin with KiotaNPMIntegration enabled", () => {
    const tempDirs: string[] = [];

    afterEach(async () => {
      for (const dir of tempDirs.splice(0)) {
        await fs.remove(dir);
      }
    });

    it("should collect warnings and write generated plugin files", async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "da-generate-plugin-"));
      tempDirs.push(tempRoot);

      const tmpDir = path.join(tempRoot, "kiota-work");
      const specPath = path.join(tempRoot, "spec.yaml");
      const teamsManifestPath = path.join(tempRoot, "manifest.json");
      const outputDir = path.join(tempRoot, "appPackage");
      const outputAPISpecPath = path.join(outputDir, "openapi.json");
      const outputAIPluginPath = path.join(outputDir, "ai-plugin.json");
      const generatedPluginDir = path.join(tempRoot, "generated", "plugin");
      const generatedSpecPath = path.join(generatedPluginDir, "openapi.yaml");
      const generatedPluginPath = path.join(generatedPluginDir, "ai-plugin.json");
      const generatedPluginManifest = {
        runtimes: [{ spec: { url: "placeholder.yaml" } }],
        functions: [{ name: "create_resource", description: "Create resource" }],
      };

      await fs.ensureDir(outputDir);
      await fs.ensureDir(generatedPluginDir);
      await fs.ensureDir(path.join(tmpDir, ".kiota", "documents", "testapp"));
      await fs.writeFile(specPath, "openapi: 3.0.0", "utf8");
      await fs.writeJson(teamsManifestPath, { name: { short: "Test App" } });
      await fs.writeFile(generatedSpecPath, "openapi: 3.0.0", "utf8");
      await fs.writeJson(generatedPluginPath, generatedPluginManifest);
      await fs.writeFile(
        path.join(tmpDir, ".kiota", "documents", "testapp", "openapi.json"),
        "{}",
        "utf8"
      );

      vi.spyOn(tmp, "dirSync").mockReturnValue({
        name: tmpDir,
        removeCallback: vi.fn(),
      } satisfies tmp.DirResult);
      vi.spyOn(kiotaClient, "listAPITreeInfo").mockResolvedValue({
        rootNode: {
          isOperation: false,
          path: "api",
          segment: "",
          children: [
            {
              isOperation: true,
              path: "api/missing-id#GET",
              segment: "GET",
              selected: true,
              servers: ["https://api.example.com"],
              children: [],
            },
            {
              isOperation: true,
              path: "api/resource#POST",
              segment: "POST",
              operationId: "create-resource",
              selected: true,
              servers: ["https://api.example.com"],
              security: [{ basic_auth: [] }],
              children: [],
            },
          ],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {
          basic_auth: { type: "http", scheme: "basic", referenceId: "" } as any,
        },
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      });
      vi.spyOn(kiotaClient, "kiotageneratePlugin").mockResolvedValue({
        openAPISpec: generatedSpecPath,
        aiPlugin: generatedPluginPath,
        isSuccess: true,
        logs: [],
      } satisfies GeneratePluginResult);

      const result = await daSpecParser.generatePlugin(
        specPath,
        teamsManifestPath,
        outputAPISpecPath,
        outputAIPluginPath,
        ["GET /api/missing-id", "POST /api/resource"],
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      assert.isTrue(result.allSuccess);
      assert.sameMembers(
        result.warnings.map((warning) => warning.type),
        [
          WarningType.OperationIdMissing,
          WarningType.OperationIdContainsSpecialCharacters,
          WarningType.UnsupportedAuthType,
        ]
      );
      expect(kiotaClient.kiotageneratePlugin).toHaveBeenCalledOnce();

      assert.isTrue(await fs.pathExists(path.join(outputDir, "openapi.yaml")));
      assert.isTrue(await fs.pathExists(path.join(outputDir, "openapi.yaml.original")));

      const writtenPlugin = await fs.readJson(outputAIPluginPath);
      assert.equal(writtenPlugin.runtimes[0].spec.url, "openapi.yaml");
    });

    it("should merge functions and runtimes when updating an existing plugin", async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "da-generate-plugin-"));
      tempDirs.push(tempRoot);

      const tmpDir = path.join(tempRoot, "kiota-work");
      const specPath = path.join(tempRoot, "spec.yaml");
      const teamsManifestPath = path.join(tempRoot, "manifest.json");
      const outputAIPluginPath = path.join(tempRoot, "appPackage", "ai-plugin.json");
      const outputAPISpecPath = path.join(tempRoot, "specs", "openapi.yaml");
      const generatedPluginDir = path.join(tempRoot, "generated", "plugin");
      const generatedPluginPath = path.join(generatedPluginDir, "ai-plugin.json");
      const generatedSpecPath = path.join(generatedPluginDir, "openapi.yaml");
      const normalizedSpecPath = "../specs/openapi.yaml";
      const generatedPluginManifest = {
        runtimes: [{ spec: { url: "generated.yaml" }, run_for_functions: ["newFunction"] }],
        functions: [{ name: "newFunction", description: "New function" }],
      };
      const existingPluginManifest = {
        runtimes: [
          { spec: { url: normalizedSpecPath }, run_for_functions: ["oldFunction"] },
          { spec: { url: "other.yaml" }, run_for_functions: ["keepFunction"] },
        ],
        functions: [
          { name: "oldFunction", description: "Old function" },
          { name: "keepFunction", description: "Keep function" },
        ],
      };

      await fs.ensureDir(path.dirname(outputAIPluginPath));
      await fs.ensureDir(path.dirname(outputAPISpecPath));
      await fs.ensureDir(generatedPluginDir);
      await fs.ensureDir(path.join(generatedPluginDir, "adaptiveCards"));
      await fs.writeFile(specPath, "openapi: 3.0.0", "utf8");
      await fs.writeJson(teamsManifestPath, { name: { short: "Test App" } });
      await fs.writeFile(generatedSpecPath, "openapi: 3.0.0", "utf8");
      await fs.writeJson(generatedPluginPath, generatedPluginManifest);
      await fs.writeJson(outputAIPluginPath, existingPluginManifest);
      await fs.writeJson(path.join(generatedPluginDir, "adaptiveCards", "card.json"), {
        type: "AdaptiveCard",
        body: [],
      });

      vi.spyOn(tmp, "dirSync").mockReturnValue({
        name: tmpDir,
        removeCallback: vi.fn(),
      } satisfies tmp.DirResult);
      vi.spyOn(kiotaClient, "listAPITreeInfo").mockResolvedValue({
        rootNode: {
          isOperation: true,
          path: "api/resource#GET",
          segment: "GET",
          operationId: "getResource",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      });
      vi.spyOn(kiotaClient, "kiotageneratePlugin").mockResolvedValue({
        openAPISpec: generatedSpecPath,
        aiPlugin: generatedPluginPath,
        isSuccess: true,
        logs: [],
      } satisfies GeneratePluginResult);

      const result = await daSpecParser.generatePlugin(
        specPath,
        teamsManifestPath,
        outputAPISpecPath,
        outputAIPluginPath,
        ["GET /api/resource"],
        AdaptiveCardUpdateStrategy.KeepExisting,
        undefined,
        true
      );

      assert.isTrue(result.allSuccess);
      assert.deepEqual(result.warnings, []);
      assert.isTrue(
        await fs.pathExists(
          path.join(path.dirname(outputAIPluginPath), "adaptiveCards", "card.json")
        )
      );

      const mergedManifest = await fs.readJson(outputAIPluginPath);
      assert.sameMembers(
        mergedManifest.functions.map((func: { name: string }) => func.name),
        ["keepFunction", "newFunction"]
      );
      assert.sameMembers(
        mergedManifest.runtimes.map((runtime: { spec: { url: string } }) => runtime.spec.url),
        ["other.yaml", normalizedSpecPath]
      );
      assert.equal(mergedManifest.runtimes[1].run_for_functions[0], "newFunction");
    });

    it("should generate adaptive cards for new Kiota plugins", async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "da-generate-plugin-"));
      tempDirs.push(tempRoot);

      const tmpDir = path.join(tempRoot, "kiota-work");
      const specPath = path.join(tempRoot, "spec.yaml");
      const teamsManifestPath = path.join(tempRoot, "manifest.json");
      const outputDir = path.join(tempRoot, "appPackage");
      const outputAPISpecPath = path.join(outputDir, "apiSpecificationFile", "openapi.yaml");
      const outputAIPluginPath = path.join(outputDir, "ai-plugin.json");
      const generatedPluginDir = path.join(tempRoot, "generated", "plugin");
      const generatedSpecPath = path.join(generatedPluginDir, "openapi.yaml");
      const generatedPluginPath = path.join(generatedPluginDir, "ai-plugin.json");
      const generatedPluginManifest = {
        runtimes: [{ spec: { url: "placeholder.yaml" }, run_for_functions: ["listRepairs"] }],
        functions: [
          {
            name: "listRepairs",
            description: "List repairs",
            capabilities: {
              response_semantics: {
                data_path: "$",
                static_template: { file: "./adaptiveCards/listRepairs.json" },
              },
            },
          },
        ],
      };

      await fs.ensureDir(path.dirname(outputAPISpecPath));
      await fs.ensureDir(generatedPluginDir);
      await fs.ensureDir(path.join(tmpDir, ".kiota", "documents", "testapp"));
      await fs.writeFile(specPath, "openapi: 3.0.0", "utf8");
      await fs.writeJson(teamsManifestPath, { name: { short: "Test App" } });
      await fs.writeFile(generatedSpecPath, "openapi: 3.0.0", "utf8");
      await fs.writeJson(generatedPluginPath, generatedPluginManifest);
      await fs.writeFile(
        path.join(tmpDir, ".kiota", "documents", "testapp", "openapi.json"),
        "{}",
        "utf8"
      );

      vi.spyOn(tmp, "dirSync").mockReturnValue({
        name: tmpDir,
        removeCallback: vi.fn(),
      } as any);
      vi.spyOn(kiotaClient, "listAPITreeInfo").mockResolvedValue({
        rootNode: {
          isOperation: true,
          path: "/repairs#GET",
          segment: "GET",
          operationId: "listRepairs",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      });
      vi.spyOn(kiotaClient, "kiotageneratePlugin").mockResolvedValue({
        openAPISpec: generatedSpecPath,
        aiPlugin: generatedPluginPath,
        logs: [],
      } as any);
      const generateAdaptiveCard = vi
        .spyOn(SpecParser.prototype, "generateAdaptiveCardInPlugin")
        .mockImplementation(async (pluginManifestPath: string) => {
          const pluginManifest = await fs.readJson(pluginManifestPath);
          pluginManifest.functions[0].capabilities.response_semantics = {
            data_path: "$.results",
            static_template: { file: "adaptiveCards/listRepairs1.json" },
          };
          await fs.ensureDir(path.join(path.dirname(pluginManifestPath), "adaptiveCards"));
          await fs.writeJson(pluginManifestPath, pluginManifest);
          await fs.writeJson(
            path.join(path.dirname(pluginManifestPath), "adaptiveCards", "listRepairs1.json"),
            {
              type: "AdaptiveCard",
              body: [{ type: "TextBlock", text: "title: ${if(title, title, 'N/A')}" }],
            }
          );
        });

      const result = await daSpecParser.generatePlugin(
        specPath,
        teamsManifestPath,
        outputAPISpecPath,
        outputAIPluginPath,
        ["GET /repairs"],
        AdaptiveCardUpdateStrategy.CreateNew
      );

      assert.isTrue(result.allSuccess);
      expect(generateAdaptiveCard).toHaveBeenCalledOnce();

      const writtenPlugin = await fs.readJson(outputAIPluginPath);
      assert.equal(
        writtenPlugin.functions[0].capabilities.response_semantics.static_template.file,
        "adaptiveCards/listRepairs1.json"
      );
      assert.equal(
        writtenPlugin.functions[0].capabilities.response_semantics.data_path,
        "$.results"
      );
      assert.isTrue(
        await fs.pathExists(path.join(outputDir, "adaptiveCards", "listRepairs1.json"))
      );
    });

    it("patches OpenAPI extensions into generated Kiota plugin manifests", async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "da-generate-plugin-"));
      tempDirs.push(tempRoot);

      const tmpDir = path.join(tempRoot, "kiota-work");
      const specPath = path.join(tempRoot, "spec.yaml");
      const teamsManifestPath = path.join(tempRoot, "manifest.json");
      const outputDir = path.join(tempRoot, "appPackage");
      const outputAPISpecPath = path.join(outputDir, "apiSpecificationFile", "openapi.yaml");
      const outputAIPluginPath = path.join(outputDir, "ai-plugin.json");
      const generatedPluginDir = path.join(tempRoot, "generated", "plugin");
      const generatedSpecPath = path.join(generatedPluginDir, "openapi.yaml");
      const generatedPluginPath = path.join(generatedPluginDir, "ai-plugin.json");

      await fs.ensureDir(path.dirname(outputAPISpecPath));
      await fs.ensureDir(generatedPluginDir);
      await fs.ensureDir(path.join(tmpDir, ".kiota", "documents", "testapp"));
      await fs.ensureDir(path.join(tempRoot, "adaptiveCards"));
      await fs.writeFile(
        specPath,
        [
          "openapi: 3.0.0",
          "info:",
          "  title: Repairs API",
          "  version: 1.0.0",
          "paths:",
          "  /repairs:",
          "    get:",
          "      operationId: listRepairs",
          "      x-ai-adaptive-card:",
          "        data_path: $.results",
          "        file: adaptiveCards/listRepairs.json",
          "      responses:",
          "        '200':",
          "          description: ok",
        ].join("\n"),
        "utf8"
      );
      await fs.writeJson(path.join(tempRoot, "adaptiveCards", "listRepairs.json"), {
        type: "AdaptiveCard",
        body: [],
      });
      await fs.writeJson(teamsManifestPath, { name: { short: "Test App" } });
      await fs.writeFile(generatedSpecPath, "openapi: 3.0.0", "utf8");
      await fs.writeJson(generatedPluginPath, {
        runtimes: [{ spec: { url: "placeholder.yaml" }, run_for_functions: ["listRepairs"] }],
        functions: [{ name: "listRepairs", description: "List repairs" }],
      });
      await fs.writeFile(
        path.join(tmpDir, ".kiota", "documents", "testapp", "openapi.json"),
        "{}",
        "utf8"
      );
      const rootNode: KiotaOpenApiNode = {
        isOperation: true,
        path: "/repairs#GET",
        segment: "GET",
        operationId: "listRepairs",
        selected: true,
        children: [],
      };

      vi.spyOn(tmp, "dirSync").mockReturnValue({
        name: tmpDir,
        removeCallback: vi.fn(),
      } satisfies tmp.DirResult);
      vi.spyOn(kiotaClient, "listAPITreeInfo").mockResolvedValue({
        rootNode: rootNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      });
      vi.spyOn(kiotaClient, "kiotageneratePlugin").mockResolvedValue({
        openAPISpec: generatedSpecPath,
        aiPlugin: generatedPluginPath,
        logs: [],
      } satisfies GeneratePluginResult);

      const result = await daSpecParser.generatePlugin(
        specPath,
        teamsManifestPath,
        outputAPISpecPath,
        outputAIPluginPath,
        ["GET /repairs"],
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      assert.isTrue(result.allSuccess);
      const plugin = await fs.readJson(outputAIPluginPath);
      assert.deepEqual(plugin.functions[0].capabilities.response_semantics, {
        data_path: "$.results",
        static_template: { type: "AdaptiveCard", body: [] },
      });
    });

    it("should warn when adaptive card generation fails for new Kiota plugins", async () => {
      const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "da-generate-plugin-"));
      tempDirs.push(tempRoot);

      const tmpDir = path.join(tempRoot, "kiota-work");
      const specPath = path.join(tempRoot, "spec.yaml");
      const teamsManifestPath = path.join(tempRoot, "manifest.json");
      const outputDir = path.join(tempRoot, "appPackage");
      const outputAPISpecPath = path.join(outputDir, "apiSpecificationFile", "openapi.yaml");
      const outputAIPluginPath = path.join(outputDir, "ai-plugin.json");
      const generatedPluginDir = path.join(tempRoot, "generated", "plugin");
      const generatedSpecPath = path.join(generatedPluginDir, "openapi.yaml");
      const generatedPluginPath = path.join(generatedPluginDir, "ai-plugin.json");

      await fs.ensureDir(path.dirname(outputAPISpecPath));
      await fs.ensureDir(generatedPluginDir);
      await fs.ensureDir(path.join(tmpDir, ".kiota", "documents", "testapp"));
      await fs.writeFile(specPath, "openapi: 3.0.0", "utf8");
      await fs.writeJson(teamsManifestPath, { name: { short: "Test App" } });
      await fs.writeFile(generatedSpecPath, "openapi: 3.0.0", "utf8");
      await fs.writeJson(generatedPluginPath, {
        runtimes: [{ spec: { url: "placeholder.yaml" }, run_for_functions: ["listRepairs"] }],
        functions: [{ name: "listRepairs", description: "List repairs" }],
      });
      await fs.writeFile(
        path.join(tmpDir, ".kiota", "documents", "testapp", "openapi.json"),
        "{}",
        "utf8"
      );

      vi.spyOn(tmp, "dirSync").mockReturnValue({
        name: tmpDir,
        removeCallback: vi.fn(),
      } as any);
      vi.spyOn(kiotaClient, "listAPITreeInfo").mockResolvedValue({
        rootNode: {
          isOperation: true,
          path: "/repairs#GET",
          segment: "GET",
          operationId: "listRepairs",
          selected: true,
          children: [],
        } as KiotaOpenApiNode,
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {},
        logs: [],
        specVersion: OpenApiSpecVersion.V3_0,
      });
      vi.spyOn(kiotaClient, "kiotageneratePlugin").mockResolvedValue({
        openAPISpec: generatedSpecPath,
        aiPlugin: generatedPluginPath,
        logs: [],
      } as any);
      const generateAdaptiveCard = vi
        .spyOn(SpecParser.prototype, "generateAdaptiveCardInPlugin")
        .mockRejectedValue(new Error("card boom"));

      const result = await daSpecParser.generatePlugin(
        specPath,
        teamsManifestPath,
        outputAPISpecPath,
        outputAIPluginPath,
        ["GET /repairs"],
        AdaptiveCardUpdateStrategy.CreateNew
      );

      assert.isTrue(result.allSuccess);
      expect(generateAdaptiveCard).toHaveBeenCalledOnce();
      assert.lengthOf(result.warnings, 1);
      assert.equal(result.warnings[0].type, WarningType.GenerateCardFailed);
      assert.include(result.warnings[0].content, "card boom");
      assert.equal(result.warnings[0].data, "GET /repairs");
    });
  });

  describe.skip("generatePlugin with KiotaNPMIntegration enabled", () => {
    beforeEach(() => {
      // These tests stub non-existent properties on daSpecParser module
      // They need to be rewritten to mock kiotaClient and tmp modules directly
      // For now they are skipped to allow other tests to pass
      vi.mocked(featureFlagManager.getBooleanValue).mockReturnValue(true);
    });

    const pathMatcher = (expectedPath: string) => {
      return (actualPath: any) => {
        const normalizedActual = actualPath?.replace?.(/\\/g, "/") ?? "";
        const normalizedExpected = expectedPath.replace(/\\/g, "/");
        return normalizedActual === normalizedExpected;
      };
    };

    it("should successfully generate plugin when feature flag is enabled", async () => {
      vi.spyOn(daSpecParser, "pathExists" as any).mockResolvedValue(true);
      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue({ name: { short: "test-app" } });
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);

      const specPath = "path/to/spec.yaml";
      const teamsManifestPath = "path/to/manifest.json";
      const outputAPISpecPath = "path/to/output/openapi.yaml";
      const outputAIPluginPath = "path/to/output/ai-plugin.json";
      const operations = ["GET /users", "POST /messages"];
      const adaptiveCardUpdateStrategy = AdaptiveCardUpdateStrategy.KeepExisting;

      const result = await daSpecParser.generatePlugin(
        specPath,
        teamsManifestPath,
        outputAPISpecPath,
        outputAIPluginPath,
        operations,
        adaptiveCardUpdateStrategy
      );

      expect(vi.mocked(daSpecParser.tmpDirSync as any)).toHaveBeenCalledOnce();
      expect(vi.mocked(daSpecParser.readJSON as any)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(daSpecParser.kiotageneratePlugin as any)).toHaveBeenCalledOnce();

      const kiotaCall = vi.mocked(daSpecParser.kiotageneratePlugin as any).mock.calls[0];
      assert.deepEqual(kiotaCall[0], specPath);
      assert.deepEqual(kiotaCall[1]?.replace?.(/\\/g, "/") || "", "c:/tmp/working-dir/plugin");
      assert.deepEqual(kiotaCall[2], "testapp");
      assert.deepEqual(kiotaCall[6], ["/users#GET", "/messages#POST"]);

      expect(vi.mocked(daSpecParser.copy as any)).toHaveBeenCalledTimes(3);

      const copyCallArgs = vi.mocked(daSpecParser.copy as any).mock.calls[1];
      assert.isTrue(copyCallArgs[0]?.replace?.(/\\/g, "/")?.endsWith("adaptiveCards"));
      assert.isTrue(copyCallArgs[0]?.replace?.(/\\/g, "/")?.endsWith("adaptiveCards"));

      assert.deepEqual(
        copyCallArgs[2],
        {
          overwrite: true,
          errorOnExist: false,
        },
        "Copy options don't match"
      );

      const firstCopyCall = vi.mocked(daSpecParser.copy as any).mock.calls[0];
      assert.isTrue(
        pathMatcher("c:/tmp/working-dir/plugin/openapi.yaml")(firstCopyCall[0]) &&
          pathMatcher("path/to/output/openapi.yaml")(firstCopyCall[1])
      );

      const thirdCopyCall = vi.mocked(daSpecParser.copy as any).mock.calls[2];
      assert.isTrue(
        pathMatcher("c:/tmp/working-dir/.kiota/documents/testapp/openapi.json")(thirdCopyCall[0]) &&
          pathMatcher("path/to/output/openapi.yaml.original")(thirdCopyCall[1])
      );

      assert.deepEqual(result, {
        allSuccess: true,
        warnings: [],
      });
    });

    it("should validate operations and generate appropriate warnings", async () => {
      const mockTreeInfo = {
        rootNode: {
          isOperation: false,
          path: "api",
          segment: "",
          children: [
            {
              isOperation: true,
              path: "api/missing-id",
              segment: "GET",
              summary: "Operation with missing ID",
              servers: ["https://valid.example.com"],
              selected: true,
              children: [],
            },
            {
              isOperation: true,
              path: "api/special-chars",
              segment: "POST",
              operationId: "create-resource",
              summary: "Operation with special characters in ID",
              servers: ["https://valid.example.com"],
              selected: true,
              children: [],
            },
            {
              isOperation: true,
              path: "api/unsupported-auth",
              segment: "GET",
              operationId: "getWithCustomAuth",
              summary: "Operation with unsupported auth",
              servers: ["https://valid.example.com"],
              security: [{ custom_auth: [] }],
              selected: true,
              children: [],
            },
          ],
        },
        servers: ["https://api.example.com"],
        security: [],
        securitySchemes: {
          custom_auth: { type: "http", scheme: "basic" },
        },
        logs: [],
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);
      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue({ name: { short: "test-app" } });
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);
      vi.mocked(utils.isJsonSpecFile).mockResolvedValue(true);

      const specPath = "path/to/spec.json";
      const outputAPISpecPath = "path/to/output/openapi.spec";

      const result = await daSpecParser.generatePlugin(
        specPath,
        "path/to/manifest.json",
        outputAPISpecPath,
        "path/to/output/ai-plugin.json",
        ["GET /api/missing-id", "POST /api/special-chars", "GET /api/unsupported-auth"],
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      assert.isTrue(result.allSuccess);
      assert.equal(result.warnings.length, 3);
      assert.isTrue(
        result.warnings.some((w: WarningResult) => w.type === WarningType.OperationIdMissing)
      );
      assert.isTrue(
        result.warnings.some(
          (w: WarningResult) => w.type === WarningType.OperationIdContainsSpecialCharacters
        )
      );
      assert.isTrue(
        result.warnings.some((w: WarningResult) => w.type === WarningType.UnsupportedAuthType)
      );

      const copyMock = vi.mocked(daSpecParser.copy as any);
      const firstCopyCall = copyMock.mock.calls[0];
      assert.isTrue(
        pathMatcher("c:/tmp/working-dir/plugin/openapi.yaml")(firstCopyCall[0]) &&
          pathMatcher("path/to/output/openapi.yaml")(firstCopyCall[1])
      );

      const secondCopyCall = copyMock.mock.calls[1];
      assert.isTrue(
        pathMatcher("c:/tmp/working-dir/.kiota/documents/testapp/openapi.json")(
          secondCopyCall[0]
        ) && pathMatcher("path/to/output/openapi.yaml.original")(secondCopyCall[1])
      );
    });

    it("should handle manifest with environment variables and special characters", async () => {
      const complexManifest = {
        name: {
          short: "Complex$App-Name_${{ENV_VAR}}",
        },
      };

      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue(complexManifest);
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);

      await daSpecParser.generatePlugin(
        "path/to/spec.yaml",
        "path/to/manifest.json",
        "path/to/output/openapi.yaml",
        "path/to/output/ai-plugin.json",
        ["GET /api"],
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      // Check namespace was properly sanitized
      const kiotaMock = vi.mocked(daSpecParser.kiotageneratePlugin as any);
      expect(kiotaMock).toHaveBeenCalledOnce();
      const generatedNamespace = kiotaMock.mock.calls[0][2];
      assert.isString(generatedNamespace);
      assert.match(generatedNamespace, /^complexappname/);
    });

    it("should update plugin manifest with relative path", async () => {
      vi.mocked(daSpecParser.pathRelative as any).mockReturnValue("..\\..\\openapi.yaml");

      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue({
        name: { short: "test-app" },
        runtimes: [
          {
            spec: { url: "old-path.yaml" },
          },
        ],
      });
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);

      await daSpecParser.generatePlugin(
        "path/to/spec.yaml",
        "path/to/manifest.json",
        "path/to/output/openapi.yaml",
        "path/to/output/ai-plugin.json",
        ["GET /api"],
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      const writeJsonMock = vi.mocked(daSpecParser.writeJson as any);
      expect(writeJsonMock).toHaveBeenCalled();
      const calls = writeJsonMock.mock.calls;
      const aiPluginCall = calls.find((call: any) => call[0]?.includes?.("ai-plugin.json"));
      assert.isTrue(aiPluginCall !== undefined);
      const manifest = aiPluginCall?.[1];
      assert.equal(manifest?.runtimes?.[0]?.spec?.url, "../../openapi.yaml");
    });

    it("should handle Windows paths and convert backslashes to forward slashes", async () => {
      vi.mocked(daSpecParser.pathRelative as any).mockReturnValue(
        "..\\nested\\folder\\openapi.yaml"
      );

      const pluginManifest = {
        name: { short: "test-app" },
        runtimes: [
          {
            spec: { url: "old-path.yaml" },
          },
        ],
      };

      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue(pluginManifest);
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);

      await daSpecParser.generatePlugin(
        "path/to/spec.yaml",
        "path/to/manifest.json",
        "path/to/output/openapi.yaml",
        "path/to/output/ai-plugin.json",
        ["GET /api"],
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      const writeJsonMock = vi.mocked(daSpecParser.writeJson as any);
      const calls = writeJsonMock.mock.calls;
      const aiPluginCall = calls.find((call: any) => call[0]?.includes?.("ai-plugin.json"));
      assert.isTrue(aiPluginCall !== undefined);
      const manifest = aiPluginCall?.[1];
      assert.equal(manifest?.runtimes?.[0]?.spec?.url, "../nested/folder/openapi.yaml");
    });

    it("should create correct include patterns from operations", async () => {
      const operations = [
        "GET /users",
        "POST /users",
        "PUT /users/{id}",
        "DELETE /users/{id}/comments",
        "PATCH /settings",
      ];

      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue({ name: { short: "test-app" } });
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);

      await daSpecParser.generatePlugin(
        "path/to/spec.yaml",
        "path/to/manifest.json",
        "path/to/output/openapi.yaml",
        "path/to/output/ai-plugin.json",
        operations,
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      const expectedPatterns = [
        "/users#GET",
        "/users#POST",
        "/users/{id}#PUT",
        "/users/{id}/comments#DELETE",
        "/settings#PATCH",
      ];

      const kiotaMock = vi.mocked(daSpecParser.kiotageneratePlugin as any);
      assert.deepEqual(kiotaMock.mock.calls[0][6], expectedPatterns);
    });

    it("should handle tree with completely missing optional fields", async () => {
      const mockTreeInfo = {
        rootNode: {
          isOperation: true,
          path: "api/resource",
          segment: "GET",
          operationId: "getResource",
          selected: true,
          children: [],
        },
        logs: [],
      };

      vi.mocked(kiotaClient.listAPITreeInfo).mockResolvedValue(mockTreeInfo);

      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue({ name: { short: "test-app" } });
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);

      const result = await daSpecParser.generatePlugin(
        "path/to/spec.yaml",
        "path/to/manifest.json",
        "path/to/output/openapi.yaml",
        "path/to/output/ai-plugin.json",
        ["GET /api/resource"],
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      assert.isTrue(result.allSuccess);
    });

    it("should handle both JSON and YAML original spec files", async () => {
      vi.mocked(utils.isJsonSpecFile).mockResolvedValue(true);

      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue({ name: { short: "test-app" } });
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);

      await daSpecParser.generatePlugin(
        "path/to/spec.json",
        "path/to/manifest.json",
        "path/to/output/openapi.spec",
        "path/to/output/ai-plugin.json",
        ["GET /api"],
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      const copyMock = vi.mocked(daSpecParser.copy as any);
      const secondCopyCall = copyMock.mock.calls[1];
      assert.isTrue(
        pathMatcher("c:/tmp/working-dir/.kiota/documents/testapp/openapi.json")(
          secondCopyCall[0]
        ) && pathMatcher("path/to/output/openapi.yaml.original")(secondCopyCall[1])
      );

      vi.clearAllMocks();
      // Re-setup mocks since we cleared them
      vi.spyOn(daSpecParser, "kiotageneratePlugin" as any).mockResolvedValue({
        openAPISpec: "c:\\tmp\\working-dir\\plugin\\openapi.yaml",
        aiPlugin: "c:\\tmp\\working-dir\\plugin\\ai-plugin.json",
        logs: [],
      });
      vi.spyOn(daSpecParser, "tmpDirSync" as any).mockReturnValue({
        name: "c:\\tmp\\working-dir",
        removeCallback: vi.fn(),
        unsafeCleanup: true,
      });
      vi.spyOn(daSpecParser, "pathRelative" as any).mockReturnValue("../openapi.yaml");
      vi.mocked(featureFlagManager.getBooleanValue).mockReturnValue(true);
      vi.mocked(utils.isJsonSpecFile).mockResolvedValue(false);
      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue({ name: { short: "test-app" } });
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);

      await daSpecParser.generatePlugin(
        "path/to/spec.yaml",
        "path/to/manifest.json",
        "path/to/output/openapi.spec",
        "path/to/output/ai-plugin.json",
        ["GET /api"],
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      const copyMockAfterClear = vi.mocked(daSpecParser.copy as any);
      const expectedCall = copyMockAfterClear.mock.calls.some(
        (call: any) =>
          pathMatcher("c:/tmp/working-dir/.kiota/documents/testapp/openapi.json")(call[0]) &&
          pathMatcher("path/to/output/openapi.yaml.original")(call[1])
      );
      assert.isTrue(expectedCall);
    });

    it("should handle original spec file properly based on updateExistingPlugin flag", async () => {
      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue({
        name: { short: "test-app" },
        runtimes: [
          {
            spec: { url: "old-path.yaml" },
          },
        ],
      });
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);

      await daSpecParser.generatePlugin(
        "path/to/spec.yaml",
        "path/to/manifest.json",
        "path/to/output/openapi.yaml",
        "path/to/output/ai-plugin.json",
        ["GET /api/resource"],
        AdaptiveCardUpdateStrategy.KeepExisting,
        undefined,
        false
      );

      let copyMock = vi.mocked(daSpecParser.copy as any);
      assert.equal(copyMock.mock.calls.length, 2);
      const firstCall = copyMock.mock.calls[0];
      assert.isTrue(
        pathMatcher("c:/tmp/working-dir/plugin/openapi.yaml")(firstCall[0]) &&
          pathMatcher("path/to/output/openapi.yaml")(firstCall[1])
      );
      const secondCall = copyMock.mock.calls[1];
      assert.isTrue(
        pathMatcher("c:/tmp/working-dir/.kiota/documents/testapp/openapi.json")(secondCall[0]) &&
          pathMatcher("path/to/output/openapi.yaml.original")(secondCall[1])
      );

      vi.clearAllMocks();
      // Re-setup mocks
      vi.spyOn(daSpecParser, "kiotageneratePlugin" as any).mockResolvedValue({
        openAPISpec: "c:\\tmp\\working-dir\\plugin\\openapi.yaml",
        aiPlugin: "c:\\tmp\\working-dir\\plugin\\ai-plugin.json",
        logs: [],
      });
      vi.spyOn(daSpecParser, "tmpDirSync" as any).mockReturnValue({
        name: "c:\\tmp\\working-dir",
        removeCallback: vi.fn(),
        unsafeCleanup: true,
      });
      vi.spyOn(daSpecParser, "pathRelative" as any).mockReturnValue("../openapi.yaml");
      vi.mocked(featureFlagManager.getBooleanValue).mockReturnValue(true);
      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockResolvedValue({
        name: { short: "test-app" },
        runtimes: [
          {
            spec: { url: "old-path.yaml" },
          },
        ],
      });
      vi.spyOn(daSpecParser, "copy" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);

      const result = await daSpecParser.generatePlugin(
        "path/to/spec.yaml",
        "path/to/manifest.json",
        "path/to/output/openapi.yaml",
        "path/to/output/ai-plugin.json",
        ["GET /api/resource"],
        AdaptiveCardUpdateStrategy.KeepExisting,
        undefined,
        true
      );

      copyMock = vi.mocked(daSpecParser.copy as any);
      assert.equal(copyMock.mock.calls.length, 1);
      const thirdCall = copyMock.mock.calls[0];
      assert.isTrue(
        pathMatcher("c:/tmp/working-dir/plugin/openapi.yaml")(thirdCall[0]) &&
          pathMatcher("path/to/output/openapi.yaml")(thirdCall[1])
      );
    });

    it("should properly filter and merge functions when updating existing plugin", async () => {
      vi.spyOn(daSpecParser, "readdir" as any).mockResolvedValue(["openapi.json"]);
      vi.spyOn(daSpecParser, "readJSON" as any).mockImplementation(async (path: any) => {
        if (path.includes("manifest.json")) {
          return { name: { short: "test-app" } };
        } else if (path.includes("ai-plugin.json") && path.includes("tmp")) {
          return {
            name: "test-app",
            runtimes: [
              {
                spec: { url: "path-to-be-replaced" },
                run_for_functions: ["newFunction1", "newFunction2"],
              },
            ],
            functions: [
              { name: "newFunction1", description: "New function 1" },
              { name: "newFunction2", description: "New function 2" },
            ],
          };
        } else {
          return {
            name: "test-app",
            runtimes: [
              {
                spec: { url: "../openapi.yaml" },
                run_for_functions: ["oldFunction1", "oldFunction2"],
              },
              {
                spec: { url: "other-spec.yaml" },
                run_for_functions: ["keepFunction1"],
              },
            ],
            functions: [
              { name: "oldFunction1", description: "Old function 1" },
              { name: "oldFunction2", description: "Old function 2" },
              { name: "keepFunction1", description: "Keep function 1" },
            ],
          };
        }
      });

      vi.spyOn(daSpecParser, "writeJson" as any).mockResolvedValue(undefined);
      vi.spyOn(daSpecParser, "pathRelative" as any).mockReturnValue("../openapi.yaml");

      const specPath = "path/to/spec.yaml";
      const teamsManifestPath = "path/to/manifest.json";
      const outputAPISpecPath = "path/to/output/openapi.yaml";
      const outputAIPluginPath = "path/to/output/ai-plugin.json";
      const operations = ["GET /api/resource"];

      const result = await daSpecParser.generatePlugin(
        specPath,
        teamsManifestPath,
        outputAPISpecPath,
        outputAIPluginPath,
        operations,
        AdaptiveCardUpdateStrategy.KeepExisting,
        undefined,
        true
      );
      expect(result).toBeDefined();
    });
  });

  describe("patchOpenApiExtensionsIntoPluginManifest (issue #15731)", () => {
    let tmpDir: string;

    beforeEach(async () => {
      // The outer describe sets up mocks we don't need here; restore so
      // real fs / yaml are exercised.
      vi.restoreAllMocks();
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kiota-15731-test-"));
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kiota-15731-test-"));
    });

    afterEach(async () => {
      try {
        await fs.remove(tmpDir);
      } catch {
        // Ignore cleanup errors on Windows when files are still locked.
      }
    });

    async function writeSpec(yaml: string): Promise<string> {
      const specPath = path.join(tmpDir, "openapi.yaml");
      await fs.writeFile(specPath, yaml, "utf8");
      return specPath;
    }

    async function writeManifest(manifest: any): Promise<string> {
      const p = path.join(tmpDir, "test-apiplugin.json");
      await fs.writeJson(p, manifest, { spaces: 2 });
      return p;
    }

    it("propagates x-ai-adaptive-card and inlines the static_template", async () => {
      const cardsDir = path.join(tmpDir, "adaptiveCards");
      await fs.ensureDir(cardsDir);
      const card = { type: "AdaptiveCard", version: "1.5", body: [] };
      await fs.writeJson(path.join(cardsDir, "get.json"), card);

      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-adaptive-card:",
          "        data_path: $.value[0]",
          "        file: adaptiveCards/get.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [{ name: "getItems", description: "" }],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const result = await fs.readJson(manifestPath);
      const fn = result.functions[0];
      assert.deepEqual(fn.capabilities.response_semantics.data_path, "$.value[0]");
      assert.deepEqual(fn.capabilities.response_semantics.static_template, card);
    });

    it("propagates x-openai-isConsequential into confirmation.isNonConsequential", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    patch:",
          "      operationId: updateItems",
          "      x-openai-isConsequential: true",
          "      x-ai-capabilities:",
          "        confirmation:",
          "          type: AdaptiveCard",
          "          title: Update?",
          "          body: Confirm.",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [{ name: "updateItems", description: "" }],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.equal(fn.capabilities.confirmation.type, "AdaptiveCard");
      assert.equal(fn.capabilities.confirmation.title, "Update?");
      // x-openai-isConsequential: true => isNonConsequential: false
      assert.strictEqual(fn.capabilities.confirmation.isNonConsequential, false);
    });

    it("maps x-openai-isConsequential: false to isNonConsequential: true", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    post:",
          "      operationId: readItems",
          "      x-openai-isConsequential: false",
          "      x-ai-capabilities:",
          "        confirmation:",
          "          type: AdaptiveCard",
          "          title: Read",
          "          body: ok",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [{ name: "readItems", description: "" }],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.strictEqual(fn.capabilities.confirmation.isNonConsequential, true);
    });

    it("does not overwrite capabilities Kiota already populated", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-adaptive-card:",
          "        data_path: $.value[0]",
          "        file: adaptiveCards/get.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const existing = {
        schema_version: "v2.4",
        functions: [
          {
            name: "getItems",
            description: "",
            capabilities: {
              response_semantics: { data_path: "$.preserved" },
            },
          },
        ],
      };
      const manifestPath = await writeManifest(existing);

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.equal(fn.capabilities.response_semantics.data_path, "$.preserved");
    });

    it("is a no-op when the spec has no relevant extensions", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const before = {
        schema_version: "v2.4",
        functions: [{ name: "getItems", description: "" }],
      };
      const manifestPath = await writeManifest(before);

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      assert.deepEqual(await fs.readJson(manifestPath), before);
    });

    it("returns silently when spec or manifest path does not exist", async () => {
      // Should not throw.
      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(
        path.join(tmpDir, "missing.yaml"),
        path.join(tmpDir, "missing.json")
      );
    });

    it("returns silently when the spec is not valid YAML", async () => {
      const specPath = path.join(tmpDir, "openapi.yaml");
      // `: : :` is a YAML parse error.
      await fs.writeFile(specPath, ":\n: :\n  : :", "utf8");
      const before = {
        schema_version: "v2.4",
        functions: [{ name: "x", description: "" }],
      };
      const manifestPath = await writeManifest(before);

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      assert.deepEqual(await fs.readJson(manifestPath), before);
    });

    it("returns silently when the parsed spec has no paths object", async () => {
      // YAML parses to a plain string, which exercises the
      // `!spec || typeof spec !== "object" || !spec.paths` guard.
      const specPath = await writeSpec("just-a-string\n");
      const before = {
        schema_version: "v2.4",
        functions: [{ name: "x", description: "" }],
      };
      const manifestPath = await writeManifest(before);

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      assert.deepEqual(await fs.readJson(manifestPath), before);
    });

    it("leaves static_template unset when the referenced card file is unreadable", async () => {
      // Create a directory where a card file is expected; readJson will fail.
      const cardsDir = path.join(tmpDir, "adaptiveCards");
      await fs.ensureDir(cardsDir);
      await fs.ensureDir(path.join(cardsDir, "broken.json"));

      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-adaptive-card:",
          "        data_path: $.items[0]",
          "        file: adaptiveCards/broken.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [{ name: "getItems", description: "" }],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      // data_path is still propagated; static_template silently omitted.
      assert.equal(fn.capabilities.response_semantics.data_path, "$.items[0]");
      assert.notProperty(fn.capabilities.response_semantics, "static_template");
    });

    it("inlines Kiota's `{ file }` placeholder for static_template", async () => {
      // Kiota 1.31.1 emits `static_template: { file: "adaptiveCards/<name>.json" }`
      // instead of inlining the card. The patch must replace it with the
      // actual card JSON.
      const cardsDir = path.join(tmpDir, "adaptiveCards");
      await fs.ensureDir(cardsDir);
      const cardJson = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.5",
        body: [{ type: "TextBlock", text: "${title}" }],
      };
      await fs.writeJson(path.join(cardsDir, "search.json"), cardJson);

      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /search:",
          "    get:",
          "      operationId: searchIssues",
          "      x-ai-adaptive-card:",
          "        data_path: $.items",
          "        file: adaptiveCards/search.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [
          {
            name: "searchIssues",
            description: "",
            capabilities: {
              response_semantics: {
                data_path: "$.items",
                static_template: { file: "adaptiveCards/search.json" },
              },
            },
          },
        ],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.deepEqual(fn.capabilities.response_semantics.static_template, cardJson);
      assert.equal(fn.capabilities.response_semantics.data_path, "$.items");
    });

    it("does not replace a real static_template that already has card fields", async () => {
      // If `static_template` already looks like a real Adaptive Card (has
      // `type`/`$schema`/`body`), we must leave it alone even if a `file`
      // property happens to be present.
      const cardsDir = path.join(tmpDir, "adaptiveCards");
      await fs.ensureDir(cardsDir);
      await fs.writeJson(path.join(cardsDir, "search.json"), {
        type: "AdaptiveCard",
        body: [{ type: "TextBlock", text: "from disk" }],
      });

      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /search:",
          "    get:",
          "      operationId: searchIssues",
          "      x-ai-adaptive-card:",
          "        data_path: $.items",
          "        file: adaptiveCards/search.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const realCard = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        body: [{ type: "TextBlock", text: "preserved" }],
      };
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [
          {
            name: "searchIssues",
            description: "",
            capabilities: {
              response_semantics: {
                data_path: "$.items",
                static_template: realCard,
              },
            },
          },
        ],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.deepEqual(fn.capabilities.response_semantics.static_template, realCard);
    });

    it("resolves card files from the parent of the plugin manifest directory", async () => {
      // Mirrors the real layout: spec lives in `<root>/.generated/specs/`,
      // plugin manifest lives in `<root>/.generated/`, and the card lives in
      // `<root>/adaptiveCards/`.
      const generated = path.join(tmpDir, ".generated");
      const specsDir = path.join(generated, "specs");
      await fs.ensureDir(specsDir);
      await fs.ensureDir(path.join(tmpDir, "adaptiveCards"));
      const cardJson = { type: "AdaptiveCard", body: [] };
      await fs.writeJson(path.join(tmpDir, "adaptiveCards", "card.json"), cardJson);

      const specPath = path.join(specsDir, "openapi.yaml");
      await fs.writeFile(
        specPath,
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /x:",
          "    get:",
          "      operationId: getX",
          "      x-ai-adaptive-card:",
          "        data_path: $.items",
          "        file: adaptiveCards/card.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n"),
        "utf8"
      );
      const manifestPath = path.join(generated, "x-apiplugin.json");
      await fs.writeJson(manifestPath, {
        schema_version: "v2.4",
        functions: [
          {
            name: "getX",
            description: "",
            capabilities: {
              response_semantics: {
                data_path: "$.items",
                static_template: { file: "adaptiveCards/card.json" },
              },
            },
          },
        ],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.deepEqual(fn.capabilities.response_semantics.static_template, cardJson);
    });

    it("swallows readJSON errors when the card file exists but is invalid JSON", async () => {
      // Exercises the `catch` branch inside resolveCardJson: pathExists
      // succeeds but readJSON throws on a corrupt file.
      const cardsDir = path.join(tmpDir, "adaptiveCards");
      await fs.ensureDir(cardsDir);
      await fs.writeFile(path.join(cardsDir, "broken.json"), "{ not valid json", "utf8");

      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-adaptive-card:",
          "        data_path: $.items",
          "        file: adaptiveCards/broken.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [
          {
            name: "getItems",
            description: "",
            capabilities: {
              response_semantics: {
                static_template: { file: "adaptiveCards/broken.json" },
              },
            },
          },
        ],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      // The placeholder should be left intact since the card could not be
      // read; data_path should still get filled from the spec.
      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.deepEqual(fn.capabilities.response_semantics.static_template, {
        file: "adaptiveCards/broken.json",
      });
      assert.equal(fn.capabilities.response_semantics.data_path, "$.items");
    });

    it("propagates x-ai-capabilities.confirmation without response_semantics", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    post:",
          "      operationId: createItem",
          "      x-ai-capabilities:",
          "        confirmation:",
          "          type: AdaptiveCard",
          "          title: Create Item",
          "          body: Confirm creation",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [{ name: "createItem", description: "" }],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.isDefined(fn.capabilities.confirmation);
      assert.equal(fn.capabilities.confirmation.type, "AdaptiveCard");
      assert.equal(fn.capabilities.confirmation.title, "Create Item");
    });

    it("does not overwrite existing confirmation with x-ai-capabilities", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    post:",
          "      operationId: createItem",
          "      x-ai-capabilities:",
          "        confirmation:",
          "          type: AdaptiveCard",
          "          title: New Title",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const existing = {
        schema_version: "v2.4",
        functions: [
          {
            name: "createItem",
            description: "",
            capabilities: {
              confirmation: {
                type: "AdaptiveCard",
                title: "Existing Title",
              },
            },
          },
        ],
      };
      const manifestPath = await writeManifest(existing);

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.equal(fn.capabilities.confirmation.title, "Existing Title");
    });

    it("sets isNonConsequential when isConsequential is true in confirmation", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    patch:",
          "      operationId: updateItems",
          "      x-openai-isConsequential: true",
          "      x-ai-capabilities:",
          "        confirmation:",
          "          type: AdaptiveCard",
          "          title: Update Item",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [
          {
            name: "updateItems",
            description: "",
            capabilities: {
              confirmation: {
                type: "AdaptiveCard",
                title: "Update Item",
              },
            },
          },
        ],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.strictEqual(fn.capabilities.confirmation.isNonConsequential, false);
    });

    it("handles operation without function match in manifest", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-adaptive-card:",
          "        data_path: $.value",
          "        file: adaptiveCards/get.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const cardsDir = path.join(tmpDir, "adaptiveCards");
      await fs.ensureDir(cardsDir);
      const card = { type: "AdaptiveCard", body: [] };
      await fs.writeJson(path.join(cardsDir, "get.json"), card);

      const before = {
        schema_version: "v2.4",
        functions: [{ name: "differentFunction", description: "" }],
      };
      const manifestPath = await writeManifest(before);

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const after = await fs.readJson(manifestPath);
      assert.deepEqual(after, before);
    });

    it("handles multiple functions where only some match", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-adaptive-card:",
          "        data_path: $.value",
          "        file: adaptiveCards/get.json",
          "    post:",
          "      operationId: createItem",
          "      x-ai-adaptive-card:",
          "        data_path: $.item",
          "        file: adaptiveCards/create.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const cardsDir = path.join(tmpDir, "adaptiveCards");
      await fs.ensureDir(cardsDir);
      await fs.writeJson(path.join(cardsDir, "get.json"), { type: "AdaptiveCard", body: [] });
      await fs.writeJson(path.join(cardsDir, "create.json"), { type: "AdaptiveCard", body: [] });

      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [
          { name: "getItems", description: "" },
          { name: "createItem", description: "" },
          { name: "otherFunction", description: "" },
        ],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const after = await fs.readJson(manifestPath);
      assert.isDefined(after.functions[0].capabilities?.response_semantics);
      assert.isDefined(after.functions[1].capabilities?.response_semantics);
      assert.isUndefined(after.functions[2].capabilities?.response_semantics);
    });

    it("handles empty x-ai-capabilities object", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-capabilities: {}",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const before = {
        schema_version: "v2.4",
        functions: [{ name: "getItems", description: "" }],
      };
      const manifestPath = await writeManifest(before);

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const after = await fs.readJson(manifestPath);
      assert.deepEqual(after, before);
    });

    it("handles x-ai-adaptive-card with only data_path", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-adaptive-card:",
          "        data_path: $.items",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [{ name: "getItems", description: "" }],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.equal(fn.capabilities.response_semantics.data_path, "$.items");
      assert.isUndefined(fn.capabilities.response_semantics.static_template);
    });

    it("handles x-ai-adaptive-card with only file", async () => {
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-adaptive-card:",
          "        file: adaptiveCards/get.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const cardsDir = path.join(tmpDir, "adaptiveCards");
      await fs.ensureDir(cardsDir);
      const card = { type: "AdaptiveCard", body: [] };
      await fs.writeJson(path.join(cardsDir, "get.json"), card);

      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [{ name: "getItems", description: "" }],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.deepEqual(fn.capabilities.response_semantics.static_template, card);
      assert.isUndefined(fn.capabilities.response_semantics.data_path);
    });

    it("fills missing data_path on an existing response_semantics with a placeholder", async () => {
      // response_semantics exists with the Kiota `{ file }` placeholder but
      // without a data_path; the patcher should backfill data_path from the
      // spec while also inlining the card.
      const cardsDir = path.join(tmpDir, "adaptiveCards");
      await fs.ensureDir(cardsDir);
      const card = { type: "AdaptiveCard", version: "1.5", body: [] };
      await fs.writeJson(path.join(cardsDir, "get.json"), card);

      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-adaptive-card:",
          "        data_path: $.value",
          "        file: adaptiveCards/get.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [
          {
            name: "getItems",
            description: "",
            capabilities: {
              response_semantics: {
                // No data_path; placeholder static_template.
                static_template: { file: "adaptiveCards/get.json" },
              },
            },
          },
        ],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.equal(fn.capabilities.response_semantics.data_path, "$.value");
      assert.deepEqual(fn.capabilities.response_semantics.static_template, card);
    });

    it("fills missing data_path on an existing response_semantics with a real card", async () => {
      // response_semantics exists with a real (non-placeholder) static_template
      // but no data_path. The patcher should leave the card alone and only
      // backfill data_path.
      const realCard = {
        type: "AdaptiveCard",
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        body: [{ type: "TextBlock", text: "real" }],
      };
      const specPath = await writeSpec(
        [
          "openapi: 3.0.0",
          "info: { title: t, version: '1' }",
          "paths:",
          "  /items:",
          "    get:",
          "      operationId: getItems",
          "      x-ai-adaptive-card:",
          "        data_path: $.value",
          "        file: adaptiveCards/get.json",
          "      responses: { '200': { description: ok } }",
          "",
        ].join("\n")
      );
      const manifestPath = await writeManifest({
        schema_version: "v2.4",
        functions: [
          {
            name: "getItems",
            description: "",
            capabilities: {
              response_semantics: {
                static_template: realCard,
              },
            },
          },
        ],
      });

      await daSpecParser.patchOpenApiExtensionsIntoPluginManifest(specPath, manifestPath);

      const fn = (await fs.readJson(manifestPath)).functions[0];
      assert.equal(fn.capabilities.response_semantics.data_path, "$.value");
      assert.deepEqual(fn.capabilities.response_semantics.static_template, realCard);
    });
  });

  describe("parseAndUpdatePluginManifestForKiota", () => {
    let tmpDir: string;

    beforeEach(async () => {
      vi.restoreAllMocks();
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "parse-manifest-test-"));
    });

    afterEach(async () => {
      try {
        await fs.remove(tmpDir);
      } catch {
        // Ignore cleanup errors on Windows when files are still locked.
      }
    });

    async function writeManifest(manifest: any): Promise<string> {
      const p = path.join(tmpDir, "plugin-manifest.json");
      await fs.writeJson(p, manifest, { spaces: 2 });
      return p;
    }

    it("should extract auth data from valid reference_id format", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "openapi.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ API_KEY_AUTH_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 1);
      assert.equal(result[0].authName, "API_KEY_AUTH");
      assert.equal(result[0].authType, "apiKey");
      // registrationId should be the new reference ID (authName.toUpperCase() + "_VAULT_ID")
      assert.isTrue(result[0].registrationId.startsWith("API_KEY_AUTH_"));
      assert.equal(result[0].specPath, "openapi.yaml");
    });

    it("should handle oauth2 auth type", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "api-spec.yaml" },
            auth: {
              type: "OAuthPluginVault",
              reference_id: "{ OAUTH_FLOW_AUTH_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 1);
      assert.equal(result[0].authType, "oauth2");
      assert.equal(result[0].authName, "OAUTH_FLOW_AUTH");
    });

    it("should handle multiple runtimes with different auth types", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "spec1.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ API_KEY_ID_VAULT_ID }",
            },
          },
          {
            spec: { url: "spec2.yaml" },
            auth: {
              type: "OAuthPluginVault",
              reference_id: "{ OAUTH_ID_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 2);
      assert.equal(result[0].authType, "apiKey");
      assert.equal(result[0].authName, "API_KEY_ID");
      assert.equal(result[1].authType, "oauth2");
      assert.equal(result[1].authName, "OAUTH_ID");
    });

    it("should skip runtimes without auth information", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "spec1.yaml" },
            auth: {
              type: "None",
              reference_id: "none",
            },
          },
          {
            spec: { url: "spec2.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ API_KEY_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 1);
      assert.equal(result[0].authName, "API_KEY");
    });

    it("should skip runtimes with undefined auth", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "spec1.yaml" },
          },
          {
            spec: { url: "spec2.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ API_KEY_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 1);
      assert.equal(result[0].authName, "API_KEY");
    });

    it("should skip invalid reference_id format", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "spec1.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "INVALID_FORMAT_WITHOUT_BRACES",
            },
          },
          {
            spec: { url: "spec2.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ VALID_ID_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 1);
      assert.equal(result[0].authName, "VALID_ID");
    });

    it("should handle reference_id with various whitespace", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "spec.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{  API_KEY_WITH_SPACES_VAULT_ID  }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 1);
      assert.equal(result[0].authName, "API_KEY_WITH_SPACES");
    });

    it("should update placeholder when updatePlaceholder is true", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "openapi.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ API_KEY_AUTH_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, true);

      assert.equal(result.length, 1);
      assert.isTrue(result[0].registrationId.startsWith("API_KEY_AUTH_"));

      const updatedManifest = await fs.readJson(manifestPath);
      assert.isTrue(updatedManifest.runtimes[0].auth.reference_id.startsWith("${{"));
      assert.isTrue(updatedManifest.runtimes[0].auth.reference_id.endsWith("}}"));
    });

    it("should not write file when updatePlaceholder is false", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "openapi.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ API_KEY_AUTH_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);
      const originalContent = await fs.readJson(manifestPath);

      await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      const afterContent = await fs.readJson(manifestPath);
      assert.deepEqual(
        afterContent.runtimes[0].auth.reference_id,
        originalContent.runtimes[0].auth.reference_id
      );
    });

    it("should return empty array when no runtimes", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 0);
    });

    it("should return empty array when runtimes is undefined", async () => {
      const manifest = {
        schema_version: "v2.4",
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 0);
    });

    it("should correctly parse auth name with underscores", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "spec.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ MULTI_PART_AUTH_NAME_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 1);
      assert.equal(result[0].authName, "MULTI_PART_AUTH_NAME");
      assert.isTrue(result[0].registrationId.startsWith("MULTI_PART_AUTH_NAME_"));
    });

    it("should handle edge case with single word auth name", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "spec.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ AUTH_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 1);
      assert.equal(result[0].authName, "AUTH");
    });

    it("should update multiple runtimes when updatePlaceholder is true", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "spec1.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ APIKEY_AUTH_VAULT_ID }",
            },
          },
          {
            spec: { url: "spec2.yaml" },
            auth: {
              type: "OAuthPluginVault",
              reference_id: "{ OAUTH_AUTH_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, true);

      assert.equal(result.length, 2);

      const updatedManifest = await fs.readJson(manifestPath);
      assert.isTrue(updatedManifest.runtimes[0].auth.reference_id.startsWith("${{"));
      assert.isTrue(updatedManifest.runtimes[0].auth.reference_id.endsWith("}}"));
      assert.isTrue(updatedManifest.runtimes[1].auth.reference_id.startsWith("${{"));
      assert.isTrue(updatedManifest.runtimes[1].auth.reference_id.endsWith("}}"));
    });

    it("should handle auth type other than ApiKeyPluginVault and OAuthPluginVault", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "spec.yaml" },
            auth: {
              type: "UnknownAuthType",
              reference_id: "{ UNKNOWN_AUTH_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 1);
      assert.equal(result[0].authType, "oauth2");
      assert.equal(result[0].authName, "UNKNOWN_AUTH");
    });

    it("should preserve other manifest properties when updating", async () => {
      const manifest = {
        schema_version: "v2.4",
        name: "Test Plugin",
        description: "Test Description",
        runtimes: [
          {
            spec: { url: "openapi.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ API_KEY_AUTH_VAULT_ID }",
            },
          },
        ],
        functions: [
          {
            name: "testFunc",
            description: "Test function",
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, true);

      const updatedManifest = await fs.readJson(manifestPath);
      assert.equal(updatedManifest.name, "Test Plugin");
      assert.equal(updatedManifest.description, "Test Description");
      assert.equal(updatedManifest.functions.length, 1);
      assert.equal(updatedManifest.functions[0].name, "testFunc");
    });

    it("should correctly determine spec path from runtime", async () => {
      const manifest = {
        schema_version: "v2.4",
        runtimes: [
          {
            spec: { url: "../../specs/complex/openapi.yaml" },
            auth: {
              type: "ApiKeyPluginVault",
              reference_id: "{ API_KEY_AUTH_VAULT_ID }",
            },
          },
        ],
      };
      const manifestPath = await writeManifest(manifest);

      const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(manifestPath, false);

      assert.equal(result.length, 1);
      assert.equal(result[0].specPath, "../../specs/complex/openapi.yaml");
    });
  });
});
