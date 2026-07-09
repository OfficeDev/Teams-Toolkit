// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author yefuwang@microsoft.com
 */

import {
  AppManifestUtils,
  Context,
  DevPreviewSchema,
  err,
  Inputs,
  ManifestUtil,
  ok,
  Platform,
  SystemError,
} from "@microsoft/teamsfx-api";
import fs from "fs";
import fse from "fs-extra";
import mockfs from "mock-fs";
import mockedEnv, { RestoreFn } from "mocked-env";
import { OfficeAddinManifest } from "office-addin-manifest";
import * as path from "path";
import * as uuid from "uuid";
import { chai, vi } from "vitest";
import { createContext, setTools } from "../../../src/common/globalVars";
import { cpUtils } from "../../../src/component/deps-checker/";
import { manifestUtils } from "../../../src/component/driver/teamsApp/utils/ManifestUtils";
import {
  getHost,
  OfficeAddinGenerator,
  officeAddinGeneratorDeps,
  OfficeAddinGeneratorNew,
} from "../../../src/component/generator/officeAddin/generator";
import { HelperMethods } from "../../../src/component/generator/officeAddin/helperMethods";
import { MetaOSHelper } from "../../../src/component/generator/officeAddin/metaOSHelper";
import { TemplateNames } from "../../../src/component/generator/templates/templateNames";
import { dotenvUtil, envUtil } from "../../../src/component/utils/envUtil";
import { UserCancelError } from "../../../src/error";
import { ProgrammingLanguage, QuestionNames } from "../../../src/question";
import { OfficeAddinCapabilityOptions } from "../../../src/question/scaffold/vsc/CapabilityOptions";
import { ProjectTypeOptions } from "../../../src/question/scaffold/vsc/ProjectTypeOptions";
import { MockTools } from "../../core/utils";

