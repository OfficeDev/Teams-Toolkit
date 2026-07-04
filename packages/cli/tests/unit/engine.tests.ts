import {
  CLICommand,
  CLICommandOption,
  CLIContext,
  CLIFoundCommand,
  err,
  LogLevel,
  ok,
  SystemError,
} from "@microsoft/teamsfx-api";
import {
  featureFlagManager,
  FeatureFlags,
  FxCore,
  IncompatibleProjectError,
  InputValidationError,
  MissingEnvironmentVariablesError,
  UserCancelError,
  VersionState,
  Correlator,
} from "@microsoft/teamsfx-core";
import mockedEnv from "mocked-env";
import { assert, vi } from "vitest";
import * as activate from "../../src/activate";
import { getFxCore, resetFxCore } from "../../src/activate";
import { engine } from "../../src/commands/engine";
import { start } from "../../src/commands/index";
import {
  listSamplesCommand,
  listTemplatesCommand,
  m365SideloadingCommand,
} from "../../src/commands/models";
import { getCreateCommand } from "../../src/commands/models/create";
import { createSampleCommand } from "../../src/commands/models/createSample";
import * as listTemplatesModule from "../../src/commands/models/listTemplates";
import { rootCommand } from "../../src/commands/models/root";
import { logger } from "../../src/commonlib/logger";
import { CliTelemetryReporter } from "../../src/commonlib/telemetry";
import {
  InvalidChoiceError,
  UnknownArgumentError,
  UnknownCommandError,
  UnknownOptionError,
} from "../../src/error";
import * as main from "../../src/index";
import CliTelemetry from "../../src/telemetry/cliTelemetry";
import { TelemetryProperty } from "../../src/telemetry/cliTelemetryEvents";

vi.mock("node-machine-id", () => ({
  machineIdSync: vi.fn(() => "mock-machine-id"),
}));

vi.mock("applicationinsights", async (importOriginal) => {
  const actual = await importOriginal<typeof import("applicationinsights")>();
  let defaultClient: actual.TelemetryClient | undefined;

  class MockTelemetryClient {
    public channel = {
      setUseDiskRetryCaching: vi.fn(),
    };
    public commonProperties: Record<string, string> | undefined;

    constructor(public key: string) {}

    trackEvent() {}

    trackException() {}

    flush(options?: { callback?: (response?: string) => void }) {
      options?.callback?.("");
    }
  }

  const setup = vi.fn(() => {
    defaultClient = new MockTelemetryClient("setup") as unknown as actual.TelemetryClient;
    return {
      setAutoCollectRequests: vi.fn().mockReturnThis(),
      setAutoCollectPerformance: vi.fn().mockReturnThis(),
      setAutoCollectExceptions: vi.fn().mockReturnThis(),
      setAutoCollectDependencies: vi.fn().mockReturnThis(),
      setAutoDependencyCorrelation: vi.fn().mockReturnThis(),
      setAutoCollectConsole: vi.fn().mockReturnThis(),
      setUseDiskRetryCaching: vi.fn().mockReturnThis(),
      start: vi.fn(),
    };
  });

  return {
    ...actual,
    get defaultClient() {
      return defaultClient;
    },
    setup,
    TelemetryClient: MockTelemetryClient,
  };
});

