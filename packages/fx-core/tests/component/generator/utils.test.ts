// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { DeclarativeAgentManifest, Platform, err, ok, signedIn } from "@microsoft/teamsfx-api";
import mockedEnv from "mocked-env";
import { assert, expect, vi } from "vitest";
import { GraphClient } from "../../../src/client/graphClient";
import { createContext, setTools } from "../../../src/common/globalVars";
import * as requestUtils from "../../../src/common/requestUtils";
import templateConfig from "../../../src/common/templates-config.json";
import { copilotGptManifestUtils } from "../../../src/component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { useLocalTemplate } from "../../../src/component/generator/templateHelper";
import {
  getTemplateUrl,
  getTemplateVSLatestVersion,
  getTemplateZipUrlByVersion,
  setGeneralSensitivityLabel,
} from "../../../src/component/generator/utils";
import { MockTools } from "../../core/utils";

// Read package.json via require — the same cached object the code under test
// (utils.ts / templateHelper.ts) reads — so mutating `.version` in a test
// actually affects what the code sees. A default JSON `import` yields a separate
// object under vitest, so version mutations were silently ignored and the tests
// read the real (release-bumped, e.g. rc) package version.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require("../../../package.json");

describe("utils unit test cases", () => {
  const sandbox = vi;
  const originalPackageVersion = (packageJson as any).version;
  const originalTemplateConfig = JSON.parse(JSON.stringify(templateConfig));

  afterEach(() => {
    vi.restoreAllMocks();
    vi.restoreAllMocks();
    (packageJson as any).version = originalPackageVersion;
    Object.assign(templateConfig, originalTemplateConfig);
  });

  it("should return the correct URL for a given version", () => {
    const version = "6.0.0";
    const perfix = "templates@";
    const name = "js";
    const expectedUrl =
      "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/templates@6.0.0/js.zip";
    const result = getTemplateZipUrlByVersion(name, version, perfix);
    assert.strictEqual(result, expectedUrl);
  });

  it("should return undefined for alpha getTemplateVSUrl", async () => {
    const getLatestVersion = () => Promise.resolve("0.0.0-rc");
    const result = await getTemplateUrl("csharp", getLatestVersion, Platform.VS);
    assert.isUndefined(result);
  });

  it("should return the correct URL for RC getTemplateVSUrl", async () => {
    const restore = mockedEnv({
      TEAMSFX_TEMPLATE_PRERELEASE: "vs",
    });
    const mockSettings = {
      version: "~6.0",
      localVersion: "6.0.0",
      tagPrefix: "templates@",
      vstagPrefix: "templates-vs@",
      vsversion: templateConfig.vsversion,
      tagListURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/template-tag-list/template-tags.txt",
      templateDownloadBaseURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download",
      templateReleaseURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/expanded_assets",
      templateDownloadBasePath: "/OfficeDev/microsoft-365-agents-toolkit/releases/download",
      templateExt: ".zip",
      useLocalTemplate: false,
    };
    Object.assign(templateConfig, mockSettings);
    const getLatestVersion = () => Promise.resolve("0.0.0-rc");
    const result = await getTemplateUrl("csharp", getLatestVersion, Platform.VS);
    const expectedUrl =
      "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/templates-vs@0.0.0-rc/csharp.zip";
    assert.strictEqual(result, expectedUrl);
    restore();
  });

  it("should return the stable URL for getTemplateVSUrl", async () => {
    assert.isFunction(getTemplateUrl);
  });

  it("should return rc URL for beta fx-core version (VS pre-release test build)", async () => {
    const mockSettings = {
      version: "~6.0",
      localVersion: "6.0.0",
      tagPrefix: "templates@",
      vstagPrefix: "templates-vs@",
      vsversion: templateConfig.vsversion,
      tagListURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/template-tag-list/template-tags.txt",
      templateDownloadBaseURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download",
      templateReleaseURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/expanded_assets",
      templateDownloadBasePath: "/OfficeDev/microsoft-365-agents-toolkit/releases/download",
      templateExt: ".zip",
      useLocalTemplate: false,
    };
    (packageJson as any).version = "3.0.0-beta.1";
    Object.assign(templateConfig, mockSettings);
    const getLatestVersion = () => Promise.resolve(templateConfig.vsversion);
    const result = await getTemplateUrl("csharp", getLatestVersion, Platform.VS);
    const expectedUrl =
      "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/templates-vs@0.0.0-rc/csharp.zip";
    assert.strictEqual(result, expectedUrl);
  });

  it("should return the correct URL for getTemplateVSCUrl", async () => {
    const restore = mockedEnv({
      TEMPLATE_VERSION: "0.0.0-rc",
    });
    const getLatestVersion = () => Promise.resolve("0.0.0-rc");
    const result = await getTemplateUrl("ts", getLatestVersion, Platform.VSCode);
    const expectedUrl =
      "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/templates@0.0.0-rc/ts.zip";
    assert.strictEqual(result, expectedUrl);
    restore();
  });

  it("should return undefined for use local template for getTemplateVSCUrl", async () => {
    const restore = mockedEnv({
      TEMPLATE_VERSION: "local",
    });
    const getLatestVersion = () => Promise.resolve("0.0.0-rc");
    const result = await getTemplateUrl("ts", getLatestVersion, Platform.VSCode);
    assert.isUndefined(result);
    restore();
  });

  it("should return undefined for alpha version in package.json", async () => {
    (packageJson as any).version = "3.0.0-alpha.1";
    const getLatestVersion = () => Promise.resolve("6.0.0");
    const result = await getTemplateUrl("ts", getLatestVersion, Platform.VSCode);
    assert.isUndefined(result);
  });

  it("should return rc URL for rc version in package.json", async () => {
    (packageJson as any).version = "3.0.0-rc.1";
    const getLatestVersion = () => Promise.resolve("6.0.0");
    const result = await getTemplateUrl("ts", getLatestVersion, Platform.VSCode);
    const expectedUrl =
      "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/templates@0.0.0-rc/ts.zip";
    assert.strictEqual(result, expectedUrl);
  });

  it("should use latest version for beta version in package.json when latest is higher", async () => {
    (packageJson as any).version = "3.0.0-beta.1";
    const mockSettings = {
      version: "~6.0",
      localVersion: "5.0.0",
      tagPrefix: "templates@",
      vstagPrefix: "templates-vs@",
      vsversion: "18.0.0",
      tagListURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/template-tag-list/template-tags.txt",
      templateDownloadBaseURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download",
      templateReleaseURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/expanded_assets",
      templateDownloadBasePath: "/OfficeDev/microsoft-365-agents-toolkit/releases/download",
      templateExt: ".zip",
      useLocalTemplate: false,
    };
    Object.assign(templateConfig, mockSettings);
    const getLatestVersion = () => Promise.resolve("6.0.0");
    const result = await getTemplateUrl("ts", getLatestVersion, Platform.VSCode);
    const expectedUrl =
      "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/templates@6.0.0/ts.zip";
    assert.strictEqual(result, expectedUrl);
  });

  it("should return undefined for stable version when latest is not higher than local", async () => {
    (packageJson as any).version = "3.0.0";
    const mockSettings = {
      version: "~6.0",
      localVersion: "6.0.0",
      tagPrefix: "templates@",
      vstagPrefix: "templates-vs@",
      vsversion: "18.0.0",
      tagListURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download/template-tag-list/template-tags.txt",
      templateDownloadBaseURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/download",
      templateReleaseURL:
        "https://github.com/OfficeDev/microsoft-365-agents-toolkit/releases/expanded_assets",
      templateDownloadBasePath: "/OfficeDev/microsoft-365-agents-toolkit/releases/download",
      templateExt: ".zip",
      useLocalTemplate: false,
    };
    Object.assign(templateConfig, mockSettings);
    const getLatestVersion = () => Promise.resolve("5.0.0");
    const result = await getTemplateUrl("ts", getLatestVersion, Platform.VSCode);
    assert.isUndefined(result);
  });

  it("should return undefined for getTemplateVSCUrl when useLocalTemplate flag is true even if latest is higher", async () => {
    (packageJson as any).version = "3.0.0";
    Object.assign(templateConfig, {
      useLocalTemplate: true,
      localVersion: "5.0.0",
      tagPrefix: "templates@",
    });
    const getLatestVersion = () => Promise.resolve("6.0.0");
    const result = await getTemplateUrl("ts", getLatestVersion, Platform.VSCode);
    assert.isUndefined(result);
  });

  it("setGeneralSensitivityLabel happy path", async () => {
    const gtools = new MockTools();
    setTools(gtools);
    const context = createContext();
    const manifestPath = "test/manifest.json";

    const tokenStub = vi
      .spyOn(context.tokenProvider!.m365TokenProvider, "getStatus")
      .mockResolvedValue(
        ok({
          status: signedIn,
          token: "fake-token",
        })
      );
    const getLabelStub = vi
      .spyOn(GraphClient.prototype, "getGeneralSentivityLabel")
      .mockResolvedValue(
        ok({
          id: "general-label-id",
          displayName: "General",
          name: "General Label",
          description: "General Label Description",
        })
      );
    const DAManifest = {
      version: "v1.4" as const,
      name: "test-agent",
      description: "test agent description",
    };

    const readStub = vi
      .spyOn(copilotGptManifestUtils, "readDeclarativeAgentManifestFile")
      .mockResolvedValue(ok(DAManifest as DeclarativeAgentManifest));

    const writeStub = vi
      .spyOn(copilotGptManifestUtils, "writeDeclarativeAgentManifestFile")
      .mockResolvedValue(ok(undefined));

    await setGeneralSensitivityLabel(context, manifestPath);

    assert.isTrue(tokenStub.mock.calls.length === 1);
    expect(getLabelStub).toHaveBeenCalledExactlyOnceWith("fake-token");
    expect(readStub).toHaveBeenCalledExactlyOnceWith(manifestPath);
    assert.isTrue(writeStub.mock.calls.length === 1);

    // Verify the manifest was updated by checking the writeStub was called correctly
    assert.equal(writeStub.mock.calls[0][1], manifestPath);

    const sensitivityLabel = (DAManifest as any).sensitivity_label;
    assert.equal(sensitivityLabel?.id, "general-label-id");
  });

  it("setGeneralSensitivityLabel failed", async () => {
    const gtools = new MockTools();
    setTools(gtools);
    const context = createContext();
    const manifestPath = "test/manifest.json";

    (context as any).tokenProvider = undefined;
    const getLabelStub = vi
      .spyOn(GraphClient.prototype, "getGeneralSentivityLabel")
      .mockResolvedValue(err(new Error("Failed to get label") as any));
    const DAManifest = {
      version: "v1.4" as const,
      name: "test-agent",
      description: "test agent description",
    };

    const readStub = vi
      .spyOn(copilotGptManifestUtils, "readDeclarativeAgentManifestFile")
      .mockResolvedValue(ok(DAManifest as DeclarativeAgentManifest));

    const writeStub = vi
      .spyOn(copilotGptManifestUtils, "writeDeclarativeAgentManifestFile")
      .mockResolvedValue(ok(undefined));

    await setGeneralSensitivityLabel(context, manifestPath);

    assert.isTrue(readStub.mock.calls.length === 0);
    assert.isTrue(writeStub.mock.calls.length === 0);

    const sensitivityLabel = (DAManifest as any).sensitivity_label;
    assert.isUndefined(sensitivityLabel);
  });
});