describe("OfficeAddinGenerator for Outlook Addin", function () {
  const testFolder = path.resolve("./tmp");
  let context: Context;
  let mockedEnvRestore: RestoreFn;
  const mockedError = new SystemError("mockedSource", "mockedError", "mockedMessage");

  beforeEach(async () => {
    mockedEnvRestore = mockedEnv({ TEAMSFX_V3: "true" }, { clear: true });
    const gtools = new MockTools();
    setTools(gtools);
    context = createContext();

    await fse.ensureDir(testFolder);
    vi.spyOn(fs, "stat").mockResolvedValue();
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
    const manifestId = uuid.v4();
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(`{"id": "${manifestId}"}`));
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "rename").mockResolvedValue();
    vi.spyOn(fs, "copyFile").mockResolvedValue();
    vi.spyOn(fse, "remove").mockResolvedValue();
    vi.spyOn(fse, "readJson").mockResolvedValue({});
    vi.spyOn(fse, "ensureFile").mockResolvedValue();
    vi.spyOn(fse, "writeJSON").mockResolvedValue();
  });

  it("should scaffold taskpane successfully on happy path if project-type is outlookAddin", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "outlook-addin-test",
    };
    inputs[QuestionNames.ProjectType] = ProjectTypeOptions.outlookAddinOptionId;
    inputs[QuestionNames.Capabilities] = "json-taskpane";
    inputs[QuestionNames.OfficeAddinFolder] = undefined;
    inputs[QuestionNames.ProgrammingLanguage] = "typescript";
    vi.spyOn(HelperMethods, "fetchAndUnzip").mockResolvedValue(ok(undefined));
    vi.spyOn(OfficeAddinManifest, "modifyManifestFile").mockResolvedValue({});
    const result = await OfficeAddinGenerator.doScaffolding(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
  });

  it("should scaffold taskpane failed, throw error", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "outlook-addin-test",
    };
    inputs[QuestionNames.ProjectType] = ProjectTypeOptions.outlookAddinOptionId;
    inputs[QuestionNames.Capabilities] = "json-taskpane";
    inputs[QuestionNames.OfficeAddinFolder] = undefined;
    inputs[QuestionNames.ProgrammingLanguage] = "typescript";
    vi.spyOn(HelperMethods, "fetchAndUnzip").mockRejectedValue(new UserCancelError());
    vi.spyOn(OfficeAddinManifest, "modifyManifestFile").mockResolvedValue({});
    const result = await OfficeAddinGenerator.doScaffolding(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
  });

  it("should copy addin files and updateManifest if addin folder is specified with json manifest", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "outlook-addin-test",
    };
    inputs[QuestionNames.ProjectType] = ProjectTypeOptions.outlookAddinOptionId;
    inputs[QuestionNames.Capabilities] = "json-taskpane";
    inputs[QuestionNames.OfficeAddinFolder] = "somepath";
    inputs[QuestionNames.ProgrammingLanguage] = "typescript";
    inputs[QuestionNames.OfficeAddinManifest] = "manifest.json";

    const copyAddinFilesStub = vi
      .spyOn(HelperMethods, "copyAddinFiles")
      .mockImplementation((from: string, to: string) => {
        return;
      });
    const updateManifestStub = vi
      .spyOn(HelperMethods, "updateManifest")
      .mockImplementation(async (destination: string, manifestPath: string) => {
        return;
      });

    vi.spyOn(ManifestUtil, "loadFromPath").mockResolvedValue({
      extensions: [
        {
          requirements: {
            scopes: ["mail"],
          },
        },
      ],
    } as any);

    const result = await OfficeAddinGenerator.doScaffolding(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
    chai.expect(copyAddinFilesStub.mock.calls.length === 1).to.be.true;
    chai.expect(updateManifestStub.mock.calls.length === 1).to.be.true;
    chai.expect(inputs[QuestionNames.OfficeAddinHost]).to.eq("Outlook");

    const hostResult = await getHost(inputs[QuestionNames.OfficeAddinFolder]);
    chai.expect(hostResult).to.equal("Outlook");
  });

  it("should copy addin files and convert manifest if addin folder is specified with xml manifest", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "outlook-addin-test",
    };
    inputs[QuestionNames.ProjectType] = ProjectTypeOptions.outlookAddinOptionId;
    inputs[QuestionNames.Capabilities] = "json-taskpane";
    inputs[QuestionNames.OfficeAddinFolder] = "somepath";
    inputs[QuestionNames.ProgrammingLanguage] = "typescript";
    inputs[QuestionNames.OfficeAddinManifest] = "manifest.xml";

    let progressBarStartCalled = 0;
    let progressBarNextCalled = 0;
    let progessBarEndCalled = 0;
    const createProgressBarStub = vi
      .spyOn(context.userInteraction, "createProgressBar")
      .mockReturnValue({
        start: async () => {
          progressBarStartCalled++;
        },
        next: async () => {
          progressBarNextCalled++;
        },
        end: async () => {
          progessBarEndCalled++;
        },
      });

    const copyAddinFilesStub = vi
      .spyOn(HelperMethods, "copyAddinFiles")
      .mockImplementation((from: string, to: string) => {
        return;
      });
    const updateManifestStub = vi
      .spyOn(HelperMethods, "updateManifest")
      .mockImplementation(async (destination: string, manifestPath: string) => {
        return;
      });
    const convertProjectStub = vi
      .fn()
      .mockImplementation(async (manifestPath?: string, backupPath?: string) => {
        return;
      });

    // The new validation in doScaffolding checks for `package.json` in the
    // source folder before invoking convertProject. Pretend it exists so the
    // test still exercises the convertProject path.
    vi.spyOn(fse, "pathExists").mockResolvedValue(true as any);

    vi.spyOn(officeAddinGeneratorDeps, "convertProject").mockImplementation(
      convertProjectStub as any
    );

    vi.spyOn(ManifestUtil, "loadFromPath").mockResolvedValue({
      extensions: [
        {
          requirements: {
            scopes: ["mail"],
          },
        },
      ],
    } as any);

    const result = await OfficeAddinGenerator.doScaffolding(context, inputs, testFolder);

    chai.expect(result.isOk()).to.eq(true);
    chai.expect(copyAddinFilesStub.mock.calls.length === 1).to.be.true;
    chai.expect(updateManifestStub.mock.calls.length === 1).to.be.true;
    chai.expect(convertProjectStub.mock.calls.length === 1).to.be.true;
    chai.expect(inputs[QuestionNames.OfficeAddinHost]).to.eq("Outlook");
    chai.expect(progressBarStartCalled).to.eq(1);
    chai.expect(progressBarNextCalled).to.eq(3);
    chai.expect(progessBarEndCalled).to.eq(1);

    const hostResult = await getHost(inputs[QuestionNames.OfficeAddinFolder]);
    chai.expect(hostResult).to.equal("Outlook");
  });

  it("should return UserError when xml manifest is selected but source folder has no package.json (manifest-only project)", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "outlook-addin-test",
    };
    inputs[QuestionNames.ProjectType] = ProjectTypeOptions.outlookAddinOptionId;
    inputs[QuestionNames.Capabilities] = "json-taskpane";
    inputs[QuestionNames.OfficeAddinFolder] = "somepath";
    inputs[QuestionNames.ProgrammingLanguage] = "typescript";
    inputs[QuestionNames.OfficeAddinManifest] = "manifest.xml";

    vi.spyOn(context.userInteraction, "createProgressBar").mockReturnValue({
      start: async () => {},
      next: async () => {},
      end: async () => {},
    } as any);

    // Simulate a manifest-only source project: no package.json on disk.
    vi.spyOn(fse, "pathExists").mockResolvedValue(false as any);

    const copyAddinFilesStub = vi.spyOn(HelperMethods, "copyAddinFiles");
    const convertProjectStub = vi.fn();

    vi.spyOn(officeAddinGeneratorDeps, "convertProject").mockImplementation(
      convertProjectStub as any
    );

    const result = await OfficeAddinGenerator.doScaffolding(context, inputs, testFolder);

    chai.expect(result.isErr()).to.eq(true);
    if (result.isErr()) {
      chai.expect(result.error.name).to.eq("ManifestOnlyAddinNotSupported");
    }
    chai.expect(copyAddinFilesStub.mock.calls.length > 0).to.be.false;
    chai.expect(convertProjectStub.mock.calls.length > 0).to.be.false;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    mockedEnvRestore();
    if (await fse.pathExists(testFolder)) {
      await fse.remove(testFolder);
    }
  });
});

