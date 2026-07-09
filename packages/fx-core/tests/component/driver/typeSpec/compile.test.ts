// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  DeclarativeCopilotManifestSchema,
  err,
  ok,
  Platform,
  SystemError,
  TeamsAppManifest,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import { expect, vi } from "vitest";
import * as daSpecParser from "../../../../src/common/daSpecParser";
import * as kiotaClient from "../../../../src/common/kiotaClient";
import { TypeSpecCompileDriver } from "../../../../src/component/driver/typeSpec/compile";
import { TypeSpecCompileArgs } from "../../../../src/component/driver/typeSpec/interface/typeSpecCompileArgs";
import * as openApiSpecHelper from "../../../../src/component/generator/openApiSpec/helper";
import { MockedM365Provider, MockLogProvider, MockTools } from "../../../core/utils";
import { MockedUserInteraction } from "../../../plugins/solution/util";

const tools = new MockTools();
const mockedDriverContext: any = {
  m365TokenProvider: new MockedM365Provider(),
  ui: new MockedUserInteraction(),
  projectPath: "test",
  platform: Platform.VSCode,
  logProvider: new MockLogProvider(),
};
mockedDriverContext.logProvider.outputChannel = {
  show: () => {
    return;
  },
};

describe("typeSpecCompilt", async () => {
  const sandbox = vi;
  let envRestore: RestoreFn | undefined;
  const typeSpecCompileDriver = new TypeSpecCompileDriver();
  const manifest: TeamsAppManifest = {
    manifestVersion: "mockedManifestVersion",
    version: "mockedVersion",
    id: "mockedId",
    developer: {
      name: "mockedName",
      websiteUrl: "mockedWebsiteUrl",
      privacyUrl: "mockedPrivacyUrl",
      termsOfUseUrl: "mockedTermsOfUseUrl",
    },
    name: {
      short: "mockedShortName",
      full: "mockedFullName",
    },
    description: {
      short: "mockedShortDescription",
      full: "mockedFullDescription",
    },
    icons: {
      outline: "mockedOutlineIcon",
      color: "mockedColorIcon",
    },
    accentColor: "mockedAccentColor",
  };

  beforeEach(() => {
    envRestore = mockedEnv({
      TEAMSFX_TYPESPEC: "true",
    });
  });

  afterEach(() => {
    mockedDriverContext.platform = Platform.VSCode;
    vi.restoreAllMocks();
    vi.restoreAllMocks();
    if (envRestore) {
      envRestore();
    }
  });

  it("happy path: with one action", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };
    const pluginManifest: DeclarativeCopilotManifestSchema = {
      id: "mockedId",
      name: "mockedName",
      description: "mockedDescription",
      actions: [
        {
          id: "mockedActionId",
          file: "mockedFile",
        },
      ],
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockReturnValue();
    vi.spyOn(mockedDriverContext.ui, "runCommand").mockResolvedValue(ok("mockedCommandResult"));
    vi.spyOn(fs, "readdirSync")
      .mockReturnValueOnce([
        "test-openapi.yaml",
        "test-apiplugin.json",
        "declarativeAgent.json",
        "manifest.json",
        "specs",
      ] as any)
      .mockReturnValueOnce(["openapi.yaml"] as any)
      .mockReturnValueOnce([
        "test-openapi.yaml",
        "test-apiplugin.json",
        "declarativeAgent.json",
        "manifest.json",
        "specs",
      ] as any);
    vi.spyOn(fs, "readJSON").mockResolvedValueOnce(pluginManifest).mockResolvedValueOnce(manifest);
    vi.spyOn(fs, "writeJSON").mockImplementation((path: string, data: any) => {
      const dataToWrite = JSON.stringify(data);
      expect(dataToWrite.includes("declarativeAgent.json")).to.be.true;
    });
    vi.spyOn(daSpecParser, "parseAndUpdatePluginManifestForKiota").mockResolvedValue([
      {
        authName: "mockedAuthName",
        specPath: "mockedSpecPath",
        registrationId: "mockedRegistrationId",
        authType: "apiKey",
      },
    ]);
    vi.spyOn(openApiSpecHelper, "injectAuthAction").mockResolvedValue(undefined);
    vi.spyOn(kiotaClient, "kiotageneratePlugin").mockResolvedValue({
      aiPlugin: "mocked-ai-plugin",
      openAPISpec: "mocked-openapi-spec",
      isSuccess: true,
      logs: [],
    });
    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
  });

  it("happy path: with one action with oauth", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };
    const pluginManifest: DeclarativeCopilotManifestSchema = {
      id: "mockedId",
      name: "mockedName",
      description: "mockedDescription",
      actions: [
        {
          id: "mockedActionId",
          file: "mockedFile",
        },
      ],
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockReturnValue();
    vi.spyOn(mockedDriverContext.ui, "runCommand").mockResolvedValue(ok("mockedCommandResult"));
    vi.spyOn(fs, "readdirSync")
      .mockReturnValueOnce([
        "test-openapi.yaml",
        "test-apiplugin.json",
        "declarativeAgent.json",
        "manifest.json",
        "specs",
      ] as any)
      .mockReturnValueOnce(["openapi.yaml"] as any)
      .mockReturnValueOnce([
        "test-openapi.yaml",
        "test-apiplugin.json",
        "declarativeAgent.json",
        "manifest.json",
        "specs",
      ] as any);
    vi.spyOn(fs, "readJSON").mockResolvedValueOnce(pluginManifest).mockResolvedValueOnce(manifest);
    vi.spyOn(fs, "writeJSON").mockImplementation((path: string, data: any) => {
      const dataToWrite = JSON.stringify(data);
      expect(dataToWrite.includes("declarativeAgent.json")).to.be.true;
    });
    vi.spyOn(daSpecParser, "parseAndUpdatePluginManifestForKiota").mockResolvedValue([
      {
        authName: "mockedAuthName",
        specPath: "mockedSpecPath",
        registrationId: "mockedRegistrationId",
        authType: "oauth2",
      },
    ]);
    vi.spyOn(openApiSpecHelper, "injectAuthAction").mockResolvedValue(undefined);
    vi.spyOn(kiotaClient, "kiotageneratePlugin").mockResolvedValue({
      aiPlugin: "mocked-ai-plugin",
      openAPISpec: "mocked-openapi-spec",
      isSuccess: true,
      logs: [],
    });
    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
  });

  it("happy path: should fail if update yaml", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };
    const pluginManifest: DeclarativeCopilotManifestSchema = {
      id: "mockedId",
      name: "mockedName",
      description: "mockedDescription",
      actions: [
        {
          id: "mockedActionId",
          file: "mockedFile",
        },
      ],
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockReturnValue();
    vi.spyOn(mockedDriverContext.ui, "runCommand").mockResolvedValue(ok("mockedCommandResult"));
    vi.spyOn(fs, "readdirSync")
      .mockReturnValueOnce([
        "test-openapi.yaml",
        "test-apiplugin.json",
        "declarativeAgent.json",
        "manifest.json",
        "specs",
      ] as any)
      .mockReturnValueOnce(["openapi.yaml"] as any)
      .mockReturnValueOnce([
        "test-openapi.yaml",
        "test-apiplugin.json",
        "declarativeAgent.json",
        "manifest.json",
        "specs",
      ] as any);
    vi.spyOn(fs, "readJSON").mockResolvedValueOnce(pluginManifest).mockResolvedValueOnce(manifest);
    vi.spyOn(fs, "writeJSON").mockImplementation((path: string, data: any) => {
      const dataToWrite = JSON.stringify(data);
      expect(dataToWrite.includes("declarativeAgent.json")).to.be.true;
    });
    vi.spyOn(daSpecParser, "parseAndUpdatePluginManifestForKiota").mockResolvedValue([
      {
        authName: "mockedAuthName",
        specPath: "mockedSpecPath",
        registrationId: "mockedRegistrationId",
        authType: "apiKey",
      },
    ]);
    vi.spyOn(openApiSpecHelper, "injectAuthAction").mockResolvedValue({
      defaultRegistrationIdEnvName: "mockedDefaultRegistrationIdEnvName",
      registrationIdEnvName: "mockedRegistrationIdEnvName",
    });
    vi.spyOn(kiotaClient, "kiotageneratePlugin").mockResolvedValue({
      aiPlugin: "mocked-ai-plugin",
      openAPISpec: "mocked-openapi-spec",
      isSuccess: true,
      logs: [],
    });
    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.be.equal("NeedRedoError");
    }
  });

  it("happy path: with one action in cli", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };
    const pluginManifest: DeclarativeCopilotManifestSchema = {
      id: "mockedId",
      name: "mockedName",
      description: "mockedDescription",
      actions: [
        {
          id: "mockedActionId",
          file: "mockedFile",
        },
      ],
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockReturnValue();
    vi.spyOn(mockedDriverContext.ui, "runCommand").mockResolvedValue(ok("mockedCommandResult"));
    vi.spyOn(fs, "readdirSync").mockReturnValue(["openapi.yaml"] as any);
    vi.spyOn(fs, "readJSON").mockResolvedValueOnce(pluginManifest).mockResolvedValueOnce(manifest);
    vi.spyOn(fs, "writeJSON").mockImplementation((path: string, data: any) => {
      const dataToWrite = JSON.stringify(data);
      expect(dataToWrite.includes("declarativeAgent.json")).to.be.true;
    });
    mockedDriverContext.platform = Platform.CLI;
    vi.spyOn(kiotaClient, "kiotageneratePlugin").mockResolvedValue({
      aiPlugin: "mocked-ai-plugin",
      openAPISpec: "mocked-openapi-spec",
      isSuccess: true,
      logs: [],
    });
    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
  });

  it("happy path: with multiple actions", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };
    const pluginManifest: DeclarativeCopilotManifestSchema = {
      id: "mockedId",
      name: "mockedName",
      description: "mockedDescription",
      actions: [
        {
          id: "mockedaction1",
          file: "mockedAction1-apiplugin.json",
        },
        {
          id: "mockedaction2",
          file: "mockedAction2-apiplugin.json",
        },
      ],
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockReturnValue();
    const runCommandStub = vi
      .spyOn(mockedDriverContext.ui, "runCommand")
      .mockResolvedValue(ok("mockedCommandResult"));
    vi.spyOn(fs, "readdirSync").mockReturnValue([
      "openapi.mockedAction1.yaml",
      "openapi.mockedAction2.yaml",
    ] as any);
    vi.spyOn(fs, "readJSON").mockResolvedValueOnce(pluginManifest).mockResolvedValueOnce(manifest);
    vi.spyOn(fs, "writeJSON").mockImplementation((path: string, data: any) => {
      const dataToWrite = JSON.stringify(data);
      expect(dataToWrite.includes("declarativeAgent.json")).to.be.true;
    });
    vi.spyOn(kiotaClient, "kiotageneratePlugin").mockResolvedValue({
      aiPlugin: "mocked-ai-plugin",
      openAPISpec: "mocked-openapi-spec",
      isSuccess: true,
      logs: [],
    });
    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    expect(runCommandStub.mock.calls.length).to.equal(1);
  });

  it("should throw error if missing input", async () => {
    let result = await typeSpecCompileDriver.execute(
      {
        path: "mockedPath",
        manifestPath: "",
        outputDir: "mockedOutputDir",
        typeSpecConfigPath: "mockedTypeSpecConfigPath",
      },
      mockedDriverContext
    );
    expect(result.result.isErr()).to.be.true;

    result = await typeSpecCompileDriver.execute(
      {
        path: "",
        manifestPath: "mockedManifestPath",
        outputDir: "mockedOutputDir",
        typeSpecConfigPath: "mockedTypeSpecConfigPath",
      },
      mockedDriverContext
    );
    expect(result.result.isErr()).to.be.true;

    result = await typeSpecCompileDriver.execute(
      {
        path: "mockedPath",
        manifestPath: "mockedManifestPath",
        outputDir: "",
        typeSpecConfigPath: "mockedTypeSpecConfigPath",
      },
      mockedDriverContext
    );
    expect(result.result.isErr()).to.be.true;

    result = await typeSpecCompileDriver.execute(
      {
        path: "mockedPath",
        manifestPath: "mockedManifestPath",
        outputDir: "mockedOutputDir",
        typeSpecConfigPath: "",
      },
      mockedDriverContext
    );
    expect(result.result.isErr()).to.be.true;
  });

  it("should throw error if failed to run tsp command", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };
    const pluginManifest: DeclarativeCopilotManifestSchema = {
      id: "mockedId",
      name: "mockedName",
      description: "mockedDescription",
      actions: [
        {
          id: "mockedActionId",
          file: "mockedFile",
        },
      ],
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockReturnValue();
    vi.spyOn(mockedDriverContext.ui, "runCommand").mockReturnValue(
      err(new SystemError("mockedSource", "mockedError", "mockedErrorMessage"))
    );
    vi.spyOn(fs, "readdirSync").mockReturnValue(["openapi.yaml"] as any);
    vi.spyOn(fs, "readJSON").mockResolvedValueOnce(pluginManifest).mockResolvedValueOnce(manifest);
    vi.spyOn(fs, "writeJSON").mockImplementation((path: string, data: any) => {
      const dataToWrite = JSON.stringify(data);
      expect(dataToWrite.includes("declarativeAgent.json")).to.be.true;
    });
    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
  });

  it("should throw TypeSpecCompileError with compiler output when output dir is missing after tsp compile", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };

    const tspCompilerOutput =
      "src/agent/actions/msgraph.tsp:20:83 - error invalid-ref: Namespace Environment doesn't have member AAD_APP_TENANT_ID";

    // existsSync returns false for all calls: output folder doesn't exist before compile,
    // and openApiSpecsFolderPath doesn't exist after compile (compile failed silently)
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    // runCommand returns ok() even though the compile failed (e.g. exit code masked by pipe)
    vi.spyOn(mockedDriverContext.ui, "runCommand").mockResolvedValue(ok(tspCompilerOutput));

    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.be.equal("TypeSpecCompileError");
      expect(result.result.error.message).to.include(tspCompilerOutput);
    }
  });

  it("shoult throw error if no openapi spec generated", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };
    const pluginManifest: DeclarativeCopilotManifestSchema = {
      id: "mockedId",
      name: "mockedName",
      description: "mockedDescription",
      actions: [
        {
          id: "mockedActionId",
          file: "mockedFile",
        },
      ],
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockReturnValue();
    vi.spyOn(mockedDriverContext.ui, "runCommand").mockResolvedValue(ok("mockedCommandResult"));
    vi.spyOn(fs, "readdirSync").mockReturnValue([] as any);
    vi.spyOn(fs, "readJSON").mockResolvedValue(pluginManifest);
    vi.spyOn(fs, "writeJSON").mockImplementation((path: string, data: any) => {
      const dataToWrite = JSON.stringify(data);
      expect(dataToWrite.includes("declarativeAgent.json")).to.be.true;
    });
    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.be.equal("NoSpecError");
    }
  });

  it("shoult skip Kiota if no action in da manifest", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };
    const pluginManifest: DeclarativeCopilotManifestSchema = {
      id: "mockedId",
      name: "mockedName",
      description: "mockedDescription",
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockReturnValue();
    const runCommandStub = vi
      .spyOn(mockedDriverContext.ui, "runCommand")
      .mockResolvedValue(ok("mockedCommandResult"));
    vi.spyOn(fs, "readdirSync").mockReturnValue(["openapi.yaml"] as any);
    vi.spyOn(fs, "readJSON").mockResolvedValue(pluginManifest);
    vi.spyOn(fs, "writeJSON").mockImplementation((path: string, data: any) => {
      const dataToWrite = JSON.stringify(data);
      expect(dataToWrite.includes("declarativeAgent.json")).to.be.true;
    });
    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    expect(runCommandStub.mock.calls.length === 1).to.be.true;
  });

  it("shoult throw error if action number > 1 in da manifest", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };
    const pluginManifest: DeclarativeCopilotManifestSchema = {
      id: "mockedId",
      name: "mockedName",
      description: "mockedDescription",
      actions: [
        {
          id: "mockedActionId1",
          file: "mockedFile1",
        },
        {
          id: "mockedActionId2",
          file: "mockedFile2",
        },
      ],
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockReturnValue();
    vi.spyOn(mockedDriverContext.ui, "runCommand").mockResolvedValue(ok("mockedCommandResult"));
    vi.spyOn(fs, "readdirSync").mockReturnValue(["openapi.yaml"] as any);
    vi.spyOn(fs, "readJSON").mockResolvedValue(pluginManifest);
    vi.spyOn(fs, "writeJSON").mockImplementation((path: string, data: any) => {
      const dataToWrite = JSON.stringify(data);
      expect(dataToWrite.includes("declarativeAgent.json")).to.be.true;
    });
    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.be.equal("MultipleActionError");
    }
  });

  it("unhandled error should be handled", async () => {
    const args: TypeSpecCompileArgs = {
      path: "mockedPath",
      manifestPath: "mockedManifestPath",
      outputDir: "mockedOutputDir",
      typeSpecConfigPath: "mockedTypeSpecConfigPath",
    };
    const pluginManifest: DeclarativeCopilotManifestSchema = {
      id: "mockedId",
      name: "mockedName",
      description: "mockedDescription",
      actions: [
        {
          id: "mockedActionId",
          file: "mockedFile",
        },
      ],
    };

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockReturnValue();
    vi.spyOn(mockedDriverContext.ui, "runCommand").mockImplementation(() => {
      throw new Error("mockedError");
    });
    vi.spyOn(fs, "readdirSync").mockReturnValue(["openapi.yaml"] as any);
    vi.spyOn(fs, "readJSON").mockResolvedValueOnce(pluginManifest).mockResolvedValueOnce(manifest);
    vi.spyOn(fs, "writeJSON").mockImplementation((path: string, data: any) => {
      const dataToWrite = JSON.stringify(data);
      expect(dataToWrite.includes("declarativeAgent.json")).to.be.true;
    });
    const result = await typeSpecCompileDriver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    if (result.result.isErr()) {
      expect(result.result.error.name).to.be.equal("UnhandledError");
    }
  });
});
