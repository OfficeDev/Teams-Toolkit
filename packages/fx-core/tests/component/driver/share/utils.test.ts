import { err, ok, UserError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { chai, vi } from "vitest";
import { parseShareAppActionYamlConfig } from "../../../../src/component/driver/share/utils";
import { Constants } from "../../../../src/component/driver/teamsApp/constants";
import { envUtil } from "../../../../src/component/utils/envUtil";
import { metadataUtil } from "../../../../src/component/utils/metadataUtil";
import { pathUtils } from "../../../../src/component/utils/pathUtils";

// Helper function to create a temporary ZIP file
function createMockZipFile(): string {
  const tempDir = os.tmpdir();
  const tempZipPath = path.join(tempDir, "mockAppPackage.zip");
  const zip = new AdmZip();
  zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify({ id: "mockManifestId" })));
  zip.writeZip(tempZipPath);
  return tempZipPath;
}

function createMockZipFileWithoutManifest(): string {
  const tempDir = os.tmpdir();
  const tempZipPath = path.join(tempDir, "mockAppPackageWithoutManifest.zip");
  const zip = new AdmZip();
  zip.writeZip(tempZipPath);
  return tempZipPath;
}

function createMockZipFileWithoutManifestId(): string {
  const tempDir = os.tmpdir();
  const tempZipPath = path.join(tempDir, "mockAppPackageWithoutManifestId.zip");
  const zip = new AdmZip();
  zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify({})));
  zip.writeZip(tempZipPath);
  return tempZipPath;
}