describe("HelperMethods", async () => {
  describe("updateManifest", () => {
    const sandbox = vi;
    const manifestPath = "manifestPath";
    const manifestTemplatePath = "manifestTemplatePath";
    let writePathResult: DevPreviewSchema | undefined = undefined;

    beforeEach(() => {
      vi.spyOn(ManifestUtil, "loadFromPath").mockImplementation(async (path) => {
        if (path === manifestPath) {
          return {
            extensions: [],
            authorization: {
              permissions: {
                resourceSpecific: [],
              },
            },
          } as unknown as DevPreviewSchema;
        } else if (path === manifestTemplatePath) {
          return {
            extensions: undefined,
            authorization: undefined,
          } as unknown as DevPreviewSchema;
        }

        throw new Error("Invalid path");
      });

      vi.spyOn(ManifestUtil, "writeToPath").mockImplementation(async (path, manifest) => {
        writePathResult = manifest as DevPreviewSchema;
        return;
      });

      vi.spyOn(manifestUtils, "getTeamsAppManifestPath").mockReturnValue(manifestTemplatePath);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      writePathResult = undefined;
    });

    it("should update manifest's extenstions and authorization", async () => {
      vi.spyOn(fse, "pathExists").mockResolvedValue(true);
      await HelperMethods.updateManifest("", manifestPath);

      chai.assert.isDefined(writePathResult);
      chai.assert.equal(writePathResult?.extensions?.length, 0);
      chai.assert.equal(writePathResult?.authorization?.permissions?.resourceSpecific?.length, 0);
    });

    it("should early return if there's no appPackage folder", async () => {
      vi.spyOn(fse, "pathExists").mockResolvedValue(false);
      await HelperMethods.updateManifest("", manifestPath);

      chai.assert.isUndefined(writePathResult, "writeToPath should not be called");
    });
  });

  describe("copyAddinFiles", () => {
    const projectRoot = "/home/user/teamsapp";

    beforeEach(() => {
      mockfs({
        "/home/user/teamsapp/.gitignore": "xxx",
        "/home/user/teamsapp/project": {
          file1: "xxx",
          file2: "yyy",
        },
        "/home/user/teamsapp/node_modules": {
          file3: "xxx",
        },
      });
    });

    afterEach(() => {
      mockfs.restore();
    });

    it("should copy project files and .gitignore but ignore node_modules", async () => {
      try {
        const destination = "/home/user/destination";
        HelperMethods.copyAddinFiles(projectRoot, destination);
        chai.assert.equal(await fse.pathExists(path.join(destination, "project", "file1")), true);
        chai.assert.equal(await fse.pathExists(path.join(destination, "project", "file2")), true);
        chai.assert.equal(await fse.pathExists(path.join(destination, ".gitignore")), true);
        chai.assert.equal(await fse.pathExists(path.join(destination, "node_modules")), false);
      } catch (err) {
        chai.assert.fail(err);
      }
    });
  });

  describe("moveManifestLocation", () => {
    const projectRoot = "/home/user/addin";

    beforeEach(() => {
      mockfs({
        "/home/user/addin/manifest.json": "{}",
        "/home/user/addin/assets": {
          file1: "xxx",
        },
        "/home/user/addin/webpack.config.js": JSON.stringify([
          {
            from: "assets/*",
            to: "assets/[name][ext][query]",
          },
          {
            from: "manifest*.json",
            to: "[name]" + "[ext]",
          },
        ]),
        "/home/user/addin/package.json": JSON.stringify({
          scripts: {
            start: "office-addin-debugging start manifest.json",
            stop: "office-addin-debugging stop manifest.json",
            validate: "office-addin-manifest validate manifest.json",
          },
        }),
        "/home/user/addin/src/taskpane/taskpane.html": `<img width="90" height="90" src="../../assets/logo-filled.png" alt="Contoso" title="Contoso" />`,
      });
    });

    afterEach(() => {
      mockfs.restore();
    });

    it("should move manifest.json into appPackage folder", async () => {
      await HelperMethods.moveManifestLocation(projectRoot, "manifest.json");
      chai.assert.isFalse(await fse.pathExists(path.join(projectRoot, "manifest.json")));
      chai.assert.isFalse(await fse.pathExists(path.join(projectRoot, "assets")));

      chai.assert.isTrue(
        await fse.pathExists(path.join(projectRoot, "appPackage", "manifest.json"))
      );
      chai.assert.isTrue(
        await fse.pathExists(path.join(projectRoot, "appPackage", "assets", "file1"))
      );

      const webpackConfigPath = path.join(projectRoot, "webpack.config.js");
      const webpackConfigJson = JSON.parse(await fse.readFile(webpackConfigPath, "utf8"));
      chai.assert.equal(webpackConfigJson[0].from, "appPackage/assets/*");
      chai.assert.equal(webpackConfigJson[1].from, "appPackage/manifest*.json");

      const packageJsonPath = path.join(projectRoot, "package.json");
      const packageJson = JSON.parse(await fse.readFile(packageJsonPath, "utf8"));
      chai.assert.equal(
        packageJson.scripts.start,
        "office-addin-debugging start appPackage/manifest.json"
      );

      chai.assert.equal(
        packageJson.scripts.stop,
        "office-addin-debugging stop appPackage/manifest.json"
      );
      chai.assert.equal(
        packageJson.scripts.validate,
        "office-addin-manifest validate appPackage/manifest.json"
      );

      const htmlPath = path.join(projectRoot, "src", "taskpane", "taskpane.html");
      const html = await fse.readFile(htmlPath, "utf8");
      chai.assert.equal(
        html,
        `<img width="90" height="90" src="../../appPackage/assets/logo-filled.png" alt="Contoso" title="Contoso" />`
      );
    });
  });
});