describe("templateHelper unit test cases", () => {
  const originalPackageVersion = (packageJson as any).version;
  const originalTemplateConfig = JSON.parse(JSON.stringify(templateConfig));

  afterEach(() => {
    (packageJson as any).version = originalPackageVersion;
    Object.assign(templateConfig, originalTemplateConfig);
  });

  it("should return true when TEMPLATE_VERSION is set to local", () => {
    const restore = mockedEnv({
      TEMPLATE_VERSION: "local",
    });
    // local override wins even when the config flag is off.
    (templateConfig as any).useLocalTemplate = false;
    const result = useLocalTemplate();
    assert.isTrue(result);
    restore();
  });

  it("should return false when an explicit non-local TEMPLATE_VERSION is set", () => {
    const restore = mockedEnv({
      TEMPLATE_VERSION: "1.0.0",
    });
    (packageJson as any).version = "3.0.0";
    (templateConfig as any).useLocalTemplate = true;
    // An explicit version override forces a download regardless of the flag.
    const result = useLocalTemplate();
    assert.isFalse(result);
    restore();
  });

  it("should return true when the useLocalTemplate config flag is true", () => {
    const restore = mockedEnv({
      TEMPLATE_VERSION: "",
    });
    (packageJson as any).version = "3.0.0";
    (templateConfig as any).useLocalTemplate = true;
    const result = useLocalTemplate();
    assert.isTrue(result);
    restore();
  });

  it("should return false when the useLocalTemplate config flag is false", () => {
    const restore = mockedEnv({
      TEMPLATE_VERSION: "",
    });
    (packageJson as any).version = "3.0.0";
    (templateConfig as any).useLocalTemplate = false;
    const result = useLocalTemplate();
    assert.isFalse(result);
    restore();
  });
});

