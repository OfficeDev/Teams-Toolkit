// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ODRProvider } from "../../../src/component/utils/odrProvider";

import { assert, expect, vi } from "vitest";
import * as odrProviderDeps from "../../../src/component/utils/odrProvider";
describe("ODRProvider", () => {
  const sandbox = vi;
  const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalPlatformDescriptor) {
      Object.defineProperty(process, "platform", originalPlatformDescriptor);
    }
  });

  describe("isODRServer", () => {
    it("odrProviderDeps.logError should delegate to console.error", () => {
      const errorStub = vi.spyOn(console, "error");

      odrProviderDeps.logError("odr", "failed");

      expect(errorStub).toHaveBeenCalledExactlyOnceWith("odr", "failed");
    });

    it("should return true for ODR server with lowercase odr command", () => {
      const serverConfig = { type: "stdio", command: "odr" };
      assert.isTrue(ODRProvider.isODRServer(serverConfig));
    });

    it("should return true for ODR server with odr.exe command", () => {
      const serverConfig = { type: "stdio", command: "odr.exe" };
      assert.isTrue(ODRProvider.isODRServer(serverConfig));
    });

    it("should return true for ODR server with path ending in odr.exe", () => {
      const serverConfig = { type: "stdio", command: "C:\\Program Files\\odr.exe" };
      assert.isTrue(ODRProvider.isODRServer(serverConfig));
    });

    it("should return false for non-stdio server", () => {
      const serverConfig = { type: "sse", command: "odr" };
      assert.isFalse(ODRProvider.isODRServer(serverConfig));
    });

    it("should return false for server without command", () => {
      const serverConfig = { type: "stdio" };
      assert.isFalse(ODRProvider.isODRServer(serverConfig));
    });

    it("should return false for non-ODR command", () => {
      const serverConfig = { type: "stdio", command: "node" };
      assert.isFalse(ODRProvider.isODRServer(serverConfig));
    });

    it("should return false for null serverConfig", () => {
      assert.isFalse(ODRProvider.isODRServer(null));
    });

    it("should return false for undefined serverConfig", () => {
      assert.isFalse(ODRProvider.isODRServer(undefined));
    });
  });

  describe("listServers", () => {
    it("should return empty array on non-Windows platform", async () => {
      Object.defineProperty(process, "platform", { value: "darwin", configurable: true }); // macOS
      const execStub = vi.spyOn(require("child_process"), "exec");

      const servers = await ODRProvider.listServers();

      assert.isArray(servers);
      assert.equal(servers.length, 0);
      assert.isFalse(execStub.mock.calls.length > 0);
    });
  });

  describe("parseODRListOutput", () => {
    it("should parse valid server data correctly", () => {
      const mockInput = {
        servers: [
          {
            name: "test-server",
            description: "Test server description",
            version: "1.0.0",
            packages: [{ identifier: "com.test.server" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    display_name: "Test MCP Server",
                    server: {
                      mcp_config: {
                        command: "odr.exe",
                        args: ["mcp", "--proxy", "com.test.server"],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "TestPackageFamily",
                        static_responses: {
                          "tools/list": {
                            tools: [
                              {
                                name: "test-tool",
                                description: "Test tool description",
                                inputSchema: { type: "object", properties: {} },
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);

      const server = servers[0];
      assert.equal(server.name, "test-server");
      assert.equal(server.display_name, "Test MCP Server");
      assert.equal(server.description, "Test server description");
      assert.equal(server.version, "1.0.0");
      assert.equal(server.identifier, "com.test.server");
      assert.equal(server.packageFamily, "TestPackageFamily");
      assert.equal(server.command, "odr.exe");
      assert.deepEqual(server.args, ["mcp", "--proxy", "com.test.server"]);
      assert.equal(server.tools.length, 1);
      assert.equal(server.tools[0].name, "test-tool");
      assert.equal(server.tools[0].description, "Test tool description");
    });

    it("should filter out servers without package family", () => {
      const mockInput = {
        servers: [
          {
            name: "valid-server",
            packages: [{ identifier: "com.valid" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    server: {
                      mcp_config: {
                        command: "odr.exe",
                        args: ["mcp", "--proxy", "valid.server"],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "ValidPackage",
                        static_responses: {
                          "tools/list": {
                            tools: [],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          {
            name: "invalid-server",
            packages: [{ identifier: "com.invalid" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    server: {
                      mcp_config: {
                        command: "odr.exe",
                        args: ["mcp", "--proxy", "invalid.server"],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        // Missing package_family_name
                        static_responses: {
                          "tools/list": {
                            tools: [],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].name, "valid-server");
    });

    it("should filter out servers without mcp_config", () => {
      const mockInput = {
        servers: [
          {
            name: "invalid-server",
            packages: [{ identifier: "com.invalid" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    server: {
                      // Missing mcp_config
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "InvalidPackage",
                        static_responses: {
                          "tools/list": {
                            tools: [],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 0);
    });

    it("should return empty array when servers property is missing", () => {
      const mockInput = {
        notServers: [],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 0);
    });

    it("should return empty array when servers is not an array", () => {
      const mockInput = {
        servers: "not-an-array",
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 0);
    });

    it("should return empty array when input is null", () => {
      const servers = ODRProvider.parseODRListOutput(null);

      assert.isArray(servers);
      assert.equal(servers.length, 0);
    });

    it("should return empty array when input is undefined", () => {
      const servers = ODRProvider.parseODRListOutput(undefined);

      assert.isArray(servers);
      assert.equal(servers.length, 0);
    });

    it("should handle servers with empty tools list", () => {
      const mockInput = {
        servers: [
          {
            name: "server-no-tools",
            packages: [{ identifier: "com.test.server" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    display_name: "Test Server",
                    server: {
                      mcp_config: {
                        command: "test-command",
                        args: ["test-arg"],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "TestPackage",
                        static_responses: {
                          "tools/list": {
                            tools: [],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].tools.length, 0);
    });

    it("should handle servers with missing tools list", () => {
      const mockInput = {
        servers: [
          {
            name: "server-no-tools-list",
            packages: [{ identifier: "com.test.server" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    display_name: "Test Server",
                    server: {
                      mcp_config: {
                        command: "test-command",
                        args: ["test-arg"],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "TestPackage",
                        static_responses: {
                          // Missing tools/list
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].tools.length, 0);
    });

    it("should use server name as display_name when display_name is missing", () => {
      const mockInput = {
        servers: [
          {
            name: "test-server",
            packages: [{ identifier: "com.test.server" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    // Missing display_name
                    server: {
                      mcp_config: {
                        command: "test-command",
                        args: [],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "TestPackage",
                        static_responses: {
                          "tools/list": {
                            tools: [],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].display_name, "test-server");
    });

    it("should use empty string for missing description", () => {
      const mockInput = {
        servers: [
          {
            name: "test-server",
            // Missing description
            packages: [{ identifier: "com.test.server" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    server: {
                      mcp_config: {
                        command: "test-command",
                        args: [],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "TestPackage",
                        static_responses: {
                          "tools/list": {
                            tools: [],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].description, "");
    });

    it("should use default version when version is missing", () => {
      const mockInput = {
        servers: [
          {
            name: "test-server",
            // Missing version
            packages: [{ identifier: "com.test.server" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    server: {
                      mcp_config: {
                        command: "test-command",
                        args: [],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "TestPackage",
                        static_responses: {
                          "tools/list": {
                            tools: [],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].version, "1.0.0");
    });

    it("should use empty string for missing identifier", () => {
      const mockInput = {
        servers: [
          {
            name: "test-server",
            packages: [], // Empty packages array
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    server: {
                      mcp_config: {
                        command: "test-command",
                        args: [],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "TestPackage",
                        static_responses: {
                          "tools/list": {
                            tools: [],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].identifier, "");
    });

    it("should handle tools with missing description", () => {
      const mockInput = {
        servers: [
          {
            name: "test-server",
            packages: [{ identifier: "com.test" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    server: {
                      mcp_config: {
                        command: "cmd",
                        args: [],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "Package",
                        static_responses: {
                          "tools/list": {
                            tools: [
                              {
                                name: "tool1",
                                // Missing description
                                inputSchema: { type: "object" },
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].tools.length, 1);
      assert.equal(servers[0].tools[0].description, "");
    });

    it("should handle tools without outputSchema", () => {
      const mockInput = {
        servers: [
          {
            name: "test-server",
            packages: [{ identifier: "com.test" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    server: {
                      mcp_config: {
                        command: "cmd",
                        args: [],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "Package",
                        static_responses: {
                          "tools/list": {
                            tools: [
                              {
                                name: "tool1",
                                description: "Tool 1",
                                inputSchema: { type: "object" },
                                // Missing outputSchema
                              },
                            ],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].tools.length, 1);
      assert.isUndefined(servers[0].tools[0].outputSchema);
    });

    it("should handle empty command and args", () => {
      const mockInput = {
        servers: [
          {
            name: "test-server",
            packages: [{ identifier: "com.test" }],
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    server: {
                      mcp_config: {
                        // Missing command and args
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "Package",
                        static_responses: {
                          "tools/list": {
                            tools: [],
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].command, "");
      assert.deepEqual(servers[0].args, []);
    });

    it("should handle deeply nested missing properties gracefully", () => {
      const mockInput = {
        servers: [
          {
            name: "test-server",
            _meta: {
              "io.modelcontextprotocol.registry/publisher-provided": {
                "com.microsoft.windows": {
                  manifest: {
                    server: {
                      mcp_config: {
                        command: "cmd",
                        args: [],
                      },
                    },
                    _meta: {
                      "com.microsoft.windows": {
                        package_family_name: "Package",
                        // Missing static_responses entirely
                      },
                    },
                  },
                },
              },
            },
          },
        ],
      };

      const servers = ODRProvider.parseODRListOutput(mockInput);

      assert.isArray(servers);
      assert.equal(servers.length, 1);
      assert.equal(servers[0].tools.length, 0);
    });
  });

  describe("getToolsForODRServer", () => {
    it("should return tools for matching ODR server", async () => {
      const mockServers = [
        {
          name: "my-server",
          display_name: "My Server",
          description: "Test",
          version: "1.0.0",
          identifier: "com.test.server",
          packageFamily: "TestPackage",
          command: "odr",
          args: ["run", "my-server"],
          tools: [
            { name: "tool1", description: "Tool 1", inputSchema: { type: "object" } },
            { name: "tool2", description: "Tool 2", inputSchema: { type: "string" } },
          ],
        },
      ];

      vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

      const tools = await ODRProvider.getToolsForODRServer("odr", ["run", "my-server"]);

      assert.isArray(tools);
      assert.equal(tools.length, 2);
      assert.equal(tools[0].name, "tool1");
      assert.equal(tools[1].name, "tool2");
    });

    it("should return empty array when no matching server found", async () => {
      const mockServers = [
        {
          name: "my-server",
          display_name: "My Server",
          description: "Test",
          version: "1.0.0",
          identifier: "com.test.server",
          packageFamily: "TestPackage",
          command: "odr",
          args: ["run", "my-server"],
          tools: [],
        },
      ];

      vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

      const tools = await ODRProvider.getToolsForODRServer("odr", ["run", "different-server"]);

      assert.isArray(tools);
      assert.equal(tools.length, 0);
    });

    it("should match server with empty args array", async () => {
      const mockServers = [
        {
          name: "my-server",
          display_name: "My Server",
          description: "Test",
          version: "1.0.0",
          identifier: "com.test.server",
          packageFamily: "TestPackage",
          command: "odr",
          args: [],
          tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
        },
      ];

      vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

      const tools = await ODRProvider.getToolsForODRServer("odr", []);

      assert.isArray(tools);
      assert.equal(tools.length, 1);
    });

    it("should match server with default empty args when not provided", async () => {
      const mockServers = [
        {
          name: "my-server",
          display_name: "My Server",
          description: "Test",
          version: "1.0.0",
          identifier: "com.test.server",
          packageFamily: "TestPackage",
          command: "odr",
          args: [],
          tools: [{ name: "tool1", description: "Tool 1", inputSchema: {} }],
        },
      ];

      vi.spyOn(ODRProvider, "listServers").mockResolvedValue(mockServers);

      const tools = await ODRProvider.getToolsForODRServer("odr");

      assert.isArray(tools);
      assert.equal(tools.length, 1);
    });
  });
});