describe("OfficeAddinGenerator for Office Addin", function () {
  const testFolder = path.resolve("./tmp");
  let context: Context;
  let mockedEnvRestore: RestoreFn = () => {};
  const mockedError = new SystemError("mockedSource", "mockedError", "mockedMessage");

  beforeEach(async () => {
    mockedEnvRestore = mockedEnv({ clear: true });
    const gtools = new MockTools();
    setTools(gtools);
    context = createContext();

    await fse.ensureDir(testFolder);
    vi.spyOn(fs, "stat").mockResolvedValue();
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("succeed");
    const manifestId = uuid.v4();
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(`{"id": "${manifestId}"}`));
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "rename").mockResolvedValue();
    vi.spyOn(fs, "copyFile").mockResolvedValue();
    vi.spyOn(fse, "remove").mockResolvedValue();
    vi.spyOn(fse, "readJson").mockResolvedValue({});
    vi.spyOn(fse, "ensureFile").mockResolvedValue();
    vi.spyOn(fse, "writeJSON").mockResolvedValue();
  });

  it("should scaffold taskpane successfully on happy path if project-type is officeAddin and capability is json-taskpane", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: testFolder,
      "app-name": "office-addin-test",
    };
    inputs[QuestionNames.ProjectType] = ProjectTypeOptions.outlookAddinOptionId;
    inputs[QuestionNames.Capabilities] = OfficeAddinCapabilityOptions.outlookTaskPane().id;
    inputs[QuestionNames.OfficeAddinFolder] = undefined;
    inputs[QuestionNames.ProgrammingLanguage] = "typescript";
    const result = await OfficeAddinGenerator.doScaffolding(context, inputs, testFolder);
    chai.expect(result.isOk()).to.eq(true);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    mockedEnvRestore();
    if (await fse.pathExists(testFolder)) {
      await fse.remove(testFolder);
    }
  });
});

