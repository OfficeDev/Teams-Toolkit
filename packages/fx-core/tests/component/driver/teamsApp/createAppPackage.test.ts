// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  DeclarativeCopilotManifestSchema,
  err,
  ok,
  Platform,
  TeamsManifest,
  TeamsManifestV1D19,
  TeamsManifestVDevPreview,
  UserError,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import { randomBytes } from "crypto";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import * as os from "os";
import * as path from "path";
import { chai, vi } from "vitest";
import { featureFlagManager, FeatureFlagName } from "../../../../src/common/featureFlags";
import { DriverContext } from "../../../../src/component/driver/interface/commonArgs";
import { CreateAppPackageDriver } from "../../../../src/component/driver/teamsApp/createAppPackage";
import { CreateAppPackageArgs } from "../../../../src/component/driver/teamsApp/interfaces/CreateAppPackageArgs";
import { copilotGptManifestUtils } from "../../../../src/component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import * as driverUtils from "../../../../src/component/driver/util/utils";
import * as envFunctionUtils from "../../../../src/component/utils/envFunctionUtils";
import { ManifestType } from "../../../../src/component/utils/envFunctionUtils";
import {
  FileNotFoundError,
  InvalidActionInputError,
  JSONSyntaxError,
} from "../../../../src/error/common";
import {
  AppPackageFileSystemError,
  AppPackageSizeExceededError,
  InvalidFileOutsideOfTheDirectotryError,
} from "../../../../src/error/teamsApp";
import { MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";

describe("teamsApp/createAppPackage", async () => {
  const teamsAppDriver = new CreateAppPackageDriver();
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    projectPath: "./",
    platform: Platform.VSCode,
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
    addTelemetryProperties: () => {},
  };
  let mockedEnvRestore: RestoreFn;
  const fakeUrl = "https://fake.com";
  const openapiServerPlaceholder = "TEAMSFX_TEST_API_URL";
  beforeEach(() => {
    mockedEnvRestore = mockedEnv({
      ["CONFIG_TEAMS_APP_NAME"]: "fakeName",
      [openapiServerPlaceholder]: fakeUrl,
      ["APP_NAME_SUFFIX"]: "test",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });

  it("happy path - with .generated folder", async () => {
    mockedEnvRestore = mockedEnv({
      TEAMSFX_TYPESPEC: "true",
      ["CONFIG_TEAMS_APP_NAME"]: "fakeName",
      [openapiServerPlaceholder]: fakeUrl,
    });

    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
    };

    const manifest = {
      manifestVersion: "1.19",
      icons: {
        color: "resources/color.png",
        outline: "resources/outline.png",
      },
      copilotAgents: {
        declarativeAgents: [
          {
            file: "resources/declarativeAgent.json",
            id: "dc1",
          },
        ],
      },
    } as TeamsManifest;
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(driverUtils, "updateVersionForTeamsAppYamlFile").mockResolvedValue();
    const writeFileStub = vi.spyOn(fs, "writeFile").mockImplementation(async () => {});

    const driverContext: any = {
      m365TokenProvider: new MockedM365Provider(),
      projectPath: "./tests/plugins/resource/appstudio/resources-multi-env/templates/",
      platform: Platform.VSCode,
      logProvider: new MockedLogProvider(),
      ui: new MockedUserInteraction(),
      addTelemetryProperties: () => {},
    };
    const result = (await teamsAppDriver.execute(args, driverContext)).result;
    if (result.isErr()) {
      console.log(result.error);
    }
    chai.assert.isTrue(result.isOk());
    delete process.env["APP_NAME_SUFFIX"];
    await fs.remove(args.outputZipPath);
  });

  it("happy path - with .generated folder and ac in .generated folder", async () => {
    mockedEnvRestore = mockedEnv({
      TEAMSFX_TYPESPEC: "true",
      ["CONFIG_TEAMS_APP_NAME"]: "fakeName",
      [openapiServerPlaceholder]: fakeUrl,
    });

    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
    };

    const manifest = {
      manifestVersion: "1.19",
      icons: {
        color: "resources/color.png",
        outline: "resources/outline.png",
      },
      copilotAgents: {
        declarativeAgents: [
          {
            file: "resources/declarativeAgent.json",
            id: "dc1",
          },
        ],
      },
    } as TeamsManifest;
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "pathExists").mockImplementation((filePath) => {
      if (filePath.includes("adaptiveCards") && !filePath.includes(".generated")) {
        return false;
      } else {
        return true;
      }
    });
    vi.spyOn(driverUtils, "updateVersionForTeamsAppYamlFile").mockResolvedValue();
    const writeFileStub = vi.spyOn(fs, "writeFile").mockImplementation(async () => {});

    const driverContext: any = {
      m365TokenProvider: new MockedM365Provider(),
      projectPath: "./tests/plugins/resource/appstudio/resources-multi-env/templates/",
      platform: Platform.VSCode,
      logProvider: new MockedLogProvider(),
      ui: new MockedUserInteraction(),
      addTelemetryProperties: () => {},
    };
    const result = (await teamsAppDriver.execute(args, driverContext)).result;
    if (result.isErr()) {
      console.log(result.error);
    }
    chai.assert.isTrue(result.isOk());
    delete process.env["APP_NAME_SUFFIX"];
    await fs.remove(args.outputZipPath);
  });

  it("should throw error if file not exists case 1", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath: "fakepath",
      outputZipPath: "fakePath",
      outputJsonPath: "fakePath",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(
      ok({
        manifestVersion: "1.0",
        icons: {
          color: "",
          outline: "",
        },
      } as TeamsManifest)
    );
    vi.spyOn(fs, "pathExists").mockResolvedValueOnce(false);
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof FileNotFoundError);
    }
  });

  it("should throw error if file not exists case 2", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath: "fakepath",
      outputZipPath: "fakePath",
      outputJsonPath: "fakePath",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(
      ok({
        manifestVersion: "1.0",
        icons: {
          color: "",
          outline: "",
        },
      } as TeamsManifest)
    );
    vi.spyOn(fs, "pathExists").mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof FileNotFoundError);
    }
  });

  it("should throw error if file not exists case 3", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath: "fakepath",
      outputZipPath: "fakePath",
      outputJsonPath: "fakePath",
    };
    const manifest = {
      manifestVersion: "1.19",
      icons: {
        color: "",
        outline: "",
      },
      localizationInfo: {
        additionalLanguages: [{ file: "aaa", languageTag: "zh" }],
        defaultLanguageTag: "en",
      },
    } as TeamsManifest;
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "pathExists")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof FileNotFoundError);
    }
  });

  it("should throw error if color32x32 does not exist", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath: "fakepath",
      outputZipPath: "fakePath",
      outputJsonPath: "fakePath",
    };
    const manifest = {
      manifestVersion: "1.21",
      icons: {
        color: "",
        outline: "",
        color32x32: "notExist.png",
      },
    } as TeamsManifest;
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "pathExists").mockImplementation((filePath) => {
      if (filePath.includes("notExist.png")) {
        return false;
      }
      return true;
    });
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof FileNotFoundError);
    }
  });

  it("should throw error if file not exists case 4", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "resources/openai.yml",
          commands: [
            {
              id: "GET /repairs",
              apiResponseRenderingTemplateFile: "resources/repairs.json",
              title: "fake",
            },
          ],
          botId: "",
        },
      ],
      icons: {
        color: "resources/color.png",
        outline: "resources/outline.png",
      },
    } as TeamsManifest;
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

    vi.spyOn(fs, "pathExists").mockImplementation((filePath) => {
      if (filePath.includes("openai.yml")) {
        return false;
      } else {
        return true;
      }
    });
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof FileNotFoundError);
    }
  });

  it("should throw error if file not exists case 5", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };
    vi.spyOn(fs, "pathExists").mockImplementation((filePath) => {
      if (filePath.includes("repairs.json")) {
        return false;
      } else {
        return true;
      }
    });

    const manifest = {
      manifestVersion: "1.19",
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "resources/openai.yml",
          commands: [
            {
              id: "GET /repairs",
              apiResponseRenderingTemplateFile: "resources/repairs.json",
              title: "fake",
            },
          ],
          botId: "",
        },
      ],
      icons: {
        color: "resources/color.png",
        outline: "resources/outline.png",
      },
    } as TeamsManifest;
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof FileNotFoundError);
    }
  });

  it("should throw error if file not exists case 6", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };
    vi.spyOn(fs, "pathExists").mockImplementation((filePath) => {
      if (filePath.includes("fake.json") || filePath.endsWith("aaa")) {
        return false;
      } else {
        return true;
      }
    });

    const manifest = {
      manifestVersion: "1.19",
      icons: {
        color: "",
        outline: "",
      },
      localizationInfo: {
        additionalLanguages: [{ file: "aaa", languageTag: "zh" }],
        defaultLanguageTag: "en",
        defaultLanguageFile: "fake.json",
      },
    } as TeamsManifest;
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof FileNotFoundError);
    }
  });

  it("invalid param error", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath: "",
      outputZipPath: "",
      outputJsonPath: "",
    };
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.equal("InvalidActionInputError", result.error.name);
    }
  });

  it("version <= 1.6: happy path", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.17",
      localizationInfo: {
        defaultLanguageTag: "en",
        additionalLanguages: [
          {
            languageTag: "de",
            file: "resources/de.json",
          },
        ],
      },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "resources/openai.yml",
          commands: [
            {
              id: "GET /repairs",
              apiResponseRenderingTemplateFile: "resources/repairs.json",
              title: "fake",
            },
          ],
          botId: "",
        },
      ],
      icons: {
        color: "resources/color.png",
        outline: "resources/outline.png",
      },
    } as TeamsManifest;
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    const outputFileStub = vi.spyOn(fs, "outputFile");

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    chai.assert(outputFileStub.mock.calls.length === 1);
    if (await fs.pathExists(args.outputZipPath)) {
      const zip = new AdmZip(args.outputZipPath);

      let openapiContent = "";

      const entries = zip.getEntries();
      for (const e of entries) {
        const name = e.entryName;

        if (name.endsWith("openai.yml")) {
          const data = e.getData();
          openapiContent = data.toString("utf8");
          break;
        }
      }

      chai.assert(
        openapiContent != undefined &&
          openapiContent.length > 0 &&
          openapiContent.search(fakeUrl) >= 0 &&
          openapiContent.search(openapiServerPlaceholder) < 0
      );
      await fs.remove(args.outputZipPath);
    }
  });

  it("version > 1.6: happy path", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
    };

    const manifest = {
      manifestVersion: "1.19",
      localizationInfo: {
        defaultLanguageTag: "en",
        additionalLanguages: [
          {
            languageTag: "de",
            file: "resources/de.json",
          },
        ],
        defaultLanguageFile: "resources/de.json",
      },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "resources/openai.yml",
          commands: [
            {
              id: "GET /repairs",
              apiResponseRenderingTemplateFile: "resources/repairs.json",
              title: "fake",
            },
          ],
          botId: "",
        },
      ],
      icons: {
        color: "resources/color.png",
        outline: "resources/outline.png",
      },
    } as TeamsManifest;
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    const outputFileStub = vi.spyOn(fs, "outputFile");

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    chai.assert(outputFileStub.mock.calls.length === 1);
    if (await fs.pathExists(args.outputZipPath)) {
      const zip = new AdmZip(args.outputZipPath);

      let openapiContent = "";

      const entries = zip.getEntries();
      for (const e of entries) {
        const name = e.entryName;

        if (name.endsWith("openai.yml")) {
          const data = e.getData();
          openapiContent = data.toString("utf8");
          break;
        }
      }

      chai.assert(
        openapiContent != undefined &&
          openapiContent.length > 0 &&
          openapiContent.search(fakeUrl) >= 0 &&
          openapiContent.search(openapiServerPlaceholder) < 0
      );
      await fs.remove(args.outputZipPath);
    }
  });

  it("version > 1.6:should return error when placeholder is not resolved in openapi.yml", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
    };

    const manifest = {
      manifestVersion: "1.19",
      localizationInfo: {
        defaultLanguageTag: "en",
        additionalLanguages: [
          {
            languageTag: "de",
            file: "resources/de.json",
          },
        ],
      },
      composeExtensions: [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "resources/openai.yml",
          commands: [
            {
              id: "GET /repairs",
              apiResponseRenderingTemplateFile: "resources/repairs.json",
              title: "fake",
            },
          ],
          botId: "",
        },
      ],
      icons: {
        color: "resources/color.png",
        outline: "resources/outline.png",
      },
    } as TeamsManifest;
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "writeFile").mockImplementation(async () => {});

    delete process.env[openapiServerPlaceholder];
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(
      result.isErr() &&
        result.error.name === "MissingEnvironmentVariablesError" &&
        result.error.message.includes(openapiServerPlaceholder)
    );
  });

  it("version > 1.6: happy path - CLI", async () => {
    const mockedCliDriverContext = {
      ...mockedDriverContext,
      platform: Platform.CLI,
    };
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
    };

    const manifest = {
      manifestVersion: "1.19",
      localizationInfo: {
        defaultLanguageTag: "en",
        additionalLanguages: [
          {
            languageTag: "de",
            file: "resources/de.json",
          },
        ],
      },
    } as TeamsManifest;
    manifest.composeExtensions = [
      {
        composeExtensionType: "apiBased",
        apiSpecificationFile: "resources/openai.yml",
        commands: [
          {
            id: "GET /repairs",
            apiResponseRenderingTemplateFile: "resources/repairs.json",
            title: "fake",
          },
        ],
        botId: "",
      },
    ];
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "writeFile").mockImplementation(async () => {});

    const result = (await teamsAppDriver.execute(args, mockedCliDriverContext)).result;
    chai.assert(result.isOk());
    if (await fs.pathExists(args.outputZipPath)) {
      await fs.remove(args.outputZipPath);
    }
  });

  it("happy path - relative path", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.composeExtensions = [
      {
        composeExtensionType: "apiBased",
        apiSpecificationFile: "manifest.template.json",
        commands: [
          {
            id: "GET /repairs",
            apiResponseRenderingTemplateFile: "manifest.template.json",
            title: "fake",
          },
        ],
        botId: "",
      },
    ];
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };
    manifest.localizationInfo = {
      defaultLanguageTag: "en",
      additionalLanguages: [
        {
          languageTag: "de",
          file: "resources/de.json",
        },
      ],
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "writeFile").mockImplementation(async () => {});

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    if (await fs.pathExists(args.outputZipPath)) {
      await fs.remove(args.outputZipPath);
    }

    const executeResult = await teamsAppDriver.execute(args, mockedDriverContext);
    chai.assert.isTrue(executeResult.result.isOk());
  });

  it("happy path - no AC template", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.composeExtensions = [
      {
        composeExtensionType: "apiBased",
        apiSpecificationFile: "manifest.template.json",
        commands: [
          {
            id: "GET /repairs",
            title: "fake",
          },
        ],
        botId: "",
      },
    ];
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };
    manifest.localizationInfo = {
      defaultLanguageTag: "en",
      additionalLanguages: [
        {
          languageTag: "de",
          file: "resources/de.json",
        },
      ],
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "writeFile").mockImplementation(async () => {});

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    if (await fs.pathExists(args.outputZipPath)) {
      await fs.remove(args.outputZipPath);
    }

    const executeResult = await teamsAppDriver.execute(args, mockedDriverContext);
    chai.assert.isTrue(executeResult.result.isOk());
  });

  it("version >= 1.9: happy path - API plugin", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          file: "resources/de.json",
          id: "dc1",
        },
      ],
    };
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    const outputFileStub = vi.spyOn(fs, "outputFile");

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    if (result.isErr()) {
      console.log(result.error);
    }
    chai.assert.isTrue(result.isOk());
    const outputExist = await fs.pathExists(args.outputZipPath);
    chai.assert.isTrue(outputExist);
    chai.assert.isTrue(outputFileStub.mock.calls.length === 2);
    if (outputExist) {
      const zip = new AdmZip(args.outputZipPath);
      const openapiContent = "";
      let declarativeAgentsContent = "";

      const entries = zip.getEntries();
      entries.forEach((e) => {
        const name = e.entryName;

        if (name.endsWith("de.json")) {
          const data = e.getData();
          declarativeAgentsContent = data.toString("utf8");
        }
      });

      chai.assert(declarativeAgentsContent);
      await fs.remove(args.outputZipPath);
    }
  });

  it("FILE-AC-07: rejects an external file reference without writing package artifacts", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-contained-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const outputFolder = path.join(root, "build");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const declarativeAgentPath = path.join(appDirectory, "declarativeAgent.json");
      const outputZipPath = path.join(outputFolder, "appPackage.dev.zip");
      await fs.ensureDir(appDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.writeFile(path.join(root, "outside.txt"), "outside content");
      await fs.writeJSON(declarativeAgentPath, {
        version: "v1.6",
        name: "Contained agent",
        description: "Contained agent",
        instructions: "$[file('../outside.txt')]",
      });

      const manifest = {
        manifestVersion: "1.19",
        icons: {
          color: "color.png",
          outline: "outline.png",
        },
        copilotAgents: {
          declarativeAgents: [{ file: "declarativeAgent.json", id: "agent" }],
        },
      } satisfies TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const args: CreateAppPackageArgs = {
        manifestPath,
        outputZipPath,
        outputFolder,
      };
      const context = {
        ...mockedDriverContext,
        projectPath: root,
      };

      const result = (await teamsAppDriver.execute(args, context)).result;

      chai.assert.isTrue(
        result.isErr() && result.error.name === "FileReferenceOutsideManifestDirectory"
      );
      chai.assert.isFalse(await fs.pathExists(outputZipPath));
      chai.assert.deepEqual(await fs.readdir(outputFolder), []);
    } finally {
      await fs.remove(root);
    }
  });

  it("FILE-AC-07: removes earlier resolved manifests when a later file reference fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-late-failure-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const outputFolder = path.join(root, "build");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const declarativeAgentPath = path.join(appDirectory, "declarativeAgent.json");
      const pluginPath = path.join(appDirectory, "plugin.json");
      const outputZipPath = path.join(outputFolder, "appPackage.dev.zip");
      await fs.ensureDir(appDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.writeFile(path.join(root, "outside.txt"), "outside content");
      await fs.writeJSON(declarativeAgentPath, {
        version: "v1.6",
        name: "Contained agent",
        description: "Contained agent",
        instructions: "Contained instructions",
        actions: [{ id: "action", file: "plugin.json" }],
      });
      await fs.writeJSON(pluginPath, {
        schema_version: "v2",
        name_for_human: "Plugin",
        description_for_model: "$[file('../outside.txt')]",
        runtimes: [],
      });

      const manifest = {
        manifestVersion: "1.19",
        icons: {
          color: "color.png",
          outline: "outline.png",
        },
        copilotAgents: {
          declarativeAgents: [{ file: "declarativeAgent.json", id: "agent" }],
        },
      } satisfies TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const args: CreateAppPackageArgs = {
        manifestPath,
        outputZipPath,
        outputFolder,
      };
      const context = {
        ...mockedDriverContext,
        projectPath: root,
      };

      const result = (await teamsAppDriver.execute(args, context)).result;

      chai.assert.isTrue(
        result.isErr() && result.error.name === "FileReferenceOutsideManifestDirectory"
      );
      chai.assert.isFalse(await fs.pathExists(outputZipPath));
      chai.assert.deepEqual(await fs.readdir(outputFolder), []);
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-04: identifies an external declarative agent manifest reference", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-agent-location-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const outputFolder = path.join(root, "build");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const externalAgentPath = path.join(root, "declarativeAgent.json");
      const outputZipPath = path.join(outputFolder, "appPackage.dev.zip");
      const agentReference = "../declarativeAgent.json";
      await fs.ensureDir(appDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      const manifest = {
        manifestVersion: "1.19",
        version: "1.0.0",
        id: "00000000-0000-0000-0000-000000000000",
        packageName: "com.microsoft.test",
        developer: {
          name: "Microsoft",
          websiteUrl: "https://www.microsoft.com",
          privacyUrl: "https://www.microsoft.com/privacy",
          termsOfUseUrl: "https://www.microsoft.com/terms",
        },
        name: { short: "Test" },
        description: { short: "Test", full: "Test" },
        icons: { color: "color.png", outline: "outline.png" },
        accentColor: "#FFFFFF",
        copilotAgents: {
          declarativeAgents: [{ file: agentReference, id: "agent" }],
        },
      } satisfies TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const result = (
        await teamsAppDriver.execute(
          { manifestPath, outputZipPath, outputFolder },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(
        result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError
      );
      if (result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError) {
        chai.assert.include(result.error.displayMessage, agentReference);
        chai.assert.include(result.error.displayMessage, externalAgentPath);
        chai.assert.include(result.error.displayMessage, appDirectory);
        chai.assert.notInclude(result.error.message, root);
      }
      chai.assert.isFalse(await fs.pathExists(outputZipPath));
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-04: identifies the owning nested manifest reference", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-action-location-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const agentDirectory = path.join(appDirectory, "resources");
      const outputFolder = path.join(root, "build");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const declarativeAgentPath = path.join(agentDirectory, "declarativeAgent.json");
      const externalPluginPath = path.join(root, "outside-plugin.json");
      const outputZipPath = path.join(outputFolder, "appPackage.dev.zip");
      const pluginReference = "../../outside-plugin.json";
      await fs.ensureDir(agentDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.writeJSON(declarativeAgentPath, {
        version: "v1.6",
        name: "Agent",
        description: "Agent",
        instructions: "Contained instructions",
        actions: [{ id: "action", file: pluginReference }],
      });
      const manifest = {
        manifestVersion: "1.19",
        version: "1.0.0",
        id: "00000000-0000-0000-0000-000000000000",
        packageName: "com.microsoft.test",
        developer: {
          name: "Microsoft",
          websiteUrl: "https://www.microsoft.com",
          privacyUrl: "https://www.microsoft.com/privacy",
          termsOfUseUrl: "https://www.microsoft.com/terms",
        },
        name: { short: "Test" },
        description: { short: "Test", full: "Test" },
        icons: { color: "color.png", outline: "outline.png" },
        accentColor: "#FFFFFF",
        copilotAgents: {
          declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "agent" }],
        },
      } satisfies TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const result = (
        await teamsAppDriver.execute(
          { manifestPath, outputZipPath, outputFolder },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(
        result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError
      );
      if (result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError) {
        chai.assert.include(result.error.displayMessage, pluginReference);
        chai.assert.include(result.error.displayMessage, externalPluginPath);
        chai.assert.include(result.error.displayMessage, appDirectory);
        chai.assert.include(
          result.error.displayMessage,
          "update this reference in the manifest that contains it"
        );
        chai.assert.notInclude(result.error.message, root);
      }
      chai.assert.isFalse(await fs.pathExists(outputZipPath));
    } finally {
      await fs.remove(root);
    }
  });

  it.runIf(process.platform === "win32")(
    "ZIP-AC-01: rejects a referenced file on another Windows drive",
    async () => {
      const currentDrive = path.parse(process.cwd()).root.slice(0, 2).toUpperCase();
      const otherDrive = currentDrive === "Z:" ? "Y:" : "Z:";
      const trustedDirectory = path.join(currentDrive + path.sep, "trusted-app-package");
      const externalFile = path.join(otherDrive + path.sep, "external", "secret.txt");
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "realpath").mockImplementation(async (filePath) => String(filePath));

      const result = await (teamsAppDriver as any).validateReferencedFile(
        externalFile,
        trustedDirectory
      );

      chai.assert.isTrue(
        result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError
      );
    }
  );

  it.runIf(process.platform === "win32")(
    "ZIP-AC-01: rejects a referenced file on a Windows UNC share",
    async () => {
      const trustedDirectory = path.resolve("C:\\trusted-app-package");
      const externalFile = "\\\\server\\share\\external\\secret.txt";
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "realpath").mockImplementation(async (filePath) => String(filePath));

      const result = await (teamsAppDriver as any).validateReferencedFile(
        externalFile,
        trustedDirectory
      );

      chai.assert.isTrue(
        result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError
      );
    }
  );

  it("ZIP-AC-04: separates actionable local paths from the telemetry message", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-error-path-"));
    try {
      const trustedDirectory = path.join(root, "appPackage");
      const externalFile = path.join(root, "external", "secret.txt");
      await fs.ensureDir(trustedDirectory);
      await fs.ensureFile(externalFile);

      const result = await (teamsAppDriver as any).validateReferencedFile(
        externalFile,
        trustedDirectory
      );

      chai.assert.isTrue(
        result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError
      );
      if (result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError) {
        chai.assert.notInclude(result.error.message, root);
        chai.assert.include(
          result.error.displayMessage,
          path.relative(trustedDirectory, externalFile)
        );
        chai.assert.include(result.error.displayMessage, externalFile);
        chai.assert.include(result.error.displayMessage, trustedDirectory);
        chai.assert.include(
          result.error.displayMessage,
          "update this reference in the manifest that contains it"
        );
      }
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-04: does not disclose an absolute path for a missing package file", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-missing-path-"));
    try {
      const trustedDirectory = path.join(root, "appPackage");
      const missingFile = path.join(trustedDirectory, "missing.json");
      await fs.ensureDir(trustedDirectory);

      const result = await (teamsAppDriver as any).validateReferencedFile(
        missingFile,
        trustedDirectory
      );

      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.notInclude(result.error.message, root);
        chai.assert.notInclude(result.error.displayMessage, root);
      }
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-01: rejects an external adaptive card instead of silently removing it", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-card-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const pluginFile = path.join(appDirectory, "resources", "plugin.json");
      const functionObject = {
        name: "externalCard",
        capabilities: {
          response_semantics: {
            static_template: { file: "../../../outside.json" },
          },
        },
      } as any;

      const result = await (teamsAppDriver as any).getAdaptiveCardTemplateFile(
        mockedDriverContext,
        pluginFile,
        functionObject,
        appDirectory
      );

      chai.assert.isTrue(
        result?.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError
      );
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-06: separates local paths from telemetry when source canonicalization fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-source-error-"));
    try {
      const trustedDirectory = path.join(root, "appPackage");
      const sourceFile = path.join(trustedDirectory, "source.json");
      await fs.ensureDir(trustedDirectory);
      await fs.ensureFile(sourceFile);
      vi.spyOn(fs, "realpath").mockRejectedValue(
        Object.assign(new Error(`EACCES: realpath '${sourceFile}'`), { code: "EACCES" })
      );

      const result = await (teamsAppDriver as any).validateReferencedFile(
        sourceFile,
        trustedDirectory
      );

      chai.assert.isTrue(result.isErr() && result.error instanceof AppPackageFileSystemError);
      if (result.isErr()) {
        chai.assert.include(result.error.displayMessage, sourceFile);
        chai.assert.notInclude(result.error.message, root);
      }
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-05: separates local paths from telemetry when output inspection fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-output-error-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const outputZipPath = path.join(root, "build", "appPackage.zip");
      const outputJsonPath = path.join(root, "build", "manifest.json");
      await fs.ensureDir(appDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      const manifest = {
        manifestVersion: "1.19",
        icons: { color: "color.png", outline: "outline.png" },
      } satisfies TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      const stat = fs.stat.bind(fs);
      vi.spyOn(fs, "stat").mockImplementation(async (filePath) => {
        if (filePath === outputZipPath) {
          throw Object.assign(new Error(`EACCES: stat '${outputZipPath}'`), { code: "EACCES" });
        }
        return stat(filePath);
      });

      const result = (
        await teamsAppDriver.execute(
          { manifestPath, outputZipPath, outputJsonPath },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(result.isErr() && result.error instanceof AppPackageFileSystemError);
      if (result.isErr()) {
        chai.assert.include(result.error.displayMessage, outputZipPath);
        chai.assert.notInclude(result.error.message, root);
        chai.assert.equal(result.error.innerError?.code, "EACCES");
      }
      chai.assert.isFalse(await fs.pathExists(outputJsonPath));
      chai.assert.isFalse(await fs.pathExists(outputZipPath));
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-04: adaptive card override warnings do not disclose the plugin path", async () => {
    const warning = vi.fn();
    const context = {
      ...mockedDriverContext,
      logProvider: { ...mockedDriverContext.logProvider, warning },
    };
    const pluginFile = path.resolve(
      "tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/resources/ai-plugin-with-external-ac.json"
    );
    const appDirectory = path.resolve(
      "tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage"
    );
    vi.spyOn(driverUtils, "updateVersionForTeamsAppYamlFile").mockResolvedValue();

    const result = await (teamsAppDriver as any).addPlugin(
      new AdmZip(),
      path.relative(appDirectory, pluginFile),
      appDirectory,
      context
    );

    chai.assert.isTrue(result.isOk());
    chai.assert.isTrue(warning.mock.calls.length > 0);
    for (const call of warning.mock.calls) {
      chai.assert.notInclude(String(call[0]), appDirectory);
    }
  });

  it("ZIP-AC-03: restores prior outputs when a later JSON publication fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-rollback-"));
    try {
      const stagedZipFile = path.join(root, "staged.zip");
      const outputZipFile = path.join(root, "appPackage.zip");
      const firstJsonFile = path.join(root, "first.json");
      const secondJsonFile = path.join(root, "second.json");
      await fs.writeFile(stagedZipFile, "new zip");
      await fs.writeFile(outputZipFile, "old zip");
      await fs.writeFile(firstJsonFile, "old first");
      await fs.writeFile(secondJsonFile, "old second");

      const rename = fs.rename.bind(fs);
      let publicationFailed = false;
      let publicationError: unknown;
      vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
        if (!publicationFailed && destination === secondJsonFile) {
          publicationFailed = true;
          throw Object.assign(new Error(`EACCES: rename '${source}' -> '${destination}'`), {
            code: "EACCES",
            path: source,
            dest: destination,
          });
        }
        await rename(source, destination);
      });

      try {
        await (teamsAppDriver as any).publishOutputs(
          stagedZipFile,
          outputZipFile,
          new Map([
            [firstJsonFile, "new first"],
            [secondJsonFile, "new second"],
          ])
        );
      } catch (error) {
        publicationError = error;
      }

      chai.assert.isTrue(publicationFailed);
      chai.assert.instanceOf(publicationError, AppPackageFileSystemError);
      if (!(publicationError instanceof AppPackageFileSystemError)) {
        return;
      }
      chai.assert.notInclude(String(publicationError.innerError?.message), root);
      chai.assert.notProperty(publicationError.innerError, "path");
      chai.assert.notProperty(publicationError.innerError, "dest");
      chai.assert.equal(await fs.readFile(firstJsonFile, "utf8"), "old first");
      chai.assert.equal(await fs.readFile(secondJsonFile, "utf8"), "old second");
      chai.assert.equal(await fs.readFile(outputZipFile, "utf8"), "old zip");
      chai.assert.deepEqual(
        (await fs.readdir(root)).filter((fileName) => fileName.startsWith(".")),
        []
      );
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-05: reports a rollback failure after restoring prior outputs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-rollback-error-"));
    try {
      const stagedZipFile = path.join(root, "staged.zip");
      const outputZipFile = path.join(root, "appPackage.zip");
      const firstJsonFile = path.join(root, "first.json");
      const secondJsonFile = path.join(root, "second.json");
      await fs.writeFile(stagedZipFile, "new zip");
      await fs.writeFile(outputZipFile, "old zip");
      await fs.writeFile(firstJsonFile, "old first");
      await fs.writeFile(secondJsonFile, "old second");

      const rename = fs.rename.bind(fs);
      let publicationFailed = false;
      vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
        if (!publicationFailed && destination === secondJsonFile) {
          publicationFailed = true;
          throw Object.assign(new Error("EACCES: publication failed"), { code: "EACCES" });
        }
        await rename(source, destination);
      });
      const chmod = fs.chmod.bind(fs);
      vi.spyOn(fs, "chmod").mockImplementation(async (filePath, mode) => {
        if (filePath === firstJsonFile) {
          throw Object.assign(new Error("EBUSY: rollback chmod failed"), { code: "EBUSY" });
        }
        await chmod(filePath, mode);
      });

      let rollbackError: unknown;
      try {
        await (teamsAppDriver as any).publishOutputs(
          stagedZipFile,
          outputZipFile,
          new Map([
            [firstJsonFile, "new first"],
            [secondJsonFile, "new second"],
          ])
        );
      } catch (error) {
        rollbackError = error;
      }

      chai.assert.isTrue(publicationFailed);
      chai.assert.instanceOf(rollbackError, AppPackageFileSystemError);
      if (!(rollbackError instanceof AppPackageFileSystemError)) {
        return;
      }
      chai.assert.equal(rollbackError.innerError?.code, "EBUSY");
      chai.assert.equal(await fs.readFile(firstJsonFile, "utf8"), "old first");
      chai.assert.equal(await fs.readFile(secondJsonFile, "utf8"), "old second");
      chai.assert.equal(await fs.readFile(outputZipFile, "utf8"), "old zip");
      chai.assert.deepEqual(
        (await fs.readdir(root)).filter((fileName) => fileName.startsWith(".")),
        []
      );
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-05: restores outputs and separates local paths from telemetry when ZIP publication fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-zip-rollback-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const outputZipFile = path.join(root, "appPackage.zip");
      const jsonFile = path.join(root, "manifest.json");
      await fs.ensureDir(appDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.writeFile(outputZipFile, "old zip");
      await fs.writeFile(jsonFile, "old json");
      const manifest = {
        manifestVersion: "1.19",
        icons: { color: "color.png", outline: "outline.png" },
      } satisfies TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const rename = fs.rename.bind(fs);
      let zipPublicationFailed = false;
      vi.spyOn(fs, "rename").mockImplementation(async (source, destination) => {
        if (!zipPublicationFailed && destination === outputZipFile) {
          zipPublicationFailed = true;
          throw Object.assign(new Error(`EACCES: rename '${source}' -> '${destination}'`), {
            code: "EACCES",
          });
        }
        await rename(source, destination);
      });
      const remove = fs.remove.bind(fs);
      vi.spyOn(fs, "remove").mockImplementation(async (filePath) => {
        if (
          path.basename(String(filePath)).startsWith(`.${path.basename(jsonFile)}.`) &&
          String(filePath).endsWith(".tmp")
        ) {
          throw Object.assign(new Error("EBUSY: staged cleanup failed"), { code: "EBUSY" });
        }
        await remove(filePath);
      });

      const result = (
        await teamsAppDriver.execute(
          {
            manifestPath,
            outputZipPath: outputZipFile,
            outputJsonPath: jsonFile,
          },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(zipPublicationFailed);
      chai.assert.isTrue(result.isErr() && result.error instanceof AppPackageFileSystemError);
      if (result.isOk()) {
        return;
      }
      const publicationError = result.error;
      chai.assert.include(String(publicationError.displayMessage), outputZipFile);
      chai.assert.notInclude(publicationError.message, root);
      chai.assert.notInclude(String(publicationError.innerError?.message), root);
      chai.assert.equal(publicationError.innerError?.code, "EACCES");
      chai.assert.equal(await fs.readFile(jsonFile, "utf8"), "old json");
      chai.assert.equal(await fs.readFile(outputZipFile, "utf8"), "old zip");
      chai.assert.deepEqual(
        (await fs.readdir(root)).filter(
          (fileName) => fileName.startsWith(".") || fileName.endsWith(".tmp")
        ),
        []
      );
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-03: stages every JSON before moving prior outputs", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-stage-json-"));
    try {
      const stagedZipFile = path.join(root, "staged.zip");
      const outputZipFile = path.join(root, "appPackage.zip");
      const firstJsonFile = path.join(root, "first.json");
      const secondJsonFile = path.join(root, "second.json");
      await fs.writeFile(stagedZipFile, "new zip");
      await fs.writeFile(outputZipFile, "old zip");
      await fs.writeFile(firstJsonFile, "old first");
      await fs.writeFile(secondJsonFile, "old second");

      const outputFile = fs.outputFile.bind(fs);
      let writeCount = 0;
      vi.spyOn(fs, "outputFile").mockImplementation(async (file, content) => {
        writeCount += 1;
        if (writeCount === 2) {
          throw new Error("simulated staging failure");
        }
        await outputFile(file, content);
      });
      const rename = vi.spyOn(fs, "rename");

      let publicationFailed = false;
      try {
        await (teamsAppDriver as any).publishOutputs(
          stagedZipFile,
          outputZipFile,
          new Map([
            [firstJsonFile, "new first"],
            [secondJsonFile, "new second"],
          ])
        );
      } catch {
        publicationFailed = true;
      }

      chai.assert.isTrue(publicationFailed);
      chai.assert.equal(rename.mock.calls.length, 0);
      chai.assert.equal(await fs.readFile(firstJsonFile, "utf8"), "old first");
      chai.assert.equal(await fs.readFile(secondJsonFile, "utf8"), "old second");
      chai.assert.equal(await fs.readFile(outputZipFile, "utf8"), "old zip");
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-03: treats backup cleanup after publication as best effort", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-cleanup-"));
    const remove = fs.remove.bind(fs);
    let removeStub: ReturnType<typeof vi.spyOn> | undefined;
    try {
      const stagedZipFile = path.join(root, "staged.zip");
      const outputZipFile = path.join(root, "appPackage.zip");
      const jsonFile = path.join(root, "manifest.json");
      await fs.writeFile(stagedZipFile, "new zip");
      await fs.writeFile(outputZipFile, "old zip");
      await fs.writeFile(jsonFile, "old json");

      removeStub = vi.spyOn(fs, "remove").mockImplementation(async (filePath) => {
        if (await fs.pathExists(filePath)) {
          throw new Error("simulated backup cleanup failure");
        }
        await remove(filePath);
      });

      await (teamsAppDriver as any).publishOutputs(
        stagedZipFile,
        outputZipFile,
        new Map([[jsonFile, "new json"]])
      );

      chai.assert.equal(await fs.readFile(jsonFile, "utf8"), "new json");
      chai.assert.equal(await fs.readFile(outputZipFile, "utf8"), "new zip");
    } finally {
      removeStub?.mockRestore();
      await remove(root);
    }
  });

  it("ZIP-AC-01: does not write rewritten plugins through a pre-existing temp junction", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-plugin-temp-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const externalDirectory = path.join(root, "external");
      const pluginFile = path.join(appDirectory, "plugin.json");
      await fs.ensureDir(appDirectory);
      await fs.ensureDir(externalDirectory);
      await fs.symlink(externalDirectory, path.join(appDirectory, ".tmp"), "junction");
      await fs.writeJSON(pluginFile, {
        schema_version: "v2",
        name_for_human: "Plugin",
        description_for_model: "Plugin",
        namespace: "unsafe_namespace",
        runtimes: [],
      });

      const result = await (teamsAppDriver as any).addPlugin(
        new AdmZip(),
        "plugin.json",
        appDirectory,
        mockedDriverContext
      );

      chai.assert.isTrue(result.isOk());
      chai.assert.deepEqual(await fs.readdir(externalDirectory), []);
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-03: removes rewritten plugin temp files when writing fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-plugin-write-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const pluginFile = path.join(appDirectory, "plugin.json");
      await fs.ensureDir(appDirectory);
      await fs.writeJSON(pluginFile, {
        schema_version: "v2",
        name_for_human: "Plugin",
        description_for_model: "Plugin",
        namespace: "unsafe_namespace",
        runtimes: [],
      });
      const writeJson = fs.writeJSON.bind(fs);
      vi.spyOn(fs, "writeJSON").mockImplementation(async (file, content, options) => {
        await writeJson(file, content, options);
        if (path.basename(String(file)).startsWith("tmp-ai-plugin-")) {
          throw new Error("simulated temp write failure");
        }
      });

      let writeFailed = false;
      try {
        await (teamsAppDriver as any).addPlugin(
          new AdmZip(),
          "plugin.json",
          appDirectory,
          mockedDriverContext
        );
      } catch {
        writeFailed = true;
      }

      chai.assert.isTrue(writeFailed);
      chai.assert.deepEqual(
        (await fs.readdir(appDirectory)).filter((entry) => entry.startsWith(".tmp-")),
        []
      );
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-03: rejects a JSON output path that equals the ZIP output path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-output-collision-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const outputPath = path.join(root, "build", "appPackage.zip");
      await fs.ensureDir(appDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeFile(outputPath, "prior output");
      const manifest = {
        manifestVersion: "1.19",
        icons: { color: "color.png", outline: "outline.png" },
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const result = (
        await teamsAppDriver.execute(
          { manifestPath, outputZipPath: outputPath, outputJsonPath: outputPath },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(result.isErr() && result.error instanceof InvalidActionInputError);
      chai.assert.equal(await fs.readFile(outputPath, "utf8"), "prior output");
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-03: rejects a ZIP output path that contains the JSON output", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-output-parent-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const outputPath = path.join(root, "build", "appPackage.zip");
      const priorOutputPath = path.join(outputPath, "prior-output.txt");
      await fs.ensureDir(appDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.ensureDir(outputPath);
      await fs.writeFile(priorOutputPath, "prior output");
      const manifest = {
        manifestVersion: "1.19",
        icons: { color: "color.png", outline: "outline.png" },
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const result = (
        await teamsAppDriver.execute(
          { manifestPath, outputZipPath: outputPath, outputFolder: outputPath },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(result.isErr() && result.error instanceof InvalidActionInputError);
      chai.assert.equal(await fs.readFile(priorOutputPath, "utf8"), "prior output");
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-03: rejects an existing directory at the ZIP output path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-zip-directory-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const outputZipPath = path.join(root, "build", "appPackage.zip");
      const outputJsonPath = path.join(root, "build", "manifest.json");
      const priorOutputPath = path.join(outputZipPath, "prior-output.txt");
      await fs.ensureDir(appDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.ensureDir(outputZipPath);
      await fs.writeFile(priorOutputPath, "prior output");
      const manifest = {
        manifestVersion: "1.19",
        icons: { color: "color.png", outline: "outline.png" },
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const result = (
        await teamsAppDriver.execute(
          { manifestPath, outputZipPath, outputJsonPath },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(result.isErr() && result.error instanceof InvalidActionInputError);
      chai.assert.equal(await fs.readFile(priorOutputPath, "utf8"), "prior output");
      chai.assert.isFalse(await fs.pathExists(outputJsonPath));
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-03: rejects an existing directory at a JSON output path", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-json-directory-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const outputZipPath = path.join(root, "build", "appPackage.zip");
      const outputJsonPath = path.join(root, "build", "manifest.json");
      const priorOutputPath = path.join(outputJsonPath, "prior-output.txt");
      await fs.ensureDir(appDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.ensureDir(outputJsonPath);
      await fs.writeFile(priorOutputPath, "prior output");
      const manifest = {
        manifestVersion: "1.19",
        icons: { color: "color.png", outline: "outline.png" },
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const result = (
        await teamsAppDriver.execute(
          { manifestPath, outputZipPath, outputJsonPath },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(result.isErr() && result.error instanceof InvalidActionInputError);
      chai.assert.equal(await fs.readFile(priorOutputPath, "utf8"), "prior output");
      chai.assert.isFalse(await fs.pathExists(outputZipPath));
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-03: rejects ZIP and JSON paths whose parent directories are aliases", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-output-alias-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const outputDirectory = path.join(root, "build");
      const outputAlias = path.join(root, "build-alias");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const outputZipPath = path.join(outputDirectory, "appPackage.zip");
      const outputJsonPath = path.join(outputAlias, "appPackage.zip");
      await fs.ensureDir(appDirectory);
      await fs.ensureDir(outputDirectory);
      await fs.symlink(
        outputDirectory,
        outputAlias,
        process.platform === "win32" ? "junction" : "dir"
      );
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.writeFile(outputZipPath, "prior output");
      const manifest = {
        manifestVersion: "1.19",
        icons: { color: "color.png", outline: "outline.png" },
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const result = (
        await teamsAppDriver.execute(
          { manifestPath, outputZipPath, outputJsonPath },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(result.isErr() && result.error instanceof InvalidActionInputError);
      chai.assert.equal(await fs.readFile(outputZipPath, "utf8"), "prior output");
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-03: rejects ZIP and JSON paths whose final files are aliases", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-file-alias-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const outputDirectory = path.join(root, "build");
      const manifestPath = path.join(appDirectory, "manifest.json");
      const outputZipPath = path.join(outputDirectory, "appPackage.zip");
      const outputJsonPath = path.join(outputDirectory, "manifest.json");
      await fs.ensureDir(appDirectory);
      await fs.ensureDir(outputDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.writeFile(outputZipPath, "prior output");
      await fs.writeFile(outputJsonPath, "prior output");
      const manifest = {
        manifestVersion: "1.19",
        icons: { color: "color.png", outline: "outline.png" },
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      const realpath = fs.realpath.bind(fs);
      vi.spyOn(fs, "realpath").mockImplementation(async (filePath) => {
        const resolvedPath = path.resolve(String(filePath));
        if (resolvedPath === outputZipPath || resolvedPath === outputJsonPath) {
          return outputZipPath;
        }
        return realpath(filePath);
      });

      const result = (
        await teamsAppDriver.execute(
          { manifestPath, outputZipPath, outputJsonPath },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(result.isErr() && result.error instanceof InvalidActionInputError);
      chai.assert.equal(await fs.readFile(outputZipPath, "utf8"), "prior output");
      chai.assert.equal(await fs.readFile(outputJsonPath, "utf8"), "prior output");
    } finally {
      await fs.remove(root);
    }
  });

  it("ZIP-AC-03: rejects duplicate resolved JSON producers", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-json-producers-"));
    try {
      const appDirectory = path.join(root, "appPackage");
      const outputDirectory = path.join(root, "build");
      const manifestPath = path.join(appDirectory, "teams-manifest.json");
      const declarativeAgentPath = path.join(appDirectory, "manifest.json");
      const outputZipPath = path.join(outputDirectory, "appPackage.zip");
      const outputManifestPath = path.join(outputDirectory, "manifest.dev.json");
      await fs.ensureDir(appDirectory);
      await fs.writeFile(path.join(appDirectory, "color.png"), "color");
      await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
      await fs.writeJSON(declarativeAgentPath, {
        version: "v1.6",
        name: "Agent",
        description: "Agent",
        instructions: "Contained instructions",
      });
      const manifest = {
        manifestVersion: "1.19",
        icons: { color: "color.png", outline: "outline.png" },
        copilotAgents: {
          declarativeAgents: [{ file: "manifest.json", id: "agent" }],
        },
      } satisfies TeamsManifestV1D19.TeamsManifestV1D19;
      await fs.writeJSON(manifestPath, manifest);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      const result = (
        await teamsAppDriver.execute(
          { manifestPath, outputZipPath, outputFolder: outputDirectory },
          { ...mockedDriverContext, projectPath: root }
        )
      ).result;

      chai.assert.isTrue(result.isErr() && result.error instanceof InvalidActionInputError);
      chai.assert.isFalse(await fs.pathExists(outputZipPath));
      chai.assert.isFalse(await fs.pathExists(outputManifestPath));
    } finally {
      await fs.remove(root);
    }
  });

  it("happy path - Plugin file with underscore namespace", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          file: "resources/declarativeAgent-namespace.json",
          id: "dc1",
        },
      ],
    };
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    const outputFileStub = vi.spyOn(fs, "outputFile");

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    if (result.isErr()) {
      console.log(result.error);
    }
    chai.assert.isTrue(result.isOk());
    const outputExist = await fs.pathExists(args.outputZipPath);
    chai.assert.isTrue(outputExist);
    chai.assert.isTrue(outputFileStub.mock.calls.length === 3);
    if (outputExist) {
      const zip = new AdmZip(args.outputZipPath);
      let aiPluginContent = "";
      let openapiContent = "";
      let declarativeAgentsContent = "";

      const entries = zip.getEntries();
      entries.forEach((e) => {
        const name = e.entryName;
        if (name.endsWith("ai-plugin-with-underscore-namespace.json")) {
          const data = e.getData();
          aiPluginContent = data.toString("utf8");
        }

        if (name.endsWith("openai.yml")) {
          const data = e.getData();
          openapiContent = data.toString("utf8");
        }

        if (name.endsWith("declarativeAgent-namespace.json")) {
          const data = e.getData();
          declarativeAgentsContent = data.toString("utf8");
        }
      });

      chai.assert(openapiContent, "openapi.yml not found in the zip file");
      chai.assert(aiPluginContent, "ai-plugin.json not found in the zip file");
      chai.assert(declarativeAgentsContent, "declarativeAgent.json not found in the zip file");
      chai.assert(
        aiPluginContent.search(openapiServerPlaceholder) < 0,
        "openapiServerPlaceholder not replaced"
      );
      chai.assert.include(aiPluginContent, "pluginnamespace", "plugin_namespace not replaced");
      chai.assert(openapiContent.search("APP_NAME_SUFFIX") < 0, "APP_NAME_SUFFIX not replaced");
      chai.assert(aiPluginContent.search("file") < 0, "file not replaced");

      await fs.remove(args.outputZipPath);
    }
  });

  it("Plugin file processed error when expandVariableWithFunction failed ", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          file: "resources/declarativeAgent-namespace.json",
          id: "dc1",
        },
      ],
    };
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };

    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "writeFile").mockImplementation(async () => {});

    vi.spyOn(envFunctionUtils, "expandVariableWithFunction").mockImplementation(
      async (
        content: string,
        ctx: DriverContext,
        envs: { [key in string]: string } | undefined,
        isJson: boolean,
        manifestType: ManifestType,
        fromPath: string
      ) => {
        if (fromPath.endsWith("ai-plugin-with-underscore-namespace.json")) {
          return err(new UserError("source", "name", "message"));
        } else {
          return ok(content);
        }
      }
    );

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(result.isErr());

    await fs.remove(args.outputZipPath);
  });

  it("happy path - Declarative Agent with external adaptive cards", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          file: "resources/declarativeAgent.json",
          id: "dc1",
        },
      ],
    };
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    const outputFileStub = vi.spyOn(fs, "outputFile");

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    if (result.isErr()) {
      console.log(result.error);
    }
    chai.assert.isTrue(result.isOk());
    const outputExist = await fs.pathExists(args.outputZipPath);
    chai.assert.isTrue(outputExist);
    chai.assert.isTrue(outputFileStub.mock.calls.length === 3);
    if (outputExist) {
      const zip = new AdmZip(args.outputZipPath);
      let aiPluginContent = "";
      let openapiContent = "";
      let declarativeAgentsContent = "";

      const entries = zip.getEntries();
      entries.forEach((e) => {
        const name = e.entryName;
        if (name.endsWith("ai-plugin-with-external-ac.json")) {
          const data = e.getData();
          aiPluginContent = data.toString("utf8");
        }

        if (name.endsWith("openai.yml")) {
          const data = e.getData();
          openapiContent = data.toString("utf8");
        }

        if (name.endsWith("declarativeAgent.json")) {
          const data = e.getData();
          declarativeAgentsContent = data.toString("utf8");
        }
      });

      chai.assert(openapiContent, "openapi.yml not found in the zip file");
      chai.assert(aiPluginContent, "ai-plugin.json not found in the zip file");
      chai.assert(declarativeAgentsContent, "declarativeAgent.json not found in the zip file");
      chai.assert(
        aiPluginContent.search(openapiServerPlaceholder) < 0,
        "openapiServerPlaceholder not replaced"
      );
      chai.assert(openapiContent.search("APP_NAME_SUFFIX") < 0, "APP_NAME_SUFFIX not replaced");
      chai.assert(aiPluginContent.search("file") < 0, "file not replaced");
      const aiPlugin = JSON.parse(aiPluginContent);
      chai.assert.isUndefined(
        aiPlugin.functions[2].capabilities.response_semantics.static_template,
        "invalid external adaptive card reference should not leave an empty static_template"
      );

      await fs.remove(args.outputZipPath);
    }
  });

  it("error if mcp_tool_description file does not exist for RemoteMCPServer runtime", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          file: "resources/declarativeAgent.json",
          id: "dc1",
        },
      ],
    };
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };

    const declarativeAgentManifest = {
      name: "test-da-mcp",
      description: "Declarative agent for testing MCP server integration",
      instructions: "This is test instructions for MCP",
      actions: [
        {
          id: "action_mcp",
          file: "ai-plugin.json",
        },
      ],
    } as DeclarativeCopilotManifestSchema;

    const mcpPluginContent = {
      schema_version: "v2",
      name_for_human: "MCP Plugin",
      description_for_model: "MCP Plugin for remote server",
      runtimes: [
        {
          type: "RemoteMCPServer",
          auth: { type: "none" },
          spec: {
            url: "https://example.com/mcp",
            mcp_tool_description: {
              file: "./mcp-tool-description.json",
            },
          },
        },
      ],
    };

    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
    vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
      ok(declarativeAgentManifest)
    );
    vi.spyOn(fs, "readJSON").mockImplementation(async () => {
      return mcpPluginContent;
    });
    vi.spyOn(fs, "stat").mockImplementation(async () => {
      return { mode: 0o644, isDirectory: () => false } as any;
    });
    vi.spyOn(fs, "readFile").mockImplementation((async (filePath: any, options?: any) => {
      const content = JSON.stringify(mcpPluginContent);
      if (options === "utf8" || options?.encoding === "utf8") {
        return content;
      }
      return Buffer.from(content);
    }) as any);
    vi.spyOn(fs, "pathExists").mockImplementation(async (filePath: string) => {
      if (filePath.toString().includes("mcp-tool-description.json")) {
        return false;
      }
      return true;
    });

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;

    chai.assert.isTrue(result.isErr());

    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof FileNotFoundError);
    }
  });

  it("happy path - RemoteMCPServer with mcp_tool_description file", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          file: "resources/declarativeAgent.json",
          id: "dc1",
        },
      ],
    };
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };

    const declarativeAgentManifest = {
      name: "test-da-mcp",
      description: "Declarative agent for testing MCP server integration",
      instructions: "This is test instructions for MCP",
      actions: [
        {
          id: "action_mcp",
          file: "ai-plugin.json",
        },
      ],
    } as DeclarativeCopilotManifestSchema;

    const mcpPluginContent = {
      schema_version: "v2",
      name_for_human: "MCP Plugin",
      description_for_model: "MCP Plugin for remote server",
      runtimes: [
        {
          type: "RemoteMCPServer",
          auth: { type: "none" },
          spec: {
            url: "https://example.com/mcp",
            mcp_tool_description: {
              file: "./mcp-tool-description.json",
            },
          },
        },
      ],
    };

    const mcpToolDescriptionContent = {
      tools: [
        {
          name: "test-tool",
          description: "A test MCP tool",
        },
      ],
    };

    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
    vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
      ok(declarativeAgentManifest)
    );
    vi.spyOn(fs, "readJSON").mockImplementation(async (filePath: string) => {
      if (filePath.toString().includes("ai-plugin")) {
        return mcpPluginContent;
      }
      return mcpToolDescriptionContent;
    });
    vi.spyOn(fs, "stat").mockImplementation(async () => {
      return { mode: 0o644, isDirectory: () => false } as any;
    });
    vi.spyOn(fs, "readFile").mockImplementation((async (filePath: any, options?: any) => {
      let content: string;
      if (filePath.toString().includes("ai-plugin")) {
        content = JSON.stringify(mcpPluginContent);
      } else if (filePath.toString().includes("mcp-tool-description")) {
        content = JSON.stringify(mcpToolDescriptionContent);
      } else if (filePath.toString().includes("declarativeAgent")) {
        content = JSON.stringify(declarativeAgentManifest);
      } else {
        content = "{}";
      }
      if (options === "utf8" || options?.encoding === "utf8") {
        return content;
      }
      return Buffer.from(content);
    }) as any);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);

    // Create a new driver instance and stub addFileInZip to track calls and prevent actual file read
    const testDriver = new CreateAppPackageDriver();
    const addedFiles: string[] = [];
    vi.spyOn(testDriver as any, "addFileInZip").mockImplementation(
      (_zip: unknown, _zipPath: unknown, filePath: unknown) => {
        addedFiles.push(filePath as string);
      }
    );

    const result = (await testDriver.execute(args, mockedDriverContext)).result;
    if (result.isErr()) {
      console.log(result.error);
    }
    chai.assert.isTrue(result.isOk());

    // Verify addFileInZip was called for mcp-tool-description.json
    const mcpToolDescriptionAdded = addedFiles.some((file) =>
      file.includes("mcp-tool-description.json")
    );
    chai.assert.isTrue(mcpToolDescriptionAdded, "mcp-tool-description.json should be added to zip");
  });

  it("happy path - agentConnectors with mcpToolDescription file", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.29",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    (manifest as any).agentConnectors = [
      {
        id: "kusto",
        displayName: "Kusto",
        toolSource: {
          remoteMcpServer: {
            mcpServerUrl: "https://www.contoso.com",
            mcpToolDescription: { file: "kusto-tools.json" },
          },
        },
      },
    ];
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };

    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
    vi.spyOn(fs, "stat").mockImplementation(async () => {
      return { mode: 0o644, isDirectory: () => false } as any;
    });
    vi.spyOn(fs, "readFile").mockImplementation((async (_filePath: any, options?: any) => {
      const content = "{}";
      if (options === "utf8" || options?.encoding === "utf8") {
        return content;
      }
      return Buffer.from(content);
    }) as any);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);

    const testDriver = new CreateAppPackageDriver();
    const addedFiles: string[] = [];
    vi.spyOn(testDriver as any, "addFileInZip").mockImplementation(
      (_zip: unknown, _zipPath: unknown, filePath: unknown) => {
        addedFiles.push(filePath as string);
      }
    );

    const result = (await testDriver.execute(args, mockedDriverContext)).result;
    if (result.isErr()) {
      console.log(result.error);
    }
    chai.assert.isTrue(result.isOk());

    const mcpToolDescriptionAdded = addedFiles.some((file) => file.includes("kusto-tools.json"));
    chai.assert.isTrue(mcpToolDescriptionAdded, "kusto-tools.json should be added to zip");
  });

  it("error if mcpToolDescription file does not exist for agentConnectors", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.29",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    (manifest as any).agentConnectors = [
      {
        id: "kusto",
        displayName: "Kusto",
        toolSource: {
          remoteMcpServer: {
            mcpServerUrl: "https://www.contoso.com",
            mcpToolDescription: { file: "kusto-tools.json" },
          },
        },
      },
    ];
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };

    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "chmod").mockImplementation(async () => {});
    vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
    vi.spyOn(fs, "stat").mockImplementation(async () => {
      return { mode: 0o644, isDirectory: () => false } as any;
    });
    vi.spyOn(fs, "readFile").mockImplementation((async (_filePath: any, options?: any) => {
      const content = "{}";
      if (options === "utf8" || options?.encoding === "utf8") {
        return content;
      }
      return Buffer.from(content);
    }) as any);
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);
    // color/outline icons exist, but the mcp tool description file does not
    vi.spyOn(fs, "pathExists").mockImplementation(async (p: any) => {
      return !p.toString().includes("kusto-tools.json");
    });

    const testDriver = new CreateAppPackageDriver();
    vi.spyOn(testDriver as any, "addFileInZip").mockImplementation(() => {});

    const result = (await testDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "FileNotFoundError");
    }
  });

  it("invalid color file", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.icons = {
      color: "../color.png",
      outline: "resources/outline.png",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "pathExists").mockImplementation(() => {
      return true;
    });
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(
      result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError
    );
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof InvalidFileOutsideOfTheDirectotryError);
    }
  });

  it("invalid outline file", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.icons = {
      color: "resources/color.png",
      outline: "../outline.png",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "pathExists").mockImplementation((filePath) => {
      return true;
    });
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof InvalidFileOutsideOfTheDirectotryError);
    }
  });

  it("invalid api spec file", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.composeExtensions = [
      {
        composeExtensionType: "apiBased",
        apiSpecificationFile: "../openai.yml",
        commands: [
          {
            id: "GET /repairs",
            apiResponseRenderingTemplateFile: "resources/repairs.json",
            title: "fake",
          },
        ],
        botId: "",
      },
    ];
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };

    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "pathExists").mockImplementation((filePath) => {
      return true;
    });
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof InvalidFileOutsideOfTheDirectotryError);
    }
  });

  it("invalid response template file", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.composeExtensions = [
      {
        composeExtensionType: "apiBased",
        apiSpecificationFile: "resources/openai.yml",
        commands: [
          {
            id: "GET /repairs",
            apiResponseRenderingTemplateFile: "../repairs.json",
            title: "fake",
          },
        ],
        botId: "",
      },
    ];
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };

    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "pathExists").mockImplementation((filePath) => {
      return true;
    });
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof InvalidFileOutsideOfTheDirectotryError);
    }
  });

  it("rejects icon file that is a symlink to outside directory", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.icons = {
      color: "symlinked/color.png",
      outline: "resources/outline.png",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    const appDir = path.resolve(path.dirname(args.manifestPath));
    const canonicalTarget = path.resolve("/outside-secrets/color.png");
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => {
      const resolved = String(p);
      if (resolved.includes("symlinked")) {
        return canonicalTarget;
      }
      return path.resolve(resolved);
    });
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert.isTrue(
      result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError
    );
    if (result.isErr() && result.error instanceof InvalidFileOutsideOfTheDirectotryError) {
      chai.assert.include(result.error.displayMessage, manifest.icons.color);
      chai.assert.include(result.error.displayMessage, canonicalTarget);
      chai.assert.include(result.error.displayMessage, appDir);
      chai.assert.notInclude(result.error.message, canonicalTarget);
    }
  });

  it("rejects api spec file that is a symlink to outside directory", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "1.19",
    } as TeamsManifestV1D19.TeamsManifestV1D19;
    manifest.composeExtensions = [
      {
        composeExtensionType: "apiBased",
        apiSpecificationFile: "api/openapi.yaml",
        commands: [],
        botId: "",
      },
    ];
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => {
      const resolved = String(p);
      if (resolved.includes("api")) {
        return path.resolve("/outside-secrets/openapi.yaml");
      }
      return resolved;
    });
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof InvalidFileOutsideOfTheDirectotryError);
    }
  });

  it("rejects agent skill folder that is a symlink to outside directory", async () => {
    const args: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
    };

    const manifest = {
      manifestVersion: "devPreview",
      agentSkills: [{ folder: "skills" }],
    } as any;
    manifest.icons = {
      color: "resources/color.png",
      outline: "resources/outline.png",
    };
    vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => {
      const resolved = String(p);
      if (resolved.includes("skills")) {
        return path.resolve("/outside-secrets/skills");
      }
      return resolved;
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) => {
      if (flag.name === "TEAMSFX_AGENT_SKILLS") return true;
      return false;
    });
    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof InvalidFileOutsideOfTheDirectotryError);
    }
  });

  it("addLocalFolderRecursive skips symlink entries", async () => {
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);
    vi.spyOn(fs, "readdir").mockImplementation(async () => {
      return [
        {
          name: "symlinked-file.txt",
          isSymbolicLink: () => true,
          isDirectory: () => false,
          isFile: () => false,
        },
        {
          name: "normal-file.txt",
          isSymbolicLink: () => false,
          isDirectory: () => false,
          isFile: () => true,
        },
      ] as any;
    });

    const addedFiles: string[] = [];
    const fakeZip = {
      addLocalFile: (localPath: string, zipPath: string) => {
        addedFiles.push(localPath);
      },
    } as any;

    const driver = new CreateAppPackageDriver();
    await (driver as any).addLocalFolderRecursive(
      fakeZip,
      "/project/appPackage/skills",
      "/project/appPackage"
    );

    chai.assert.isFalse(
      addedFiles.some((f) => f.includes("symlinked-file")),
      "symlinked file should be skipped"
    );
    chai.assert.isTrue(
      addedFiles.some((f) => f.includes("normal-file")),
      "normal file should be added"
    );
  });

  it("addLocalFolderRecursive skips files whose realpath is outside app directory", async () => {
    vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => {
      const resolved = String(p);
      if (resolved.includes("leaked-file")) {
        return path.resolve("/outside-secrets/leaked-file.txt");
      }
      return resolved;
    });
    vi.spyOn(fs, "readdir").mockImplementation(async () => {
      return [
        {
          name: "leaked-file.txt",
          isSymbolicLink: () => false,
          isDirectory: () => false,
          isFile: () => true,
        },
      ] as any;
    });

    const addedFiles: string[] = [];
    const fakeZip = {
      addLocalFile: (localPath: string, zipPath: string) => {
        addedFiles.push(localPath);
      },
    } as any;

    const driver = new CreateAppPackageDriver();
    await (driver as any).addLocalFolderRecursive(
      fakeZip,
      "/project/appPackage/skills",
      "/project/appPackage"
    );

    chai.assert.isFalse(
      addedFiles.some((f) => f.includes("leaked-file")),
      "file with realpath outside app directory should be skipped"
    );
  });

  describe("copilotGpt", async () => {
    it("version <= 1.6: happy path ", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [
          {
            file: "resources/gpt.json",
            id: "action_1",
          },
        ],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      const outputFileStub = vi.spyOn(fs, "outputFile");

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      if (result.isErr()) {
        console.log(result.error);
      }
      chai.assert.isTrue(result.isOk());
      chai.assert.isTrue(outputFileStub.mock.calls.length === 1);
      const outputExist = await fs.pathExists(args.outputZipPath);
      chai.assert.isTrue(outputExist);
      if (outputExist) {
        const zip = new AdmZip(args.outputZipPath);
        let gptManifestContent = "";
        let plugin = "";
        let apiSpec = "";

        const entries = zip.getEntries();
        entries.forEach((e) => {
          const name = e.entryName;
          if (name.endsWith("gpt.json")) {
            const data = e.getData();
            gptManifestContent = data.toString("utf8");
          } else if (name.endsWith("ai-plugin.json")) {
            const data = e.getData();
            plugin = data.toString("utf8");
          } else if (name.endsWith("openai.yml")) {
            const data = e.getData();
            apiSpec = data.toString("utf8");
          }
        });

        chai.assert(
          plugin &&
            apiSpec &&
            gptManifestContent &&
            gptManifestContent.search("APP_NAME_SUFFIX") < 0 &&
            gptManifestContent.search("test") > 0
        );
        await fs.remove(args.outputZipPath);
      }
    });

    it("version > 1.6: happy path ", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [
          {
            file: "resources/gpt.json",
            id: "action_1",
          },
        ],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      const outputFileStub = vi.spyOn(fs, "outputFile");

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      if (result.isErr()) {
        console.log(result.error);
      }
      chai.assert.isTrue(result.isOk());
      chai.assert.isTrue(outputFileStub.mock.calls.length === 3);
      const outputExist = await fs.pathExists(args.outputZipPath);
      chai.assert.isTrue(outputExist);
      if (outputExist) {
        const zip = new AdmZip(args.outputZipPath);
        let gptManifestContent = "";
        let plugin = "";
        let apiSpec = "";

        const entries = zip.getEntries();
        entries.forEach((e) => {
          const name = e.entryName;
          if (name.endsWith("gpt.json")) {
            const data = e.getData();
            gptManifestContent = data.toString("utf8");
          } else if (name.endsWith("ai-plugin.json")) {
            const data = e.getData();
            plugin = data.toString("utf8");
          } else if (name.endsWith("openai.yml")) {
            const data = e.getData();
            apiSpec = data.toString("utf8");
          }
        });

        chai.assert(
          plugin &&
            apiSpec &&
            gptManifestContent &&
            gptManifestContent.search("APP_NAME_SUFFIX") < 0 &&
            gptManifestContent.search("test") > 0
        );
        await fs.remove(args.outputZipPath);
      }
    });

    it("error if gpt manifest does not exist ", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [
          {
            file: "resources/gpt.json",
            id: "action_1",
          },
        ],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(fs, "pathExists").mockImplementation(async (path: string) => {
        if (path.endsWith("gpt.json")) {
          return false;
        } else {
          return true;
        }
      });

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;

      chai.assert.isTrue(result.isErr());

      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof FileNotFoundError);
      }
    });

    it("error if parse gpt manifest error ", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;

      manifest.copilotAgents = {
        declarativeAgents: [
          {
            file: "resources/gpt.json",
            id: "action_1",
          },
        ],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(fs, "readFile").mockImplementation(async (file: fs.PathLike | number) => {
        if (file.toString().includes("gpt.json")) {
          return "" as any;
        } else {
          return JSON.stringify({});
        }
      });

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;

      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof JSONSyntaxError);
      }
    });

    it("error when placeholder is not resolved in gpt manifest", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
      };
      vi.spyOn(fs, "pathExists").mockImplementation((filePath) => {
        return true;
      });

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      manifest.copilotAgents = {
        declarativeAgents: [
          {
            file: "resources/gpt.json",
            id: "action_1",
          },
        ],
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});

      delete process.env["APP_NAME_SUFFIX"];
      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;

      chai.assert(
        result.isErr() &&
          result.error.name === "MissingEnvironmentVariablesError" &&
          result.error.message.includes("APP_NAME_SUFFIX")
      );
    });

    it("error when add files for plugin failed", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.dev.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [
          {
            file: "resources/gpt.json",
            id: "action_1",
          },
        ],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      delete process.env[openapiServerPlaceholder];

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;

      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert(
          result.isErr() &&
            result.error.name === "MissingEnvironmentVariablesError" &&
            result.error.message.includes(openapiServerPlaceholder)
        );
      }
    });

    it("relative path error 1", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.localizationInfo = {
        defaultLanguageTag: "en",
        additionalLanguages: [
          {
            languageTag: "de",
            file: "../migrate.manifest.json",
          },
        ],
        defaultLanguageFile: "resources/de.json",
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);
      const outputFileStub = vi.spyOn(fs, "outputFile");

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof InvalidFileOutsideOfTheDirectotryError);
      }
    });

    it("resolve additional localization file error", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.localizationInfo = {
        defaultLanguageTag: "en",
        additionalLanguages: [
          {
            languageTag: "de",
            file: "migrate.manifest.json",
          },
        ],
        defaultLanguageFile: "de.json",
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);
      vi.spyOn(manifestUtils, "resolveLocFile").mockResolvedValue(
        err(new FileNotFoundError("teamsapp", "faked_loc_path"))
      );

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof FileNotFoundError);
      }
    });

    it("resolve default localization file error", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.localizationInfo = {
        defaultLanguageTag: "en",
        additionalLanguages: [
          {
            languageTag: "de",
            file: "migrate.manifest.json",
          },
        ],
        defaultLanguageFile: "de.json",
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);
      vi.spyOn(manifestUtils, "resolveLocFile").mockImplementation(async (path) => {
        if (path.includes("migrate.manifest.json")) {
          return ok("{}");
        } else {
          return err(new FileNotFoundError("teamsapp", "faked_loc_path"));
        }
      });

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof FileNotFoundError);
      }
    });

    it("relative path error 2", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.localizationInfo = {
        defaultLanguageTag: "en",
        additionalLanguages: [
          {
            languageTag: "de",
            file: "resources/de.json",
          },
        ],
        defaultLanguageFile: "../migrate.manifest.json",
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);
      const writeFileStub = vi.spyOn(fs, "writeFile").mockImplementation(async () => {});

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof InvalidFileOutsideOfTheDirectotryError);
      }
    });

    it("zip same level dir", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.composeExtensions = [
        {
          composeExtensionType: "apiBased",
          apiSpecificationFile: "resources/openai.yml",
          commands: [
            {
              id: "GET /repairs",
              apiResponseRenderingTemplateFile: "resources/repairs.json",
              title: "fake",
            },
          ],
          botId: "",
        },
      ];
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      manifest.localizationInfo = {
        defaultLanguageTag: "en",
        additionalLanguages: [
          {
            languageTag: "de",
            file: "de.json",
          },
        ],
        defaultLanguageFile: "de.json",
      };
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));

      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      const outputFileStub = vi.spyOn(fs, "outputFile");
      vi.spyOn(manifestUtils, "resolveLocFile").mockResolvedValue(ok("{}"));

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert(result.isOk());
      chai.assert(outputFileStub.mock.calls.length === 1);
      if (await fs.pathExists(args.outputZipPath)) {
        const zip = new AdmZip(args.outputZipPath);

        let openapiContent = "";

        const entries = zip.getEntries();
        for (const e of entries) {
          const name = e.entryName;

          if (name.endsWith("openai.yml")) {
            const data = e.getData();
            openapiContent = data.toString("utf8");
            break;
          }
        }

        chai.assert(
          openapiContent != undefined &&
            openapiContent.length > 0 &&
            openapiContent.search(fakeUrl) >= 0 &&
            openapiContent.search(openapiServerPlaceholder) < 0
        );
        await fs.remove(args.outputZipPath);
      }
    });

    it("should add embedded knowledge files for Declarative Agent", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.embedded.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.embedded.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "1" }],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };

      // Updated gpt manifest stub with required properties.
      const declarativeAgentManifest = {
        name: "TestDeclarativeCopilot",
        description: "Test declarative copilot manifest",
        actions: [],
        capabilities: [
          {
            name: "EmbeddedKnowledge",
            files: [{ file: "EmbeddedKnowledge/knowledge.docx" }],
          },
        ],
      } as DeclarativeCopilotManifestSchema;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockImplementation(async (filePath) => {
        // Return true for all required files including declarativeAgent.json, color/outline files and knowledge file.
        if (
          filePath.includes("knowledge.docx") ||
          filePath.includes("declarativeAgent.json") ||
          filePath.includes("color.png") ||
          filePath.includes("outline.png")
        ) {
          return true;
        }
        return true;
      });

      const mockedDriverContext: any = {
        m365TokenProvider: {},
        projectPath: "./",
        platform: 0,
        logProvider: { info: () => {} },
        ui: {},
        addTelemetryProperties: () => {},
      };

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert.isTrue(result.isOk());

      if (await fs.pathExists(args.outputZipPath)) {
        const AdmZip = require("adm-zip");
        const zip = new AdmZip(args.outputZipPath);
        const knowledgeEntry = zip.getEntry("EmbeddedKnowledge/knowledge.docx");
        chai.assert.exists(knowledgeEntry, "Embedded knowledge file should be added");
        await fs.remove(args.outputZipPath);
      }
    });

    it("should add embedded knowledge files for Declarative Agent of MetaOS", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.embedded.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.embedded.json",
      };

      const manifest = {
        manifestVersion: "devPreview",
      } as TeamsManifestVDevPreview.TeamsManifestVDevPreview;
      manifest.copilotAgents = {
        declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "1" }],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };

      // Updated gpt manifest stub with required properties.
      const declarativeAgentManifest = {
        name: "TestDeclarativeCopilot",
        description: "Test declarative copilot manifest",
        actions: [],
        capabilities: [
          {
            name: "EmbeddedKnowledge",
            files: [{ file: "EmbeddedKnowledge/knowledge.docx" }],
          },
        ],
      } as DeclarativeCopilotManifestSchema;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockImplementation(async (filePath) => {
        // Return true for all required files including declarativeAgent.json, color/outline files and knowledge file.
        if (
          filePath.includes("knowledge.docx") ||
          filePath.includes("declarativeAgent.json") ||
          filePath.includes("color.png") ||
          filePath.includes("outline.png")
        ) {
          return true;
        }
        return true;
      });

      const mockedDriverContext: any = {
        m365TokenProvider: {},
        projectPath: "./",
        platform: 0,
        logProvider: { info: () => {} },
        ui: {},
        addTelemetryProperties: () => {},
      };

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert.isTrue(result.isOk());

      if (await fs.pathExists(args.outputZipPath)) {
        const AdmZip = require("adm-zip");
        const zip = new AdmZip(args.outputZipPath);
        const knowledgeEntry = zip.getEntry("EmbeddedKnowledge/knowledge.docx");
        chai.assert.exists(knowledgeEntry, "Embedded knowledge file should be added");
        await fs.remove(args.outputZipPath);
      }
    });

    it("should skip if there is no embedded knowledge capability for Declarative Agent", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.embedded.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.embedded.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "1" }],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };

      // Updated gpt manifest stub with required properties.
      const declarativeAgentManifest = {
        name: "TestDeclarativeCopilot",
        description: "Test declarative copilot manifest",
        actions: [],
        capabilities: [
          {
            name: "WebSearch",
          },
        ],
      } as DeclarativeCopilotManifestSchema;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockImplementation(async (filePath) => {
        // Return true for all required files including declarativeAgent.json, color/outline files.
        if (
          filePath.includes("declarativeAgent.json") ||
          filePath.includes("color.png") ||
          filePath.includes("outline.png")
        ) {
          return true;
        }
        return true;
      });

      const mockedDriverContext: any = {
        m365TokenProvider: {},
        projectPath: "./",
        platform: 0,
        logProvider: { info: () => {} },
        ui: {},
        addTelemetryProperties: () => {},
      };

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert.isTrue(result.isOk());

      if (await fs.pathExists(args.outputZipPath)) {
        await fs.remove(args.outputZipPath);
      }
    });

    it("should handle undefined embedded knowledge files for Declarative Agent", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.embedded.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.embedded.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "1" }],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };

      // Updated gpt manifest stub with required properties.
      const declarativeAgentManifest = {
        name: "TestDeclarativeCopilot",
        description: "Test declarative copilot manifest",
        actions: [],
        capabilities: [
          {
            name: "EmbeddedKnowledge",
            files: [{}],
          },
        ],
      } as DeclarativeCopilotManifestSchema;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockImplementation(async (filePath) => {
        // Return true for all required files including declarativeAgent.json, color/outline files.
        if (
          filePath.includes("declarativeAgent.json") ||
          filePath.includes("color.png") ||
          filePath.includes("outline.png")
        ) {
          return true;
        }
        return true;
      });

      const mockedDriverContext: any = {
        m365TokenProvider: {},
        projectPath: "./",
        platform: 0,
        logProvider: { info: () => {} },
        ui: {},
        addTelemetryProperties: () => {},
      };

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert.isTrue(result.isOk());

      if (await fs.pathExists(args.outputZipPath)) {
        await fs.remove(args.outputZipPath);
      }
    });

    it("should throw error if embedded knowledge file does not exist for Declarative Agent", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.embedded.missing.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.embedded.missing.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "1" }],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };

      // Prepare a minimal declarative agent manifest with an embedded knowledge file.
      const declarativeAgentManifest = {
        name: "TestDeclarativeCopilot",
        description: "Missing knowledge file test",
        actions: [],
        capabilities: [
          {
            name: "EmbeddedKnowledge",
            files: [{ file: "EmbeddedKnowledge/knowledgeMissing.docx" }],
          },
        ],
      } as DeclarativeCopilotManifestSchema;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      // Simulate missing knowledge file.
      vi.spyOn(fs, "pathExists").mockImplementation(async (filePath) => {
        if (filePath.toString().includes("knowledgeMissing.docx")) {
          return false;
        }
        return true;
      });

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof FileNotFoundError);
      }
    });

    // Regression test for issue #15837. The original failure mode was a TypeError
    // ("ce.value.capabilities.filter is not a function") thrown deep inside the build
    // because a malformed declarativeAgent.json produced an untyped object where an
    // array was expected. With Phase 1 (typed reader) the read step rejects the
    // manifest with a descriptive JSONSyntaxError, and Phase 3 (Array.isArray guards)
    // prevents the crash class even if a future code path bypasses the typed reader.
    it("propagates JSONSyntaxError when declarativeAgent.json has invalid shape (#15837)", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.bad-shape.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.bad-shape.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "1" }],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      // Simulate the typed converter rejecting a non-array `capabilities` field —
      // this is exactly what `readCopilotGptManifestFile` now produces for the
      // user's manifest in #15837.
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        err(
          new JSONSyntaxError(
            "declarativeAgent.json",
            new Error(
              'Invalid value for key "capabilities". Expected array but got {"name":"CodeInterpreter"}'
            ),
            "CopilotGptManifestUtils"
          )
        )
      );

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;

      chai.assert.isTrue(result.isErr(), "createAppPackage should return err, not throw");
      if (result.isErr()) {
        chai.assert.isTrue(
          result.error instanceof JSONSyntaxError,
          `expected JSONSyntaxError, got ${result.error.constructor.name}`
        );
        chai.assert.include(result.error.message, "capabilities");
      }
    });

    it("rejects non-array actions with a descriptive error", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.guard2.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.guard2.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "1" }],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };

      const malformedManifest = {
        name: "TestDeclarativeCopilot",
        description: "shape-bypass test",
        actions: { id: "action1" } as any,
        capabilities: [],
      } as DeclarativeCopilotManifestSchema;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(ok(malformedManifest));

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert.isTrue(result.isErr(), "build should reject non-array actions");
      if (result.isErr()) {
        chai.assert.include(result.error.message, "actions");
      }

      if (await fs.pathExists(args.outputZipPath)) {
        await fs.remove(args.outputZipPath);
      }
    });

    // Defense-in-depth: even if `getManifest` returns a manifest with a non-array
    // `capabilities` (e.g. a future code path that bypasses the typed reader),
    // createAppPackage must not crash with `TypeError: capabilities.filter is not a function`.
    it("does not crash when capabilities is not an array (rejects with descriptive error)", async () => {
      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.guard.zip",
        outputJsonPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.guard.json",
      };

      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "1" }],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };

      // Bypass the typed reader by stubbing getManifest to return a manifest where
      // `capabilities` is an object instead of an array.
      const malformedManifest = {
        name: "TestDeclarativeCopilot",
        description: "shape-bypass test",
        actions: [],
        capabilities: { name: "CodeInterpreter" } as any,
      } as DeclarativeCopilotManifestSchema;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(ok(malformedManifest));

      // Must reject non-array capabilities with a descriptive error, not crash
      // with a raw TypeError (#15837).
      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert.isTrue(result.isErr(), "build should reject non-array capabilities");
      if (result.isErr()) {
        chai.assert.include(result.error.message, "capabilities");
      }

      if (await fs.pathExists(args.outputZipPath)) {
        await fs.remove(args.outputZipPath);
      }
    });
  });

  describe("agent skills bundling", async () => {
    const skillArgs: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.skills.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.skills.json",
    };

    beforeEach(() => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) => {
        if (flag.name === FeatureFlagName.AgentSkillsManifest) return true;
        return false;
      });
    });

    function createTeamsManifest(): TeamsManifestV1D19.TeamsManifestV1D19 {
      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      manifest.copilotAgents = {
        declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "1" }],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      return manifest;
    }

    it("should bundle skill directories when agent_skills is present", async () => {
      const manifest = createTeamsManifest();
      const declarativeAgentManifest = {
        name: "TestAgent",
        description: "Test agent with skills",
        actions: [],
        agent_skills: [{ folder: "skills/skill1" }],
      } as any;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const result = (await teamsAppDriver.execute(skillArgs, mockedDriverContext)).result;
      chai.assert.isTrue(result.isOk());

      if (await fs.pathExists(skillArgs.outputZipPath)) {
        const zip = new AdmZip(skillArgs.outputZipPath);
        const skillMdEntry = zip.getEntry("skills/skill1/SKILL.md");
        chai.assert.exists(skillMdEntry, "SKILL.md should be bundled in zip");
        const handlerEntry = zip.getEntry("skills/skill1/handler.js");
        chai.assert.exists(handlerEntry, "handler.js should be bundled in zip");
        await fs.remove(skillArgs.outputZipPath);
      }
    });

    it("ZIP-AC-02: omits a nested skill link to an external directory", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-skill-link-"));
      try {
        const appDirectory = path.join(root, "appPackage");
        const skillDirectory = path.join(appDirectory, "skills", "linked-skill");
        const externalDirectory = path.join(root, "external");
        const outputZipPath = path.join(root, "build", "appPackage.zip");
        const manifestPath = path.join(appDirectory, "manifest.json");
        await fs.ensureDir(skillDirectory);
        await fs.ensureDir(externalDirectory);
        await fs.writeFile(path.join(appDirectory, "color.png"), "color");
        await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
        await fs.writeFile(path.join(skillDirectory, "SKILL.md"), "# Safe skill");
        await fs.writeFile(path.join(externalDirectory, "secret.txt"), "EXTERNAL_SENTINEL");
        await fs.symlink(
          externalDirectory,
          path.join(skillDirectory, "linked"),
          process.platform === "win32" ? "junction" : "dir"
        );
        await fs.writeJSON(path.join(appDirectory, "declarativeAgent.json"), {
          version: "v1.6",
          name: "Skill agent",
          description: "Skill agent",
          instructions: "Use the skill",
          agent_skills: [{ folder: "skills/linked-skill" }],
        });

        const manifest = {
          manifestVersion: "1.19",
          icons: { color: "color.png", outline: "outline.png" },
          copilotAgents: {
            declarativeAgents: [{ file: "declarativeAgent.json", id: "agent" }],
          },
        } satisfies TeamsManifestV1D19.TeamsManifestV1D19;
        await fs.writeJSON(manifestPath, manifest);
        vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
        vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
          ok({
            name: "Skill agent",
            description: "Skill agent",
            instructions: "Use the skill",
            actions: [],
            agent_skills: [{ folder: "skills/linked-skill" }],
          } as any)
        );

        const result = (
          await teamsAppDriver.execute(
            {
              manifestPath,
              outputZipPath,
              outputJsonPath: path.join(root, "build", "manifest.json"),
            },
            { ...mockedDriverContext, projectPath: root }
          )
        ).result;

        chai.assert.isTrue(result.isOk());
        const zip = new AdmZip(outputZipPath);
        chai.assert.isNull(zip.getEntry("skills/linked-skill/linked/secret.txt"));
        chai.assert.notInclude(
          zip
            .getEntries()
            .map((entry) => entry.getData().toString("utf8"))
            .join("\n"),
          "EXTERNAL_SENTINEL"
        );
      } finally {
        await fs.remove(root);
      }
    });

    it("ZIP-AC-03: leaves no final artifacts when the package exceeds the size limit", async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "create-app-package-size-"));
      try {
        const appDirectory = path.join(root, "appPackage");
        const skillDirectory = path.join(appDirectory, "skills", "large-skill");
        const outputDirectory = path.join(root, "build");
        const outputZipPath = path.join(outputDirectory, "appPackage.zip");
        const outputJsonPath = path.join(outputDirectory, "manifest.json");
        const manifestPath = path.join(appDirectory, "manifest.json");
        await fs.ensureDir(skillDirectory);
        await fs.writeFile(path.join(appDirectory, "color.png"), "color");
        await fs.writeFile(path.join(appDirectory, "outline.png"), "outline");
        await fs.writeFile(path.join(skillDirectory, "SKILL.md"), "# Large skill");
        await fs.writeFile(path.join(skillDirectory, "payload.bin"), randomBytes(11 * 1024 * 1024));
        await fs.writeJSON(path.join(appDirectory, "declarativeAgent.json"), {
          version: "v1.6",
          name: "Large skill agent",
          description: "Large skill agent",
          instructions: "Use the skill",
          agent_skills: [{ folder: "skills/large-skill" }],
        });

        const manifest = {
          manifestVersion: "1.19",
          icons: { color: "color.png", outline: "outline.png" },
          copilotAgents: {
            declarativeAgents: [{ file: "declarativeAgent.json", id: "agent" }],
          },
        } satisfies TeamsManifestV1D19.TeamsManifestV1D19;
        await fs.writeJSON(manifestPath, manifest);
        vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
        vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
          ok({
            name: "Large skill agent",
            description: "Large skill agent",
            instructions: "Use the skill",
            actions: [],
            agent_skills: [{ folder: "skills/large-skill" }],
          } as any)
        );

        const result = (
          await teamsAppDriver.execute(
            { manifestPath, outputZipPath, outputJsonPath },
            { ...mockedDriverContext, projectPath: root }
          )
        ).result;

        chai.assert.isTrue(result.isErr() && result.error instanceof AppPackageSizeExceededError);
        chai.assert.isFalse(await fs.pathExists(outputZipPath));
        chai.assert.isFalse(await fs.pathExists(outputJsonPath));
      } finally {
        await fs.remove(root);
      }
    });

    it("should return error when skill folder does not exist", async () => {
      const manifest = createTeamsManifest();
      const declarativeAgentManifest = {
        name: "TestAgent",
        description: "Test agent with skills",
        actions: [],
        agent_skills: [{ folder: "skills/nonexistent" }],
      } as any;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockImplementation(async (filePath) => {
        if (filePath.toString().includes("nonexistent")) {
          return false;
        }
        return true;
      });

      const result = (await teamsAppDriver.execute(skillArgs, mockedDriverContext)).result;
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof FileNotFoundError);
      }
    });

    it("should return error when SKILL.md is missing in skill folder", async () => {
      const manifest = createTeamsManifest();
      const declarativeAgentManifest = {
        name: "TestAgent",
        description: "Test agent with skills",
        actions: [],
        agent_skills: [{ folder: "skills/skill1" }],
      } as any;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockImplementation(async (filePath) => {
        if (filePath.toString().includes("SKILL.md")) {
          return false;
        }
        return true;
      });

      const result = (await teamsAppDriver.execute(skillArgs, mockedDriverContext)).result;
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof FileNotFoundError);
        chai.assert.include(result.error.message, "SKILL.md");
      }
    });

    it("should return error when skill path escapes appPackage boundary", async () => {
      const manifest = createTeamsManifest();
      const declarativeAgentManifest = {
        name: "TestAgent",
        description: "Test agent with skills",
        actions: [],
        agent_skills: [{ folder: "../../../outside" }],
      } as any;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "realpath").mockImplementation(async (p: any) => p);

      const result = (await teamsAppDriver.execute(skillArgs, mockedDriverContext)).result;
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof InvalidFileOutsideOfTheDirectotryError);
      }
    });

    it("should succeed with empty agent_skills array (no-op)", async () => {
      const manifest = createTeamsManifest();
      const declarativeAgentManifest = {
        name: "TestAgent",
        description: "Test agent with no skills",
        actions: [],
        agent_skills: [],
      } as any;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const result = (await teamsAppDriver.execute(skillArgs, mockedDriverContext)).result;
      chai.assert.isTrue(result.isOk());

      if (await fs.pathExists(skillArgs.outputZipPath)) {
        const zip = new AdmZip(skillArgs.outputZipPath);
        const entries = zip.getEntries().map((e) => e.entryName);
        const skillEntries = entries.filter((name) => name.includes("skills/"));
        chai.assert.isEmpty(skillEntries, "No skill entries should be in the zip");
        await fs.remove(skillArgs.outputZipPath);
      }
    });

    it("should bundle multiple skills alongside actions and embedded knowledge", async () => {
      const manifest = createTeamsManifest();
      const declarativeAgentManifest = {
        name: "TestAgent",
        description: "Test agent with skills, actions, and knowledge",
        actions: [{ id: "action_1", file: "ai-plugin.json" }],
        capabilities: [
          {
            name: "EmbeddedKnowledge",
            files: [{ file: "EmbeddedKnowledge/knowledge.docx" }],
          },
        ],
        agent_skills: [{ folder: "skills/skill1" }, { folder: "skills/skill2" }],
      } as any;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const result = (await teamsAppDriver.execute(skillArgs, mockedDriverContext)).result;
      chai.assert.isTrue(result.isOk());

      if (await fs.pathExists(skillArgs.outputZipPath)) {
        const zip = new AdmZip(skillArgs.outputZipPath);
        const entries = zip.getEntries().map((e) => e.entryName);

        // Verify skill1 files
        chai.assert.isTrue(
          entries.some((e) => e.includes("skills/skill1/SKILL.md")),
          "skill1 SKILL.md should be in zip"
        );
        // Verify skill2 files
        chai.assert.isTrue(
          entries.some((e) => e.includes("skills/skill2/SKILL.md")),
          "skill2 SKILL.md should be in zip"
        );
        // Verify actions are also bundled
        chai.assert.isTrue(
          entries.some((e) => e.endsWith("ai-plugin.json")),
          "ai-plugin.json should be in zip"
        );
        // Verify embedded knowledge is also bundled
        chai.assert.isTrue(
          entries.some((e) => e.includes("EmbeddedKnowledge/knowledge.docx")),
          "Embedded knowledge should be in zip"
        );
        await fs.remove(skillArgs.outputZipPath);
      }
    });
  });

  describe("Teams manifest agentSkills packaging", async () => {
    const teamsManifestAgentSkillsArgs: CreateAppPackageArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
      outputZipPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.teams-manifest-skills.zip",
      outputJsonPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/manifest.teams-manifest-skills.json",
    };

    function createTeamsManifestWithAgentSkills(): TeamsManifestV1D19.TeamsManifestV1D19 & {
      agentSkills?: { folder: string }[];
    } {
      const manifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19 & {
        agentSkills?: { folder: string }[];
      };
      manifest.copilotAgents = {
        declarativeAgents: [{ file: "resources/declarativeAgent.json", id: "1" }],
      };
      manifest.icons = {
        color: "resources/color.png",
        outline: "resources/outline.png",
      };
      return manifest;
    }

    it("should bundle top-level Teams manifest agentSkills folders unconditionally (no feature flag required)", async () => {
      const manifest = createTeamsManifestWithAgentSkills();
      manifest.agentSkills = [{ folder: "skills/skill1" }];
      const declarativeAgentManifest = {
        name: "TestAgent",
        description: "Test agent with top-level Teams manifest skills",
        actions: [],
      } as any;

      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      const pathExistsStub = vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const result = (
        await teamsAppDriver.execute(teamsManifestAgentSkillsArgs, mockedDriverContext)
      ).result;
      chai.assert.isTrue(result.isOk());
      const skillMdChecks = pathExistsStub.mock.calls.filter((call) =>
        call[0].toString().includes(path.join("skills", "skill1", "SKILL.md"))
      );
      chai.assert.lengthOf(skillMdChecks, 1);

      if (await fs.pathExists(teamsManifestAgentSkillsArgs.outputZipPath)) {
        const zip = new AdmZip(teamsManifestAgentSkillsArgs.outputZipPath);
        const skillMdEntry = zip.getEntry("skills/skill1/SKILL.md");
        chai.assert.exists(skillMdEntry, "SKILL.md should be bundled in zip");
        await fs.remove(teamsManifestAgentSkillsArgs.outputZipPath);
      }
    });

    it("should skip Teams manifest agentSkills already packaged from DA manifest", async () => {
      const manifest = createTeamsManifestWithAgentSkills();
      manifest.agentSkills = [{ folder: "skills/skill1" }];
      const declarativeAgentManifest = {
        name: "TestAgent",
        description: "Test agent with duplicated skills",
        actions: [],
        agent_skills: [{ folder: "skills/skill1" }],
      } as any;

      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag: any) => {
        if (flag.name === FeatureFlagName.AgentSkillsManifest) return true;
        return false;
      });
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);

      const result = (
        await teamsAppDriver.execute(teamsManifestAgentSkillsArgs, mockedDriverContext)
      ).result;
      chai.assert.isTrue(result.isOk());

      if (await fs.pathExists(teamsManifestAgentSkillsArgs.outputZipPath)) {
        const zip = new AdmZip(teamsManifestAgentSkillsArgs.outputZipPath);
        const skillEntries = zip
          .getEntries()
          .filter((entry) => entry.entryName === "skills/skill1/SKILL.md");
        chai.assert.lengthOf(skillEntries, 1, "skill folder should only be packaged once");
        await fs.remove(teamsManifestAgentSkillsArgs.outputZipPath);
      }
    });

    it("should return error when Teams manifest agentSkills folder is missing SKILL.md", async () => {
      const manifest = createTeamsManifestWithAgentSkills();
      manifest.agentSkills = [{ folder: "skills/skill1" }];
      const declarativeAgentManifest = {
        name: "TestAgent",
        description: "Test agent with invalid Teams manifest skill",
        actions: [],
      } as any;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      vi.spyOn(copilotGptManifestUtils, "getManifest").mockResolvedValue(
        ok(declarativeAgentManifest)
      );
      vi.spyOn(fs, "pathExists").mockImplementation(async (filePath) => {
        if (filePath.toString().includes(path.join("skills", "skill1", "SKILL.md"))) {
          return false;
        }
        return true;
      });

      const result = (
        await teamsAppDriver.execute(teamsManifestAgentSkillsArgs, mockedDriverContext)
      ).result;
      chai.assert.isTrue(result.isErr());
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof FileNotFoundError);
        chai.assert.include(result.error.message, "SKILL.md");
      }
    });
  });

  describe("package size limit", () => {
    it("should fail when zip exceeds 10 MB", async () => {
      const manifest = {
        manifestVersion: "1.16",
        icons: {
          color: "resources/color.png",
          outline: "resources/outline.png",
        },
      } as TeamsManifest;
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(driverUtils, "updateVersionForTeamsAppYamlFile").mockResolvedValue();
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      // Stub fs.stat to return a large file size
      vi.spyOn(fs, "stat").mockResolvedValue({
        size: 20 * 1024 * 1024,
        mode: 0o644,
        isDirectory: () => false,
      } as any);

      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
      };

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert.isTrue(result.error instanceof AppPackageSizeExceededError);
        chai.assert.include(result.error.message, "exceeds the maximum allowed size");
      }
      await fs.remove(args.outputZipPath);
    });

    it("should succeed when zip is within 10 MB", async () => {
      const manifest = {
        manifestVersion: "1.16",
        icons: {
          color: "resources/color.png",
          outline: "resources/outline.png",
        },
      } as TeamsManifest;
      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(manifest));
      vi.spyOn(fs, "chmod").mockImplementation(async () => {});
      vi.spyOn(fs, "existsSync").mockReturnValue(false);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(driverUtils, "updateVersionForTeamsAppYamlFile").mockResolvedValue();
      vi.spyOn(fs, "writeFile").mockImplementation(async () => {});
      // Stub fs.stat to return a small file size
      vi.spyOn(fs, "stat").mockResolvedValue({
        size: 1024 * 1024,
        mode: 0o644,
        isDirectory: () => false,
      } as any);

      const args: CreateAppPackageArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        outputZipPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage/appPackage.dev.zip",
        outputFolder: "./tests/plugins/resource/appstudio/resources-multi-env/build/appPackage",
      };

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      if (result.isErr()) {
        console.log(result.error);
      }
      chai.assert.isTrue(result.isOk());
      await fs.remove(args.outputZipPath);
    });
  });
});