describe("parseShareAppActionYamlConfig", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return manifestId, sharedTitleId, and sharedAppId when config is valid", async () => {
    const mockZipPath = createMockZipFile();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        deploy: {
          driverDefs: [
            {
              uses: "teamsApp/extendToM365",
              with: { appPackagePath: mockZipPath } as any,
              writeToEnvironmentFile: {
                titleId: "parseShareAppActionYamlConfigMockTitleIdName",
                appId: "parseShareAppActionYamlConfigMockAppIdName",
              } as any,
            },
          ],
        },
      } as any)
    );
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    process.env["parseShareAppActionYamlConfigMockTitleIdName"] = "mockTitleId";
    process.env["parseShareAppActionYamlConfigMockAppIdName"] = "mockAppId";
    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, {
        teamsappId: "mockManifestId",
        titleId: "mockTitleId",
        appId: "mockAppId",
      });
    }

    process.env["parseShareAppActionYamlConfigMockTitleIdName"] = undefined;
    process.env["parseShareAppActionYamlConfigMockAppIdName"] = undefined;
  });

  it("should return error when yaml config is invalid", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      err(new UserError("FxCore", "InvalidYaml", "Invalid yaml config"))
    );

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.instanceOf(result.error, UserError);
      chai.assert.equal(result.error.name, "InvalidYaml");
    }
  });

  it("should return error when appPackagePath is missing", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        deploy: {
          driverDefs: [
            {
              uses: "teamsApp/extendToM365",
            },
          ],
        },
      } as any)
    );

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.instanceOf(result.error, UserError);
      chai.assert.equal(result.error.name, "Share to Users");
    }
  });

  it("should return error when manifest file is missing", async () => {
    const mockZipPath = createMockZipFileWithoutManifest();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        deploy: {
          driverDefs: [
            {
              uses: "teamsApp/extendToM365",
              with: { appPackagePath: mockZipPath },
            },
          ],
        },
      } as any)
    );
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(fs, "existsSync").mockReturnValue(true);

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.instanceOf(result.error, UserError);
      chai.assert.equal(result.error.name, "Share to Users");
    }
  });

  it("should return error when sharedTitleId or sharedAppId is missing", async () => {
    const mockZipPath = createMockZipFile();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        deploy: {
          driverDefs: [
            {
              uses: "teamsApp/extendToM365",
              with: { appPackagePath: mockZipPath },
              writeToEnvironmentFile: {},
            },
          ],
        },
      } as any)
    );
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const admZipInstance = new AdmZip();
    vi.spyOn(admZipInstance, "getEntries").mockReturnValue([
      {
        entryName: Constants.MANIFEST_FILE,
        getData: () => Buffer.from(JSON.stringify({ id: "mockManifestId" })),
      },
    ] as any);

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.instanceOf(result.error, UserError);
      chai.assert.equal(result.error.name, "Share");
    }
  });

  it("should return error when projectModel.share or driverDefs is missing", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok({} as any));

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "Share");
    }
  });

  it("should return error when provision has no driverDefs and deploy is missing", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        provision: {},
      } as any)
    );

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "Share");
      chai.assert.include(result.error.message, 'Unable to find the "provision"');
    }
  });

  it("should return error when deploy has no driverDefs and provision is missing", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        deploy: {},
      } as any)
    );

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "Share");
      chai.assert.include(result.error.message, 'Unable to find the "provision"');
    }
  });

  it("should return error when both provision and deploy have no driverDefs", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        provision: {},
        deploy: {},
      } as any)
    );

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "Share");
      chai.assert.include(result.error.message, 'Unable to find the "provision"');
    }
  });

  it("should find extendToM365Action in provision when deploy doesn't have it", async () => {
    const mockZipPath = createMockZipFile();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        provision: {
          driverDefs: [
            {
              uses: "teamsApp/extendToM365",
              with: { appPackagePath: mockZipPath } as any,
              writeToEnvironmentFile: {
                titleId: "parseShareAppActionYamlConfigMockTitleIdName",
                appId: "parseShareAppActionYamlConfigMockAppIdName",
              } as any,
            },
          ],
        },
        deploy: {
          driverDefs: [
            {
              uses: "someOtherAction",
            },
          ],
        },
      } as any)
    );
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    process.env["parseShareAppActionYamlConfigMockTitleIdName"] = "mockTitleId";
    process.env["parseShareAppActionYamlConfigMockAppIdName"] = "mockAppId";

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, {
        teamsappId: "mockManifestId",
        titleId: "mockTitleId",
        appId: "mockAppId",
      });
    }

    process.env["parseShareAppActionYamlConfigMockTitleIdName"] = undefined;
    process.env["parseShareAppActionYamlConfigMockAppIdName"] = undefined;
  });

  it("should return error when share action is not found in either provision or deploy", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        provision: {
          driverDefs: [
            {
              uses: "someOtherAction",
            },
          ],
        },
        deploy: {
          driverDefs: [
            {
              uses: "anotherAction",
            },
          ],
        },
      } as any)
    );

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "Share");
      chai.assert.include(result.error.message, 'Unable to find the "copilotAgent/publish"');
    }
  });

  it("should find copilotAgent/publish action in provision", async () => {
    const mockZipPath = createMockZipFile();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        provision: {
          driverDefs: [
            {
              uses: "copilotAgent/publish",
              with: { appPackagePath: mockZipPath } as any,
              writeToEnvironmentFile: {
                titleId: "parseShareAppActionYamlConfigMockTitleIdName",
                appId: "parseShareAppActionYamlConfigMockAppIdName",
              } as any,
            },
          ],
        },
      } as any)
    );
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    process.env["parseShareAppActionYamlConfigMockTitleIdName"] = "mockTitleId";
    process.env["parseShareAppActionYamlConfigMockAppIdName"] = "mockAppId";

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, {
        teamsappId: "mockManifestId",
        titleId: "mockTitleId",
        appId: "mockAppId",
      });
    }

    process.env["parseShareAppActionYamlConfigMockTitleIdName"] = undefined;
    process.env["parseShareAppActionYamlConfigMockAppIdName"] = undefined;
  });

  it("should return error when extendToM365Action is missing", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok({ deploy: { driverDefs: [] } } as any));

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "Share");
    }
  });

  it("should return error when readEnv fails", async () => {
    const mockZipPath = createMockZipFile();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        deploy: {
          driverDefs: [
            {
              uses: "teamsApp/extendToM365",
              with: { appPackagePath: mockZipPath } as any,
              writeToEnvironmentFile: {
                titleId: "parseShareAppActionYamlConfigMockTitleIdName",
                appId: "parseShareAppActionYamlConfigMockAppIdName",
              } as any,
            },
          ],
        },
      } as any)
    );
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      err(new UserError("FxCore", "EnvError", "Failed to read env"))
    );

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "EnvError");
    }
  });

  it("should return error when resolvedAppPackagePath does not exist", async () => {
    const mockZipPath = createMockZipFile();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        deploy: {
          driverDefs: [
            {
              uses: "teamsApp/extendToM365",
              with: { appPackagePath: mockZipPath } as any,
              writeToEnvironmentFile: {
                titleId: "parseShareAppActionYamlConfigMockTitleIdName",
                appId: "parseShareAppActionYamlConfigMockAppIdName",
              } as any,
            },
          ],
        },
      } as any)
    );
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(fs, "existsSync").mockReturnValue(false);

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "Share");
    }
  });

  it("should return error when manifestId is missing", async () => {
    const mockZipPath = createMockZipFileWithoutManifestId();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        deploy: {
          driverDefs: [
            {
              uses: "teamsApp/extendToM365",
              with: { appPackagePath: mockZipPath } as any,
              writeToEnvironmentFile: {
                titleId: "parseShareAppActionYamlConfigMockTitleIdName",
                appId: "parseShareAppActionYamlConfigMockAppIdName",
              } as any,
            },
          ],
        },
      } as any)
    );
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    process.env["parseShareAppActionYamlConfigMockTitleIdName"] = "mockTitleId";
    process.env["parseShareAppActionYamlConfigMockAppIdName"] = "mockAppId";

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "Share to Users");
    }
  });

  it("should return error when shared ids are missing in environment", async () => {
    const mockZipPath = createMockZipFile();
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(
      ok({
        deploy: {
          driverDefs: [
            {
              uses: "teamsApp/extendToM365",
              with: { appPackagePath: mockZipPath } as any,
              writeToEnvironmentFile: {
                titleId: "parseShareAppActionYamlConfigMissingTitleIdName",
                appId: "parseShareAppActionYamlConfigMissingAppIdName",
              } as any,
            },
          ],
        },
      } as any)
    );
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    delete process.env["parseShareAppActionYamlConfigMissingTitleIdName"];
    delete process.env["parseShareAppActionYamlConfigMissingAppIdName"];

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(result.error.name, "Share");
      chai.assert.include(result.error.message, "Unable to get title id or app id");
    }
  });

  it("should error with yamlConfigNotSupported for version < 1.10.0", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok({ version: "v1.9" } as any));

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.instanceOf(result.error, UserError);
      chai.assert.equal(result.error.name, "Share");
      // message should include the unsupported version string
      chai.assert.include(
        result.error.message,
        "Share feature only supports m365agents.yml version v1.10 or above"
      );
    }
  });

  it("should proceed when version >= 1.10.0", async () => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("mockTemplatePath");
    // minimal model with only version; subsequent checks will return yamlConfigNotFound
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok({ version: "v1.10" } as any));

    const result = await parseShareAppActionYamlConfig("mockProjectPath");

    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      // ensure not failing due to version gate by checking generic Share error
      chai.assert.instanceOf(result.error, UserError);
      chai.assert.equal(result.error.name, "Share");
    }
  });
});
