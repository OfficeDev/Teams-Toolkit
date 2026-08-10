import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import * as os from "os";
import * as path from "path";
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
import { DriverContext } from "../../../src/component/driver/interface/commonArgs";

describe("expandVariableWithFunction", async () => {
  const tools = new MockTools();
  setTools(tools);
  const sandbox = vi;
  const context: DriverContext = {
    azureAccountProvider: tools.tokenProvider.azureAccountProvider,
    m365TokenProvider: tools.tokenProvider.m365TokenProvider,
    ui: tools.ui,
    progressBar: undefined,
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
  it("reports expansion results safely without telemetry", async () => {
    const content = 'description:"description of the app"';
    const contextWithoutTelemetry = { ...context, telemetryReporter: undefined };

    const res = await expandVariableWithFunction(
      content,
      contextWithoutTelemetry as any,
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
      "description:\"$[file('testfile1.md')]\",description2:\"$[file( file( 'testfile2.txt' ))] $[file(${{FILE_PATH}})]\"";
    vi.spyOn(fs, "realpath").mockImplementation(async (filePath) => path.resolve(String(filePath)));
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

  it("FILE-AC-01: resolves a file inside the manifest directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-contained-"));
    try {
      const manifestPath = path.join(root, "manifest.json");
      const instructionPath = path.join(root, "content", "instruction.md");
      await fs.ensureDir(path.dirname(instructionPath));
      await fs.writeFile(instructionPath, "contained instructions");

      const res = await expandVariableWithFunction(
        "description:\"$[file('content/instruction.md')]\"",
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        manifestPath
      );

      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value, 'description:"contained instructions"');
      }
    } finally {
      await fs.remove(root);
    }
  });

  it("FILE-AC-02: rejects a parent-directory reference", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-parent-"));
    try {
      const manifestDirectory = path.join(root, "appPackage");
      const secretPath = path.join(root, "secret.txt");
      await fs.ensureDir(manifestDirectory);
      await fs.writeFile(secretPath, "external secret");
      const readFileSpy = vi.spyOn(fs, "readFile");

      const res = await expandVariableWithFunction(
        "description:\"$[file('../secret.txt')]\"",
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        path.join(manifestDirectory, "manifest.json")
      );

      assert.isTrue(res.isErr() && res.error.name === "FileReferenceOutsideManifestDirectory");
      assert.isFalse(
        readFileSpy.mock.calls.some(([filePath]) => path.resolve(String(filePath)) === secretPath)
      );
    } finally {
      await fs.remove(root);
    }
  });

  it("FILE-AC-10: explains how to fix a lexical external file reference", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-lexical-diagnostic-"));
    try {
      const manifestDirectory = path.join(root, "appPackage");
      const manifestPath = path.join(manifestDirectory, "manifest.json");
      const externalFile = path.join(root, "secret.txt");
      const fileReference = "../secret.txt";
      await fs.ensureDir(manifestDirectory);
      await fs.writeFile(externalFile, "external secret");

      const res = await expandVariableWithFunction(
        `description:"$[file('${fileReference}')]"`,
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        manifestPath
      );

      assert.isTrue(res.isErr() && res.error.name === "FileReferenceOutsideManifestDirectory");
      assert.include(context.logProvider.msg, fileReference);
      assert.include(context.logProvider.msg, externalFile);
      assert.include(context.logProvider.msg, manifestDirectory);
      assert.include(context.logProvider.msg, "Move the file into the manifest directory");
      if (res.isErr()) {
        assert.include(res.error.displayMessage, fileReference);
        assert.include(res.error.displayMessage, externalFile);
        assert.include(res.error.displayMessage, manifestDirectory);
        assert.include(res.error.displayMessage, "Move the file into the manifest directory");
        assert.notInclude(res.error.displayMessage, "Output panel");
        assert.notInclude(res.error.message, externalFile);
        assert.notInclude(res.error.message, manifestDirectory);
        assert.notInclude(res.error.message, "Output panel");
      }
    } finally {
      await fs.remove(root);
    }
  });

  it("FILE-AC-02: rejects a sibling-prefix reference", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-sibling-"));
    try {
      const manifestDirectory = path.join(root, "appPackage");
      const siblingDirectory = path.join(root, "appPackage-copy");
      await fs.ensureDir(manifestDirectory);
      await fs.ensureDir(siblingDirectory);
      await fs.writeFile(path.join(siblingDirectory, "secret.txt"), "external secret");

      const res = await expandVariableWithFunction(
        "description:\"$[file('../appPackage-copy/secret.txt')]\"",
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        path.join(manifestDirectory, "manifest.json")
      );

      assert.isTrue(res.isErr() && res.error.name === "FileReferenceOutsideManifestDirectory");
    } finally {
      await fs.remove(root);
    }
  });

  it("FILE-AC-03: resolves an absolute reference inside the manifest directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-absolute-contained-"));
    try {
      const manifestPath = path.join(root, "manifest.json");
      const instructionPath = path.join(root, "instruction.txt");
      await fs.writeFile(instructionPath, "contained absolute instructions");

      const res = await expandVariableWithFunction(
        `description:"$[file('${instructionPath.replace(/\\/g, "/")}')]"`,
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        manifestPath
      );

      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value, 'description:"contained absolute instructions"');
      }
    } finally {
      await fs.remove(root);
    }
  });

  it("FILE-AC-09: rejects an absolute reference outside the manifest directory", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-absolute-"));
    try {
      const manifestDirectory = path.join(root, "appPackage");
      const secretPath = path.join(root, "secret.txt");
      await fs.ensureDir(manifestDirectory);
      await fs.writeFile(secretPath, "external secret");
      const readFileSpy = vi.spyOn(fs, "readFile");

      const res = await expandVariableWithFunction(
        `description:"$[file('${secretPath.replace(/\\/g, "/")}')]"`,
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        path.join(manifestDirectory, "manifest.json")
      );

      assert.isTrue(res.isErr() && res.error.name === "FileReferenceOutsideManifestDirectory");
      assert.isFalse(
        readFileSpy.mock.calls.some(([filePath]) => path.resolve(String(filePath)) === secretPath)
      );
    } finally {
      await fs.remove(root);
    }
  });

  it.runIf(process.platform === "win32")(
    "FILE-AC-09: rejects a Windows cross-drive reference",
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-cross-drive-"));
      try {
        const manifestDirectory = path.join(root, "appPackage");
        const otherDrive = path.parse(root).root.toUpperCase() === "Z:\\" ? "Y:" : "Z:";
        await fs.ensureDir(manifestDirectory);

        const res = await expandVariableWithFunction(
          `description:"$[file('${otherDrive}/secret.txt')]"`,
          context,
          undefined,
          true,
          ManifestType.DeclarativeCopilotManifest,
          path.join(manifestDirectory, "manifest.json")
        );

        assert.isTrue(res.isErr() && res.error.name === "FileReferenceOutsideManifestDirectory");
      } finally {
        await fs.remove(root);
      }
    }
  );

  it("FILE-AC-04: rejects a reference whose real path is outside", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-realpath-"));
    try {
      const manifestDirectory = path.join(root, "appPackage");
      const externalDirectory = path.join(root, "external");
      const linkedDirectory = path.join(manifestDirectory, "linked");
      const secretPath = path.join(externalDirectory, "secret.txt");
      await fs.ensureDir(manifestDirectory);
      await fs.ensureDir(externalDirectory);
      await fs.writeFile(secretPath, "external secret");
      await fs.symlink(
        externalDirectory,
        linkedDirectory,
        process.platform === "win32" ? "junction" : "dir"
      );
      const readFileSpy = vi.spyOn(fs, "readFile");

      const res = await expandVariableWithFunction(
        "description:\"$[file('linked/secret.txt')]\"",
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        path.join(manifestDirectory, "manifest.json")
      );

      assert.isTrue(res.isErr() && res.error.name === "FileReferenceOutsideManifestDirectory");
      assert.isFalse(
        readFileSpy.mock.calls.some(([filePath]) => path.resolve(String(filePath)) === secretPath)
      );
    } finally {
      await fs.remove(root);
    }
  });

  it("FILE-AC-10: explains how to fix a canonical external file reference", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-canonical-diagnostic-"));
    try {
      const manifestDirectory = path.join(root, "appPackage");
      const externalDirectory = path.join(root, "external");
      const externalFile = path.join(externalDirectory, "secret.txt");
      const fileReference = "linked/secret.txt";
      await fs.ensureDir(manifestDirectory);
      await fs.ensureDir(externalDirectory);
      await fs.writeFile(externalFile, "external secret");
      await fs.symlink(
        externalDirectory,
        path.join(manifestDirectory, "linked"),
        process.platform === "win32" ? "junction" : "dir"
      );

      const res = await expandVariableWithFunction(
        `description:"$[file('${fileReference}')]"`,
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        path.join(manifestDirectory, "manifest.json")
      );

      assert.isTrue(res.isErr() && res.error.name === "FileReferenceOutsideManifestDirectory");
      assert.include(context.logProvider.msg, fileReference);
      assert.include(context.logProvider.msg, externalFile);
      assert.include(context.logProvider.msg, manifestDirectory);
      assert.include(context.logProvider.msg, "update the file reference");
      if (res.isErr()) {
        assert.include(res.error.displayMessage, fileReference);
        assert.include(res.error.displayMessage, "Move the file into the manifest directory");
        assert.notInclude(res.error.displayMessage, "Output panel");
        assert.notInclude(res.error.message, externalFile);
        assert.notInclude(res.error.message, manifestDirectory);
        assert.notInclude(res.error.message, "Output panel");
      }
    } finally {
      await fs.remove(root);
    }
  });

  it("FILE-AC-05: rejects a supported reference whose real target is unsupported", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-extension-"));
    try {
      const manifestDirectory = path.join(root, "appPackage");
      const referencePath = path.join(manifestDirectory, "instruction.txt");
      const targetPath = path.join(manifestDirectory, "instruction.json");
      await fs.ensureDir(manifestDirectory);
      await fs.ensureDir(targetPath);
      await fs.symlink(
        targetPath,
        referencePath,
        process.platform === "win32" ? "junction" : "dir"
      );

      const res = await expandVariableWithFunction(
        "description:\"$[file('instruction.txt')]\"",
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        path.join(manifestDirectory, "manifest.json")
      );

      assert.isTrue(res.isErr() && res.error.name === "UnsupportedFileFormat");
    } finally {
      await fs.remove(root);
    }
  });

  it("FILE-AC-06: applies containment to environment and nested references", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-indirect-"));
    try {
      const manifestDirectory = path.join(root, "appPackage");
      await fs.ensureDir(manifestDirectory);
      await fs.writeFile(path.join(manifestDirectory, "path.txt"), "../secret.txt");
      await fs.writeFile(path.join(root, "secret.txt"), "external secret");
      mockedEnvRestore = mockedEnv({ FILE_PATH: "../secret.txt" });

      const environmentResult = await expandVariableWithFunction(
        'description:"$[file(${{FILE_PATH}})]"',
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        path.join(manifestDirectory, "manifest.json")
      );
      const nestedResult = await expandVariableWithFunction(
        "description:\"$[file(file('path.txt'))]\"",
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        path.join(manifestDirectory, "manifest.json")
      );

      assert.isTrue(
        environmentResult.isErr() &&
          environmentResult.error.name === "FileReferenceOutsideManifestDirectory"
      );
      assert.isTrue(
        nestedResult.isErr() && nestedResult.error.name === "FileReferenceOutsideManifestDirectory"
      );
    } finally {
      await fs.remove(root);
    }
  });

  it("FILE-AC-08: reports actionable external file paths in CLI output", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-cli-diagnostic-"));
    try {
      const manifestDirectory = path.join(root, "appPackage");
      const externalFile = path.join(root, "secret.txt");
      const cliLogProvider = new MockedLogProvider();
      const cliContext = { ...context, platform: Platform.CLI, logProvider: cliLogProvider };
      await fs.ensureDir(manifestDirectory);
      await fs.writeFile(externalFile, "external secret");

      const res = await expandVariableWithFunction(
        "description:\"$[file('../secret.txt')]\"",
        cliContext,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        path.join(manifestDirectory, "manifest.json")
      );

      assert.isTrue(res.isErr() && res.error.name === "FileReferenceOutsideManifestDirectory");
      assert.include(cliLogProvider.msg, "../secret.txt");
      assert.include(cliLogProvider.msg, externalFile);
      assert.include(cliLogProvider.msg, manifestDirectory);
      if (res.isErr()) {
        assert.include(res.error.displayMessage, externalFile);
        assert.include(res.error.displayMessage, manifestDirectory);
        assert.notInclude(res.error.message, root);
      }
    } finally {
      await fs.remove(root);
    }
  });

  it("does not log absolute paths from filesystem errors", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-log-"));
    try {
      const manifestPath = path.join(root, "manifest.json");
      const filesystemError = Object.assign(new Error(`access denied: ${root}`), {
        code: "EACCES",
      });
      vi.spyOn(fs, "realpath").mockRejectedValue(filesystemError);

      const res = await expandVariableWithFunction(
        "description:\"$[file('instruction.txt')]\"",
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        manifestPath
      );

      assert.isTrue(res.isErr() && res.error.name === "ReadFileError");
      assert.notInclude(context.logProvider.msg, root);
      assert.include(context.logProvider.msg, "EACCES");
    } finally {
      await fs.remove(root);
    }
  });

  it("does not disclose an absolute in-root reference when the file is missing", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-missing-absolute-"));
    try {
      const manifestPath = path.join(root, "manifest.json");
      const missingPath = path.join(root, "instruction.txt");
      const absoluteReference = missingPath.replace(/\\/g, "/");

      const res = await expandVariableWithFunction(
        `description:"$[file('${absoluteReference}')]"`,
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        manifestPath
      );

      assert.isTrue(res.isErr() && res.error instanceof FileNotFoundError);
      if (res.isErr()) {
        assert.notInclude(res.error.message, absoluteReference);
        assert.notInclude(res.error.displayMessage, absoluteReference);
      }
      assert.notInclude(context.logProvider.msg, absoluteReference);
    } finally {
      await fs.remove(root);
    }
  });

  it("does not log an absolute in-root reference with an unsupported format", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-unsupported-absolute-"));
    try {
      const manifestPath = path.join(root, "manifest.json");
      const unsupportedPath = path.join(root, "instruction.png");
      const absoluteReference = unsupportedPath.replace(/\\/g, "/");

      const res = await expandVariableWithFunction(
        `description:"$[file('${absoluteReference}')]"`,
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        manifestPath
      );

      assert.isTrue(res.isErr() && res.error.name === "UnsupportedFileFormat");
      assert.notInclude(context.logProvider.msg, absoluteReference);
    } finally {
      await fs.remove(root);
    }
  });

  it("does not disclose an absolute in-root reference when reading fails", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "env-function-read-absolute-"));
    try {
      const manifestPath = path.join(root, "manifest.json");
      const instructionPath = path.join(root, "instruction.txt");
      const absoluteReference = instructionPath.replace(/\\/g, "/");
      await fs.writeFile(instructionPath, "instructions");
      vi.spyOn(fs, "readFile").mockRejectedValue(
        Object.assign(new Error(`access denied: ${instructionPath}`), { code: "EACCES" })
      );

      const res = await expandVariableWithFunction(
        `description:"$[file('${absoluteReference}')]"`,
        context,
        undefined,
        true,
        ManifestType.DeclarativeCopilotManifest,
        manifestPath
      );

      assert.isTrue(res.isErr() && res.error.name === "ReadFileError");
      if (res.isErr()) {
        assert.notInclude(res.error.message, absoluteReference);
        assert.notInclude(res.error.displayMessage, absoluteReference);
      }
      assert.notInclude(context.logProvider.msg, absoluteReference);
    } finally {
      await fs.remove(root);
    }
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

    vi.spyOn(fs, "realpath").mockImplementation(async (filePath) => path.resolve(String(filePath)));
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

    vi.spyOn(fs, "realpath").mockImplementation(async (filePath) => path.resolve(String(filePath)));
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
