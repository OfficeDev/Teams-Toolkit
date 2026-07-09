// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import * as util from "util";

import { err, ok } from "@microsoft/teamsfx-api";
import * as localizeUtils from "../../../../src/common/localizeUtils";
import { getLocalizedString } from "../../../../src/common/localizeUtils";
import { CreateOrUpdateEnvironmentFileDriver } from "../../../../src/component/driver/file/createOrUpdateEnvironmentFile";
import { pathUtils } from "../../../../src/component/utils/pathUtils";
import {
  InvalidActionInputError,
  UnhandledError,
  UserCancelError,
} from "../../../../src/error/common";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";
import { chai, vi } from "vitest";

describe("CreateOrUpdateEnvironmentFileDriver", () => {
  const mockedDriverContexts = [
    {
      logProvider: new MockedLogProvider(),
      projectPath: "/path/to/project",
      ui: new MockedUserInteraction(),
    } as any,
    {
      projectPath: "/path/to/project",
    } as any,
  ];
  const driver = new CreateOrUpdateEnvironmentFileDriver();

  beforeEach(() => {
    vi.spyOn(localizeUtils, "getDefaultString").mockImplementation((key, ...params) => {
      if (key === "error.yaml.InvalidActionInputError") {
        return util.format("error.yaml.InvalidActionInputError. %s. %s.", ...params);
      } else if (key === "error.common.UnhandledError") {
        return util.format("error.common.UnhandledError. %s. %s", ...params);
      } else if (key === "driver.file.createOrUpdateEnvironmentFile.description") {
        return "driver.file.createOrUpdateEnvironmentFile.description";
      } else if (key === "driver.file.createOrUpdateEnvironmentFile.summary") {
        return util.format("driver.file.createOrUpdateEnvironmentFile.summary. %s.", ...params);
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
    for (const mockedDriverContext of mockedDriverContexts) {
      it("invalid args: empty target", async () => {
        const args: any = {
          target: null,
          envs: {
            key: "value",
          },
        };
        const result = await driver.run(args, mockedDriverContext);
        chai.assert(result.isErr());
        if (result.isErr()) {
          chai.assert(result.error instanceof InvalidActionInputError);
        }
      });

      it("invalid args: envs is not object", async () => {
        const args: any = {
          target: ".env.teamsfx.local",
          envs: "value",
        };
        const result = await driver.run(args, mockedDriverContext);
        chai.assert(result.isErr());
        if (result.isErr()) {
          chai.assert(result.error instanceof InvalidActionInputError);
        }
      });

      it("invalid args: envs is not key value pairs", async () => {
        const args: any = {
          target: ".env.teamsfx.local",
          envs: {
            key1: "value1",
            key2: {
              key3: "value3",
            },
          },
        };
        const result = await driver.run(args, mockedDriverContext);
        chai.assert(result.isErr());
        if (result.isErr()) {
          chai.assert(result.error instanceof InvalidActionInputError);
        }
      });

      it("exception", async () => {
        vi.spyOn(fs, "ensureFile").mockImplementation(() => {
          throw new Error("exception");
        });
        const args: any = {
          target: "path",
          envs: {
            key1: "value1",
            key2: "value2",
          },
        };
        const result = await driver.run(args, mockedDriverContext);
        chai.assert(result.isErr());
        if (result.isErr()) {
          chai.assert(result.error instanceof UnhandledError);
          const message =
            "error.common.UnhandledError. file/createOrUpdateEnvironmentFile. exception.";
          chai.assert(result.error.message, message);
        }
      });

      it("happy path: output to target", async () => {
        const target = path.join(mockedDriverContext.projectPath, ".env.local");
        const existingEnvs = {
          existing1: "value1",
          existing2: "value2",
        };
        let content = Object.entries(existingEnvs)
          .map(([key, value]) => `${key}=${value}`)
          .join(os.EOL);
        vi.spyOn(fs, "ensureFile").mockResolvedValue();
        vi.spyOn(fs, "readFile").mockImplementation(async (path) => {
          return Buffer.from(content);
        });
        vi.spyOn(fs, "writeFile").mockImplementation(async (path, data) => {
          content = data;
        });
        const args: any = {
          target: ".env.local",
          envs: {
            key1: 10,
            key2: true,
            key3: "value3",
          },
        };
        vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(target));
        const result = await driver.run(args, mockedDriverContext);
        chai.assert(result.isOk());
        if (result.isOk()) {
          chai.assert.equal(result.value.size, 3);
          const expectedEnvs = { ...existingEnvs, ...args.envs };
          const expectedContent = Object.entries(expectedEnvs)
            .map(([key, value]) => `${key}=${value}`)
            .join(os.EOL);
          chai.assert.equal(content, expectedContent);
        }
      });
      it("happy path: not env file", async () => {
        const existingEnvs = {
          existing1: "value1",
          existing2: "value2",
        };
        let content = Object.entries(existingEnvs)
          .map(([key, value]) => `${key}=${value}`)
          .join(os.EOL);
        vi.spyOn(fs, "ensureFile").mockResolvedValue();
        vi.spyOn(fs, "readFile").mockImplementation(async (path) => {
          return Buffer.from(content);
        });
        vi.spyOn(fs, "writeFile").mockImplementation(async (path, data) => {
          content = data;
        });
        const args: any = {
          target: "E:\\home\\test\\.env.local",
          envs: {
            key1: 10,
            key2: true,
            key3: "value3",
          },
        };
        vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("fake-path"));
        const result = await driver.run(args, mockedDriverContext);
        chai.assert(result.isOk());
        if (result.isOk()) {
          chai.assert.equal(result.value.size, 0);
          const expectedEnvs = { ...existingEnvs, ...args.envs };
          const expectedContent = Object.entries(expectedEnvs)
            .map(([key, value]) => `${key}=${value}`)
            .join(os.EOL);
          chai.assert.equal(content, expectedContent);
        }
      });
      it("happy path: getEnvFilePath error", async () => {
        const existingEnvs = {
          existing1: "value1",
          existing2: "value2",
        };
        let content = Object.entries(existingEnvs)
          .map(([key, value]) => `${key}=${value}`)
          .join(os.EOL);
        vi.spyOn(fs, "ensureFile").mockResolvedValue();
        vi.spyOn(fs, "readFile").mockImplementation(async (path) => {
          return Buffer.from(content);
        });
        vi.spyOn(fs, "writeFile").mockImplementation(async (path, data) => {
          content = data;
        });
        const args: any = {
          target: "E:\\home\\test\\.env.local",
          envs: {
            key1: 10,
            key2: true,
            key3: "value3",
          },
        };
        vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(err(new UserCancelError()));
        const result = await driver.run(args, mockedDriverContext);
        chai.assert(result.isOk());
        if (result.isOk()) {
          chai.assert.equal(result.value.size, 0);
          const expectedEnvs = { ...existingEnvs, ...args.envs };
          const expectedContent = Object.entries(expectedEnvs)
            .map(([key, value]) => `${key}=${value}`)
            .join(os.EOL);
          chai.assert.equal(content, expectedContent);
        }
      });
    }
  });

  describe("execute", () => {
    beforeEach(() => {
      process.env.TEAMSFX_ENV = "local";
    });

    afterEach(() => {
      delete process.env.TEAMSFX_ENV;
    });

    for (const mockedDriverContext of mockedDriverContexts) {
      it("happy path: output to target", async () => {
        const target = path.join(mockedDriverContext.projectPath, ".env.teamsfx.local");
        const existingEnvs = {
          existing1: "value1",
          existing2: "value2",
        };
        let content = Object.entries(existingEnvs)
          .map(([key, value]) => `${key}=${value}`)
          .join(os.EOL);
        vi.spyOn(fs, "ensureFile").mockImplementation(async (path) => {
          if (path !== target) {
            content = "";
          }
        });
        vi.spyOn(fs, "readFile").mockImplementation(async (path) => {
          if (path === target) {
            return Buffer.from(content);
          }
          return Buffer.from("");
        });
        vi.spyOn(fs, "writeFile").mockImplementation(async (path, data) => {
          if (path === target) {
            content = data;
          }
        });
        const args: any = {
          target: ".env.teamsfx.local",
          envs: {
            key1: 10,
            key2: true,
            key3: "value3",
          },
        };
        vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(target));
        const executionResult = await driver.execute(args, mockedDriverContext);
        chai.assert(executionResult.result.isOk());
        if (executionResult.result.isOk()) {
          chai.assert.equal(executionResult.result.value.size, 3);
          const expectedEnvs = { ...existingEnvs, ...args.envs };
          const expectedContent = Object.entries(expectedEnvs)
            .map(([key, value]) => `${key}=${value}`)
            .join(os.EOL);
          chai.assert.equal(content, expectedContent);
        }
        chai.assert.equal(executionResult.summaries.length, 1);
        chai.assert.include(executionResult.summaries[0], path.normalize(target));
      });
    }
  });

  describe("askForOpenAIEnvironmentVariables", () => {
    let envOutput: Map<string, string>;
    const mockedDriverContext = {
      logProvider: new MockedLogProvider(),
      projectPath: "/path/to/project",
      ui: new MockedUserInteraction(),
    } as any;

    beforeEach(() => {
      envOutput = new Map<string, string>();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("Environment variables provided", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_API_KEY: "fakeApiKey",
          AZURE_OPENAI_ENDPOINT: "https://fakeEndpoint",
          AZURE_OPENAI_DEPLOYMENT_NAME: "fakeDeploymentName",
          AZURE_OPENAI_MODEL_DEPLOYMENT_NAME: "fakeModelDeploymentName",
          OPENAI_API_KEY: "fakeOpenAIKey",
          OPENAI_ASSISTANT_ID: "fakeAssistantId",
          AZURE_OPENAI_ASSISTANT_ID: "fakeAzureAssistantId",
          AZURE_OPENAI_EMBEDDING_DEPLOYMENT: "fakeEmbeddingDeploymentName",
        },
      };

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
      chai.assert.equal(envOutput.size, 0);
    });

    it("should prompt for AZURE_OPENAI_API_KEY and update envOutput", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_API_KEY: "${{ AZURE_OPENAI_API_KEY }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(
        ok({ result: "fakeApiKey" })
      );

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
      chai.assert.equal(envOutput.get("AZURE_OPENAI_API_KEY"), "fakeApiKey");
      chai.assert.equal(args.envs["AZURE_OPENAI_API_KEY"], "fakeApiKey");
    });

    it("should prompt for AZURE_OPENAI_ENDPOINT and update envOutput", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_ENDPOINT: "${{ AZURE_OPENAI_ENDPOINT }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(
        ok({ result: "https://fakeEndpoint" })
      );

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
      chai.assert.equal(envOutput.get("AZURE_OPENAI_ENDPOINT"), "https://fakeEndpoint");
      chai.assert.equal(args.envs["AZURE_OPENAI_ENDPOINT"], "https://fakeEndpoint");
    });

    it("should prompt for AZURE_OPENAI_DEPLOYMENT_NAME and update envOutput", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_DEPLOYMENT_NAME: "${{ AZURE_OPENAI_DEPLOYMENT_NAME }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(
        ok({ result: "fakeDeploymentName" })
      );

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
      chai.assert.equal(envOutput.get("AZURE_OPENAI_DEPLOYMENT_NAME"), "fakeDeploymentName");
      chai.assert.equal(args.envs["AZURE_OPENAI_DEPLOYMENT_NAME"], "fakeDeploymentName");
    });

    it("should prompt for AZURE_OPENAI_MODEL_DEPLOYMENT_NAME and update envOutput", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_MODEL_DEPLOYMENT_NAME: "${{ AZURE_OPENAI_MODEL_DEPLOYMENT_NAME }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(
        ok({ result: "fakeModelDeploymentName" })
      );

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
      chai.assert.equal(
        envOutput.get("AZURE_OPENAI_MODEL_DEPLOYMENT_NAME"),
        "fakeModelDeploymentName"
      );
      chai.assert.equal(args.envs["AZURE_OPENAI_MODEL_DEPLOYMENT_NAME"], "fakeModelDeploymentName");
    });

    it("should prompt for OPENAI_API_KEY and update envOutput", async () => {
      const args = {
        envs: {
          OPENAI_API_KEY: "${{ OPENAI_API_KEY }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(
        ok({ result: "fakeOpenAIKey" })
      );

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
      chai.assert.equal(envOutput.get("OPENAI_API_KEY"), "fakeOpenAIKey");
      chai.assert.equal(args.envs["OPENAI_API_KEY"], "fakeOpenAIKey");
    });

    it("should prompt for OPENAI_ASSISTANT_ID and update envOutput", async () => {
      const args = {
        envs: {
          OPENAI_ASSISTANT_ID: "${{ OPENAI_ASSISTANT_ID }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(
        ok({ result: "fakeAssistantId" })
      );

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
      chai.assert.equal(envOutput.get("OPENAI_ASSISTANT_ID"), "fakeAssistantId");
      chai.assert.equal(args.envs["OPENAI_ASSISTANT_ID"], "fakeAssistantId");
    });

    it("should prompt for AZURE_OPENAI_ASSISTANT_ID and update envOutput", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_ASSISTANT_ID: "${{ AZURE_OPENAI_ASSISTANT_ID }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(
        ok({ result: "fakeAzureAssistantId" })
      );

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
      chai.assert.equal(envOutput.get("AZURE_OPENAI_ASSISTANT_ID"), "fakeAzureAssistantId");
      chai.assert.equal(args.envs["AZURE_OPENAI_ASSISTANT_ID"], "fakeAzureAssistantId");
    });

    it("should prompt for AZURE_OPENAI_EMBEDDING_DEPLOYMENT and update envOutput", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_EMBEDDING_DEPLOYMENT: "${{ AZURE_OPENAI_EMBEDDING_DEPLOYMENT }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(
        ok({ result: "fakeEmbeddingDeploymentName" })
      );

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
      chai.assert.equal(
        envOutput.get("AZURE_OPENAI_EMBEDDING_DEPLOYMENT"),
        "fakeEmbeddingDeploymentName"
      );
      chai.assert.equal(
        args.envs["AZURE_OPENAI_EMBEDDING_DEPLOYMENT"],
        "fakeEmbeddingDeploymentName"
      );
    });

    it("should prompt for GENERAL_ENV_VAR and update envOutput", async () => {
      const args = {
        envs: {
          GENERAL_ENV_VAR: "${{ GENERAL_ENV_VAR }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(
        ok({ result: "fakeGeneralEnvVarValue" })
      );

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
      chai.assert.equal(envOutput.get("GENERAL_ENV_VAR"), "fakeGeneralEnvVarValue");
      chai.assert.equal(args.envs["GENERAL_ENV_VAR"], "fakeGeneralEnvVarValue");
    });

    it("should return error if AZURE_OPENAI_API_KEY inputText fails", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_API_KEY: "${{ AZURE_OPENAI_API_KEY }}",
        },
        target: ".env.teamsfx.local",
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(err(new UserCancelError()));
      const existingEnvs = {
        existing1: "value1",
        existing2: "value2",
      };
      const content = Object.entries(existingEnvs)
        .map(([key, value]) => `${key}=${value}`)
        .join(os.EOL);
      vi.spyOn(fs, "ensureFile").mockResolvedValue();
      vi.spyOn(fs, "readFile").mockImplementation(async (path) => {
        return Buffer.from(content);
      });

      const result = await driver.execute(args, mockedDriverContext);

      chai.assert(result.result.isErr());
    });

    it("should return error if AZURE_OPENAI_ENDPOINT inputText fails", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_ENDPOINT: "${{ AZURE_OPENAI_ENDPOINT }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(err(new UserCancelError()));

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isErr());
    });

    it("should return error if AZURE_OPENAI_DEPLOYMENT_NAME inputText fails", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_DEPLOYMENT_NAME: "${{ AZURE_OPENAI_DEPLOYMENT_NAME }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(err(new UserCancelError()));

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isErr());
    });

    it("should return error if AZURE_OPENAI_MODEL_DEPLOYMENT_NAME inputText fails", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_MODEL_DEPLOYMENT_NAME: "${{ AZURE_OPENAI_MODEL_DEPLOYMENT_NAME }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(err(new UserCancelError()));

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isErr());
    });

    it("should return error if OPENAI_API_KEY inputText fails", async () => {
      const args = {
        envs: {
          OPENAI_API_KEY: "${{ OPENAI_API_KEY }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(err(new UserCancelError()));

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isErr());
    });

    it("should return error if OPENAI_ASSISTANT_ID inputText fails", async () => {
      const args = {
        envs: {
          OPENAI_ASSISTANT_ID: "${{ OPENAI_ASSISTANT_ID }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(err(new UserCancelError()));

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isErr());
    });

    it("should return error if AZURE_OPENAI_ASSISTANT_ID inputText fails", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_ASSISTANT_ID: "${{ AZURE_OPENAI_ASSISTANT_ID }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(err(new UserCancelError()));

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isErr());
    });

    it("should return error if AZURE_OPENAI_EMBEDDING_DEPLOYMENT inputText fails", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_EMBEDDING_DEPLOYMENT: "${{ AZURE_OPENAI_EMBEDDING_DEPLOYMENT }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(err(new UserCancelError()));

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isErr());
    });

    it("should return error if GENERAL_ENV_VAR inputText fails", async () => {
      const args = {
        envs: {
          GENERAL_ENV_VAR: "${{ GENERAL_ENV_VAR }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(err(new UserCancelError()));

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isErr());
    });

    it("should validate OPENAI_API_KEY input and return error if input is empty", async () => {
      const args = {
        envs: {
          OPENAI_API_KEY: "${{ OPENAI_API_KEY }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockImplementation(async (options) => {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        chai.assert.equal(
          validationResult,
          getLocalizedString("driver.file.createOrUpdateEnvironmentFile.OpenAIKey.validation")
        );
        return ok({ result: "" });
      });

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
    });

    it("should validate AZURE_OPENAI_API_KEY input and return error if input is empty", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_API_KEY: "${{ AZURE_OPENAI_API_KEY }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockImplementation(async (options) => {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        chai.assert.equal(
          validationResult,
          getLocalizedString("driver.file.createOrUpdateEnvironmentFile.OpenAIKey.validation")
        );
        return ok({ result: "" });
      });

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
    });

    it("should validate AZURE_OPENAI_ENDPOINT input and return error if input is empty", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_ENDPOINT: "${{ AZURE_OPENAI_ENDPOINT }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockImplementation(async (options) => {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        chai.assert.equal(
          validationResult,
          getLocalizedString(
            "driver.file.createOrUpdateEnvironmentFile.OpenAIDeploymentEndpoint.validation"
          )
        );
        return ok({ result: "" });
      });

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
    });

    it("should validate AZURE_OPENAI_DEPLOYMENT_NAME input and return error if input is empty", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_DEPLOYMENT_NAME: "${{ AZURE_OPENAI_DEPLOYMENT_NAME }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockImplementation(async (options) => {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        chai.assert.equal(
          validationResult,
          getLocalizedString(
            "driver.file.createOrUpdateEnvironmentFile.OpenAIDeploymentName.validation"
          )
        );
        return ok({ result: "" });
      });

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
    });

    it("should validate AZURE_OPENAI_MODEL_DEPLOYMENT_NAME input and return error if input is empty", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_MODEL_DEPLOYMENT_NAME: "${{ AZURE_OPENAI_MODEL_DEPLOYMENT_NAME }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockImplementation(async (options) => {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        chai.assert.equal(
          validationResult,
          getLocalizedString(
            "driver.file.createOrUpdateEnvironmentFile.OpenAIDeploymentName.validation"
          )
        );
        return ok({ result: "" });
      });

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
    });

    it("should validate OPENAI_ASSISTANT_ID input and return error if input is empty", async () => {
      const args = {
        envs: {
          OPENAI_ASSISTANT_ID: "${{ OPENAI_ASSISTANT_ID }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockImplementation(async (options) => {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        chai.assert.equal(
          validationResult,
          getLocalizedString(
            "driver.file.createOrUpdateEnvironmentFile.OpenAIAssistantID.validation"
          )
        );
        return ok({ result: "" });
      });

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
    });

    it("should validate AZURE_OPENAI_ASSISTANT_ID input and return error if input is empty", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_ASSISTANT_ID: "${{ AZURE_OPENAI_ASSISTANT_ID }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockImplementation(async (options) => {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        chai.assert.equal(
          validationResult,
          getLocalizedString(
            "driver.file.createOrUpdateEnvironmentFile.OpenAIAssistantID.validation"
          )
        );
        return ok({ result: "" });
      });

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
    });

    it("should validate AZURE_OPENAI_EMBEDDING_DEPLOYMENT input and return error if input is empty", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_EMBEDDING_DEPLOYMENT: "${{ AZURE_OPENAI_EMBEDDING_DEPLOYMENT }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockImplementation(async (options) => {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        chai.assert.equal(
          validationResult,
          getLocalizedString(
            "driver.file.createOrUpdateEnvironmentFile.OpenAIEmbeddingDeploymentName.validation"
          )
        );
        return ok({ result: "" });
      });

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
    });

    it("should validate GENERAL_ENV_VAR input and return error if input is empty", async () => {
      const args = {
        envs: {
          GENERAL_ENV_VAR: "${{ GENERAL_ENV_VAR }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockImplementation(async (options) => {
        const validationResult = (options as any).validation!(""); // Simulate empty input
        chai.assert.equal(
          validationResult,
          getLocalizedString("driver.file.createOrUpdateEnvironmentFile.genericEnvVar.validation")
        );
        return ok({ result: "" });
      });

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
    });

    it("should handle undefined ctx.ui and empty result values", async () => {
      // Test with undefined ctx.ui
      const argsWithUndefinedUI = {
        envs: {
          AZURE_OPENAI_API_KEY: "${{ AZURE_OPENAI_API_KEY }}",
          AZURE_OPENAI_ENDPOINT: "${{ AZURE_OPENAI_ENDPOINT }}",
        },
      };
      const contextWithoutUI = {
        logProvider: new MockedLogProvider(),
        projectPath: "/path/to/project",
        ui: undefined,
      } as any;

      const resultWithUndefinedUI = await driver.askForOpenAIEnvironmentVariables(
        contextWithoutUI,
        argsWithUndefinedUI,
        envOutput
      );

      chai.assert(resultWithUndefinedUI.isOk());
      chai.assert.equal(envOutput.size, 0);
      chai.assert.equal(
        argsWithUndefinedUI.envs["AZURE_OPENAI_API_KEY"],
        "${{ AZURE_OPENAI_API_KEY }}"
      );
      chai.assert.equal(
        argsWithUndefinedUI.envs["AZURE_OPENAI_ENDPOINT"],
        "${{ AZURE_OPENAI_ENDPOINT }}"
      );

      // Reset for next test
      envOutput.clear();

      // Test with empty result value
      const argsWithEmptyResult = {
        envs: {
          AZURE_OPENAI_API_KEY: "${{ AZURE_OPENAI_API_KEY }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockResolvedValue(ok({ result: "" }));

      const resultWithEmptyValue = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        argsWithEmptyResult,
        envOutput
      );

      chai.assert(resultWithEmptyValue.isOk());
      chai.assert.equal(envOutput.size, 0);
      chai.assert.equal(
        argsWithEmptyResult.envs["AZURE_OPENAI_API_KEY"],
        "${{ AZURE_OPENAI_API_KEY }}"
      );
    });

    it("should validate AZURE_OPENAI_ENDPOINT input and return error for invalid endpoint format", async () => {
      const args = {
        envs: {
          AZURE_OPENAI_ENDPOINT: "${{ AZURE_OPENAI_ENDPOINT }}",
        },
      };
      vi.spyOn(mockedDriverContext.ui!, "inputText").mockImplementation(async (options) => {
        const validationResult = (options as any).validation!("ftp://invalid-endpoint"); // Simulate invalid endpoint
        chai.assert.equal(
          validationResult,
          getLocalizedString(
            "driver.file.createOrUpdateEnvironmentFile.OpenAIDeploymentEndpoint.validation"
          )
        );
        return ok({ result: "ftp://invalid-endpoint" });
      });

      const result = await driver.askForOpenAIEnvironmentVariables(
        mockedDriverContext,
        args,
        envOutput
      );

      chai.assert(result.isOk());
    });
  });
});