describe("CLI Engine", () => {
  const sandbox = vi;
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: any, ...args: any[]) => {
      const text = typeof chunk === "string" ? chunk : chunk?.toString?.() ?? "";
      if (
        text.includes("Usage: atk list templates") ||
        text.includes("List available app templates.") ||
        text.includes("For more information about the Microsoft 365 Agents Toolkit") ||
        text.includes("Some arguments/options are useless because the interactive mode is opened.")
      ) {
        return true;
      }
      return stdoutWrite(chunk, ...args);
    }) as any);
    vi.spyOn(process.stderr, "write").mockImplementation(((chunk: any, ...args: any[]) => {
      const text = typeof chunk === "string" ? chunk : chunk?.toString?.() ?? "";
      if (
        text.includes("Some arguments/options are useless because the interactive mode is opened.")
      ) {
        return true;
      }
      return stderrWrite(chunk, ...args);
    }) as any);
    vi.spyOn(process, "exit").mockImplementation((() => undefined) as any);
    vi.spyOn(CliTelemetry, "flush").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("findCommand", async () => {
    it("should find new sample command", async () => {
      const result = engine.findCommand(rootCommand, ["new", "sample"]);
      assert.equal(result.cmd.name, createSampleCommand.name);
      assert.deepEqual(result.remainingArgs, []);
    });
    it("should find sideloading command alias", async () => {
      const result = engine.findCommand(rootCommand, ["sideloading"]);
      assert.equal(result.cmd.name, m365SideloadingCommand.name);
      assert.deepEqual(result.remainingArgs, []);
    });
  });
  describe("parseArgs", async () => {
    it("array type options", async () => {
      const mockedEnvRestore = mockedEnv({
        CI_ENABLED: "true",
      });
      const command: CLIFoundCommand = {
        name: "test",
        fullName: "test",
        description: "test command",
        options: [
          {
            type: "array",
            name: "option1",
            description: "test option",
          },
        ],
      };
      const ctx: CLIContext = {
        command: command,
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const result = engine.parseArgs(ctx, rootCommand, ["--option1", "a,b,c"]);
      assert.isTrue(result.isOk());
      assert.deepEqual(ctx.optionValues["option1"], ["a", "b", "c"]);
      assert.isFalse(ctx.globalOptionValues.interactive);
      mockedEnvRestore();
    });
    it("array type options 2", async () => {
      const command: CLIFoundCommand = {
        name: "test",
        fullName: "test",
        description: "test command",
        options: [
          {
            type: "array",
            name: "option1",
            description: "test option",
          },
        ],
      };
      const ctx: CLIContext = {
        command: command,
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const result = engine.parseArgs(ctx, rootCommand, [
        "--option1",
        "a",
        "--option1",
        "b",
        "--option1",
        "c",
      ]);
      assert.isTrue(result.isOk());
      assert.deepEqual(ctx.optionValues["option1"], ["a", "b", "c"]);
    });
    it("array type options 3", async () => {
      const command: CLIFoundCommand = {
        name: "test",
        fullName: "test",
        description: "test command",
        options: [
          {
            type: "array",
            name: "option1",
            description: "test option",
          },
        ],
      };
      const ctx: CLIContext = {
        command: command,
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const result = engine.parseArgs(ctx, rootCommand, ["--option1=a,b,c"]);
      assert.isTrue(result.isOk());
      assert.deepEqual(ctx.optionValues["option1"], ["a", "b", "c"]);
    });
    it("rejects v4 primary create flags because atk new keeps the v3 option surface", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
        (flag) => flag.name === FeatureFlags.V4Enabled.name
      );
      vi.spyOn(listTemplatesModule, "listAllTemplates").mockReturnValue([] as any);
      const command: CLIFoundCommand = { ...getCreateCommand(), fullName: "new" };
      const ctx: CLIContext = {
        command,
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const parseResult = engine.parseArgs(ctx, rootCommand, [
        "--project-type",
        "copilot-agent-type",
        "--da-template",
        "add-action",
        "--action-source",
        "mcp",
        "--app-name",
        "myagent",
        "--interactive",
        "false",
      ]);

      assert.isTrue(parseResult.isErr());
      assert.isUndefined(ctx.optionValues.projectType);
      assert.isUndefined(ctx.optionValues.daTemplate);
      assert.isUndefined(ctx.optionValues.actionSource);
      assert.isUndefined(ctx.optionValues.capabilities);
    });
    it("array type argument", async () => {
      const command: CLIFoundCommand = {
        name: "test",
        fullName: "test",
        description: "test command",
        arguments: [
          {
            type: "array",
            name: "arg1",
            description: "test argument",
          },
          {
            type: "string",
            name: "arg2",
            description: "test argument2",
            required: true,
            default: "default",
          },
        ],
      };
      const ctx: CLIContext = {
        command: command,
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const result = engine.parseArgs(ctx, rootCommand, ["a,b,c"]);
      assert.isTrue(result.isOk());
      assert.deepEqual(ctx.argumentValues[0], ["a", "b", "c"]);
      assert.equal(ctx.argumentValues[1], "default");
    });
    it("boolean type option", async () => {
      const command: CLIFoundCommand = {
        name: "test",
        fullName: "test",
        description: "test command",
        options: [
          {
            type: "boolean",
            name: "option1",
            description: "test option",
          },
        ],
      };
      const ctx: CLIContext = {
        command: command,
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const result = engine.parseArgs(ctx, rootCommand, ["--option1", "true"]);
      assert.isTrue(result.isOk());
      assert.equal(ctx.optionValues["option1"], true);
    });
    it("UnknownCommandError", async () => {
      const command: CLIFoundCommand = {
        name: "test",
        fullName: "test",
        description: "test command",
        options: [
          {
            type: "boolean",
            name: "option1",
            description: "test option",
          },
        ],
        commands: [
          {
            name: "subcommand",
            description: "test",
          },
        ],
      };
      const ctx: CLIContext = {
        command: command,
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const result = engine.parseArgs(ctx, rootCommand, ["subcomand"]);
      assert.isTrue(
        result.isErr() &&
          result.error instanceof UnknownCommandError &&
          result.error.message.includes("subcomand")
      );
    });
    it("UnknownArgumentError", async () => {
      const command: CLIFoundCommand = {
        name: "test",
        fullName: "test",
        description: "test command",
        arguments: [
          {
            type: "boolean",
            name: "option1",
            description: "test option",
          },
        ],
      };
      const ctx: CLIContext = {
        command: command,
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const result = engine.parseArgs(ctx, rootCommand, ["abc", "def"]);
      assert.isTrue(result.isErr() && result.error instanceof UnknownArgumentError);
    });
  });
  describe("validateOption", async () => {
    it("InvalidChoiceError", async () => {
      const option: CLICommandOption = {
        type: "array",
        description: "test",
        name: "test",
        choices: ["a", "b", "c"],
        value: ["d"],
      };
      const result = engine.validateOption(
        { name: "test", fullName: "test", description: "" },
        option,
        "option"
      );
      assert.isTrue(result.isErr() && result.error instanceof InvalidChoiceError);
    });
  });
  describe("isTelemetryEnabled", async () => {
    it("true", async () => {
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "abc" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = engine.isTelemetryEnabled(ctx);
      assert.isTrue(res);
    });
    it("true", async () => {
      const res = engine.isTelemetryEnabled();
      assert.isTrue(res);
    });
    it("false", async () => {
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "abc" },
        optionValues: {},
        globalOptionValues: { telemetry: false },
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = engine.isTelemetryEnabled(ctx);
      assert.isFalse(res);
    });
  });
  describe("processResult", async () => {
    it("sendTelemetryErrorEvent", async () => {
      const sendTelemetryErrorEventStub = vi
        .spyOn(CliTelemetry, "sendTelemetryErrorEvent")
        .mockReturnValue();
      vi.spyOn(logger, "outputError").mockReturnValue();
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "abc" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      await engine.processResult(ctx, new InputValidationError("test", "no reason"));
      assert.isTrue(sendTelemetryErrorEventStub.mock.calls.length === 1);
    });
    it("sendTelemetryEvent", async () => {
      const sendTelemetryEventStub = vi.spyOn(CliTelemetry, "sendTelemetryEvent").mockReturnValue();
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "abc" },
        optionValues: { env: "dev" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      await engine.processResult(ctx, undefined);
      assert.isTrue(sendTelemetryEventStub.mock.calls.length === 1);
    });
    it("skip telemetry when reporter is disabled", async () => {
      CliTelemetry.reporter = new CliTelemetryReporter("real", "real", "real", "real");
      CliTelemetry.enable = false;
      const spy = vi.spyOn(CliTelemetry.reporter.reporter, "sendTelemetryEvent");
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "abc" },
        optionValues: {},
        globalOptionValues: { telemetry: false },
        argumentValues: [],
        telemetryProperties: {},
      };
      await engine.processResult(ctx, undefined);
      assert.isTrue(spy.mock.calls.length === 0);
    });
    it("skip telemetry when context is undefined", async () => {
      CliTelemetry.reporter = new CliTelemetryReporter("real", "real", "real", "real");
      CliTelemetry.enable = false;
      const spy = vi.spyOn(CliTelemetry.reporter.reporter, "sendTelemetryEvent");
      await engine.processResult(undefined, undefined);
      assert.isTrue(spy.mock.calls.length === 0);
    });
    it("skip telemetry when command telemetry is undefined", async () => {
      CliTelemetry.reporter = new CliTelemetryReporter("real", "real", "real", "real");
      CliTelemetry.enable = false;
      const spy = vi.spyOn(CliTelemetry.reporter.reporter, "sendTelemetryEvent");
      const command: CLICommand = {
        name: "test",
        description: "test",
      };
      const ctx: CLIContext = {
        command: { ...command, fullName: "test" },
        optionValues: {},
        globalOptionValues: { telemetry: false },
        argumentValues: [],
        telemetryProperties: {},
      };
      await engine.processResult(ctx, undefined);
      assert.isTrue(spy.mock.calls.length === 0);
    });
  });
  describe("start", async () => {
    it("command not found", async () => {
      process.argv = ["node", "cli", "abc123"] as any;
      const stub = vi.spyOn(engine, "printError").mockReturnValue();
      await engine.start(rootCommand);
      assert.isTrue(stub.mock.calls.length > 0);
    });
    it("command has no handler", async () => {
      process.argv = ["node", "cli", "list", "templates"] as any;
      (listTemplatesCommand as any).handler = undefined;
      await engine.start(rootCommand);
    });
    it("parseArg return error", async () => {
      process.argv = ["node", "cli", "new", "--xxx"] as any;
      let error;
      vi.spyOn(engine, "processResult").mockImplementation(async (ctx, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.instanceOf(error, UnknownOptionError);
    });
    it("should display version", async () => {
      process.argv = ["node", "cli", "--version"] as any;
      const loggerStub = vi.spyOn(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(loggerStub.mock.calls.length > 0);
    });
    it("should display help message", async () => {
      process.argv = ["node", "cli", "-h"] as any;
      const loggerStub = vi.spyOn(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(loggerStub.mock.calls.length > 0);
    });
    it("should validation failed for capability", async () => {
      process.argv = ["node", "cli", "new", "-c", "da", "-n", "myapp", "-i", "false"] as any;
      let error: any = {};
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isTrue(error && error instanceof InvalidChoiceError);
    });
    it("should run command with argument success", async () => {
      vi.spyOn(activate, "getFxCore").mockReturnValue(new FxCore({} as any));
      vi.spyOn(FxCore.prototype, "createSampleProject").mockResolvedValue(
        ok({ projectPath: "..." })
      );
      process.argv = [
        "node",
        "cli",
        "new",
        "sample",
        "hello-world-tab-with-backend",
        "-i",
        "false",
      ] as any;
      const loggerStub = vi.spyOn(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(loggerStub.mock.calls.length === 1);
    });
    it("should validate argument failed", async () => {
      (createSampleCommand as any).arguments = [
        {
          type: "string",
          name: "sample",
          description: "Select a sample app to create",
          choices: ["a", "b", "c"],
        },
      ];
      vi.spyOn(FxCore.prototype, "createSampleProject").mockResolvedValue(
        ok({ projectPath: "..." })
      );
      process.argv = ["node", "cli", "new", "sample", "d", "-i", "false"] as any;
      let error: any = {};
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      vi.spyOn(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(error instanceof InvalidChoiceError);
    });
    it("should discard useless args and options for interactive mode", async () => {
      vi.spyOn(FxCore.prototype, "createSampleProject").mockResolvedValue(
        ok({ projectPath: "..." })
      );
      process.argv = ["node", "cli", "new", "sample", "abc"] as any;
      const stub = vi.spyOn(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(stub.mock.calls.length > 0);
    });
    it("should run handler return error", async () => {
      process.argv = ["node", "cli"] as any;
      const command: CLIFoundCommand = {
        name: "test",
        description: "test",
        fullName: "test",
        handler: async () => err(new UserCancelError()),
      };
      let error: any = {};
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(command);
      assert.isTrue(error instanceof UserCancelError);
    });
    it("should run handler throw error", async () => {
      process.argv = ["node", "cli"] as any;
      const command: CLIFoundCommand = {
        name: "test",
        description: "test",
        fullName: "test",
        handler: async () => {
          throw new UserCancelError();
        },
      };
      let error: any = {};
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(command);
      assert.isTrue(error instanceof UserCancelError);
    });
    it("run version check and return error", async () => {
      vi.spyOn(FxCore.prototype, "projectVersionCheck").mockResolvedValue(
        err(new UserCancelError())
      );
      process.argv = ["node", "cli", "provision", "--folder", "abc"] as any;
      let error: any = {};
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isTrue(error instanceof UserCancelError);
    });
    it("run version check and return upgradeable", async () => {
      vi.spyOn(FxCore.prototype, "projectVersionCheck").mockResolvedValue(
        ok({
          isSupport: VersionState.upgradeable,
          currentVersion: "1",
          trackingId: "1",
          versionSource: "1",
        })
      );
      process.argv = ["node", "cli", "provision", "--folder", "abc"] as any;
      let error: any = {};
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isTrue(error instanceof IncompatibleProjectError);
    });
    it("run version check and return unsupported", async () => {
      vi.spyOn(FxCore.prototype, "projectVersionCheck").mockResolvedValue(
        ok({
          isSupport: VersionState.unsupported,
          currentVersion: "1",
          trackingId: "1",
          versionSource: "1",
        })
      );
      process.argv = ["node", "cli", "provision", "--folder", "abc"] as any;
      let error: any = {};
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isTrue(error instanceof IncompatibleProjectError);
    });
    it("skip options in interactive mode", async () => {
      vi.spyOn(FxCore.prototype, "createProject").mockResolvedValue(ok({} as any));
      process.argv = ["node", "cli", "new", "--folder", "abc"] as any;
      let error: any = undefined;
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isUndefined(undefined);
    });
    it("skip arguments in interactive mode", async () => {
      vi.spyOn(FxCore.prototype, "createSampleProject").mockResolvedValue(ok({} as any));
      process.argv = ["node", "cli", "new", "sample", "abc"] as any;
      let error: any = undefined;
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isUndefined(undefined);
    });
    it("no need to skip options or arguments in interactive mode", async () => {
      vi.spyOn(FxCore.prototype, "createProject").mockResolvedValue(ok({} as any));
      process.argv = ["node", "cli", "new"] as any;
      let error: any = undefined;
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isUndefined(undefined);
    });
    it("use defaultInteractiveOption", async () => {
      const comand = listSamplesCommand;
      vi.spyOn(comand, "handler").mockResolvedValue(ok(undefined));
      process.argv = ["node", "cli", "list", "samples"] as any;
      let error: any = undefined;
      vi.spyOn(engine, "processResult").mockImplementation(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isUndefined(undefined);
    });
  });
  describe("index.start", async () => {
    it("happy path", async () => {
      vi.spyOn(main, "initTelemetryReporter").mockReturnValue();
      vi.spyOn(engine, "start").mockResolvedValue();
      await start("atk");
      assert.isTrue(true);
    });
  });
  describe("getFxCore", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("new logger", async () => {
      resetFxCore();
      getFxCore();
    });
  });
  describe("printError", async () => {
    it("happy path user error", async () => {
      vi.spyOn(logger, "info").mockResolvedValue();
      vi.spyOn(logger, "debug").mockResolvedValue();
      const stub = vi.spyOn(logger, "outputError").mockReturnValue();
      engine.printError(new MissingEnvironmentVariablesError("test", "test"));
      assert.isTrue(stub.mock.calls.length > 0);
    });
    it("happy path system error", async () => {
      (logger as any).logLevel = LogLevel.Debug;
      const stub = vi.spyOn(logger, "debug").mockResolvedValue();
      vi.spyOn(logger, "outputError").mockReturnValue();
      const error = new SystemError({ issueLink: "http://aka.ms/teamsfx-cli-help" });
      engine.printError(error);
      assert.isTrue(stub.mock.calls.length > 0);
    });
    it("happy path inner error", async () => {
      (logger as any).logLevel = LogLevel.Debug;
      const stub = vi.spyOn(logger, "debug").mockResolvedValue();
      vi.spyOn(logger, "outputError").mockReturnValue();
      const error = new SystemError({ issueLink: "http://aka.ms/teamsfx-cli-help" });
      const innerError = new Error("test");
      error.innerError = innerError;
      error.message = "";
      error.stack = undefined;
      engine.printError(error);
      innerError.stack = undefined;
      engine.printError(error);
      assert.isTrue(stub.mock.calls.length > 0);
    });
    it("canceled", async () => {
      const stub = vi.spyOn(logger, "info").mockResolvedValue();
      engine.printError(new UserCancelError("test"));
      assert.isTrue(stub.mock.calls.length > 0);
    });
  });
  describe("ATK_CLI_SKILL env var", () => {
    it("sets Skill telemetry property when ATK_CLI_SKILL=true", async () => {
      const mockedEnvRestore = mockedEnv({
        ATK_CLI_SKILL: "true",
      });
      const command: CLIFoundCommand = {
        name: "test",
        fullName: "test",
        description: "test command",
      };
      const ctx: CLIContext = {
        command: command,
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const result = engine.parseArgs(ctx, rootCommand, []);
      assert.isTrue(result.isOk());
      assert.equal(ctx.telemetryProperties[TelemetryProperty.Skill], "true");
      mockedEnvRestore();
    });
    it("does not set Skill telemetry property when ATK_CLI_SKILL is not set", async () => {
      const mockedEnvRestore = mockedEnv({
        ATK_CLI_SKILL: undefined,
      });
      const command: CLIFoundCommand = {
        name: "test",
        fullName: "test",
        description: "test command",
      };
      const ctx: CLIContext = {
        command: command,
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const result = engine.parseArgs(ctx, rootCommand, []);
      assert.isTrue(result.isOk());
      assert.notProperty(ctx.telemetryProperties, TelemetryProperty.Skill);
      mockedEnvRestore();
    });
  });

  describe("ATK_CLI_CORRELATION_ID env var", () => {
    it("seeds the Correlator with the parent-provided id", async () => {
      const externalId = "11111111-1111-4111-8111-111111111111";
      const mockedEnvRestore = mockedEnv({ ATK_CLI_CORRELATION_ID: externalId });
      const setIdStub = sandbox.stub(Correlator, "setId");
      sandbox.stub(process, "argv").value(["node", "cli", "-h"]);
      sandbox.stub(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(setIdStub.calledWith(externalId));
      mockedEnvRestore();
    });
    it("seeds the Correlator with undefined when the env var is not set", async () => {
      const mockedEnvRestore = mockedEnv({ ATK_CLI_CORRELATION_ID: undefined });
      const setIdStub = sandbox.stub(Correlator, "setId");
      sandbox.stub(process, "argv").value(["node", "cli", "-h"]);
      sandbox.stub(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(setIdStub.calledWith(undefined));
      mockedEnvRestore();
    });
  });
});
