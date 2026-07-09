// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Context, err, Inputs, ok, Platform, Stage, SystemError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import os from "os";
import * as path from "path";
import * as uuid from "uuid";
import { createContext, setTools } from "../../../src/common/globalVars";
import { getLocalizedString } from "../../../src/common/localizeUtils";
import { cpUtils } from "../../../src/component/deps-checker/";
import { ManifestUtils } from "../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { Generator } from "../../../src/component/generator/generator";
import { GeneratorChecker } from "../../../src/component/generator/spfx/depsChecker/generatorChecker";
import { YoChecker } from "../../../src/component/generator/spfx/depsChecker/yoChecker";
import {
  SPFxGenerator,
  SPFxGeneratorImport,
  SPFxGeneratorNew,
} from "../../../src/component/generator/spfx/spfxGenerator";
import { getShellOptionValue, Utils } from "../../../src/component/generator/spfx/utils/utils";
import { envUtil } from "../../../src/component/utils/envUtil";
import { FileNotFoundError, UserCancelError } from "../../../src/error";
import { QuestionNames, SPFxVersionOptionIds } from "../../../src/question";
import { TabCapabilityOptions } from "../../../src/question/scaffold/vsc/CapabilityOptions";
import { ProjectTypeOptions } from "../../../src/question/scaffold/vsc/ProjectTypeOptions";
import { TeamsProjectTypeOptions } from "../../../src/question/scaffold/vsc/teamsProjectTypeNode";
import { MockTools } from "../../core/utils";
import { chai, vi } from "vitest";