describe("getTemplateVSLatestVersion", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return the max satisfying version matching vsVersionPattern", async () => {
    // Build tag list from the actual vsVersionPattern so the test stays valid after version bumps
    const base = templateConfig.vsVersionPattern.replace("~", ""); // e.g. "18.6"
    const [major, minor] = base.split(".");
    const nextMinor = `${major}.${parseInt(minor) + 1}`;
    // shared tag list contains both VSC and VS tags
    const tagList = `templates@6.6.0\ntemplates@6.6.1\ntemplates-vs@${base}.0\ntemplates-vs@${base}.1\ntemplates-vs@${nextMinor}.0\n`;
    vi.spyOn(requestUtils, "sendRequestWithTimeout").mockResolvedValue({ data: tagList } as any);

    const result = await getTemplateVSLatestVersion();
    // ~base matches base.x only, not nextMinor.x; VSC tags are ignored
    assert.strictEqual(result, `${base}.1`);
  });

  it("should handle CRLF line endings in tag list", async () => {
    const base = templateConfig.vsVersionPattern.replace("~", "");
    const tagList = `templates@6.6.1\r\ntemplates-vs@${base}.0\r\ntemplates-vs@${base}.1\r\n`;
    vi.spyOn(requestUtils, "sendRequestWithTimeout").mockResolvedValue({ data: tagList } as any);

    const result = await getTemplateVSLatestVersion();
    assert.strictEqual(result, `${base}.1`);
  });

  it("should throw when no version satisfies vsVersionPattern", async () => {
    // only non-VS tags and old VS tags — none match ~18.6
    const tagList = "templates@6.6.1\ntemplates-vs@17.0.0\ntemplates-vs@17.1.0\n";
    vi.spyOn(requestUtils, "sendRequestWithTimeout").mockResolvedValue({ data: tagList } as any);

    try {
      await getTemplateVSLatestVersion();
      assert.fail("Expected error to be thrown");
    } catch (e: any) {
      assert.include(e.message, "Failed to find valid VS template version");
    }
  });

  it("should propagate network errors from fetchTagList", async () => {
    vi.spyOn(requestUtils, "sendRequestWithTimeout").mockRejectedValue(
      new Error("Network timeout")
    );

    try {
      await getTemplateVSLatestVersion();
      assert.fail("Expected error to be thrown");
    } catch (e: any) {
      assert.include(e.message, "Network timeout");
    }
  });
});
