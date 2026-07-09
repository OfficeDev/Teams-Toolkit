// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SpecParser } from "@microsoft/m365-spec-parser";
import {
  AppManifestUtils,
  Colors,
  DeclarativeAgentManifestConverter,
  DeclarativeCopilotCapabilityName,
  DeclarativeCopilotManifestSchema,
  err,
  Err,
  FxError,
  ok,
  Ok,
  Platform,
  Result,
  SystemError,
  UserError,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import path from "path";
import { chai, expect, vi } from "vitest";
import { featureFlagManager } from "../../../../src";
import { createContext, setTools } from "../../../../src/common/globalVars";
import { generateDriverContext } from "../../../../src/common/utils";
import { EmbeddedKnowledgeLocalDirectoryName } from "../../../../src/component/driver/teamsApp/constants";
import { AppStudioError } from "../../../../src/component/driver/teamsApp/errors";
import { DeclarativeCopilotManifestValidationResult } from "../../../../src/component/driver/teamsApp/interfaces/ValidationResult";
import { copilotGptManifestUtils } from "../../../../src/component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { pluginManifestUtils } from "../../../../src/component/driver/teamsApp/utils/PluginManifestUtils";
import { WrapDriverContext } from "../../../../src/component/driver/util/wrapUtil";
import {
  FileNotFoundError,
  JSONSyntaxError,
  MissingEnvironmentVariablesError,
  WriteFileError,
} from "../../../../src/error";
import { MockTools } from "../../../core/utils";
import { MockedLogProvider, MockedTelemetryReporter } from "../../../plugins/solution/util";

describe("copilotGptManifestUtils", () => {
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });

  const gptManifest: DeclarativeCopilotManifestSchema = {
    name: "name${{APP_NAME_SUFFIX}}",
    description: "description",
  };

  describe("add plugin", async () => {
    it("add plugin without appending conversation starters success", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(
        JSON.stringify({
          name: "name${{APP_NAME_SUFFIX}}",
          description: "description",
          conversation_starters: [
            {
              text: "List all repairs",
            },
          ],
        }) as any
      );
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(fs, "readJson").mockResolvedValue({} as any);

      const res = await copilotGptManifestUtils.addAction("testPath", "testId", "testFile");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const updatedManifest = res.value;
        chai.assert.deepEqual(updatedManifest.actions![0], {
          id: "testId",
          file: "testFile",
        });

        chai.assert.deepEqual(updatedManifest.conversation_starters, [
          {
            text: "List all repairs",
          },
        ]);
      }
    });

    it("add plugin success - use conversation_starters in action file", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(gptManifest) as any);
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(fs, "readJson").mockResolvedValue({
        capabilities: {
          conversation_starters: [
            {
              text: "List all repairs",
            },
          ],
        },
      } as any);

      const res = await copilotGptManifestUtils.addAction("testPath", "testId", "testFile");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const updatedManifest = res.value;
        chai.assert.deepEqual(updatedManifest.actions![0], {
          id: "testId",
          file: "testFile",
        });

        chai.assert.deepEqual(updatedManifest.conversation_starters, [
          {
            text: "List all repairs",
          },
        ]);
      }
    });

    it("add plugin success - parse conversation_starters in open api spec file", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(gptManifest) as any);
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(fs, "readJson").mockResolvedValue({
        capabilities: {
          conversation_starters: [],
        },
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "apiSpecificationFile/openapi.json",
            },
            run_for_functions: ["deleteRepairs", "listRepairs", "patchRepairs", "createRepair"],
          },
        ],
        functions: [
          {
            name: "listRepairs",
            description: "List all repairs",
          },
          {
            name: "deleteRepairs",
            description: "Delete repairs",
          },
          {
            name: "patchRepairs",
            description: "Patch repairs",
          },
          {
            name: "createRepair",
            description: "Create repairs",
          },
        ],
      } as any);

      vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
        APIs: [
          {
            api: "GET /repairs",
            server: "https://example.com",
            operationId: "listRepairs",
            isValid: true,
            reason: [],
            summary: "List all repairs",
            description: "It is used to list all repairs",
          },
          {
            api: "POST /repairs",
            server: "https://example.com",
            operationId: "createRepair",
            isValid: true,
            reason: [],
          },
          {
            api: "DELETE /repairs",
            server: "https://example.com",
            operationId: "deleteRepairs",
            isValid: true,
            reason: [],
            description: "It is used to delete a repair",
          },
          {
            api: "PATCH /repairs",
            server: "https://example.com",
            operationId: "patchRepairs",
            isValid: false,
            reason: [],
            summary: "Patch a repair",
            description: "It is used to patch a repair",
          },
          {
            api: "Put /repairs",
            server: "https://example.com",
            operationId: "putRepairs",
            isValid: true,
            reason: [],
            summary: "Put a repair",
            description: "It is used to put a repair",
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });

      const res = await copilotGptManifestUtils.addAction("testPath", "testId", "testFile");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const updatedManifest = res.value;
        chai.assert.deepEqual(updatedManifest.actions![0], {
          id: "testId",
          file: "testFile",
        });

        chai.assert.deepEqual(updatedManifest.conversation_starters, [
          {
            text: "List all repairs",
          },
          {
            text: "It is used to delete a repair",
          },
        ]);
      }
    });

    it("add plugin success - parse conversation_starters in open api spec file with undefined existing conversation starter", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(gptManifest) as any);
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(fs, "readJson").mockResolvedValue({
        capabilities: {},
        runtimes: [
          {
            type: "OpenApi",
            auth: {
              type: "None",
            },
            spec: {
              url: "apiSpecificationFile/openapi.json",
            },
            run_for_functions: ["listRepairs"],
          },
        ],
        functions: [
          {
            name: "listRepairs",
            description: "List all repairs",
          },
        ],
      } as any);
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);

      vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
        APIs: [
          {
            api: "GET /repairs",
            server: "https://example.com",
            operationId: "listRepairs",
            isValid: true,
            reason: [],
            summary: "List all repairs",
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });

      const res = await copilotGptManifestUtils.addAction("testPath", "testId", "testFile");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const updatedManifest = res.value;
        chai.assert.deepEqual(updatedManifest.actions![0], {
          id: "testId",
          file: "testFile",
        });

        chai.assert.deepEqual(updatedManifest.conversation_starters, [
          {
            text: "List all repairs",
          },
        ]);
      }
    });

    it("add plugin and append conversation starters success - use conversation_starters in action file", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(
        JSON.stringify({
          name: "name${{APP_NAME_SUFFIX}}",
          description: "description",
          conversation_starters: [
            {
              text: "List all repairs1",
            },
          ],
          actions: [
            {
              id: "action_1",
              file: "plugin1.json",
            },
          ],
        }) as any
      );
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(fs, "readJson").mockResolvedValue({
        capabilities: {
          conversation_starters: [
            {
              text: "List all repairs2",
            },
          ],
        },
      } as any);

      const res = await copilotGptManifestUtils.addAction("testPath", "testId", "testFile");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const updatedManifest = res.value;
        chai.assert.deepEqual(updatedManifest.actions![0], {
          id: "action_1",
          file: "plugin1.json",
        });
        chai.assert.deepEqual(updatedManifest.actions![1], {
          id: "testId",
          file: "testFile",
        });

        chai.assert.deepEqual(updatedManifest.conversation_starters, [
          {
            text: "List all repairs1",
          },
          {
            text: "List all repairs2",
          },
        ]);
      }
    });

    it("conversation starters count should less than 6", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(
        JSON.stringify({
          name: "name${{APP_NAME_SUFFIX}}",
          description: "description",
          conversation_starters: [
            {
              text: "List all repairs1",
            },
          ],
          actions: [
            {
              id: "action_1",
              file: "plugin1.json",
            },
          ],
        }) as any
      );
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(fs, "readJson").mockResolvedValue({
        capabilities: {
          conversation_starters: [
            {
              text: "List all repairs2",
            },
            {
              text: "List all repairs3",
            },
            {
              text: "List all repairs4",
            },
            {
              text: "List all repairs5",
            },
            {
              text: "List all repairs6",
            },
            {
              text: "List all repairs7",
            },
          ],
        },
      } as any);

      const res = await copilotGptManifestUtils.addAction("testPath", "testId", "testFile");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const updatedManifest = res.value;
        chai.assert.deepEqual(updatedManifest.actions![0], {
          id: "action_1",
          file: "plugin1.json",
        });
        chai.assert.deepEqual(updatedManifest.actions![1], {
          id: "testId",
          file: "testFile",
        });

        chai.assert.deepEqual(updatedManifest.conversation_starters, [
          {
            text: "List all repairs1",
          },
          {
            text: "List all repairs2",
          },
          {
            text: "List all repairs3",
          },
          {
            text: "List all repairs4",
          },
          {
            text: "List all repairs5",
          },
          {
            text: "List all repairs6",
          },
        ]);
      }
    });

    it("conversation starters should unique", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(
        JSON.stringify({
          name: "name${{APP_NAME_SUFFIX}}",
          description: "description",
          conversation_starters: [
            {
              text: "List all repairs1",
            },
          ],
          actions: [
            {
              id: "action_1",
              file: "plugin1.json",
            },
          ],
        }) as any
      );
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(fs, "readJson").mockResolvedValue({
        capabilities: {
          conversation_starters: [
            {
              text: "List all repairs1",
            },
            {
              text: "List all repairs2",
            },
          ],
        },
      } as any);

      const res = await copilotGptManifestUtils.addAction("testPath", "testId", "testFile");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const updatedManifest = res.value;
        chai.assert.deepEqual(updatedManifest.actions![0], {
          id: "action_1",
          file: "plugin1.json",
        });
        chai.assert.deepEqual(updatedManifest.actions![1], {
          id: "testId",
          file: "testFile",
        });

        chai.assert.deepEqual(updatedManifest.conversation_starters, [
          {
            text: "List all repairs1",
          },
          {
            text: "List all repairs2",
          },
        ]);
      }
    });

    it("add plugin error: read manifest error", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await copilotGptManifestUtils.addAction("testPath", "testId", "testFile");
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof FileNotFoundError);
      }
    });

    it("add plugin error: write file error", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(gptManifest) as any);
      vi.spyOn(fs, "writeFile").mockImplementation(() => {
        throw "some error";
      });
      vi.spyOn(fs, "readJson").mockResolvedValue({} as any);
      const res = await copilotGptManifestUtils.addAction("testPath", "testId", "testFile");
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof WriteFileError);
      }
    });
  });

  describe("getManifest", async () => {
    setTools(new MockTools());
    const context = generateDriverContext(createContext(), {
      platform: Platform.VSCode,
      projectPath: "",
    });
    const mockedContex = new WrapDriverContext(context, "test", "test");
    it("get manifest success", async () => {
      mockedEnvRestore = mockedEnv({
        ["APP_NAME_SUFFIX"]: "test",
      });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(gptManifest) as any);

      const res = await copilotGptManifestUtils.getManifest("testPath", mockedContex);

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.equal("nametest", res.value.name);
      }
    });

    it("get manifest error: file not found", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await copilotGptManifestUtils.getManifest("testPath", mockedContex);
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof FileNotFoundError);
      }
    });

    it("get manifest error: unresolved env error", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(gptManifest) as any);

      const res = await copilotGptManifestUtils.getManifest("testPath", mockedContex);

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof MissingEnvironmentVariablesError);
      }
    });
  });

  describe("validateAgainstSchema", async () => {
    const driverContext = {
      logProvider: new MockedLogProvider(),
      telemetryReporter: new MockedTelemetryReporter(),
      projectPath: "test",
      addTelemetryProperties: () => {},
    };
    it("validate success", async () => {
      const manifest: DeclarativeCopilotManifestSchema = {
        ...gptManifest,
        actions: [
          {
            id: "1",
            file: "testFile",
          },
        ],
      };
      mockedEnvRestore = mockedEnv({
        ["APP_NAME_SUFFIX"]: "test",
      });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(manifest) as any);
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);
      vi.spyOn(pluginManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "1",
          filePath: "testFile",
          validationResult: ["error1"],
        })
      );

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.deepEqual(res.value, {
          id: "1",
          filePath: "testPath",
          validationResult: [],
          actionValidationResult: [
            {
              id: "1",
              filePath: "testFile",
              validationResult: ["error1"],
            },
          ],
          skillValidationResult: [],
        });
      }
    });

    it("validate action error", async () => {
      const manifest: DeclarativeCopilotManifestSchema = {
        ...gptManifest,
        actions: [
          {
            id: "1",
            file: "testFile",
          },
        ],
      };
      mockedEnvRestore = mockedEnv({
        ["APP_NAME_SUFFIX"]: "test",
      });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(manifest) as any);
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);
      vi.spyOn(pluginManifestUtils, "validateAgainstSchema").mockResolvedValue(
        err(new SystemError("error", "error", "error", "error"))
      );

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal("error", res.error.name);
      }
    });

    it("validate schema error", async () => {
      const manifest: DeclarativeCopilotManifestSchema = {
        ...gptManifest,
        actions: [
          {
            id: "1",
            file: "testFile",
          },
        ],
      };
      mockedEnvRestore = mockedEnv({
        ["APP_NAME_SUFFIX"]: "test",
      });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(gptManifest) as any);
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockImplementation(() => {
        throw "error";
      });

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(AppStudioError.ValidationFailedError.name, res.error.name);
      }
    });

    it("error: cannot get manifest", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );
      chai.assert.isTrue(res.isErr());
    });
  });

  describe("logValidationErrors", () => {
    it("skip if no errors", () => {
      const validationRes: DeclarativeCopilotManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: [],
        actionValidationResult: [
          {
            id: "1",
            filePath: "testPath",
            validationResult: [],
          },
          {
            id: "2",
            filePath: "pluginPath",
            validationResult: [],
          },
        ],
        skillValidationResult: [],
      };

      const res = copilotGptManifestUtils.logValidationErrors(validationRes, Platform.VSCode);
      chai.assert.isEmpty(res);
    });

    it("handles undefined skillValidationResult in VSC", () => {
      const validationRes = {
        id: "1",
        filePath: "testPath",
        validationResult: ["error1"],
        actionValidationResult: [],
      } as unknown as DeclarativeCopilotManifestValidationResult;

      const res = copilotGptManifestUtils.logValidationErrors(
        validationRes,
        Platform.VSCode
      ) as string;
      chai.assert.isTrue(res.includes("error1"));
    });

    it("handles undefined skillValidationResult in CLI", () => {
      const validationRes = {
        id: "1",
        filePath: "testPath",
        validationResult: ["error1"],
        actionValidationResult: [],
      } as unknown as DeclarativeCopilotManifestValidationResult;

      const res = copilotGptManifestUtils.logValidationErrors(
        validationRes,
        Platform.CLI
      ) as Array<{ content: string; color: Colors }>;
      chai.assert.isTrue(res.find((item) => item.content.includes("error1")) !== undefined);
    });

    it("log if VSC", () => {
      const validationRes: DeclarativeCopilotManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: ["error1"],
        actionValidationResult: [
          {
            id: "1",
            filePath: "testPath",
            validationResult: ["errorAction1"],
          },
          {
            id: "2",
            filePath: "pluginPath",
            validationResult: ["errorAction2"],
          },
        ],
        skillValidationResult: [],
      };

      const res = copilotGptManifestUtils.logValidationErrors(
        validationRes,
        Platform.VSCode
      ) as string;

      chai.assert.isFalse(res.includes("errorActions2"));
      chai.assert.isTrue(res.includes("error1"));
      chai.assert.isTrue(res.includes("errorAction1"));
    });

    it("log if VSC and action error only", () => {
      const validationRes: DeclarativeCopilotManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: [],
        actionValidationResult: [
          {
            id: "1",
            filePath: "testPath",
            validationResult: ["errorAction1"],
          },
          {
            id: "2",
            filePath: "pluginPath",
            validationResult: ["errorAction2"],
          },
        ],
        skillValidationResult: [],
      };

      const res = copilotGptManifestUtils.logValidationErrors(
        validationRes,
        Platform.VSCode
      ) as string;

      chai.assert.isFalse(res.includes("errorActions2"));
      chai.assert.isTrue(res.includes("errorAction1"));
    });

    it("log if CLI", () => {
      const validationRes: DeclarativeCopilotManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: ["error1"],
        actionValidationResult: [
          {
            id: "1",
            filePath: "testPath",
            validationResult: ["errorAction1"],
          },
        ],
        skillValidationResult: [],
      };

      const res = copilotGptManifestUtils.logValidationErrors(
        validationRes,
        Platform.CLI
      ) as Array<{ content: string; color: Colors }>;
      chai.assert.isTrue(res.find((item) => item.content.includes("error1")) !== undefined);
      chai.assert.isTrue(res.find((item) => item.content.includes("errorAction1")) !== undefined);
      chai.assert.isUndefined(res.find((item) => item.content.includes("errorAction2")));
    });

    it("log if CLI and action error only", () => {
      const validationRes: DeclarativeCopilotManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: [],
        actionValidationResult: [
          {
            id: "1",
            filePath: "testPath",
            validationResult: ["errorAction1"],
          },
          {
            id: "2",
            filePath: "pluginPath",
            validationResult: ["errorAction2"],
          },
        ],
        skillValidationResult: [],
      };

      const res = copilotGptManifestUtils.logValidationErrors(
        validationRes,
        Platform.CLI
      ) as Array<{ content: string; color: Colors }>;
      chai.assert.isTrue(res.find((item) => item.content.includes("errorAction2")) !== undefined);
      chai.assert.isTrue(res.find((item) => item.content.includes("errorAction1")) !== undefined);
    });

    it("log VSC with skill errors", () => {
      const validationRes: DeclarativeCopilotManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: [],
        actionValidationResult: [],
        skillValidationResult: [
          {
            folder: "skills/my-skill",
            filePath: "skills/my-skill/SKILL.md",
            validationResult: ["missing name field", "missing description field"],
          },
        ],
      };

      const res = copilotGptManifestUtils.logValidationErrors(
        validationRes,
        Platform.VSCode
      ) as string;

      chai.assert.isTrue(res.includes("Skill validation"));
      chai.assert.isTrue(res.includes("missing name field"));
      chai.assert.isTrue(res.includes("missing description field"));
      chai.assert.isTrue(res.includes("skills/my-skill/SKILL.md"));
    });

    it("log CLI with skill errors", () => {
      const validationRes: DeclarativeCopilotManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: [],
        actionValidationResult: [],
        skillValidationResult: [
          {
            folder: "skills/my-skill",
            filePath: "skills/my-skill/SKILL.md",
            validationResult: ["skill error1"],
          },
        ],
      };

      const res = copilotGptManifestUtils.logValidationErrors(
        validationRes,
        Platform.CLI
      ) as Array<{ content: string; color: Colors }>;

      chai.assert.isTrue(
        res.find((item) => item.content.includes("Skill validation")) !== undefined
      );
      chai.assert.isTrue(res.find((item) => item.content.includes("skill error1")) !== undefined);
    });

    it("log VSC with skill error uses folder when filePath is empty", () => {
      const validationRes: DeclarativeCopilotManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: [],
        actionValidationResult: [],
        skillValidationResult: [
          {
            folder: "skills/no-md",
            filePath: "",
            validationResult: ["SKILL.md not found"],
          },
        ],
      };

      const res = copilotGptManifestUtils.logValidationErrors(
        validationRes,
        Platform.VSCode
      ) as string;

      chai.assert.isTrue(res.includes("skills/no-md"));
      chai.assert.isTrue(res.includes("SKILL.md not found"));
    });

    it("log CLI with skill error uses folder when filePath is empty", () => {
      const validationRes: DeclarativeCopilotManifestValidationResult = {
        id: "1",
        filePath: "testPath",
        validationResult: [],
        actionValidationResult: [],
        skillValidationResult: [
          {
            folder: "skills/no-md",
            filePath: "",
            validationResult: ["SKILL.md not found"],
          },
        ],
      };

      const res = copilotGptManifestUtils.logValidationErrors(
        validationRes,
        Platform.CLI
      ) as Array<{ content: string; color: Colors }>;

      chai.assert.isTrue(res.find((item) => item.content.includes("skills/no-md")) !== undefined);
    });
  });

  describe("getManifestPath", async () => {
    setTools(new MockTools());
    const context = generateDriverContext(createContext(), {
      platform: Platform.VSCode,
      projectPath: "",
    });

    it("get manifest success", async () => {
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        ok({
          copilotExtensions: {
            declarativeCopilots: [
              {
                file: "test",
                id: "1",
              },
            ],
          },
        } as any)
      );
      vi.spyOn(path, "dirname").mockReturnValue("testFolder");
      vi.spyOn(path, "resolve").mockReturnValue("testFolder/test");

      const res = await copilotGptManifestUtils.getManifestPath("testPath");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.equal(res.value, "testFolder/test");
      }
    });

    it("get manifest success - copilot agent", async () => {
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        ok({
          copilotAgents: {
            declarativeAgents: [
              {
                file: "test",
                id: "1",
              },
            ],
          },
        } as any)
      );
      vi.spyOn(path, "dirname").mockReturnValue("testFolder");
      vi.spyOn(path, "resolve").mockReturnValue("testFolder/test");

      const res = await copilotGptManifestUtils.getManifestPath("testPath");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.equal(res.value, "testFolder/test");
      }
    });

    it("declarativeAgents error 1", async () => {
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        ok({
          copilotAgents: {},
        } as any)
      );
      const res = await copilotGptManifestUtils.getManifestPath("testPath");
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof UserError);
      }
    });

    it("declarativeAgents error 2", async () => {
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok({} as any));
      const res = await copilotGptManifestUtils.getManifestPath("testPath");
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof UserError);
      }
    });

    it("declarativeCopilots error 1", async () => {
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        ok({
          copilotExtensions: {},
        } as any)
      );
      const res = await copilotGptManifestUtils.getManifestPath("testPath");
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof UserError);
      }
    });

    it("read Teams manifest error", async () => {
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        err(new UserError("readError", "readError", "", ""))
      );

      const res = await copilotGptManifestUtils.getManifestPath("testPath");

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, "readError");
      }
    });

    it("missing file property", async () => {
      vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
        ok({
          copilotExtensions: {
            declarativeCopilots: [
              {
                id: "1",
              },
            ],
          },
        } as any)
      );

      const res = await copilotGptManifestUtils.getManifestPath("testPath");

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.equal(res.error.name, AppStudioError.TeamsAppRequiredPropertyMissingError.name);
      }
    });
  });

  describe("getDefaultNextAvailablePluginManifestPath", async () => {
    setTools(new MockTools());
    const context = generateDriverContext(createContext(), {
      platform: Platform.VSCode,
      projectPath: "",
    });

    it("Success on second try", async () => {
      vi.spyOn(fs, "pathExists")
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const res = await copilotGptManifestUtils.getDefaultNextAvailablePluginManifestPath("test");
      chai.assert.equal(res, path.join("test", "ai-plugin_2.json"));
    });

    it("Success on first try", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const res = await copilotGptManifestUtils.getDefaultNextAvailablePluginManifestPath("test");
      chai.assert.equal(res, path.join("test", "ai-plugin_1.json"));
    });
  });

  describe("add knowledge for Copilot connector", async () => {
    setTools(new MockTools());
    const context = generateDriverContext(createContext(), {
      platform: Platform.VSCode,
      projectPath: "",
    });

    const agentManifestPath = "test/agentManifestPath";
    let manifestRes: Result<DeclarativeCopilotManifestSchema, FxError>;

    it("happy path", async () => {
      vi.spyOn(copilotGptManifestUtils, "writeCopilotGptManifestFile").mockResolvedValue(
        new Ok(undefined)
      );
      const connectionIds = ["connectionId1", "connectionId2"];
      const manifest: DeclarativeCopilotManifestSchema = {
        name: "name${{APP_NAME_SUFFIX}}",
        description: "description",
        capabilities: [
          {
            name: DeclarativeCopilotCapabilityName.GraphConnectors,
            connections: [
              {
                connection_id: "123",
              },
            ],
          },
        ],
      };
      const res = await copilotGptManifestUtils.addGCCapability(
        agentManifestPath,
        connectionIds,
        new Ok(manifest)
      );
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.deepEqual(manifest, {
          name: "name${{APP_NAME_SUFFIX}}",
          description: "description",
          capabilities: [
            {
              name: DeclarativeCopilotCapabilityName.GraphConnectors,
              connections: [
                {
                  connection_id: "123",
                },
                {
                  connection_id: "connectionId1",
                },
                {
                  connection_id: "connectionId2",
                },
              ],
            },
          ],
        });
      }
    });

    it("duplicated id", async () => {
      vi.spyOn(copilotGptManifestUtils, "writeCopilotGptManifestFile").mockResolvedValue(
        new Ok(undefined)
      );
      const connectionIds = ["123"];
      const manifest: DeclarativeCopilotManifestSchema = {
        name: "name${{APP_NAME_SUFFIX}}",
        description: "description",
        capabilities: [
          {
            name: DeclarativeCopilotCapabilityName.GraphConnectors,
            connections: [
              {
                connection_id: "123",
              },
            ],
          },
        ],
      };
      const res = await copilotGptManifestUtils.addGCCapability(
        agentManifestPath,
        connectionIds,
        new Ok(manifest)
      );
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.deepEqual(manifest, {
          name: "name${{APP_NAME_SUFFIX}}",
          description: "description",
          capabilities: [
            {
              name: DeclarativeCopilotCapabilityName.GraphConnectors,
              connections: [
                {
                  connection_id: "123",
                },
              ],
            },
          ],
        });
      }
    });

    it("empty capability", async () => {
      vi.spyOn(copilotGptManifestUtils, "writeCopilotGptManifestFile").mockResolvedValue(
        new Ok(undefined)
      );
      const connectionIds = ["123"];
      const manifest: DeclarativeCopilotManifestSchema = {
        name: "name${{APP_NAME_SUFFIX}}",
        description: "description",
      };
      const res = await copilotGptManifestUtils.addGCCapability(
        agentManifestPath,
        connectionIds,
        new Ok(manifest)
      );
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.deepEqual(manifest, {
          name: "name${{APP_NAME_SUFFIX}}",
          description: "description",
          capabilities: [
            {
              name: DeclarativeCopilotCapabilityName.GraphConnectors,
              connections: [
                {
                  connection_id: "123",
                },
              ],
            },
          ],
        });
      }
    });

    it("error manifest", async () => {
      const res = await copilotGptManifestUtils.addGCCapability(
        agentManifestPath,
        ["123"],
        new Err("manifest") as any
      );
      chai.assert.isFalse(res.isOk());
    });
  });

  describe("addEmbeddedKnowledgeFiles", () => {
    setTools(new MockTools());
    const context = generateDriverContext(createContext(), {
      platform: Platform.VSCode,
      projectPath: "",
    });
    it("should add embedded knowledge files successfully - empty declarative agent manifest", async () => {
      const manifestFilePath = "test/manifest.json";
      const resolvedManifestPath = "test/resolvedManifest.json";
      const manifest: any = {};

      vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
        ok(resolvedManifestPath)
      );
      vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
        ok(manifest)
      );
      const writeStub = vi
        .spyOn(copilotGptManifestUtils, "writeCopilotGptManifestFile")
        .mockResolvedValue(ok(undefined));
      const ensureDirStub = vi.spyOn(fs, "ensureDir").mockResolvedValue();
      const copyFileStub = vi.spyOn(fs, "copyFile").mockResolvedValue();

      const filePathList = ["dummy.txt"];
      const result = await copilotGptManifestUtils.addEmbeddedKnowledgeFiles(
        manifestFilePath,
        filePathList
      );
      chai.assert.isTrue(result.isOk());

      const expectedDir = path.resolve(
        path.dirname(manifestFilePath),
        EmbeddedKnowledgeLocalDirectoryName
      );
      expect(ensureDirStub).toHaveBeenCalledWith(expectedDir);

      const expectedSavedPath = path.resolve(
        path.dirname(manifestFilePath),
        EmbeddedKnowledgeLocalDirectoryName,
        path.basename("dummy.txt")
      );

      chai.assert.isArray(manifest.capabilities);
      const capability = manifest.capabilities.find(
        (cap: any) => cap.name === DeclarativeCopilotCapabilityName.EmbeddedKnowledge
      );
      chai.assert.exists(capability);
      chai.assert.isArray(capability.files);
      const expectedRelativePath = path
        .relative(path.dirname(manifestFilePath), expectedSavedPath)
        .replace(/\\/g, "/");
      chai.assert.equal(capability.files[0].file, expectedRelativePath);

      expect(writeStub).toHaveBeenCalledWith(manifest, resolvedManifestPath);
    });

    it("should add embedded knowledge files successfully - declarative agent manifest with knowledge", async () => {
      const manifestFilePath = "test/manifest.json";
      const resolvedManifestPath = "test/resolvedManifest.json";
      const manifest: any = {
        capabilities: [
          {
            name: DeclarativeCopilotCapabilityName.EmbeddedKnowledge,
            files: [{ file: "existing.txt" }],
          },
        ],
      };

      vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
        ok(resolvedManifestPath)
      );
      vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
        ok(manifest)
      );
      const writeStub = vi
        .spyOn(copilotGptManifestUtils, "writeCopilotGptManifestFile")
        .mockResolvedValue(ok(undefined));
      const ensureDirStub = vi.spyOn(fs, "ensureDir").mockResolvedValue();
      const copyFileStub = vi.spyOn(fs, "copyFile").mockResolvedValue();

      const filePathList = ["dummy.txt"];
      const result = await copilotGptManifestUtils.addEmbeddedKnowledgeFiles(
        manifestFilePath,
        filePathList
      );
      chai.assert.isTrue(result.isOk());

      const expectedDir = path.resolve(
        path.dirname(manifestFilePath),
        EmbeddedKnowledgeLocalDirectoryName
      );
      expect(ensureDirStub).toHaveBeenCalledWith(expectedDir);

      const expectedSavedPath = path.resolve(
        path.dirname(manifestFilePath),
        EmbeddedKnowledgeLocalDirectoryName,
        path.basename("dummy.txt")
      );

      chai.assert.isArray(manifest.capabilities);
      const capability = manifest.capabilities.find(
        (cap: any) => cap.name === DeclarativeCopilotCapabilityName.EmbeddedKnowledge
      );
      chai.assert.exists(capability);
      chai.assert.isArray(capability.files);
      chai.assert.equal(capability.files.length, 2);
      chai.assert.isTrue(capability.files[0].file == "existing.txt");
      const expectedRelativePath = path
        .relative(path.dirname(manifestFilePath), expectedSavedPath)
        .replace(/\\/g, "/");
      chai.assert.equal(capability.files[1].file, expectedRelativePath);
      expect(writeStub).toHaveBeenCalledWith(manifest, resolvedManifestPath);
    });

    it("should return error if getManifestPath fails", async () => {
      const fackeErr = new SystemError("FakeError", "getManifestPath failed", "test", "");
      vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(err(fackeErr));
      const result = await copilotGptManifestUtils.addEmbeddedKnowledgeFiles("test/manifest.json", [
        "dummy.txt",
      ]);
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.deepEqual(result.error, fackeErr);
      }
    });
    it("should return error if readCopilotGptManifestFile fails", async () => {
      const resolvedManifestPath = "test/resolvedManifest.json";
      vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
        ok(resolvedManifestPath)
      );
      const fackeErr = new SystemError(
        "FakeError",
        "readCopilotGptManifestFile failed",
        "test",
        ""
      );
      vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
        err(fackeErr)
      );
      const result = await copilotGptManifestUtils.addEmbeddedKnowledgeFiles("test/manifest.json", [
        "dummy.txt",
      ]);
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.deepEqual(result.error, fackeErr);
      }
    });
  });

  describe("add knowledge for Web Content and OneDrive and Sharepoint", () => {
    setTools(new MockTools());
    afterEach(async () => {
      if (await fs.pathExists("fake agent manifest path")) {
        await fs.unlink("fake agent manifest path");
      }
      vi.restoreAllMocks();
    });

    it("happy path: manifestRes has no capabilities for addOrUpdateCapability ", async () => {
      const agentManifest: DeclarativeCopilotManifestSchema = {
        name: "name${{APP_NAME_SUFFIX}}",
        description: "description",
      };
      const res = await copilotGptManifestUtils.addOrUpdateCapability(
        "fake agent manifest path",
        DeclarativeCopilotCapabilityName.WebSearch,
        ok(agentManifest),
        {}
      );
      chai.assert.isTrue(res.isOk());
    });

    it("error path: manifestRes is error", async () => {
      let res = await copilotGptManifestUtils.addOneDriveSharePointCapability(
        "fake agent manifest path",
        null,
        null,
        err(new UserError("fake error", "fake error", "fake error", "fake error"))
      );
      chai.assert.isTrue(res.isErr());

      res = await copilotGptManifestUtils.addWebSearchCapability(
        context,
        "fake agent manifest path",
        null,
        err(new UserError("fake error", "fake error", "fake error", "fake error"))
      );
      chai.assert.isTrue(res.isErr());
    });

    it("error path: manifestRes error for addOrUpdateCapability ", async () => {
      const res = await copilotGptManifestUtils.addOrUpdateCapability(
        "fake agent manifest path",
        DeclarativeCopilotCapabilityName.WebSearch,
        err(new UserError("fake error", "fake error", "fake error", "fake error")),
        {}
      );
      chai.assert.isTrue(res.isErr());
    });

    it("error path: updateGptManifestRes error for addOrUpdateCapability ", async () => {
      const agentManifest: DeclarativeCopilotManifestSchema = {
        name: "name${{APP_NAME_SUFFIX}}",
        description: "description",
        capabilities: [
          {
            name: DeclarativeCopilotCapabilityName.WebSearch,
          },
        ],
      };

      vi.spyOn(copilotGptManifestUtils, "writeCopilotGptManifestFile").mockResolvedValue(
        err(new UserError("fake error", "fake error", "fake error", "fake error"))
      );
      const res = await copilotGptManifestUtils.addOrUpdateCapability(
        "fake agent manifest path",
        DeclarativeCopilotCapabilityName.WebSearch,
        ok(agentManifest),
        {}
      );
      chai.assert.isTrue(res.isErr());
    });
  });

  describe("readCopilotGptManifestFileSync", () => {
    it("should read manifest file successfully", () => {
      const manifest = {
        name: "name${{APP_NAME_SUFFIX}}",
        description: "description",
      };
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(manifest));

      const res = copilotGptManifestUtils.readCopilotGptManifestFileSync("testPath");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.deepEqual(res.value, manifest);
      }
    });

    it("should return FileNotFoundError if file does not exist", () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);

      const res = copilotGptManifestUtils.readCopilotGptManifestFileSync("testPath");

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof FileNotFoundError);
      }
    });

    it("should return JSONSyntaxError if JSON parse fails", () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("invalid json");

      const res = copilotGptManifestUtils.readCopilotGptManifestFileSync("testPath");

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof JSONSyntaxError);
      }
    });

    it("should return JSONSyntaxError if manifest has invalid shape (#15837)", () => {
      // Reproduces issue #15837: capabilities provided as object instead of array.
      // The typed converter throws a descriptive error instead of letting the bad value
      // propagate to a downstream `.filter is not a function` TypeError.
      const badManifest = {
        version: "v1.6",
        name: "test",
        description: "test",
        capabilities: { name: "CodeInterpreter" },
      };
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(badManifest));

      const res = copilotGptManifestUtils.readCopilotGptManifestFileSync("testPath");

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof JSONSyntaxError);
      }
    });
  });

  describe("readDeclarativeAgentManifestFile", async () => {
    it("should read manifest file successfully", async () => {
      const manifest = {
        schema: "schema",
        description: "description",
      } as any;
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(manifest) as any);
      vi.spyOn(DeclarativeAgentManifestConverter, "jsonToManifest").mockReturnValue(
        manifest as any
      );

      const res = await copilotGptManifestUtils.readDeclarativeAgentManifestFile("testPath");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.deepEqual(res.value, manifest);
      }
    });

    it("should return FileNotFoundError if file does not exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);

      const res = await copilotGptManifestUtils.readDeclarativeAgentManifestFile("testPath");

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof FileNotFoundError);
      }
    });

    it("should return JSONSyntaxError if manifest conversion fails", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue("invalid json" as any);

      const res = await copilotGptManifestUtils.readDeclarativeAgentManifestFile("testPath");

      chai.assert.isTrue(res.isErr());
    });
  });

  describe("readDeclarativeAgentManifestFileSync", () => {
    it("should read manifest file successfully", () => {
      const manifest = {
        schema: "schema",
        description: "description",
      } as any;
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue(JSON.stringify(manifest));
      vi.spyOn(DeclarativeAgentManifestConverter, "jsonToManifest").mockReturnValue(
        manifest as any
      );

      const res = copilotGptManifestUtils.readDeclarativeAgentManifestFileSync("testPath");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.deepEqual(res.value, manifest);
      }
    });

    it("should return FileNotFoundError if file does not exist", () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);

      const res = copilotGptManifestUtils.readDeclarativeAgentManifestFileSync("testPath");

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof FileNotFoundError);
      }
    });

    it("should return JSONSyntaxError if manifest conversion fails", () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      vi.spyOn(fs, "readFileSync").mockReturnValue("invalid json");

      const res = copilotGptManifestUtils.readDeclarativeAgentManifestFileSync("testPath");

      chai.assert.isTrue(res.isErr());
    });
  });

  describe("writeDeclarativeAgentManifestFile", async () => {
    it("write manifest successfully", async () => {
      const manifest = {
        schema: "schema",
        description: "description",
      };
      const convertedJson = '{"schema":"schema","description":"description"}';
      vi.spyOn(DeclarativeAgentManifestConverter, "manifestToJson").mockReturnValue(convertedJson);
      vi.spyOn(fs, "writeFile").mockResolvedValue();

      const res = await copilotGptManifestUtils.writeDeclarativeAgentManifestFile(
        manifest as any,
        "testPath"
      );

      chai.assert.isTrue(res.isOk());
    });

    it("write manifest error: write file error", async () => {
      const manifest = {
        schema: "schema",
        description: "description",
      };
      const convertedJson = '{"schema":"schema","description":"description"}';
      vi.spyOn(DeclarativeAgentManifestConverter, "manifestToJson").mockReturnValue(convertedJson);
      vi.spyOn(fs, "writeFile").mockImplementation(() => {
        throw "some error";
      });

      const res = await copilotGptManifestUtils.writeDeclarativeAgentManifestFile(
        manifest as any,
        "testPath"
      );

      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof WriteFileError);
      }
    });
  });

  describe("addSkill", () => {
    it("adds skill entry to manifest and writes file", async () => {
      const manifest: DeclarativeCopilotManifestSchema = {
        name: "test-agent",
        description: "description",
      };
      vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
        ok(manifest)
      );
      vi.spyOn(copilotGptManifestUtils, "writeCopilotGptManifestFile").mockResolvedValue(
        ok(undefined)
      );

      const res = await copilotGptManifestUtils.addSkill("testPath", "./skills/mySkill");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const manifestAny = res.value as any;
        chai.assert.isArray(manifestAny["agent_skills"]);
        chai.assert.lengthOf(manifestAny["agent_skills"], 1);
        chai.assert.deepEqual(manifestAny["agent_skills"][0], {
          folder: "./skills/mySkill",
        });
      }
    });

    it("prevents duplicate entries", async () => {
      const manifest: any = {
        name: "test-agent",
        description: "description",
        agent_skills: [{ folder: "./skills/mySkill" }],
      };
      vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
        ok(manifest as DeclarativeCopilotManifestSchema)
      );
      vi.spyOn(copilotGptManifestUtils, "writeCopilotGptManifestFile").mockResolvedValue(
        ok(undefined)
      );

      const res = await copilotGptManifestUtils.addSkill("testPath", "./skills/mySkill");

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const manifestAny = res.value as any;
        chai.assert.lengthOf(manifestAny["agent_skills"], 1);
      }
    });

    it("returns error when readCopilotGptManifestFile fails", async () => {
      vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
        err(new UserError("test", "test", "test", "test"))
      );

      const res = await copilotGptManifestUtils.addSkill("testPath", "./skills/mySkill");

      chai.assert.isTrue(res.isErr());
    });

    it("returns error when writeCopilotGptManifestFile fails", async () => {
      const manifest: DeclarativeCopilotManifestSchema = {
        name: "test-agent",
        description: "description",
      };
      vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
        ok(manifest)
      );
      vi.spyOn(copilotGptManifestUtils, "writeCopilotGptManifestFile").mockResolvedValue(
        err(new UserError("test", "test", "test", "test"))
      );

      const res = await copilotGptManifestUtils.addSkill("testPath", "./skills/mySkill");

      chai.assert.isTrue(res.isErr());
    });
  });

  describe("validateAgainstSchema - skill validation", () => {
    const driverContext = {
      logProvider: new MockedLogProvider(),
      telemetryReporter: new MockedTelemetryReporter(),
      projectPath: "test",
      addTelemetryProperties: () => {},
    };

    it("validates skill folder exists", async () => {
      const manifest: any = {
        name: "test-agent",
        description: "description",
        agent_skills: [{ folder: "./skills/missing" }],
      };
      mockedEnvRestore = mockedEnv({ ["APP_NAME_SUFFIX"]: "test" });
      vi.spyOn(fs, "pathExists").mockImplementation(async (p: string) => {
        if (typeof p === "string" && p.includes("missing")) {
          return false;
        }
        return true;
      });
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(manifest) as any);
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.lengthOf(res.value.skillValidationResult, 1);
        chai.assert.isTrue(
          res.value.skillValidationResult[0].validationResult.some((r) =>
            r.includes("Skill folder not found")
          )
        );
      }
    });

    it("validates SKILL.md exists in skill folder", async () => {
      const manifest: any = {
        name: "test-agent",
        description: "description",
        agent_skills: [{ folder: "./skills/noSkillMd" }],
      };
      mockedEnvRestore = mockedEnv({ ["APP_NAME_SUFFIX"]: "test" });
      vi.spyOn(fs, "pathExists").mockImplementation(async (p: string) => {
        if (typeof p === "string" && p.includes("SKILL.md")) {
          return false;
        }
        return true;
      });
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(manifest) as any);
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.lengthOf(res.value.skillValidationResult, 1);
        chai.assert.isTrue(
          res.value.skillValidationResult[0].validationResult.some((r) =>
            r.includes("SKILL.md not found")
          )
        );
      }
    });

    it("validates SKILL.md has name in frontmatter", async () => {
      const manifest: any = {
        name: "test-agent",
        description: "description",
        agent_skills: [{ folder: "./skills/mySkill" }],
      };
      mockedEnvRestore = mockedEnv({ ["APP_NAME_SUFFIX"]: "test" });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const skillMdContent = "---\ndescription: some desc\n---\n# content";
      const readFileStub = vi.spyOn(fs, "readFile");
      readFileStub.mockImplementation(async (p: any, _opts?: any) => {
        if (typeof p === "string" && p.includes("SKILL.md")) {
          return skillMdContent as any;
        }
        return JSON.stringify(manifest) as any;
      });
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.lengthOf(res.value.skillValidationResult, 1);
        chai.assert.isTrue(
          res.value.skillValidationResult[0].validationResult.some((r) =>
            r.includes("missing required field 'name'")
          )
        );
      }
    });

    it("validates SKILL.md has description in frontmatter", async () => {
      const manifest: any = {
        name: "test-agent",
        description: "description",
        agent_skills: [{ folder: "./skills/mySkill" }],
      };
      mockedEnvRestore = mockedEnv({ ["APP_NAME_SUFFIX"]: "test" });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const skillMdContent = "---\nname: mySkill\n---\n# content";
      const readFileStub = vi.spyOn(fs, "readFile");
      readFileStub.mockImplementation(async (p: any, _opts?: any) => {
        if (typeof p === "string" && p.includes("SKILL.md")) {
          return skillMdContent as any;
        }
        return JSON.stringify(manifest) as any;
      });
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.lengthOf(res.value.skillValidationResult, 1);
        chai.assert.isTrue(
          res.value.skillValidationResult[0].validationResult.some((r) =>
            r.includes("missing required field 'description'")
          )
        );
      }
    });

    it("no errors when skills are valid", async () => {
      const manifest: any = {
        name: "test-agent",
        description: "description",
        agent_skills: [{ folder: "./skills/mySkill" }],
      };
      mockedEnvRestore = mockedEnv({ ["APP_NAME_SUFFIX"]: "test" });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const skillMdContent = "---\nname: mySkill\ndescription: A valid skill\n---\n# content";
      const readFileStub = vi.spyOn(fs, "readFile");
      readFileStub.mockImplementation(async (p: any, _opts?: any) => {
        if (typeof p === "string" && p.includes("SKILL.md")) {
          return skillMdContent as any;
        }
        return JSON.stringify(manifest) as any;
      });
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.lengthOf(res.value.skillValidationResult, 1);
        chai.assert.lengthOf(res.value.skillValidationResult[0].validationResult, 0);
      }
    });

    it("no errors when no skills present", async () => {
      const manifest: DeclarativeCopilotManifestSchema = {
        name: "test-agent",
        description: "description",
      };
      mockedEnvRestore = mockedEnv({ ["APP_NAME_SUFFIX"]: "test" });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(JSON.stringify(manifest) as any);
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.lengthOf(res.value.skillValidationResult, 0);
      }
    });

    it("parses standard YAML frontmatter via validation", async () => {
      const manifest: any = {
        name: "test-agent",
        description: "description",
        agent_skills: [{ folder: "./skills/mySkill" }],
      };
      mockedEnvRestore = mockedEnv({ ["APP_NAME_SUFFIX"]: "test" });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const skillMdContent =
        "---\nname: mySkill\ndescription: My great skill\nauthor: test\n---\n# Skill";
      const readFileStub = vi.spyOn(fs, "readFile");
      readFileStub.mockImplementation(async (p: any, _opts?: any) => {
        if (typeof p === "string" && p.includes("SKILL.md")) {
          return skillMdContent as any;
        }
        return JSON.stringify(manifest) as any;
      });
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.lengthOf(res.value.skillValidationResult[0].validationResult, 0);
      }
    });

    it("returns empty for content without frontmatter via validation", async () => {
      const manifest: any = {
        name: "test-agent",
        description: "description",
        agent_skills: [{ folder: "./skills/mySkill" }],
      };
      mockedEnvRestore = mockedEnv({ ["APP_NAME_SUFFIX"]: "test" });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const skillMdContent = "# Just some markdown\nNo frontmatter here";
      const readFileStub = vi.spyOn(fs, "readFile");
      readFileStub.mockImplementation(async (p: any, _opts?: any) => {
        if (typeof p === "string" && p.includes("SKILL.md")) {
          return skillMdContent as any;
        }
        return JSON.stringify(manifest) as any;
      });
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        // Both name and description should be missing
        chai.assert.lengthOf(res.value.skillValidationResult[0].validationResult, 2);
        chai.assert.isTrue(
          res.value.skillValidationResult[0].validationResult.some((r) =>
            r.includes("missing required field 'name'")
          )
        );
        chai.assert.isTrue(
          res.value.skillValidationResult[0].validationResult.some((r) =>
            r.includes("missing required field 'description'")
          )
        );
      }
    });

    it("returns empty for malformed frontmatter via validation", async () => {
      const manifest: any = {
        name: "test-agent",
        description: "description",
        agent_skills: [{ folder: "./skills/mySkill" }],
      };
      mockedEnvRestore = mockedEnv({ ["APP_NAME_SUFFIX"]: "test" });
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      // Frontmatter with opening --- but no closing ---
      const skillMdContent = "---\nname: mySkill\ndescription: test\n# No closing delimiter";
      const readFileStub = vi.spyOn(fs, "readFile");
      readFileStub.mockImplementation(async (p: any, _opts?: any) => {
        if (typeof p === "string" && p.includes("SKILL.md")) {
          return skillMdContent as any;
        }
        return JSON.stringify(manifest) as any;
      });
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);

      const res = await copilotGptManifestUtils.validateAgainstSchema(
        { id: "1", file: "file" },
        "testPath",
        driverContext as any
      );

      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        // Malformed frontmatter -> both fields missing
        chai.assert.lengthOf(res.value.skillValidationResult[0].validationResult, 2);
      }
    });
  });
});