describe("SPFxGenerator", function () {
  const testFolder = path.resolve("./tmp");
  let context: Context;
  let mockedEnvRestore: RestoreFn | undefined;

  beforeEach(async () => {
    const gtools = new MockTools();
    setTools(gtools);
    context = createContext();

    await fs.ensureDir(testFolder);
    vi.spyOn(Utils, "configure");

    const manifestId = uuid.v4();
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        `{"id": "${manifestId}", "preconfiguredEntries": [{"title": {"default": "helloworld"}}]}`
      )
    );
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "rename").mockResolvedValue();
    vi.spyOn(fs, "copyFile").mockResolvedValue();
    vi.spyOn(fs, "remove").mockResolvedValue();
    vi.spyOn(fs, "readJson").mockImplementation((directory: string) => {
      if (directory.includes("teams")) {
        return {
          $schema:
            "https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json",
          manifestVersion: "1.17",
          id: "fakedId",
          name: {
            short: "thisisaverylongappnametotestifitwillbetruncated",
          },
          icons: {
            color: "color.png",
            outline: "outline.png",
          },
          staticTabs: [],
          configurableTabs: [],
        };
      } else if (directory.includes(".yo-rc.json")) {
        return {
          "@microsoft/generator-sharepoint": {
            solutionName: "fakedSolutionName",
            version: "1.17.4",
          },
        };
      } else {
        return { id: "fakedid", preconfiguredEntries: [{ title: { default: "helloworld" } }] };
      }
    });
    vi.spyOn(fs, "ensureFile").mockResolvedValue();
    vi.spyOn(fs, "writeJSON").mockResolvedValue();
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
    if (await fs.pathExists(testFolder)) {
      await fs.remove(testFolder);
    }
  });

  it("Both yeoman generator and template generator is called when scaffold SPFx project", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "spfxTestApp",
      "spfx-solution": "new",
    };
    const doYeomanScaffoldStub = vi
      .spyOn(SPFxGenerator, "doYeomanScaffold" as any)
      .mockResolvedValue(ok(undefined));
    const generateTemplateStub = vi
      .spyOn(Generator, "generateTemplate" as any)
      .mockResolvedValue(ok(undefined));
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
    chai.expect(doYeomanScaffoldStub.mock.calls.length === 1).to.be.true;
    chai.expect(generateTemplateStub.mock.calls.length === 1).to.be.true;
  });

  it("scaffold SPFx project without framework", async function () {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(Generator, "generateTemplate" as any).mockResolvedValue(ok(undefined));
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.SPFxFramework]: "none",
      [QuestionNames.SPFxWebpartDesc]: "test",
      [QuestionNames.SPFxWebpartName]: "hello",
      "app-name": "spfxTestApp",
      "spfx-solution": "new",
    };
    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
  });

  it("scaffold SPFx project with react framework", async function () {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
    vi.spyOn(Generator, "generateTemplate" as any).mockResolvedValue(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.SPFxFramework]: "react",
      [QuestionNames.SPFxWebpartDesc]: "test",
      [QuestionNames.SPFxWebpartName]: "hello",
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxSolution]: "new",
    };
    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
  });

  it("scaffold SPFx project with minimal framework", async function () {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
    vi.spyOn(Generator, "generateTemplate" as any).mockResolvedValue(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.SPFxFramework]: "minimal",
      [QuestionNames.SPFxWebpartDesc]: "test",
      [QuestionNames.SPFxWebpartName]: "hello",
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxSolution]: "new",
    };
    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
  });

  it("scaffold SPFx project with extremely long webpart name", async function () {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
    vi.spyOn(Generator, "generateTemplate" as any).mockResolvedValue(ok(undefined));
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.SPFxFramework]: "minimal",
      [QuestionNames.SPFxWebpartDesc]: "test",
      [QuestionNames.SPFxWebpartName]:
        "extremelylongextremelylongextremelylongextremelylongspfxwebpartname",
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxSolution]: "new",
    };
    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
  });

  it("select to install locally but no need to install", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxInstallPackage]: SPFxVersionOptionIds.installLocally,
      [QuestionNames.SPFxSolution]: "new",
    };
    vi.spyOn(YoChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(GeneratorChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");

    const generateTemplateStub = vi
      .spyOn(Generator, "generateTemplate" as any)
      .mockResolvedValue(ok(undefined));

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);

    chai.expect(generateTemplateStub.mock.calls.length === 1).to.be.true;
  });

  it("select to install locally and install only sp", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxInstallPackage]: SPFxVersionOptionIds.installLocally,
      [QuestionNames.SPFxSolution]: "new",
    };
    vi.spyOn(YoChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
    vi.spyOn(GeneratorChecker.prototype, "isLatestInstalled").mockResolvedValue(false);
    const yoInstaller = vi
      .spyOn(YoChecker.prototype, "ensureDependency")
      .mockResolvedValue(ok(true));
    const generatorInstaller = vi
      .spyOn(GeneratorChecker.prototype, "ensureDependency")
      .mockResolvedValue(ok(true));

    const generateTemplateStub = vi
      .spyOn(Generator, "generateTemplate" as any)
      .mockResolvedValue(ok(undefined));

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);

    chai.expect(generateTemplateStub.mock.calls.length === 1).to.be.true;
    chai.expect(yoInstaller.mock.calls.length === 1).to.be.false;
    chai.expect(generatorInstaller.mock.calls.length === 1).to.be.true;
  });

  it("select to install locally and install only yo", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxInstallPackage]: SPFxVersionOptionIds.installLocally,
      [QuestionNames.SPFxSolution]: "new",
    };
    vi.spyOn(YoChecker.prototype, "isLatestInstalled").mockResolvedValue(false);
    vi.spyOn(GeneratorChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
    const yoInstaller = vi
      .spyOn(YoChecker.prototype, "ensureDependency")
      .mockResolvedValue(ok(true));
    const generatorInstaller = vi
      .spyOn(GeneratorChecker.prototype, "ensureDependency")
      .mockResolvedValue(ok(true));

    const generateTemplateStub = vi
      .spyOn(Generator, "generateTemplate" as any)
      .mockResolvedValue(ok(undefined));

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);

    chai.expect(generateTemplateStub.mock.calls.length === 1).to.be.true;
    chai.expect(yoInstaller.mock.calls.length === 1).to.be.true;
    chai.expect(generatorInstaller.mock.calls.length === 1).to.be.false;
  });

  it("select to install locally and install sp error", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxInstallPackage]: SPFxVersionOptionIds.installLocally,
      [QuestionNames.SPFxSolution]: "new",
    };
    vi.spyOn(YoChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(GeneratorChecker.prototype, "isLatestInstalled").mockResolvedValue(false);
    vi.spyOn(YoChecker.prototype, "ensureDependency").mockResolvedValue(ok(true));
    vi.spyOn(GeneratorChecker.prototype, "ensureDependency").mockResolvedValue(
      err(new SystemError("source", "name", "msg", "msg"))
    );

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isErr()).to.eq(true);
    if (result.isErr()) {
      chai.expect(result.error.name).equal("LatestPackageInstallFailed");
    }
  });

  it("select to install locally and install yo error", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxInstallPackage]: SPFxVersionOptionIds.installLocally,
      [QuestionNames.SPFxSolution]: "new",
    };
    vi.spyOn(YoChecker.prototype, "isLatestInstalled").mockResolvedValue(false);
    vi.spyOn(GeneratorChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(YoChecker.prototype, "ensureDependency").mockResolvedValue(
      err(new SystemError("source", "name", "msg", "msg"))
    );

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isErr()).to.eq(true);
    if (result.isErr()) {
      chai.expect(result.error.name).equal("LatestPackageInstallFailed");
    }
  });

  it("Yeoman Generator scaffolding error", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxInstallPackage]: SPFxVersionOptionIds.installLocally,
      [QuestionNames.SPFxSolution]: "new",
    };
    vi.spyOn(YoChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(GeneratorChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(cpUtils, "executeCommand").mockImplementation(() => {
      throw new Error("errorMessage");
    });
    vi.spyOn(Generator, "generateTemplate" as any).mockResolvedValue(ok(undefined));

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isErr()).to.eq(true);
  });

  it("Yeoman Generator scaffolding error with unknown", async function () {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxInstallPackage]: SPFxVersionOptionIds.installLocally,
      [QuestionNames.SPFxSolution]: "new",
    };
    vi.spyOn(YoChecker.prototype, "isLatestInstalled").mockResolvedValue(false);
    vi.spyOn(GeneratorChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(cpUtils, "executeCommand").mockImplementation(() => {
      throw new Error("errorMessage");
    });
    vi.spyOn(Generator, "generateTemplate" as any).mockResolvedValue(ok(undefined));
    vi.spyOn(YoChecker.prototype, "ensureDependency").mockImplementation(() => {
      throw new Error("unknown");
    });

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isErr()).to.eq(true);
    if (result.isErr()) {
      chai.expect(result.error.name).equal("SPFxScaffoldError");
    }
  });

  it("install locally and use path", async function () {
    mockedEnvRestore = mockedEnv({
      PATH: undefined,
    });
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxInstallPackage]: SPFxVersionOptionIds.installLocally,
      [QuestionNames.SPFxSolution]: "new",
    };
    vi.spyOn(YoChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(GeneratorChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");

    const generateTemplateStub = vi
      .spyOn(Generator, "generateTemplate" as any)
      .mockResolvedValue(ok(undefined));

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);

    chai.expect(generateTemplateStub.mock.calls.length === 1).to.be.true;
  });

  it("use global packages and use path", async function () {
    mockedEnvRestore = mockedEnv({
      PATH: undefined,
    });
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxInstallPackage]: SPFxVersionOptionIds.globalPackage,
      [QuestionNames.SPFxSolution]: "new",
      globalSpfxPackageVersion: "1.17.0",
    };
    vi.spyOn(YoChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(GeneratorChecker.prototype, "isLatestInstalled").mockResolvedValue(true);
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");

    const generateTemplateStub = vi
      .spyOn(Generator, "generateTemplate" as any)
      .mockResolvedValue(ok(undefined));

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);

    chai.expect(generateTemplateStub.mock.calls.length === 1).to.be.true;
  });

  it("No web part in imported SPFx solution", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxSolution]: "import",
      [QuestionNames.SPFxFolder]: "c:\\test",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readdir").mockResolvedValue([]);
    vi.spyOn(fs, "copy").mockResolvedValue();

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isErr()).to.eq(true);
    if (result.isErr()) {
      chai.expect(result.error.name).to.eq("RetrieveSPFxInfoFailed");
    }
  });

  it("No valid web part manifest when import SPFx solution", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: testFolder,
      "app-name": "spfxTestApp",
      "spfx-solution": "import",
      "spfx-folder": "c:\\test",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readdir").mockImplementation((directory: any) => {
      if (directory === path.join("c:\\test", "teams")) {
        return ["1_color.png", "1_outline.png"] as any;
      } else if (directory === path.join("c:\\test", "src", "webparts")) {
        return ["helloworld", "second"] as any;
      } else {
        return [];
      }
    });
    vi.spyOn(fs, "statSync").mockReturnValue({
      isDirectory: () => {
        return true;
      },
    } as any);
    vi.spyOn(fs, "copy").mockResolvedValue();

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isErr()).to.eq(true);
    if (result.isErr()) {
      chai.expect(result.error.name).to.eq("FileNotFoundError");
    }
  });

  it("Copy existing SPFx solution failed when import SPFx solution", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: testFolder,
      "app-name": "spfxTestApp",
      "spfx-solution": "import",
      "spfx-folder": "c:\\test",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readdir").mockResolvedValue([]);
    vi.spyOn(fs, "copy").mockImplementation(() => {
      throw "Failed to copy";
    });

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isErr()).to.eq(true);
    if (result.isErr()) {
      chai.expect(result.error.name).to.eq("CopyExistingSPFxSolutioinFailed");
    }
  });

  it("Update SPFx template failed when import SPFx solution", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: testFolder,
      "app-name": "spfxTestApp",
      "spfx-solution": "import",
      "spfx-folder": "c:\\test",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readdir").mockImplementation((directory: any) => {
      if (directory === path.join("c:\\test", "teams")) {
        return ["1_color.png", "1_outline.png"] as any;
      } else if (directory === path.join("c:\\test", "src", "webparts")) {
        return ["helloworld", "second"] as any;
      } else {
        return ["HelloWorldWebPart.manifest.json"] as any;
      }
    });
    vi.spyOn(fs, "statSync").mockReturnValue({
      isDirectory: () => {
        return true;
      },
    } as any);
    vi.spyOn(fs, "copy").mockResolvedValue();
    vi.spyOn(Generator, "generateTemplate" as any).mockResolvedValue(ok(undefined));
    vi.spyOn(ManifestUtils.prototype, "_readAppManifest").mockImplementation(() => {
      throw "Failed to read manifest";
    });

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isErr()).to.eq(true);
    if (result.isErr()) {
      chai.expect(result.error.name).to.eq("UpdateSPFxTemplateFailed");
    }
  });

  it("Web part with invalid manifeset will not be imported", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxSolution]: "import",
      [QuestionNames.SPFxFolder]: "c:\\test",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readdir").mockImplementation((directory: any) => {
      if (directory === path.join("c:\\test", "teams")) {
        return ["1_color.png", "1_outline.png"] as any;
      } else if (directory === path.join("c:\\test", "src", "webparts")) {
        return ["helloworld", "second"] as any;
      } else if (directory === path.join("c:\\test", "src", "webparts", "helloworld")) {
        return ["HelloWorldWebPart.manifest.json"] as any;
      } else {
        return [] as any;
      }
    });
    vi.spyOn(fs, "statSync").mockReturnValue({
      isDirectory: () => {
        return true;
      },
    } as any);
    const generateTemplateStub = vi
      .spyOn(Generator, "generateTemplate" as any)
      .mockResolvedValue(ok(undefined));
    const fakedManifest = {
      name: { short: "thisisaverylongappnametotestifitwillbetruncated" },
      staticTabs: [{ name: "default" }],
    };
    const readAppManifestStub = vi
      .spyOn(ManifestUtils.prototype, "_readAppManifest")
      .mockResolvedValue(ok(fakedManifest as any));
    const writeAppManifestStub = vi
      .spyOn(ManifestUtils.prototype, "_writeAppManifest")
      .mockResolvedValue();
    const writeEnvStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(fs, "copy").mockResolvedValue();

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
    chai.expect(fakedManifest.staticTabs.length).to.eq(1);
    chai.expect(generateTemplateStub.mock.calls.length === 1).to.eq(true);
    chai.expect(writeEnvStub.mock.calls.length === 1).to.eq(true);
    chai.expect(readAppManifestStub.mock.calls.length === 2).to.eq(true);
    chai.expect(writeAppManifestStub.mock.calls.length === 2).to.eq(true);
  });

  it("Generate template fail when import SPFx solution", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxSolution]: "import",
      [QuestionNames.SPFxFolder]: "c:\\test",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readdir").mockImplementation((directory: any) => {
      if (directory === path.join("c:\\test", "teams")) {
        return ["1_color.png", "1_outline.png"] as any;
      } else if (directory === path.join("c:\\test", "src", "webparts")) {
        return ["helloworld", "second"] as any;
      } else {
        return ["HelloWorldWebPart.manifest.json"] as any;
      }
    });
    vi.spyOn(fs, "statSync").mockReturnValue({
      isDirectory: () => {
        return true;
      },
    } as any);
    const generateTemplateStub = vi
      .spyOn(Generator, "generateTemplate" as any)
      .mockResolvedValue(err(undefined));
    vi.spyOn(fs, "copy").mockResolvedValue();

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isErr()).to.eq(true);
    chai.expect(generateTemplateStub.mock.calls.length === 1).to.eq(true);
  });

  it("Teams manifest staticTabs is updated if imported SPFx solution has multiple web parts", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxSolution]: "import",
      [QuestionNames.SPFxFolder]: "c:\\test",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readdir").mockImplementation((directory: any) => {
      if (directory === path.join("c:\\test", "teams")) {
        return ["1_color.png", "1_outline.png"] as any;
      } else if (directory === path.join("c:\\test", "src", "webparts")) {
        return ["helloworld", "second"] as any;
      } else {
        return ["HelloWorldWebPart.manifest.json"] as any;
      }
    });
    vi.spyOn(fs, "statSync").mockReturnValue({
      isDirectory: () => {
        return true;
      },
    } as any);
    const generateTemplateStub = vi
      .spyOn(Generator, "generateTemplate" as any)
      .mockResolvedValue(ok(undefined));
    const fakedManifest = {
      name: { short: "thisisaverylongappnametotestifitwillbetruncated" },
      staticTabs: [{ name: "default" }],
    };
    const readAppManifestStub = vi
      .spyOn(ManifestUtils.prototype, "_readAppManifest")
      .mockResolvedValue(ok(fakedManifest as any));
    const writeAppManifestStub = vi
      .spyOn(ManifestUtils.prototype, "_writeAppManifest")
      .mockResolvedValue();
    const writeEnvStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(fs, "copy").mockResolvedValue();

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
    chai.expect(fakedManifest.staticTabs.length).to.eq(3);
    chai.expect(generateTemplateStub.mock.calls.length === 1).to.eq(true);
    chai.expect(writeEnvStub.mock.calls.length === 1).to.eq(true);
    chai.expect(readAppManifestStub.mock.calls.length === 2).to.eq(true);
    chai.expect(writeAppManifestStub.mock.calls.length === 2).to.eq(true);
  });

  it("Teams manifest staticTabs is updated if imported SPFx solution has multiple web parts - SPFx higher than 1.21.0", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      projectPath: testFolder,
      [QuestionNames.AppName]: "spfxTestApp",
      [QuestionNames.SPFxSolution]: "import",
      [QuestionNames.SPFxFolder]: "c:\\test",
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readdir").mockImplementation((directory: any) => {
      if (directory === path.join("c:\\test", "teams")) {
        return ["1_color.png", "1_outline.png"] as any;
      } else if (directory === path.join("c:\\test", "src", "webparts")) {
        return ["helloworld", "second"] as any;
      } else {
        return ["HelloWorldWebPart.manifest.json"] as any;
      }
    });
    vi.spyOn(fs, "statSync").mockReturnValue({
      isDirectory: () => {
        return true;
      },
    } as any);
    const generateTemplateStub = vi
      .spyOn(Generator, "generateTemplate" as any)
      .mockResolvedValue(ok(undefined));
    const fakedManifest = {
      name: { short: "thisisaverylongappnametotestifitwillbetruncated" },
      staticTabs: [{ name: "default" }],
    };
    const readAppManifestStub = vi
      .spyOn(ManifestUtils.prototype, "_readAppManifest")
      .mockResolvedValue(ok(fakedManifest as any));
    const writeAppManifestStub = vi
      .spyOn(ManifestUtils.prototype, "_writeAppManifest")
      .mockResolvedValue();
    const writeEnvStub = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));
    vi.spyOn(fs, "copy").mockResolvedValue();
    vi.spyOn(SPFxGenerator, "getSolutionVersion").mockResolvedValue("1.21.0");
    if (context) {
      context.templateVariables = context.templateVariables || {};
      context.templateVariables["useNewDevUrl"] = "true";
    }

    const result = await SPFxGenerator.generate(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
    chai.expect(fakedManifest.staticTabs.length).to.eq(3);
    chai.expect(generateTemplateStub.mock.calls.length === 1).to.eq(true);
    chai.expect(writeEnvStub.mock.calls.length === 1).to.eq(true);
    chai.expect(readAppManifestStub.mock.calls.length === 2).to.eq(true);
    chai.expect(writeAppManifestStub.mock.calls.length === 2).to.eq(true);
  });

  describe("get node versions from SPFx package.json", async () => {
    it("found node version", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJSON").mockImplementation((directory: string) => {
        if (directory.includes("package.json")) {
          return { engines: { node: ">= 10.13.0 < 11.0.0" } };
        } else {
          return "";
        }
      });
      vi.spyOn(Generator, "generateTemplate" as any).mockResolvedValue(ok(undefined));
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.SPFxFramework]: "none",
        [QuestionNames.SPFxWebpartDesc]: "test",
        [QuestionNames.SPFxWebpartName]: "hello",
        "app-name": "spfxTestApp",
        "spfx-solution": "new",
      };
      const result = await SPFxGenerator.generate(context, inputs, testFolder);

      chai.expect(context.templateVariables!.SpfxNodeVersion).eq(">= 10.13.0 < 11.0.0");
      chai.expect(result.isOk()).to.eq(true);
    });

    it("cannot found engine", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJSON").mockImplementation((directory: string) => {
        if (directory.includes("package.json")) {
          return {};
        } else {
          return "";
        }
      });
      vi.spyOn(Generator, "generateTemplate" as any).mockResolvedValue(ok(undefined));
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.SPFxFramework]: "none",
        [QuestionNames.SPFxWebpartDesc]: "test",
        [QuestionNames.SPFxWebpartName]: "hello",
        "app-name": "spfxTestApp",
        "spfx-solution": "new",
      };
      const result = await SPFxGenerator.generate(context, inputs, testFolder);

      chai.expect(context.templateVariables!.SpfxNodeVersion).eq("22");
      chai.expect(result.isOk()).to.eq(true);
    });

    it("cannot found engines.node", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJSON").mockImplementation((directory: string) => {
        if (directory.includes("package.json")) {
          return { engines: {} };
        } else {
          return "";
        }
      });
      vi.spyOn(Generator, "generateTemplate" as any).mockResolvedValue(ok(undefined));
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.SPFxFramework]: "none",
        [QuestionNames.SPFxWebpartDesc]: "test",
        [QuestionNames.SPFxWebpartName]: "hello",
        "app-name": "spfxTestApp",
        "spfx-solution": "new",
      };
      const result = await SPFxGenerator.generate(context, inputs, testFolder);

      chai.expect(context.templateVariables!.SpfxNodeVersion).eq("22");
      chai.expect(result.isOk()).to.eq(true);
    });
  });

  describe("doYeomanScaffold: add web part", async () => {
    it("add web part with global package", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        "1.17.4"
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue(
        undefined
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const yoInstaller = vi
        .spyOn(YoChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const generatorInstaller = vi
        .spyOn(GeneratorChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);
      if (result.isErr()) {
        console.log(result.error);
      }

      chai.expect(result.isOk()).to.eq(true);

      chai.expect(yoInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(generatorInstaller.mock.calls.length > 0).to.be.false;
    });

    it("add web part with global package - SPFx higher than 1.21", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        "1.21.0"
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue(
        undefined
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const yoInstaller = vi
        .spyOn(YoChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const generatorInstaller = vi
        .spyOn(GeneratorChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      vi.spyOn(SPFxGenerator, "shouldAddWebPartWithLocalDependencies").mockResolvedValue(false);

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);
      if (result.isErr()) {
        console.log(result.error);
      }

      chai.expect(result.isOk()).to.eq(true);

      chai.expect(yoInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(generatorInstaller.mock.calls.length > 0).to.be.false;
    });

    it("add web part with local package", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        undefined
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue("1.17.4");
      const localYoChecker = vi
        .spyOn(YoChecker.prototype, "findLocalInstalledVersion")
        .mockResolvedValue("4.3.1");
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const yoInstaller = vi
        .spyOn(YoChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const generatorInstaller = vi
        .spyOn(GeneratorChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);
      if (result.isErr()) {
        console.log(result.error);
      }

      chai.expect(result.isOk()).to.eq(true);

      chai.expect(yoInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(generatorInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(localYoChecker.mock.calls.length > 0).to.be.true;
    });

    it("add web part with installing yo and SPFx locally", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        "1.17.0"
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue(
        undefined
      );
      const localYoChecker = vi
        .spyOn(YoChecker.prototype, "findLocalInstalledVersion")
        .mockResolvedValue(undefined);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const yoInstaller = vi
        .spyOn(YoChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const generatorInstaller = vi
        .spyOn(GeneratorChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const userConfirm = vi
        .spyOn(context.userInteraction, "showMessage")
        .mockResolvedValue(ok(getLocalizedString("plugins.spfx.addWebPart.install")));

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);
      if (result.isErr()) {
        console.log(result.error);
      }

      chai.expect(result.isOk()).to.eq(true);

      chai.expect(yoInstaller.mock.calls.length > 0).to.be.true;
      chai.expect(generatorInstaller.mock.calls.length > 0).to.be.true;
      chai.expect(localYoChecker.mock.calls.length > 0).to.be.true;
      chai.expect(userConfirm.mock.calls.length > 0).to.be.true;
    });

    it("add web part with upgrading SPFx locally", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        "1.17.0"
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue("1.16.1");
      const localYoChecker = vi
        .spyOn(YoChecker.prototype, "findLocalInstalledVersion")
        .mockResolvedValue("4.3.1");
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const yoInstaller = vi
        .spyOn(YoChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const generatorInstaller = vi
        .spyOn(GeneratorChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const userConfirm = vi
        .spyOn(context.userInteraction, "showMessage")
        .mockResolvedValue(ok(getLocalizedString("plugins.spfx.addWebPart.upgrade")));

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);

      chai.expect(result.isOk()).to.eq(true);

      chai.expect(yoInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(generatorInstaller.mock.calls.length > 0).to.be.true;
      chai.expect(localYoChecker.mock.calls.length > 0).to.be.true;
      chai.expect(userConfirm.mock.calls.length > 0).to.be.true;
    });

    it("add web part with mismatch SPFx version locally. click 'help' first and then 'continue'", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        "1.17.0"
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue("1.18.2");
      const localYoChecker = vi
        .spyOn(YoChecker.prototype, "findLocalInstalledVersion")
        .mockResolvedValue("4.3.1");
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const yoInstaller = vi
        .spyOn(YoChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const generatorInstaller = vi
        .spyOn(GeneratorChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const userConfirm = vi
        .spyOn(context.userInteraction, "showMessage")
        .mockResolvedValueOnce(
          ok(getLocalizedString("plugins.spfx.addWebPart.versionMismatch.help"))
        )
        .mockResolvedValueOnce(
          ok(getLocalizedString("plugins.spfx.addWebPart.versionMismatch.continue"))
        );
      const openUrl = vi.spyOn(context.userInteraction, "openUrl").mockResolvedValue(ok(true));

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);

      chai.expect(result.isOk()).to.eq(true);

      chai.expect(yoInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(generatorInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(localYoChecker.mock.calls.length > 0).to.be.true;
      chai.expect(userConfirm.mock.calls.length > 0).to.be.true;
      chai.expect(openUrl.mock.calls.length > 0).to.be.true;
    });

    it("add web part with installing SPFx cancel", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        "1.17.0"
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue("1.16.1");
      const localYoChecker = vi
        .spyOn(YoChecker.prototype, "findLocalInstalledVersion")
        .mockResolvedValue("4.3.1");
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const yoInstaller = vi
        .spyOn(YoChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const generatorInstaller = vi
        .spyOn(GeneratorChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const userConfirm = vi
        .spyOn(context.userInteraction, "showMessage")
        .mockResolvedValue(ok(undefined));

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);

      chai.expect(result.isErr()).to.eq(true);

      chai.expect(yoInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(generatorInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(localYoChecker.mock.calls.length > 0).to.be.false;
      chai.expect(userConfirm.mock.calls.length > 0).to.be.true;
    });

    it("add web part with upgrading SPFx cancel", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        "1.17.0"
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue("1.16.1");
      const localYoChecker = vi
        .spyOn(YoChecker.prototype, "findLocalInstalledVersion")
        .mockResolvedValue("4.3.1");
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const yoInstaller = vi
        .spyOn(YoChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const generatorInstaller = vi
        .spyOn(GeneratorChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const userConfirm = vi
        .spyOn(context.userInteraction, "showMessage")
        .mockResolvedValue(ok(undefined));

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);

      chai.expect(result.isErr()).to.eq(true);

      chai.expect(yoInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(generatorInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(localYoChecker.mock.calls.length > 0).to.be.false;
      chai.expect(userConfirm.mock.calls.length > 0).to.be.true;
    });

    it("Cancel adding web part due to mismatch SPFx version locally. ", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        "1.17.0"
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue("1.18.2");
      const localYoChecker = vi
        .spyOn(YoChecker.prototype, "findLocalInstalledVersion")
        .mockResolvedValue("4.3.1");
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const yoInstaller = vi
        .spyOn(YoChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const generatorInstaller = vi
        .spyOn(GeneratorChecker.prototype, "ensureDependency")
        .mockResolvedValue(ok(true));
      const userConfirm = vi
        .spyOn(context.userInteraction, "showMessage")
        .mockResolvedValue(ok(undefined));

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);

      chai.expect(result.isErr()).to.eq(true);

      if (result.isErr()) {
        chai.expect(result.error.name).equal("UserCancel");
      }

      chai.expect(yoInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(generatorInstaller.mock.calls.length > 0).to.be.false;
      chai.expect(localYoChecker.mock.calls.length > 0).to.be.false;
      chai.expect(userConfirm.mock.calls.length > 0).to.be.true;
    });

    it("failed to install yo", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        "1.17.0"
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue(
        undefined
      );
      const localYoChecker = vi
        .spyOn(YoChecker.prototype, "findLocalInstalledVersion")
        .mockResolvedValue(undefined);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const yoInstaller = vi
        .spyOn(YoChecker.prototype, "ensureDependency")
        .mockResolvedValue(err(new SystemError("error", "error", "", "")));
      const userConfirm = vi
        .spyOn(context.userInteraction, "showMessage")
        .mockResolvedValue(ok(getLocalizedString("plugins.spfx.addWebPart.install")));

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);

      chai.expect(result.isOk()).to.eq(false);

      chai.expect(yoInstaller.mock.calls.length > 0).to.be.true;
      chai.expect(localYoChecker.mock.calls.length > 0).to.be.true;
      chai.expect(userConfirm.mock.calls.length > 0).to.be.true;
    });

    it("failed to install SPFx generator", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };

      vi.spyOn(GeneratorChecker.prototype, "findGloballyInstalledVersion").mockResolvedValue(
        "1.17.0"
      );
      vi.spyOn(GeneratorChecker.prototype, "findLocalInstalledVersion").mockResolvedValue("1.16.1");
      const localYoChecker = vi
        .spyOn(YoChecker.prototype, "findLocalInstalledVersion")
        .mockResolvedValue("4.3.1");
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
      const generatorInstaller = vi
        .spyOn(GeneratorChecker.prototype, "ensureDependency")
        .mockResolvedValue(err(new SystemError("error", "error", "", "")));
      const userConfirm = vi
        .spyOn(context.userInteraction, "showMessage")
        .mockResolvedValue(ok(getLocalizedString("plugins.spfx.addWebPart.upgrade")));

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);
      chai.expect(result.isOk()).to.eq(false);
      chai.expect(generatorInstaller.mock.calls.length > 0).to.be.true;
      chai.expect(localYoChecker.mock.calls.length > 0).to.be.true;
      chai.expect(userConfirm.mock.calls.length > 0).to.be.true;
    });

    it("Cannot find version in .yo-rc.json file", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };
      vi.restoreAllMocks();
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJson").mockResolvedValue({
        "@microsoft/generator-sharepoint": {
          solutionName: "fakedSolutionName",
        },
      });

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);
      chai.expect(result.isErr()).to.eq(true);
      if (result.isErr()) {
        chai.expect(result.error.name).equals("SolutionVersionMissing");
      }
    });

    it("Empty content in .yo-rc.json file", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };
      vi.restoreAllMocks();
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readJson").mockResolvedValue({});

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);
      chai.expect(result.isErr()).to.eq(true);
      if (result.isErr()) {
        chai.expect(result.error.name).equals("SolutionVersionMissing");
      }
    });

    it("Cannot find .yo-rc.json file", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: testFolder,
        [QuestionNames.AppName]: "spfxTestApp",
        [QuestionNames.SPFxSolution]: "new",
        [QuestionNames.SPFxFolder]: "folder",
        [QuestionNames.SPFxWebpartName]: "hello",
        stage: Stage.addWebpart,
      };
      vi.restoreAllMocks();
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);

      const result = await SPFxGenerator.doYeomanScaffold(context, inputs, testFolder);
      chai.expect(result.isErr()).to.eq(true);
      if (result.isErr()) {
        chai.expect(result.error instanceof FileNotFoundError).to.eq(true);
      }
    });
  });
});

