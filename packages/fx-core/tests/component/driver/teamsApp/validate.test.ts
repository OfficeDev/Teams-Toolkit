// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  AppManifestUtils,
  err,
  ManifestUtil,
  ok,
  Platform,
  SystemError,
  TeamsManifestV1D19,
  TeamsManifestVDevPreview,
} from "@microsoft/teamsfx-api";
import { chai, vi } from "vitest";
import { AppStudioError } from "../../../../src/component/driver/teamsApp/errors";
import { ValidateManifestArgs } from "../../../../src/component/driver/teamsApp/interfaces/ValidateManifestArgs";
import { copilotGptManifestUtils } from "../../../../src/component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { pluginManifestUtils } from "../../../../src/component/driver/teamsApp/utils/PluginManifestUtils";
import { ValidateManifestDriver } from "../../../../src/component/driver/teamsApp/validate";
import { InvalidActionInputError } from "../../../../src/error";
import { MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";

describe("teamsApp/validateManifest", async () => {
  const teamsAppDriver = new ValidateManifestDriver();
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
    projectPath: "./",
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("file not found - manifest", async () => {
    const args: ValidateManifestArgs = {
      manifestPath: "fakepath",
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(AppStudioError.FileNotFoundError.name, result.error.name);
    }
  });

  it("invalid param error", async () => {
    const args: ValidateManifestArgs = {
      manifestPath: "",
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof InvalidActionInputError);
    }
  });

  // it("happy path - validate against schema", async () => {
  //   const args: ValidateManifestArgs = {
  //     manifestPath:
  //       "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
  //   };

  //   process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

  //   const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
  //   chai.assert(result.isOk());
  // });

  // it("execute", async () => {
  //   const args: ValidateManifestArgs = {
  //     manifestPath:
  //       "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
  //   };

  //   process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

  //   const result = await teamsAppDriver.execute(args, mockedDriverContext);
  //   chai.assert(result.result.isOk());
  // });

  // it("happy path - VS", async () => {
  //   const args: ValidateManifestArgs = {
  //     manifestPath:
  //       "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
  //   };

  //   mockedDriverContext.platform = Platform.VS;

  //   process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

  //   const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
  //   chai.assert(result.isOk());
  // });

  // it("happy path- CLI", async () => {
  //   const args: ValidateManifestArgs = {
  //     manifestPath:
  //       "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
  //     showMessage: true,
  //   };

  //   mockedDriverContext.platform = Platform.CLI;

  //   process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

  //   const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
  //   chai.assert(result.isOk());
  // });

  // it("happy path- VSC", async () => {
  //   const args: ValidateManifestArgs = {
  //     manifestPath:
  //       "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
  //     showMessage: true,
  //   };

  //   mockedDriverContext.platform = Platform.VSCode;

  //   process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

  //   const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
  //   chai.assert(result.isOk());
  // });

  it("validation error - no schema", async () => {
    const args: ValidateManifestArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.noSchema.manifest.json",
    };

    process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert(result.error.name, AppStudioError.ValidationFailedError.name);
    }
  });

  it("validation error - invalid", async () => {
    const args: ValidateManifestArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.invalid.manifest.json",
    };

    process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert(result.error.name, AppStudioError.ValidationFailedError.name);
    }
  });

  it("validation error - cli", async () => {
    const args: ValidateManifestArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.invalid.manifest.json",
    };

    const mockedCliDriverContext = {
      ...mockedDriverContext,
      platform: Platform.CLI,
    };

    process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

    const result = (await teamsAppDriver.execute(args, mockedCliDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert(result.error.name, AppStudioError.ValidationFailedError.name);
    }
  });

  it("validation error - download failed", async () => {
    vi.spyOn(AppManifestUtils, "validateAgainstSchema")
      .mockResolvedValueOnce([])
      .mockImplementationOnce(() => {
        throw new Error("error");
      });
    const args: ValidateManifestArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
    };

    process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert(result.error.name, AppStudioError.ValidationFailedError.name);
    }
  });

  it("validation error - localization file validation failed", async () => {
    vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockImplementation(() => {
      throw new Error(`Failed to get manifest at url due to: unknown error`);
    });
    const args: ValidateManifestArgs = {
      manifestPath:
        "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
    };

    process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert(result.error.name, AppStudioError.ValidationFailedError.name);
    }
  });

  describe("validateLocalizatoinFiles", async () => {
    const teamsAppDriver = new ValidateManifestDriver();
    const mockedDriverContext: any = {
      projectPath: "./",
    };

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return ok when no additionalLanguages in manifest", async () => {
      const args: ValidateManifestArgs = { manifestPath: "fakepath" };
      const manifest = { localizationInfo: { additionalLanguages: [] } } as any;

      const result = await teamsAppDriver.validateLocalizatoinFiles(
        args,
        mockedDriverContext,
        manifest
      );
      chai.assert(result.isOk());
    });

    it("should return error when language file path is not defined", async () => {
      const args: ValidateManifestArgs = { manifestPath: "fakepath" };
      const manifest = {
        manifestVersion: "1.19",
        localizationInfo: {
          additionalLanguages: [{ file: undefined }],
        },
      } as unknown as TeamsManifestV1D19.TeamsManifestV1D19;

      const result = await teamsAppDriver.validateLocalizatoinFiles(
        args,
        mockedDriverContext,
        manifest
      );
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert.equal(result.error.name, AppStudioError.ValidationFailedError.name);
      }
    });

    it("should return error when manifest file cannot be found", async () => {
      const args: ValidateManifestArgs = { manifestPath: "fakepath" };
      const manifest = {
        manifestVersion: "1.19",
        localizationInfo: {
          additionalLanguages: [{ file: "filePath" }],
        },
      } as unknown as TeamsManifestV1D19.TeamsManifestV1D19;

      vi.spyOn(manifestUtils, "resolveLocFile").mockResolvedValue(
        err(new SystemError("error", "error", "", ""))
      );

      const result = await teamsAppDriver.validateLocalizatoinFiles(
        args,
        mockedDriverContext,
        manifest
      );
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert.equal(result.error.name, "error");
      }
    });

    // it("should return error when validation fails", async () => {
    //   const args: ValidateManifestArgs = { manifestPath: "fakepath" };
    //   const manifest = {
    //     manifestVersion: "1.19",
    //     localizationInfo: {
    //       additionalLanguages: [{ file: "filePath" }],
    //     },
    //   } as unknown as TeamsManifestV1D19.TeamsManifestV1D19;
    //   const fakeLocalizationFile = {
    //     $schema:
    //       "https://developer.microsoft.com/en-us/json-schemas/teams/v1.16/MicrosoftTeams.Localization.schema.json",
    //   };

    //   vi.spyOn(manifestUtils, "resolveLocFile")
    //     .mockResolvedValue(ok(JSON.stringify(fakeLocalizationFile)));
    //   vi.spyOn(ManifestUtil, "validateManifestAgainstSchema").mockResolvedValue(["Validation error"]);

    //   const result = await teamsAppDriver.validateLocalizatoinFiles(
    //     args,
    //     mockedDriverContext,
    //     manifest
    //   );
    //   chai.assert(result.isOk());
    //   if (result.isOk()) {
    //     chai.assert.isTrue(result.value.error[0].includes("Validation error"));
    //   }
    // });

    // it("should output errors when validation fails", async () => {
    //   const args: ValidateManifestArgs = {
    //     manifestPath:
    //       "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.invalid.localization.manifest.json",
    //   };
    //   process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

    //   const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    //   chai.assert(result.isErr());
    //   if (result.isErr()) {
    //     chai.assert.isTrue(result.error.message.includes("2 failed"));
    //   }
    // });

    // it("should output errors when validation fails - CLI", async () => {
    //   const args: ValidateManifestArgs = {
    //     manifestPath:
    //       "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.invalid.localization.manifest.json",
    //   };
    //   const mockedCLIDriverContext: any = {
    //     m365TokenProvider: new MockedM365Provider(),
    //     logProvider: new MockedLogProvider(),
    //     ui: new MockedUserInteraction(),
    //     projectPath: "./",
    //     platform: Platform.CLI,
    //   };
    //   process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

    //   const result = (await teamsAppDriver.execute(args, mockedCLIDriverContext)).result;
    //   chai.assert(result.isErr());
    //   if (result.isErr()) {
    //     chai.assert.isTrue(result.error.message.includes("2 failed"));
    //   }
    // });

    // it("should output errors when default language file validation fails", async () => {
    //   const args: ValidateManifestArgs = {
    //     manifestPath:
    //       "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.invalid.default.localization.manifest.json",
    //   };
    //   process.env.CONFIG_TEAMS_APP_NAME = "fakeName";

    //   const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    //   chai.assert(result.isErr());
    //   if (result.isErr()) {
    //     chai.assert.isTrue(result.error.message.includes("2 failed"));
    //   }
    // });

    it("should return error when validation throws exception", async () => {
      const args: ValidateManifestArgs = { manifestPath: "fakepath" };
      const manifest = {
        manifestVersion: "1.19",
        localizationInfo: {
          additionalLanguages: [{ file: "filePath" }],
        },
      } as unknown as TeamsManifestV1D19.TeamsManifestV1D19;
      const fakeLocalizationFile = {};

      vi.spyOn(manifestUtils, "resolveLocFile").mockResolvedValue(
        ok(JSON.stringify(fakeLocalizationFile))
      );
      vi.spyOn(ManifestUtil, "validateManifestAgainstSchema").mockImplementation(() => {
        throw new Error("validation exception");
      });

      const result = await teamsAppDriver.validateLocalizatoinFiles(
        args,
        mockedDriverContext,
        manifest
      );
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert.equal(result.error.name, AppStudioError.ValidationFailedError.name);
      }
    });

    it("should not throw error if schema does not have patternProperties", async () => {
      const args: ValidateManifestArgs = { manifestPath: "fakepath" };
      const manifest = { localizationInfo: { additionalLanguages: [{ file: "filePath" }] } } as any;
      vi.spyOn(ManifestUtil, "fetchSchema").mockResolvedValue({} as any);
      vi.spyOn(manifestUtils, "resolveLocFile").mockResolvedValue(ok("{}"));
      vi.spyOn(ManifestUtil, "validateManifestAgainstSchema").mockResolvedValue([] as any);
      const result = await teamsAppDriver.validateLocalizatoinFiles(
        args,
        mockedDriverContext,
        manifest
      );
      chai.assert(result.isOk());
    });

    it("should return ok when localization file is valid", async () => {
      const args: ValidateManifestArgs = { manifestPath: "fakepath" };
      const manifest = { localizationInfo: { additionalLanguages: [{ file: "filePath" }] } } as any;
      const fakeLocalizationFile = {
        $schema:
          "https://developer.microsoft.com/en-us/json-schemas/teams/v1.16/MicrosoftTeams.Localization.schema.json",
        "name.short": "name short",
        "name.full": "name full",
        "description.short": "desp short",
        "description.full": "desp full",
        "staticTabs[0].name": "static tab name",
        "activities.activityTypes[0].description": "aa",
      };

      vi.spyOn(manifestUtils, "resolveLocFile").mockResolvedValue(
        ok(JSON.stringify(fakeLocalizationFile))
      );
      const result = await teamsAppDriver.validateLocalizatoinFiles(
        args,
        mockedDriverContext,
        manifest
      );
      chai.assert(result.isOk());
    });
  });

  describe("validate Declarative Agent", async () => {
    it("validate with errors returned", async () => {
      const teamsManifest = {
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      teamsManifest.copilotAgents = {
        declarativeAgents: [
          {
            id: "fakeId",
            file: "fakeFile",
          },
        ],
      };

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(teamsManifest));
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);
      vi.spyOn(pluginManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: ["error1"],
        })
      );
      vi.spyOn(pluginManifestUtils, "logValidationErrors").mockReturnValue("errorMessage1");

      vi.spyOn(copilotGptManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: ["error2"],
          actionValidationResult: [
            {
              id: "fakeId",
              filePath: "fakeFile",
              validationResult: ["error3"],
            },
          ],
          skillValidationResult: [],
        })
      );
      vi.spyOn(copilotGptManifestUtils, "logValidationErrors").mockReturnValue("errorMessage2");

      const args: ValidateManifestArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        showMessage: true,
      };

      mockedDriverContext.platform = Platform.VSCode;
      mockedDriverContext.projectPath = "test";

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert.equal(result.error.name, AppStudioError.ValidationFailedError.name);
      }
    });

    it("validate with errors returned - MetaOS DA", async () => {
      const teamsManifest = {
        $schema:
          "https://developer.microsoft.com/json-schemas/teams/vDevPreview/MicrosoftTeams.schema.json",
        manifestVersion: "devPreview",
      } as TeamsManifestVDevPreview.TeamsManifestVDevPreview;
      teamsManifest.copilotAgents = {
        declarativeAgents: [
          {
            id: "fakeId",
            file: "fakeFile",
          },
        ],
      };

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(teamsManifest));
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);
      vi.spyOn(pluginManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: ["error1"],
        })
      );
      vi.spyOn(pluginManifestUtils, "logValidationErrors").mockReturnValue("errorMessage1");

      vi.spyOn(copilotGptManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: ["error2"],
          actionValidationResult: [
            {
              id: "fakeId",
              filePath: "fakeFile",
              validationResult: ["error3"],
            },
          ],
          skillValidationResult: [],
        })
      );
      vi.spyOn(copilotGptManifestUtils, "logValidationErrors").mockReturnValue("errorMessage2");

      const args: ValidateManifestArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        showMessage: true,
      };

      mockedDriverContext.platform = Platform.VSCode;
      mockedDriverContext.projectPath = "test";

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert.equal(result.error.name, AppStudioError.ValidationFailedError.name);
      }
    });

    it("validate with errors returned - copilot agent", async () => {
      const teamsManifest = {
        $schema:
          "https://developer.microsoft.com/en-us/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      teamsManifest.copilotAgents = {
        declarativeAgents: [
          {
            id: "fakeId",
            file: "fakeFile",
          },
        ],
      };

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(teamsManifest));
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);
      vi.spyOn(pluginManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: ["error1"],
        })
      );
      vi.spyOn(pluginManifestUtils, "logValidationErrors").mockReturnValue("errorMessage1");

      vi.spyOn(copilotGptManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: ["error2"],
          actionValidationResult: [
            {
              id: "fakeId",
              filePath: "fakeFile",
              validationResult: ["error3"],
            },
          ],
          skillValidationResult: [],
        })
      );
      vi.spyOn(copilotGptManifestUtils, "logValidationErrors").mockReturnValue("errorMessage2");

      const args: ValidateManifestArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        showMessage: true,
      };

      mockedDriverContext.platform = Platform.VSCode;
      mockedDriverContext.projectPath = "test";

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert.equal(result.error.name, AppStudioError.ValidationFailedError.name);
      }
    });

    it("validate with skill errors returned - copilot agent", async () => {
      const teamsManifest = {
        $schema:
          "https://developer.microsoft.com/en-us/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      teamsManifest.copilotAgents = {
        declarativeAgents: [
          {
            id: "fakeId",
            file: "fakeFile",
          },
        ],
      };

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(teamsManifest));
      vi.spyOn(ManifestUtil, "validateManifest").mockResolvedValue([]);
      vi.spyOn(pluginManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: ["error1"],
        })
      );
      vi.spyOn(pluginManifestUtils, "logValidationErrors").mockReturnValue("errorMessage1");

      vi.spyOn(copilotGptManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: [],
          actionValidationResult: [],
          skillValidationResult: [
            {
              folder: "skills/my-skill",
              filePath: "skills/my-skill/SKILL.md",
              validationResult: ["skill-error1", "skill-error2"],
            },
          ],
        })
      );
      vi.spyOn(copilotGptManifestUtils, "logValidationErrors").mockReturnValue("errorMessage2");

      const args: ValidateManifestArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        showMessage: true,
      };

      mockedDriverContext.platform = Platform.VSCode;
      mockedDriverContext.projectPath = "test";

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert.equal(result.error.name, AppStudioError.ValidationFailedError.name);
      }
    });

    it("skip plugin validation", async () => {
      const teamsManifest = {
        $schema:
          "https://developer.microsoft.com/en-us/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(teamsManifest));
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);
      vi.spyOn(pluginManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: ["error1"],
        })
      );
      vi.spyOn(pluginManifestUtils, "logValidationErrors").mockReturnValue("errorMessage1");

      vi.spyOn(copilotGptManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: ["error2"],
          actionValidationResult: [
            {
              id: "fakeId",
              filePath: "fakeFile",
              validationResult: ["error3"],
            },
          ],
          skillValidationResult: [],
        })
      );
      vi.spyOn(copilotGptManifestUtils, "logValidationErrors").mockReturnValue("errorMessage2");

      const args: ValidateManifestArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        showMessage: true,
      };

      mockedDriverContext.platform = Platform.VSCode;
      mockedDriverContext.projectPath = "test";

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert(result.isOk());
    });

    it("declarative agent manifest validation error", async () => {
      const teamsManifest = {
        $schema:
          "https://developer.microsoft.com/en-us/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
        manifestVersion: "1.19",
      } as TeamsManifestV1D19.TeamsManifestV1D19;
      teamsManifest.copilotAgents = {
        declarativeAgents: [
          {
            id: "fakeId",
            file: "fakeFile",
          },
        ],
      };

      vi.spyOn(manifestUtils, "getManifestV3").mockResolvedValue(ok(teamsManifest));
      vi.spyOn(AppManifestUtils, "validateAgainstSchema").mockResolvedValue([]);
      vi.spyOn(pluginManifestUtils, "validateAgainstSchema").mockResolvedValue(
        ok({
          id: "fakeId",
          filePath: "fakeFile",
          validationResult: ["error1"],
        })
      );
      vi.spyOn(pluginManifestUtils, "logValidationErrors").mockReturnValue("errorMessage1");

      vi.spyOn(copilotGptManifestUtils, "validateAgainstSchema").mockResolvedValue(
        err(new SystemError("testError", "testError", "", ""))
      );
      vi.spyOn(copilotGptManifestUtils, "logValidationErrors").mockReturnValue("errorMessage2");

      const args: ValidateManifestArgs = {
        manifestPath:
          "./tests/plugins/resource/appstudio/resources-multi-env/templates/appPackage/v3.manifest.template.json",
        showMessage: true,
      };

      mockedDriverContext.platform = Platform.VSCode;
      mockedDriverContext.projectPath = "test";

      const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
      chai.assert(result.isErr());
      if (result.isErr()) {
        chai.assert.equal(result.error.name, "testError");
      }
    });
  });
});
