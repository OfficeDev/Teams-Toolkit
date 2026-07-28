// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import AdmZip from "adm-zip";
import fs from "fs-extra";
import { RestoreFn } from "mocked-env";
import * as os from "os";
import * as path from "path";
import { assert, beforeEach, chai, describe, it, vi } from "vitest";
import { FxCore } from "../../src";
import { featureFlagManager } from "../../src/common/featureFlags";
import { setTools } from "../../src/common/globalVars";
import "../../src/component/feature/sso";
import * as templateHelper from "../../src/component/generator/templateHelper";
import * as generatorUtils from "../../src/component/generator/utils";
import * as fxCoreModule from "../../src/core/FxCore";
import { MockTools, randomAppName } from "./utils";

vi.mock("../../src/common/templates-config.json", () => ({
  default: {
    tagPrefix: "templates@",
    vstagPrefix: "templates-vs@",
    templateDownloadBaseURL: "https://example.com/releases/download",
  },
  tagPrefix: "templates@",
  vstagPrefix: "templates-vs@",
  templateDownloadBaseURL: "https://example.com/releases/download",
}));

const tools = new MockTools();

async function mockV3Project(): Promise<string> {
  const appName = randomAppName();
  const projectPath = path.join(os.tmpdir(), appName);
  // await fs.move(path.join(__dirname, "../sampleV3"), path.join(os.tmpdir(), appName));
  await fs.copy(path.join(__dirname, "../samples/sampleV3/"), path.join(projectPath));
  return appName;
}

async function mockCliUninstallProject(): Promise<string> {
  const appName = randomAppName();
  const projectPath = path.join(os.tmpdir(), appName);
  await fs.copy(path.join(__dirname, "../samples/uninstall/"), path.join(projectPath));
  return appName;
}

async function deleteTestProject(appName: string) {
  await fs.remove(path.join(os.tmpdir(), appName));
}

