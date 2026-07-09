// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import { chai, vi } from "vitest";
import {
  loadStateFromEnv,
  mapStateToEnv,
  updateVersionForTeamsAppYamlFile,
} from "../../../../src/component/driver/util/utils";

describe("loadStateFromEnv", () => {
  let envRestore: RestoreFn | undefined;

  afterEach(() => {
    if (envRestore) {
      envRestore();
      envRestore = undefined;
    }
  });

  it("should return empty object when outputEnvVarNames is empty", () => {
    const outputEnvVarNames: Map<string, string> = new Map<string, string>();
    const result = loadStateFromEnv(outputEnvVarNames);
    chai.expect(Object.entries(result).length).to.equal(0);
  });

  it("should return state object with value from env", () => {
    envRestore = mockedEnv({
      ENV_A: "ENV_A value",
      ENV_B: "ENV_B value",
    });
    const outputEnvVarNames: Map<string, string> = new Map(
      Object.entries({
        envA: "ENV_A",
        envB: "ENV_B",
      })
    );

    const result = loadStateFromEnv(outputEnvVarNames);
    chai.expect(Object.entries(result).length).to.equal(2);
    chai.expect(result.envA).to.equal("ENV_A value");
    chai.expect(result.envB).to.equal("ENV_B value");
  });

  it("should return state object with undefined property if env does not exist", () => {
    envRestore = mockedEnv({
      ENV_A: "ENV_A value",
    });
    const outputEnvVarNames: Map<string, string> = new Map(
      Object.entries({
        envA: "ENV_A",
        envB: "ENV_B",
      })
    );

    const result = loadStateFromEnv(outputEnvVarNames);
    chai.expect(Object.entries(result).length).to.equal(2);
    chai.expect(result.envA).to.equal("ENV_A value");
    chai.expect(result.envB).to.be.undefined;
  });
});

describe("mapStateToEnv", async () => {
  it("should convert state to env based on outputEnvVarNames", () => {
    const state: Record<string, string> = {
      envA: "ENV_A value",
      envB: "ENV_B value",
    };
    let outputEnvVarNames: Map<string, string> = new Map(
      Object.entries({
        envA: "ENV_A",
      })
    );
    let result = mapStateToEnv(state, outputEnvVarNames);
    chai.expect(result.size).to.equal(1);
    chai.expect(result.get("ENV_A")).to.equal("ENV_A value");

    outputEnvVarNames = new Map(
      Object.entries({
        envA: "ENV_A",
        envB: "ENV_B",
      })
    );
    result = mapStateToEnv(state, outputEnvVarNames);
    chai.expect(result.size).to.equal(2);
    chai.expect(result.get("ENV_A")).to.equal("ENV_A value");
    chai.expect(result.get("ENV_B")).to.equal("ENV_B value");

    outputEnvVarNames = new Map();
    result = mapStateToEnv(state, outputEnvVarNames);
    chai.expect(result.size).to.equal(0);
  });

  it("should convert state to env and exclude given properties", () => {
    const state: Record<string, string> = {
      envA: "ENV_A value",
      envB: "ENV_B value",
    };
    const outputEnvVarNames: Map<string, string> = new Map(
      Object.entries({
        envA: "ENV_A",
        envB: "ENV_B",
      })
    );
    const result = mapStateToEnv(state, outputEnvVarNames, ["envB"]);
    chai.expect(result.size).to.equal(1);
    chai.expect(result.get("ENV_A")).to.equal("ENV_A value");
  });
});