describe("Utils", () => {
  it("truncate name with app name suffix", () => {
    const appName = "thisisasuperlongappNameWithSuffix${{APP_NAME_SUFFIX}}";
    const res = Utils.truncateAppShortName(appName);
    chai.expect(res).equals("thisisasuperlongappNameWi${{APP_NAME_SUFFIX}}");
  });
  it("no need to truncate name with app name with suffix", () => {
    const appName = "appNameWithSuffix${{APP_NAME_SUFFIX}}";
    const res = Utils.truncateAppShortName(appName);
    chai.expect(res).equals("appNameWithSuffix${{APP_NAME_SUFFIX}}");
  });

  it("truncate name with app name without suffix", () => {
    const appName = "thisisasuperlongappNameWithoutSuffix";
    const res = Utils.truncateAppShortName(appName);
    chai.expect(res).equals("thisisasuperlongappNameWithout");
  });

  it("no need to truncate name with app name without suffix", () => {
    const appName = "appNameWithoutSuffix";
    const res = Utils.truncateAppShortName(appName);
    chai.expect(res).equals("appNameWithoutSuffix");
  });

  describe("getShellOptionValue", () => {
    const sandbox = vi;
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("windows", () => {
      vi.spyOn(os, "type").mockReturnValue("Windows_NT");
      const res = getShellOptionValue();

      chai.expect(res).equal("cmd.exe");
    });

    it("non windowns", () => {
      vi.spyOn(os, "type").mockReturnValue("Linux");
      const res = getShellOptionValue();

      chai.expect(res).true;
    });
  });
});