describe("fetchOnlineTemplateMetadata", () => {
  let core: FxCore;
  let mockedEnvRestore: RestoreFn | undefined;

  beforeEach(() => {
    setTools(tools);
    core = new FxCore(tools);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
      mockedEnvRestore = undefined;
    }
  });

  it("should skip download when using local template", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(true);

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.isUndefined(result.value);
    }
  });

  it("should download metadata for rc version when coreVersion contains 'rc'", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0-rc.1");

    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    const writeFileStub = vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isOk());
    assert.isTrue(fetchZipStub.mock.calls.length === 1);
    assert.equal(
      fetchZipStub.mock.calls[0]?.[0],
      "https://example.com/releases/download/templates@0.0.0-rc/metadata.zip"
    );
    assert.isTrue(unzipStub.mock.calls.length === 1);
    assert.isTrue(writeFileStub.mock.calls.length === 1);
  });

  it("should download metadata for stable version", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);

    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0");

    const getTemplateLatestVersionStub = vi
      .spyOn(generatorUtils, "getTemplateLatestVersion")
      .mockResolvedValue("2.0.0");
    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    const writeFileStub = vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isOk());
    assert.isTrue(getTemplateLatestVersionStub.mock.calls.length === 1);
    assert.isTrue(fetchZipStub.mock.calls.length === 1);
    assert.equal(
      fetchZipStub.mock.calls[0]?.[0],
      "https://example.com/releases/download/templates@2.0.0/metadata.zip"
    );
    assert.isTrue(unzipStub.mock.calls.length === 1);
    chai.expect(writeFileStub.mock.calls.length).to.be.greaterThan(0);
  });

  it("should skip download when cached version matches latest version", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0");

    vi.spyOn(generatorUtils, "getTemplateLatestVersion").mockResolvedValue("2.0.0");
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl");
    const unzipStub = vi.spyOn(generatorUtils, "unzip");

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "readFile").mockResolvedValue("2.0.0" as any);
    vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isOk());
    assert.equal(fetchZipStub.mock.calls.length > 0, false);
    assert.equal(unzipStub.mock.calls.length > 0, false);
  });

  it("should download when cached version file does not exist", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);

    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0");

    vi.spyOn(generatorUtils, "getTemplateLatestVersion").mockResolvedValue("2.0.0");
    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isOk());
    assert.isTrue(fetchZipStub.mock.calls.length === 1);
    assert.isTrue(unzipStub.mock.calls.length === 1);
  });

  it("should download when cached version differs from latest version", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);

    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0");

    vi.spyOn(generatorUtils, "getTemplateLatestVersion").mockResolvedValue("2.0.0");
    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "readFile").mockResolvedValue("1.0.0" as any); // Old cached version
    vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isOk());
    assert.isTrue(fetchZipStub.mock.calls.length === 1);
    assert.isTrue(unzipStub.mock.calls.length === 1);
  });

  it("should re-download when cached version file is corrupted", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);

    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0");

    vi.spyOn(generatorUtils, "getTemplateLatestVersion").mockResolvedValue("2.0.0");
    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("File read error"));
    vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isOk());
    assert.isTrue(fetchZipStub.mock.calls.length === 1);
    assert.isTrue(unzipStub.mock.calls.length === 1);
  });

  it("should handle alpha version correctly", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0-alpha.1");

    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isOk());
    assert.equal(
      fetchZipStub.mock.calls[0]?.[0],
      "https://example.com/releases/download/templates@0.0.0-rc/metadata.zip"
    );
  });

  it("should handle beta version correctly", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0-beta.1");

    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isOk());
    assert.equal(
      fetchZipStub.mock.calls[0]?.[0],
      "https://example.com/releases/download/templates@0.0.0-rc/metadata.zip"
    );
  });

  it("should return error when fetchZipFromUrl fails", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);

    vi.spyOn(generatorUtils, "getTemplateLatestVersion").mockResolvedValue("2.0.0");
    vi.spyOn(generatorUtils, "fetchZipFromUrl").mockRejectedValue(
      new Error("Network error: Failed to fetch")
    );

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.source, "FetchOnlineTemplateMetadata");
      assert.equal(result.error.name, "DownloadFailed");
      assert.include(result.error.message, "Network error: Failed to fetch");
    }
  });

  it("should return error when unzip fails", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);

    vi.spyOn(generatorUtils, "getTemplateLatestVersion").mockResolvedValue("2.0.0");
    const mockZip = new AdmZip();
    vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    vi.spyOn(generatorUtils, "unzip").mockRejectedValue(new Error("Unzip failed: Invalid archive"));

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.source, "FetchOnlineTemplateMetadata");
      assert.equal(result.error.name, "DownloadFailed");
      assert.include(result.error.message, "Unzip failed: Invalid archive");
    }
  });

  it("should return error when fs.writeFile fails", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);

    vi.spyOn(generatorUtils, "getTemplateLatestVersion").mockResolvedValue("2.0.0");
    const mockZip = new AdmZip();
    vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockRejectedValue(new Error("Permission denied"));

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.source, "FetchOnlineTemplateMetadata");
      assert.equal(result.error.name, "DownloadFailed");
      assert.include(result.error.message, "Permission denied");
    }
  });

  it("should use correct metadata directory path", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0");

    vi.spyOn(generatorUtils, "getTemplateLatestVersion").mockResolvedValue("2.0.0");
    const mockZip = new AdmZip();
    vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const ensureDirStub = vi.spyOn(fs, "ensureDir").mockResolvedValue();
    const writeFileStub = vi.spyOn(fs, "writeFile").mockResolvedValue();

    const expectedMetadataDir = path.join(os.homedir(), ".fx");

    const result = await core.fetchOnlineTemplateMetadata();

    assert.isTrue(result.isOk());
    chai.expect(ensureDirStub.mock.calls.length).to.be.greaterThan(0);
    chai.expect(unzipStub.mock.calls.length).to.be.greaterThan(0);
    assert.deepEqual(writeFileStub.mock.calls[0], [
      path.join(expectedMetadataDir, "template-version.txt"),
      "2.0.0",
      { encoding: "utf-8" },
    ]);
  });
});