describe("updateVersionForTeamsAppYamlFile", async () => {
  beforeEach(() => {
    vi.spyOn(fs, "writeFile").mockResolvedValue(undefined as any);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("updateVersionForTeamsAppYamlFile should works fine", async () => {
    const teamsAppYaml = "version: v1.7";
    const expectedTeamsAppYaml = "version: v1.8";

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(teamsAppYaml as any);
    const writeFileStub = vi.spyOn(fs, "writeFile");

    await updateVersionForTeamsAppYamlFile("fake-project-path");

    const writtenContent = writeFileStub.mock.calls[0][1];
    // use epect instead
    chai.expect(writtenContent).to.include(expectedTeamsAppYaml);
  });

  it("updateVersionForTeamsAppYamlFile should works fine when yaml contains schema url", async () => {
    const teamsAppYaml = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/v1.7/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: v1.7`;
    const expectedTeamsAppYaml = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/v1.8/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: v1.8`;

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(teamsAppYaml as any);
    const writeFileStub = vi.spyOn(fs, "writeFile");

    await updateVersionForTeamsAppYamlFile("fake-project-path");

    const writtenContent = writeFileStub.mock.calls[0][1];
    chai.expect(writtenContent).to.include(expectedTeamsAppYaml);
  });

  it("updateVersionForTeamsAppYamlFile should works fine when yaml contains schema url for old version style", async () => {
    const teamsAppYaml = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/1.0.0/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: 1.0.0`;
    const expectedTeamsAppYaml = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/v1.8/yaml.schema.json
# Visit https://aka.ms/teamsfx-v5.0-guide for details on this file
# Visit https://aka.ms/teamsfx-actions for details on actions
version: v1.8`;

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(teamsAppYaml as any);
    const writeFileStub = vi.spyOn(fs, "writeFile");

    await updateVersionForTeamsAppYamlFile("fake-project-path");

    const writtenContent = writeFileStub.mock.calls[0][1];
    chai.expect(writtenContent).to.include(expectedTeamsAppYaml);
  });

  it("should convert outputJsonPath to outputFolder in provision and publish sections if original version <= v1.6", async () => {
    const teamsAppYaml = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/v1.6/yaml.schema.json
  version: v1.6
  provision:
    - uses: teamsApp/zipAppPackage
      with:
        # Path to manifest template
        manifestPath: ./appPackage/manifest.json
        outputZipPath: ./appPackage/build/appPackage.dev.zip
        outputJsonPath: ./appPackage/build/manifest.dev.json
  publish:
    - uses: teamsApp/zipAppPackage
      with:
        # Path to manifest template
        manifestPath: ./appPackage/manifest.json
        outputZipPath: ./appPackage/build/appPackage.dev.zip
        outputJsonPath: ./appPackage/build/manifest.dev.json`;

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(teamsAppYaml as any);
    const writeFileStub = vi.spyOn(fs, "writeFile");

    await updateVersionForTeamsAppYamlFile("fake-project-path");

    const writtenContent = writeFileStub.mock.calls[0][1] as string;
    chai.expect(writtenContent).to.include("version: v1.8");
    chai.expect(writtenContent).to.include("https://aka.ms/teams-toolkit/v1.8/yaml.schema.json");
    chai.expect(writtenContent).to.include("outputFolder: ./appPackage/build");
    chai.expect(writtenContent).to.not.include("outputJsonPath");
    chai.expect(writtenContent).to.include("# Path to manifest template");
  });

  it("should not convert if version >=v1.8", async () => {
    const teamsAppYaml = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/v1.8/yaml.schema.json
  version: v1.8
  provision:
    - uses: unknown/action`;

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(teamsAppYaml as any);
    const writeFileStub = vi.spyOn(fs, "writeFile");

    await updateVersionForTeamsAppYamlFile("fake-project-path");

    chai.expect(writeFileStub.mock.calls.length === 0).to.be.true;
  });

  it("should not convert outputJsonPath to outputFolder in provision and publish sections if original version <= v1.6 and no outputJsonPath", async () => {
    const teamsAppYaml = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/v1.6/yaml.schema.json
  version: v1.6
  provision:
    - uses: teamsApp/zipAppPackage
      with:
        # Path to manifest template
        manifestPath: ./appPackage/manifest.json
        outputZipPath: ./appPackage/build/appPackage.dev.zip
    - uses: unknown/action
  publish:
    - uses: teamsApp/zipAppPackage
      with:
        # Path to manifest template
        manifestPath: ./appPackage/manifest.json
        outputZipPath: ./appPackage/build/appPackage.dev.zip`;

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(teamsAppYaml as any);
    const writeFileStub = vi.spyOn(fs, "writeFile");

    await updateVersionForTeamsAppYamlFile("fake-project-path");

    const writtenContent = writeFileStub.mock.calls[0][1] as string;
    chai.expect(writtenContent).to.include("version: v1.8");
    chai.expect(writtenContent).to.include("https://aka.ms/teams-toolkit/v1.8/yaml.schema.json");
    chai.expect(writtenContent).to.not.include("outputFolder: ./appPackage/build");
    chai.expect(writtenContent).to.not.include("outputJsonPath");
    chai.expect(writtenContent).to.include("# Path to manifest template");
    chai.expect(writtenContent).to.include("unknown/action");
  });

  it("should convert clientSecret to primaryClientSecret in provision and publish sections if original version == v1.3", async () => {
    const teamsAppYaml = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/v1.3/yaml.schema.json
  version: v1.3
  provision:
    - uses: apiKey/register
      with:
        # Name of the API Key
        name: apiKey
        # Teams app ID
        appId: xxxx
        # Path to OpenAPI description document
        apiSpecPath: ./appPackage/apiSpecificationFile/openapi.yaml
        # Client secret for the API Key
        clientSecret: xxxx
      # Write the registration information of API Key into environment file for
      # the specified environment variable(s).
      writeToEnvironmentFile:
        registrationId: APIKEY_REGISTRATION_ID`;

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(teamsAppYaml as any);
    const writeFileStub = vi.spyOn(fs, "writeFile");

    await updateVersionForTeamsAppYamlFile("fake-project-path");

    const writtenContent = writeFileStub.mock.calls[0][1] as string;
    chai.expect(writtenContent).to.include("version: v1.8");
    chai.expect(writtenContent).to.include("https://aka.ms/teams-toolkit/v1.8/yaml.schema.json");
    chai.expect(writtenContent).to.include("primaryClientSecret: xxxx");
    chai.expect(writtenContent).to.not.include("clientSecret");
    chai.expect(writtenContent).to.include("# Path to OpenAPI description document");
  });

  it("should not convert apiKey/register action in provision and publish sections if original version == v1.3 and no client secret", async () => {
    const teamsAppYaml = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/v1.3/yaml.schema.json
  version: v1.3
  provision:
    - uses: apiKey/register
      with:
        # Name of the API Key
        name: apiKey
        # Teams app ID
        appId: xxxx
        # Path to OpenAPI description document
        apiSpecPath: ./appPackage/apiSpecificationFile/openapi.yaml
      # Write the registration information of API Key into environment file for
      # the specified environment variable(s).
      writeToEnvironmentFile:
        registrationId: APIKEY_REGISTRATION_ID`;

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(teamsAppYaml as any);
    const writeFileStub = vi.spyOn(fs, "writeFile");

    await updateVersionForTeamsAppYamlFile("fake-project-path");

    const writtenContent = writeFileStub.mock.calls[0][1] as string;
    chai.expect(writtenContent).to.include("version: v1.8");
    chai.expect(writtenContent).to.include("https://aka.ms/teams-toolkit/v1.8/yaml.schema.json");
    chai.expect(writtenContent).to.not.include("primaryClientSecret: xxxx");
    chai.expect(writtenContent).to.not.include("clientSecret");
    chai.expect(writtenContent).to.include("# Path to OpenAPI description document");
  });
});
