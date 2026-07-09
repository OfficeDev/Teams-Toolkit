import fs from "fs-extra";
import { afterEach, beforeEach, chai } from "vitest";
import { jsonUtils } from "../../src/common/jsonUtils";
import { convertToAlphanumericOnly } from "../../src/common/stringUtils";
import {
  isYamlFileName,
  isYamlFileNameV3,
  isYamlFileNameV4,
} from "../../src/common/versionMetadata";
import {
  FileNotFoundError,
  JSONSyntaxError,
  ReadFileError,
  WriteFileError,
} from "../../src/error/common";

describe("convert to valid AppName in ProjectSetting", () => {
  it("convert app name", () => {
    const appName = "app.123";
    const expected = "app123";
    const projectSettingsName = convertToAlphanumericOnly(appName);

    chai.assert.equal(projectSettingsName, expected);
  });

  it("convert app name", () => {
    const appName = "app.1@@2！3";
    const expected = "app123";
    const projectSettingsName = convertToAlphanumericOnly(appName);

    chai.assert.equal(projectSettingsName, expected);
  });
});

describe("JSONUtils", () => {
  const tempDir = ".tmp-json-utils-tests";

  beforeEach(() => {
    fs.ensureDirSync(tempDir);
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it("readJSONFileSync JSONSyntaxError", () => {
    const badJsonPath = `${tempDir}/bad.json`;
    fs.writeFileSync(badJsonPath, "{ bad json }");
    const res = jsonUtils.readJSONFileSync(badJsonPath);
    chai.assert.isTrue(res.isErr());
    if (res.isErr()) {
      chai.assert.isTrue(res.error instanceof JSONSyntaxError);
    }
  });

  it("readJSONFileSync ReadFileError", () => {
    const folderPath = `${tempDir}/folder`;
    fs.ensureDirSync(folderPath);
    const res = jsonUtils.readJSONFileSync(folderPath);
    chai.assert.isTrue(res.isErr());
    if (res.isErr()) {
      chai.assert.isTrue(res.error instanceof ReadFileError);
    }
  });

  it("readJSONFileSync FileNotFoundError", () => {
    const res = jsonUtils.readJSONFileSync(`${tempDir}/not-exist.json`);
    chai.assert.isTrue(res.isErr());
    if (res.isErr()) {
      chai.assert.isTrue(res.error instanceof FileNotFoundError);
    }
  });
});

describe("Errors", () => {
  afterEach(() => {
    // Cleanup if needed
  });
  it("WriteFileError", () => {
    const error = new WriteFileError(new Error("write file error"), "common");
    chai.assert(error.name === "WriteFileError");
  });
  it("WriteFileError", () => {
    const error = new WriteFileError(new Error(""), "common");
    chai.assert(error.name === "WriteFileError");
  });
});

describe("versionMetadata", () => {
  it("isYamlFileName - true", () => {
    const res = isYamlFileName("m365agents.local.yml");
    chai.assert.isTrue(res);
  });
  it("isYamlFileName - false", () => {
    const res = isYamlFileName("abc.local.yml");
    chai.assert.isFalse(res);
  });
  it("isYamlFileNameV3 - true", () => {
    const res = isYamlFileNameV3("teamsapp.local.yml");
    chai.assert.isTrue(res);
  });
  it("isYamlFileNameV3 - false", () => {
    const res = isYamlFileNameV3("m365agents.local.yml");
    chai.assert.isFalse(res);
  });
  it("isYamlFileNameV4 - true", () => {
    const res = isYamlFileNameV4("m365agents.local.yml");
    chai.assert.isTrue(res);
  });
  it("isYamlFileNameV4 - false", () => {
    const res = isYamlFileNameV4("teamsapp.yml");
    chai.assert.isFalse(res);
  });
});