describe("OfficeAddinGeneratorNew", () => {
  const gtools = new MockTools();
  setTools(gtools);
  const generator = new OfficeAddinGeneratorNew();
  const context = createContext();
  const sandbox = vi;
  describe("active()", () => {
    it(`should return true`, async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
      };
      inputs[QuestionNames.ProgrammingLanguage] = ProgrammingLanguage.JS;
      inputs[QuestionNames.TemplateName] = TemplateNames.OutlookTaskpane;
      const res = generator.activate(context, inputs);
      chai.assert.isTrue(res);
    });

    it(`should return false`, async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
      };
      inputs[QuestionNames.ProgrammingLanguage] = ProgrammingLanguage.JS;
      const res = generator.activate(context, inputs);
      chai.assert.isFalse(res);
    });
  });

  describe("getTemplateInfos()", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it(`should return office-addin-config template officeMetaOS`, async () => {
      vi.spyOn(OfficeAddinGenerator, "doScaffolding").mockResolvedValue(ok(undefined));
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
      };
      inputs[QuestionNames.ProjectType] = ProjectTypeOptions.officeMetaOSOptionId;
      inputs[QuestionNames.Capabilities] = OfficeAddinCapabilityOptions.officeAddinImport().id;
      inputs[QuestionNames.TemplateName] = TemplateNames.OfficeAddinCommon;
      const res = await generator.getTemplateInfos(context, inputs, "./");
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const templates = res.value;
        chai.assert.isTrue(templates.length === 1);
        const template = templates[0];
        chai.assert.equal(template.templateName, "office-addin-config");
        chai.assert.isTrue(template.language === ProgrammingLanguage.TS);
      }
    });

    it(`should return office-addin-config template outlookAddin`, async () => {
      vi.spyOn(OfficeAddinGenerator, "doScaffolding").mockResolvedValue(ok(undefined));
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
      };
      inputs[QuestionNames.ProjectType] = ProjectTypeOptions.outlookAddinOptionId;
      inputs[QuestionNames.Capabilities] = OfficeAddinCapabilityOptions.outlookTaskPane().id;
      inputs[QuestionNames.TemplateName] = TemplateNames.OfficeAddinCommon;
      const res = await generator.getTemplateInfos(context, inputs, "./");
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const templates = res.value;
        chai.assert.isTrue(templates.length === 1);
        const template = templates[0];
        chai.assert.equal(template.templateName, "office-addin-config");
        chai.assert.isTrue(template.language === ProgrammingLanguage.TS);
      }
    });

    it(`should return office-addin-outlook-taskpane template`, async () => {
      vi.spyOn(OfficeAddinGenerator, "doScaffolding").mockResolvedValue(ok(undefined));
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
      };
      inputs[QuestionNames.ProjectType] = ProjectTypeOptions.outlookAddinOptionId;
      inputs[QuestionNames.Capabilities] = OfficeAddinCapabilityOptions.outlookTaskPane().id;
      inputs[QuestionNames.TemplateName] = TemplateNames.OutlookTaskpane;
      const res = await generator.getTemplateInfos(context, inputs, "./");
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const templates = res.value;
        chai.assert.isTrue(templates.length === 1);
        const template = templates[0];
        chai.assert.isTrue(template.templateName === TemplateNames.OutlookTaskpane);
        chai.assert.isTrue(template.language === ProgrammingLanguage.TS);
      }
    });
    it(`should return office-addin-outlook-taskpane template`, async () => {
      vi.spyOn(OfficeAddinGenerator, "doScaffolding").mockResolvedValue(ok(undefined));
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
      };
      inputs[QuestionNames.ProjectType] = ProjectTypeOptions.officeMetaOSOptionId;
      inputs[QuestionNames.Capabilities] = OfficeAddinCapabilityOptions.wxpTaskPane().id;
      inputs[QuestionNames.TemplateName] = TemplateNames.WXPTaskpane;
      const res = await generator.getTemplateInfos(context, inputs, "./");
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        const templates = res.value;
        chai.assert.isTrue(templates.length === 1);
        const template = templates[0];
        chai.assert.isTrue(template.templateName === TemplateNames.WXPTaskpane);
        chai.assert.isTrue(template.language === ProgrammingLanguage.TS);
      }
    });
    it("should fail", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
      };
      vi.spyOn(OfficeAddinGenerator, "doScaffolding").mockResolvedValue(err(new UserCancelError()));
      const res = await generator.getTemplateInfos(context, inputs, "./");
      chai.assert.isTrue(res.isErr());
    });
  });

  describe("post()", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it(`happy`, async () => {
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "dev2"]));
      const reset = vi.spyOn(envUtil, "resetEnv").mockResolvedValue();
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
      };
      inputs[QuestionNames.OfficeAddinFolder] = "testfolder";
      const res = await generator.post(context, inputs, "./");
      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(reset.mock.calls.length === 2);
    });
    it(`not import`, async () => {
      const reset = vi.spyOn(envUtil, "resetEnv").mockResolvedValue();
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
      };
      const res = await generator.post(context, inputs, "./");
      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(reset.mock.calls.length === 0);
    });
    it(`list env error`, async () => {
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(err(new UserCancelError()));
      const reset = vi.spyOn(envUtil, "resetEnv").mockResolvedValue();
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
      };
      const res = await generator.post(context, inputs, "./");
      chai.assert.isTrue(res.isOk());
      chai.assert.isTrue(reset.mock.calls.length === 0);
    });
  });
});