describe("fetchOnlineTemplateMetadataForVS", () => {
  let core: FxCore;
  let mockedEnvRestore: RestoreFn | undefined;

  beforeEach(() => {
    setTools(tools);
    core = new FxCore(tools);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
      mockedEnvRestore = undefined;
    }
  });

  it("should skip download when using local template", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(true);

    const result = await core.fetchOnlineTemplateMetadataForVS();

    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.isUndefined(result.value);
    }
  });

  it("should download metadata when version file does not exist (stable fx-core)", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0");
    // stable

    vi.spyOn(generatorUtils, "getTemplateVSLatestVersion").mockResolvedValue("18.4.1");
    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    const writeFileStub = vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadataForVS();

    assert.isTrue(result.isOk());
    assert.isTrue(fetchZipStub.mock.calls.length === 1);
    assert.equal(
      fetchZipStub.mock.calls[0]?.[0],
      "https://example.com/releases/download/templates-vs@18.4.1/metadata.zip"
    );
    assert.isTrue(unzipStub.mock.calls.length === 1);
    chai.expect(writeFileStub.mock.calls.length).to.be.greaterThan(0);
  });

  it("should use rc templates for beta fx-core (VS pre-release test build)", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0-beta.1");
    // beta = pre-stable test

    const getVSLatestStub = vi.spyOn(generatorUtils, "getTemplateVSLatestVersion");
    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadataForVS();

    assert.isTrue(result.isOk());
    // beta should NOT call getTemplateVSLatestVersion
    assert.isFalse(getVSLatestStub.mock.calls.length > 0);
    assert.equal(
      fetchZipStub.mock.calls[0]?.[0],
      "https://example.com/releases/download/templates-vs@0.0.0-rc/metadata.zip"
    );
  });

  it("should skip download when cached version matches latest", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(generatorUtils, "getTemplateVSLatestVersion").mockResolvedValue("18.4.1");
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl");
    const unzipStub = vi.spyOn(generatorUtils, "unzip");

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "readFile").mockResolvedValue("18.4.1" as any);
    vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadataForVS();

    assert.isTrue(result.isOk());
    assert.isFalse(fetchZipStub.mock.calls.length > 0);
    assert.isFalse(unzipStub.mock.calls.length > 0);
  });

  it("should download when cached version differs from latest", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);

    vi.spyOn(generatorUtils, "getTemplateVSLatestVersion").mockResolvedValue("18.4.1");
    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "readFile").mockResolvedValue("18.4.0" as any);
    vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadataForVS();

    assert.isTrue(result.isOk());
    assert.isTrue(fetchZipStub.mock.calls.length === 1);
    assert.isTrue(unzipStub.mock.calls.length === 1);
  });

  it("should re-download when version file read throws", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);

    vi.spyOn(generatorUtils, "getTemplateVSLatestVersion").mockResolvedValue("18.4.1");
    const mockZip = new AdmZip();
    const fetchZipStub = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("File read error"));
    vi.spyOn(fs, "writeFile").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadataForVS();

    assert.isTrue(result.isOk());
    assert.isTrue(fetchZipStub.mock.calls.length === 1);
    assert.isTrue(unzipStub.mock.calls.length === 1);
  });

  it("should return error when getTemplateVSLatestVersion fails", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(generatorUtils, "getTemplateVSLatestVersion").mockRejectedValue(
      new Error("Failed to find valid VS template version")
    );

    vi.spyOn(fs, "ensureDir").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadataForVS();

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.source, "FetchOnlineTemplateMetadataForVS");
      assert.equal(result.error.name, "DownloadFailed");
      assert.include(result.error.message, "Failed to find valid VS template version");
    }
  });

  it("should return error when fetchZipFromUrl fails", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);

    vi.spyOn(generatorUtils, "getTemplateVSLatestVersion").mockResolvedValue("18.4.1");
    vi.spyOn(generatorUtils, "fetchZipFromUrl").mockRejectedValue(
      new Error("Download failed: 404 Not Found")
    );

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(fs, "ensureDir").mockResolvedValue();

    const result = await core.fetchOnlineTemplateMetadataForVS();

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.equal(result.error.source, "FetchOnlineTemplateMetadataForVS");
      assert.equal(result.error.name, "DownloadFailed");
      assert.include(result.error.message, "Download failed: 404 Not Found");
    }
  });

  it("should use vs-metadata directory with correct version file path", async () => {
    vi.spyOn(templateHelper, "useLocalTemplate").mockReturnValue(false);
    vi.spyOn(fxCoreModule.fxCoreDeps, "getCoreVersion").mockReturnValue("1.0.0");

    vi.spyOn(generatorUtils, "getTemplateVSLatestVersion").mockResolvedValue("18.4.1");
    const mockZip = new AdmZip();
    vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue(mockZip);
    const unzipStub = vi.spyOn(generatorUtils, "unzip").mockResolvedValue();

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const ensureDirStub = vi.spyOn(fs, "ensureDir").mockResolvedValue();
    const writeFileStub = vi.spyOn(fs, "writeFile").mockResolvedValue();

    const expectedMetadataDir = path.join(os.homedir(), ".fx", "vs-metadata");

    const result = await core.fetchOnlineTemplateMetadataForVS();

    assert.isTrue(result.isOk());
    chai.expect(ensureDirStub.mock.calls.length).to.be.greaterThan(0);
    chai.expect(unzipStub.mock.calls.length).to.be.greaterThan(0);
    assert.deepEqual(writeFileStub.mock.calls[0], [
      path.join(expectedMetadataDir, "template-vs-version.txt"),
      "18.4.1",
      { encoding: "utf-8" },
    ]);
  });
});
