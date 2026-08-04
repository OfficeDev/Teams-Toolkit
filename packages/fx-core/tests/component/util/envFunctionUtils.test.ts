import fs from "fs-extra";
import os from "os";
import path from "path";
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
  let tmpDir: string | undefined;
  afterEach(async () => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
    if (tmpDir) {
      await fs.remove(tmpDir);
      tmpDir = undefined;
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
      FILE_PATH: "byEnv.txt",
    });
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envfunc-"));
    await fs.writeFile(path.join(tmpDir, "simple.md"), "description in ${{TEST_ENV}}");
    await fs.writeFile(path.join(tmpDir, "outer.txt"), "inner.txt");
    await fs.writeFile(path.join(tmpDir, "inner.txt"), "description in ${{TEST_ENV}}");
    await fs.writeFile(path.join(tmpDir, "byEnv.txt"), "description in ${{TEST_ENV}}");

    const content =
      "description:\"$[file('simple.md')]\",description2:\"$[file( file( 'outer.txt' ))] $[file(${{FILE_PATH}})]\"";

    const res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      path.join(tmpDir, "manifest.json")
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
    // Make the target path a directory so the real readFile throws (EISDIR).
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envfunc-"));
    await fs.mkdirp(path.join(tmpDir, "testfile1.txt"));
    const content = "description:\"$[ file('testfile1.txt')]\"";

    let res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      path.join(tmpDir, "manifest.json")
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
      path.join(tmpDir, "manifest.json")
    );
    assert.isTrue(res.isErr() && res.error.name === "ReadFileError");
  });

  it("Read file content error - nested error", async () => {
    mockedEnvRestore = mockedEnv({
      TEST_ENV: "test",
      FILE_PATH: "testfile1.txt",
    });
    // Inner file() resolves to a path whose target is a directory, so the
    // outer read throws (EISDIR).
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envfunc-"));
    await fs.writeFile(path.join(tmpDir, "testfile1.txt"), "erroring.txt");
    await fs.mkdirp(path.join(tmpDir, "erroring.txt"));
    const content = "description:\"$[ file(file('testfile1.txt'))]\"";

    let res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      path.join(tmpDir, "manifest.json")
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
      path.join(tmpDir, "manifest.json")
    );
    assert.isTrue(res.isErr() && res.error.name === "ReadFileError");
  });

  it("file not found error", async () => {
    mockedEnvRestore = mockedEnv({
      TEST_ENV: "test",
      FILE_PATH: "testfile1.txt",
    });
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "envfunc-"));
    const content = "description:\"$[ file('testfile1.txt')]\"";

    const res = await expandVariableWithFunction(
      content,
      context as any,
      undefined,
      true,
      ManifestType.DeclarativeCopilotManifest,
      path.join(tmpDir, "manifest.json")
    );
    assert.isTrue(res.isErr() && res.error instanceof FileNotFoundError);
  });
});