describe("doScaffolding()", () => {
  it("doScaffolding: should failed because of invalid addin-host", async () => {
    const inputs: Inputs = {
      platform: Platform.CLI,
      projectPath: ".",
      "app-name": "outlook-addin-test",
      [QuestionNames.OfficeAddinHost]: "invalid",
    };
    inputs[QuestionNames.Capabilities] = "json-taskpane";
    inputs[QuestionNames.OfficeAddinFolder] = undefined;
    inputs[QuestionNames.ProgrammingLanguage] = "typescript";
    const context = createContext();
    const res = await OfficeAddinGenerator.doScaffolding(context, inputs, ".");
    chai.assert.isTrue(res.isOk());
  });
});

describe("MetaOSHelper", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copyFilterFn", () => {
    chai.assert.isFalse(MetaOSHelper.copyFilterFn("m365agents.yml"));
    chai.assert.isFalse(MetaOSHelper.copyFilterFn("env"));
    chai.assert.isTrue(MetaOSHelper.copyFilterFn("test.ts"));
  });

  it("copyExistMetaOSProject", async () => {
    const fseCopy = vi.spyOn(fse, "copy").mockResolvedValue();
    await MetaOSHelper.copyExistMetaOSProject("source", "target");
    chai.assert.isTrue(fseCopy.mock.calls.length === 1);
  });

  it("getNameWithSuffix", () => {
    chai.assert.equal(MetaOSHelper.getNameWithSuffix("test", 1), "test1");
    chai.assert.equal(MetaOSHelper.getNameWithSuffix("test", 0), "test");
  });

  it("ensureFunctionNameIsNotExist", () => {
    const jsonObj1 = [{ name: "test" }, { name: "test1" }, { name: "test2" }];
    const jsonObj2 = [undefined];
    const result1 = MetaOSHelper.ensureFunctionNameIsNotExist(jsonObj1, "name", "test");
    const result2 = MetaOSHelper.ensureFunctionNameIsNotExist(jsonObj2, "te", "test");
    chai.assert.equal(result1, "test3");
    chai.assert.equal(result2, "test");
  });

  it("ensureFileNameIsNotExist", () => {
    vi.spyOn(fse, "existsSync").mockReturnValueOnce(true).mockReturnValueOnce(false);
    const result = MetaOSHelper.ensureFileNameIsNotExist("path", "test", ".json");
    chai.assert.equal(result, "test1.json");
  });

  it("unifyProjectID", async () => {
    const readManifestStub = vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue({
      id: "test",
    } as any);
    const writeManifestStub = vi.spyOn(AppManifestUtils, "writeTeamsManifest").mockResolvedValue();
    const readFileStub = vi.spyOn(fse, "readFile").mockResolvedValue(Buffer.from(`{"id": "test"}`));
    const writeFileStub = vi.spyOn(fse, "writeFile").mockResolvedValue();
    const pathExistsStub = vi.spyOn(fse, "pathExists").mockResolvedValue(true);
    const deserializeStub = vi.spyOn(dotenvUtil, "deserialize").mockReturnValue({ obj: {} } as any);
    const serializeStub = vi.spyOn(dotenvUtil, "serialize").mockReturnValue("test");

    await MetaOSHelper.unifyProjectID("projectFolder");

    chai.assert.isTrue(readManifestStub.mock.calls.length === 1);
    chai.assert.isTrue(writeManifestStub.mock.calls.length === 1);
    chai.assert.isTrue(readFileStub.mock.calls.length === 1);
    chai.assert.isTrue(writeFileStub.mock.calls.length === 1);
    chai.assert.isTrue(pathExistsStub.mock.calls.length === 1);
    chai.assert.isTrue(deserializeStub.mock.calls.length === 1);
    chai.assert.isTrue(serializeStub.mock.calls.length === 1);
  });

  it("extendToDA", async () => {
    vi.spyOn(MetaOSHelper, "ensureFileNameIsNotExist").mockReturnValue("test");
    vi.spyOn(MetaOSHelper, "modifyManifest").mockResolvedValue({ w: "w", x: "x", p: "p" });
    const generateDAFile = vi.spyOn(MetaOSHelper, "generateDAFile").mockResolvedValue();
    const generateActionFile = vi.spyOn(MetaOSHelper, "generateActionFile").mockResolvedValue();
    const addCodeToCommands = vi.spyOn(MetaOSHelper, "addCodeToCommands").mockResolvedValue();
    const upgradePkg = vi.spyOn(MetaOSHelper, "upgradeOfficeAddInDebugging").mockResolvedValue();

    await MetaOSHelper.extendToDA("projectFolder", "appName");
    chai.assert.isTrue(generateDAFile.mock.calls.length === 1);
    chai.assert.isTrue(generateActionFile.mock.calls.length === 1);
    chai.assert.isTrue(addCodeToCommands.mock.calls.length === 1);
    chai.assert.isTrue(upgradePkg.mock.calls.length === 1);
  });

  it("modifyManifest: condition 1", async () => {
    vi.spyOn(MetaOSHelper, "ensureFunctionNameIsNotExist").mockReturnValue("test");
    vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue({
      extensions: [
        {
          runtimes: [
            undefined,
            {},
            { code: {} },
            { code: { script: "" } },
            { code: { script: "commands.js" } },
            { code: { script: "commands.js" }, actions: [] },
          ],
        },
      ],
    } as any);
    vi.spyOn(AppManifestUtils, "writeTeamsManifest").mockResolvedValue();

    const result = await MetaOSHelper.modifyManifest("projectFolder", "DAFilename");
    chai.assert.isNotNull(result);
  });

  it("modifyManifest: condition 2", async () => {
    vi.spyOn(MetaOSHelper, "ensureFunctionNameIsNotExist").mockReturnValue("test");
    vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue({
      extensions: [
        {
          runtimes: [{ code: { script: "commands.js" }, actions: [] }],
        },
      ],
    } as any);
    vi.spyOn(AppManifestUtils, "writeTeamsManifest").mockResolvedValue();

    const result = await MetaOSHelper.modifyManifest("projectFolder", "DAFilename");
    chai.assert.isNotNull(result);
  });

  it("modifyManifest: error 1", async () => {
    vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue({
      extensions: [
        {
          runtimes: [{ code: { scirpt: "" } }],
        },
      ],
    } as any);
    try {
      await MetaOSHelper.modifyManifest("projectFolder", "DAFilename");
    } catch (e) {
      chai.assert.isNotNull(e);
    }
  });

  it("modifyManifest: error 2", async () => {
    vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue({
      extensions: [{}],
    } as any);
    try {
      await MetaOSHelper.modifyManifest("projectFolder", "DAFilename");
    } catch (e) {
      chai.assert.isNotNull(e);
    }
  });

  it("modifyManifest: error 3", async () => {
    vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue({} as any);
    try {
      await MetaOSHelper.modifyManifest("projectFolder", "DAFilename");
    } catch (e) {
      chai.assert.isNotNull(e);
    }
  });

  it("modifyManifest: error 4", async () => {
    vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue({
      extensions: undefined,
    } as any);
    try {
      await MetaOSHelper.modifyManifest("projectFolder", "DAFilename");
    } catch (e) {
      chai.assert.isNotNull(e);
    }
  });

  it("modifyManifest: error 5", async () => {
    vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue({
      extensions: [undefined],
    } as any);
    try {
      await MetaOSHelper.modifyManifest("projectFolder", "DAFilename");
    } catch (e) {
      chai.assert.isNotNull(e);
    }
  });

  it("generateDAFile", async () => {
    const writeFileFn = vi
      .spyOn(AppManifestUtils, "writeDeclarativeAgentManifest")
      .mockResolvedValue();
    await MetaOSHelper.generateDAFile("projectFolder", "filename", "test", "test");
    chai.assert.isTrue(writeFileFn.mock.calls.length === 1);
  });

  it("generateActionFile", async () => {
    const writeFileFn = vi.spyOn(fse, "writeJSON").mockResolvedValue();
    await MetaOSHelper.generateActionFile("projectFolder", "filename", "test", {
      w: "w",
      x: "x",
      p: "p",
    });
    chai.assert.isTrue(writeFileFn.mock.calls.length === 1);
  });

  it("addCodeToCommands: error", async () => {
    vi.spyOn(fse, "existsSync").mockResolvedValue(false);
    try {
      await MetaOSHelper.addCodeToCommands("projectFolder", { w: "w", x: "x", p: "p" });
    } catch (e) {
      chai.assert.isNotNull(e);
    }
  });

  it("addCodeToCommands", async () => {
    vi.spyOn(fse, "existsSync").mockResolvedValue(true);
    const writeFileFn = vi.spyOn(fse, "appendFile").mockResolvedValue();
    await MetaOSHelper.addCodeToCommands("projectFolder", { w: "w", x: "x", p: "p" });
    chai.assert.isTrue(writeFileFn.mock.calls.length === 1);
  });

  it("upgradeOfficeAddInDebugging: success", async () => {
    vi.spyOn(fse, "existsSync").mockResolvedValue(true);
    const readJsonStub = vi
      .spyOn(fse, "readJSON")
      .mockResolvedValue({ devDependencies: { "office-addin-debugging": "1.0.0" } });
    const writeJsonStub = vi.spyOn(fse, "writeJSON").mockResolvedValue();

    await MetaOSHelper.upgradeOfficeAddInDebugging("projectFolder");
    chai.assert.isTrue(readJsonStub.mock.calls.length === 1);
    chai.assert.isTrue(writeJsonStub.mock.calls.length === 1);
  });

  it("upgradeOfficeAddInDebugging: failed", async () => {
    vi.spyOn(fse, "existsSync").mockResolvedValue(false);

    try {
      await MetaOSHelper.upgradeOfficeAddInDebugging("projectFolder");
    } catch (e) {
      chai.assert.isNotNull(e);
    }
  });

  it("unifyProjectID: env file doesn't exist", async () => {
    const readManifestStub = vi.spyOn(AppManifestUtils, "readTeamsManifest").mockResolvedValue({
      id: "test",
    } as any);
    const writeManifestStub = vi.spyOn(AppManifestUtils, "writeTeamsManifest").mockResolvedValue();
    const writeFileStub = vi.spyOn(fse, "writeFile").mockResolvedValue();
    const pathExistsStub = vi.spyOn(fse, "pathExists").mockResolvedValue(false); // File doesn't exist
    const ensureDirStub = vi.spyOn(fse, "ensureDir").mockResolvedValue();
    await MetaOSHelper.unifyProjectID("projectFolder");
    chai.assert.isTrue(readManifestStub.mock.calls.length === 1);
    chai.assert.isTrue(writeManifestStub.mock.calls.length === 1);
    chai.assert.isTrue(pathExistsStub.mock.calls.length === 1);
    chai.assert.isTrue(ensureDirStub.mock.calls.length === 1);
    chai.assert.isTrue(writeFileStub.mock.calls.length === 1);
    // Verify that the env file content contains TEAMS_APP_ID
    const writeFileCall = writeFileStub.mock.calls[0];
    chai.assert.include(writeFileCall[1], "TEAMS_APP_ID=");
  });
});