describe("SPFxGeneratorNew", () => {
  const gtools = new MockTools();
  setTools(gtools);
  const generator = new SPFxGeneratorNew();
  const context = createContext();
  describe("activate", () => {
    it("happy path", () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "new",
      };
      const isActive = generator.activate(context, inputs);
      chai.expect(isActive).to.be.true;
    });
  });
  describe("getTemplateInfos", () => {
    const sandbox = vi;
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("happy path", async () => {
      vi.spyOn(SPFxGenerator, "doYeomanScaffold").mockResolvedValue(ok(""));
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "new",
      };
      const res = await generator.getTemplateInfos(context, inputs, "");
      chai.expect(res.isOk()).to.be.true;
    });
    it("doYeomanScaffold error", async () => {
      vi.spyOn(SPFxGenerator, "doYeomanScaffold").mockResolvedValue(err(new UserCancelError()));
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "new",
      };
      const res = await generator.getTemplateInfos(context, inputs, "");
      chai.expect(res.isErr()).to.be.true;
    });
  });
});

describe("SPFxGeneratorImport", () => {
  const gtools = new MockTools();
  setTools(gtools);
  const generator = new SPFxGeneratorImport();
  const context = createContext();
  describe("activate", () => {
    it("happy path", () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "import",
      };
      const isActive = generator.activate(context, inputs);
      chai.expect(isActive).to.be.true;
    });
  });
  describe("getTemplateInfos", () => {
    const sandbox = vi;
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("happy path", async () => {
      vi.spyOn(SPFxGenerator, "copySPFxSolution").mockResolvedValue();
      vi.spyOn(SPFxGenerator, "getWebpartManifest").mockResolvedValue({
        id: "test-id",
        preconfiguredEntries: [{ title: { default: "defaultTitle" } }],
      });
      vi.spyOn(SPFxGenerator, "getNodeVersion").mockResolvedValue("18.0");
      vi.spyOn(SPFxGenerator, "getSolutionVersion").mockResolvedValue("1.21.0");
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.AppName]: "testspfx",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "import",
        [QuestionNames.SPFxFolder]: "c:\\test",
      };
      const res = await generator.getTemplateInfos(context, inputs, "");
      chai.expect(res.isOk()).to.be.true;
    });

    it("happy path - SPFx lower than 1.21", async () => {
      vi.spyOn(SPFxGenerator, "copySPFxSolution").mockResolvedValue();
      vi.spyOn(SPFxGenerator, "getWebpartManifest").mockResolvedValue({
        id: "test-id",
        preconfiguredEntries: [{ title: { default: "defaultTitle" } }],
      });
      vi.spyOn(SPFxGenerator, "getNodeVersion").mockResolvedValue("18.0");
      vi.spyOn(SPFxGenerator, "getSolutionVersion").mockResolvedValue("1.17.0");
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.AppName]: "testspfx",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "import",
        [QuestionNames.SPFxFolder]: "c:\\test",
      };
      const res = await generator.getTemplateInfos(context, inputs, "");
      chai.expect(res.isOk()).to.be.true;
    });

    it("throw error", async () => {
      vi.spyOn(SPFxGenerator, "copySPFxSolution").mockRejectedValue(new Error());
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.AppName]: "testspfx",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "import",
      };
      const res = await generator.getTemplateInfos(context, inputs, "");
      chai.expect(res.isErr()).to.be.true;
    });

    it("throw FxError", async () => {
      vi.spyOn(SPFxGenerator, "copySPFxSolution").mockRejectedValue(new UserCancelError());
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.AppName]: "testspfx",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "import",
      };
      const res = await generator.getTemplateInfos(context, inputs, "");
      chai.expect(res.isErr()).to.be.true;
    });

    it("RetrieveSPFxInfoError", async () => {
      vi.spyOn(SPFxGenerator, "copySPFxSolution").mockResolvedValue();
      vi.spyOn(SPFxGenerator, "getWebpartManifest").mockResolvedValue({});
      vi.spyOn(SPFxGenerator, "getNodeVersion").mockResolvedValue("18.0");
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.AppName]: "testspfx",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "import",
      };
      const res = await generator.getTemplateInfos(context, inputs, "");
      chai.expect(res.isErr()).to.be.true;
    });
  });

  describe("post", () => {
    const sandbox = vi;
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("happy path", async () => {
      vi.spyOn(SPFxGenerator, "updateSPFxTemplate").mockResolvedValue();
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.AppName]: "testspfx",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "import",
      };
      const res = await generator.post(context, inputs, "");
      chai.expect(res.isOk()).to.be.true;
    });

    it("happy path with template variables not exist", async () => {
      vi.spyOn(SPFxGenerator, "updateSPFxTemplate").mockResolvedValue();
      context.templateVariables = undefined;

      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.AppName]: "testspfx",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "import",
      };
      const res = await generator.post(context, inputs, "");
      chai.expect(res.isOk()).to.be.true;
    });

    it("throw error", async () => {
      vi.spyOn(SPFxGenerator, "updateSPFxTemplate").mockRejectedValue(new Error());
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.AppName]: "testspfx",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "import",
      };
      const res = await generator.post(context, inputs, "");
      chai.expect(res.isErr()).to.be.true;
    });

    it("throw FxError", async () => {
      vi.spyOn(SPFxGenerator, "updateSPFxTemplate").mockRejectedValue(new UserCancelError());
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.AppName]: "testspfx",
        [QuestionNames.Capabilities]: TabCapabilityOptions.SPFxTab().id,
        [QuestionNames.ProjectType]: ProjectTypeOptions.teamsOptionId,
        [QuestionNames.TeamsAppType]: TeamsProjectTypeOptions.tabOptionId,
        [QuestionNames.SPFxSolution]: "import",
      };
      const res = await generator.post(context, inputs, "");
      chai.expect(res.isErr()).to.be.true;
    });
  });
});
