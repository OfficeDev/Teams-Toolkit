import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import { setTools } from "../../../src/common/globalVars";
import { MockTools } from "../../core/utils";
import {
  expandVariableWithFunction,
  ManifestType,
} from "../../../src/component/utils/envFunctionUtils";
import { MockedLogProvider, MockedTelemetryReporter } from "../../plugins/solution/util";
import { FileNotFoundError } from "../../../src/error";
import { FeatureFlagName } from "../../../src/common/featureFlags";
import { Platform } from "@microsoft/teamsfx-api";
import { assert, vi } from "vitest";

describe("expandVariableWithFunction", async () => {
  const tools = new MockTools();
  setTools(tools);
  const sandbox = vi;
  const context = {
    logProvider: new MockedLogProvider(),
    telemetryReporter: new MockedTelemetryReporter(),
    projectPath: "test",
    platform: Platform.VSCode,
  };

  let mockedEnvRestore: RestoreFn | undefined;
  afterEach(() => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });

  it("happy path with no placeholder", async () => {
    const content = 'description:"description of the app"';
    const res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test"
    );

    assert.isTrue(res.isOk() && res.value === content);
  });

  it("happy path with placeholders", async () => {
    mockedEnvRestore = mockedEnv({
      TEST_ENV: "test",
      FILE_PATH: "testfile1.txt",
    });
    const content =
      "description:\"$[file('testfile1.md')]\",description2:\"$[file( file( 'C://testfile2.txt' ))] $[file(${{FILE_PATH}})]\"";
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file: number | fs.PathLike) => {
      if (file.toString().endsWith("testfile1.txt")) {
        return Promise.resolve("description in ${{TEST_ENV}}" as any);
      } else if (file.toString().endsWith("testfile2.txt")) {
        return Promise.resolve("test/testfile1.txt" as any);
      }
      if (file.toString().endsWith("testfile1.md")) {
        return Promise.resolve("description in ${{TEST_ENV}}" as any);
      } else {
        throw new Error("not support " + file);
      }
    });

    const res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test.json"
    );
    if (res.isErr()) {
      console.log(res.error);
    }
    assert.isTrue(
      res.isOk() &&
        res.value ===
          'description:"description in test",description2:"description in test description in test"'
    );
  });

  it("Invalid function", async () => {
    mockedEnvRestore = mockedEnv({
      TEST_ENV: "test",
      FILE_PATH: "testfile1.txt",
    });
    const content = "description:\"$[ unknown('testfile1.txt')]\"C://test";
    const res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test"
    );
    assert.isTrue(res.isErr() && res.error.name === "InvalidFunction");
  });

  it("Unsupport file format", async () => {
    mockedEnvRestore = mockedEnv({
      TEST_ENV: "test",
      FILE_PATH: "testfile1.txt",
    });
    const content = "description:\"$[ file('testfile1.png')]\"C://test";
    const res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test"
    );
    assert.isTrue(res.isErr() && res.error.name === "UnsupportedFileFormat");
  });

  it("Invalid file parameter", async () => {
    mockedEnvRestore = mockedEnv({
      TEST_ENV: "test",
      FILE_PATH: "testfile1.txt",
    });
    const content = 'description:"$[ file(testfile1.md)]"';

    let res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test"
    );
    assert.isTrue(
      res.isErr() &&
        res.error.name === "InvalidFunctionParameter" &&
        res.error.message.includes("[Output panel]")
    );

    res = await expandVariableWithFunction(
      content,
      { ...context, platform: Platform.CLI } as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test"
    );
    assert.isTrue(res.isErr() && res.error.name === "InvalidFunctionParameter");
  });

  it("Read file content error", async () => {
    mockedEnvRestore = mockedEnv({
      TEST_ENV: "test",
      FILE_PATH: "testfile1.txt",
    });
    const content = "description:\"$[ file('testfile1.txt')]\"C://test";

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file: number | fs.PathLike) => {
      throw new Error("not support " + file);
    });

    let res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test"
    );
    assert.isTrue(
      res.isErr() &&
        res.error.name === "ReadFileError" &&
        res.error.message.includes("[Output panel]")
    );

    res = await expandVariableWithFunction(
      content,
      { ...context, platform: Platform.CLI } as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test"
    );
    assert.isTrue(res.isErr() && res.error.name === "ReadFileError");
  });

  it("Read file content error - nested error", async () => {
    mockedEnvRestore = mockedEnv({
      TEST_ENV: "test",
      FILE_PATH: "testfile1.txt",
    });
    const content = "description:\"$[ file(file('testfile1.txt'))]\"C://test";

    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation((file: number | fs.PathLike) => {
      throw new Error("not support " + file);
    });

    let res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test"
    );

    assert.isTrue(
      res.isErr() &&
        res.error.name === "ReadFileError" &&
        res.error.message.includes("[Output panel]")
    );

    res = await expandVariableWithFunction(
      content,
      { ...context, platform: Platform.CLI } as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test"
    );
    assert.isTrue(res.isErr() && res.error.name === "ReadFileError");
  });

  it("file not found error", async () => {
    mockedEnvRestore = mockedEnv({
      TEST_ENV: "test",
      FILE_PATH: "testfile1.txt",
    });
    const content = "description:\"$[ file('testfile1.txt')]\"C://test";

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);

    const res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      "C://test"
    );
    assert.isTrue(res.isErr() && res.error instanceof FileNotFoundError);
  });
});
