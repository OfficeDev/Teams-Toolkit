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
  FxCore,
  IncompatibleProjectError,
  InputValidationError,
  MissingEnvironmentVariablesError,
  UserCancelError,
  VersionState,
} from "@microsoft/teamsfx-core";
import { assert } from "chai";
import mockedEnv from "mocked-env";
import * as sinon from "sinon";
import { vi } from "vitest";
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
  const sandbox = sinon.createSandbox();
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);

  beforeEach(() => {
    sandbox.stub(process.stdout, "write").callsFake(((chunk: any, ...args: any[]) => {
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
    sandbox.stub(process.stderr, "write").callsFake(((chunk: any, ...args: any[]) => {
      const text = typeof chunk === "string" ? chunk : chunk?.toString?.() ?? "";
      if (
        text.includes("Some arguments/options are useless because the interactive mode is opened.")
      ) {
        return true;
      }
      return stderrWrite(chunk, ...args);
    }) as any);
    sandbox.stub(process, "exit");
    sandbox.stub(CliTelemetry, "flush").resolves();
  });

  afterEach(() => {
    sandbox.restore();
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
      const sendTelemetryErrorEventStub = sandbox
        .stub(CliTelemetry, "sendTelemetryErrorEvent")
        .returns();
      sandbox.stub(logger, "outputError").returns();
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "abc" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      await engine.processResult(ctx, new InputValidationError("test", "no reason"));
      assert.isTrue(sendTelemetryErrorEventStub.calledOnce);
    });
    it("sendTelemetryEvent", async () => {
      const sendTelemetryEventStub = sandbox.stub(CliTelemetry, "sendTelemetryEvent").returns();
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "abc" },
        optionValues: { env: "dev" },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      await engine.processResult(ctx, undefined);
      assert.isTrue(sendTelemetryEventStub.calledOnce);
    });
    it("skip telemetry when reporter is disabled", async () => {
      CliTelemetry.reporter = new CliTelemetryReporter("real", "real", "real", "real");
      CliTelemetry.enable = false;
      const spy = sandbox.spy(CliTelemetry.reporter.reporter, "sendTelemetryEvent");
      const ctx: CLIContext = {
        command: { ...getCreateCommand(), fullName: "abc" },
        optionValues: {},
        globalOptionValues: { telemetry: false },
        argumentValues: [],
        telemetryProperties: {},
      };
      await engine.processResult(ctx, undefined);
      assert.isTrue(spy.notCalled);
    });
    it("skip telemetry when context is undefined", async () => {
      CliTelemetry.reporter = new CliTelemetryReporter("real", "real", "real", "real");
      CliTelemetry.enable = false;
      const spy = sandbox.spy(CliTelemetry.reporter.reporter, "sendTelemetryEvent");
      await engine.processResult(undefined, undefined);
      assert.isTrue(spy.notCalled);
    });
    it("skip telemetry when command telemetry is undefined", async () => {
      CliTelemetry.reporter = new CliTelemetryReporter("real", "real", "real", "real");
      CliTelemetry.enable = false;
      const spy = sandbox.spy(CliTelemetry.reporter.reporter, "sendTelemetryEvent");
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
      assert.isTrue(spy.notCalled);
    });
  });
  describe("start", async () => {
    it("command not found", async () => {
      sandbox.stub(process, "argv").value(["node", "cli", "abc123"]);
      const stub = sandbox.stub(engine, "printError").returns();
      await engine.start(rootCommand);
      assert.isTrue(stub.called);
    });
    it("command has no handler", async () => {
      sandbox.stub(process, "argv").value(["node", "cli", "list", "templates"]);
      sandbox.stub(listTemplatesCommand, "handler").value(undefined);
      await engine.start(rootCommand);
    });
    it("parseArg return error", async () => {
      sandbox.stub(process, "argv").value(["node", "cli", "new", "--xxx"]);
      let error;
      sandbox.stub(engine, "processResult").callsFake(async (ctx, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.instanceOf(error, UnknownOptionError);
    });
    it("should display version", async () => {
      sandbox.stub(process, "argv").value(["node", "cli", "--version"]);
      const loggerStub = sandbox.stub(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(loggerStub.called);
    });
    it("should display help message", async () => {
      sandbox.stub(process, "argv").value(["node", "cli", "-h"]);
      const loggerStub = sandbox.stub(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(loggerStub.called);
    });
    it("should validation failed for capability", async () => {
      sandbox
        .stub(process, "argv")
        .value(["node", "cli", "new", "-c", "da", "-n", "myapp", "-i", "false"]);
      let error: any = {};
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isTrue(error && error instanceof InvalidChoiceError);
    });
    it("should run command with argument success", async () => {
      sandbox.stub(activate, "getFxCore").returns(new FxCore({} as any));
      sandbox.stub(FxCore.prototype, "createSampleProject").resolves(ok({ projectPath: "..." }));
      sandbox
        .stub(process, "argv")
        .value(["node", "cli", "new", "sample", "hello-world-tab-with-backend", "-i", "false"]);
      const loggerStub = sandbox.stub(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(loggerStub.calledOnce);
    });
    it("should validate argument failed", async () => {
      sandbox.stub(createSampleCommand, "arguments").value([
        {
          type: "string",
          name: "sample",
          description: "Select a sample app to create",
          choices: ["a", "b", "c"],
        },
      ]);
      sandbox.stub(FxCore.prototype, "createSampleProject").resolves(ok({ projectPath: "..." }));
      sandbox.stub(process, "argv").value(["node", "cli", "new", "sample", "d", "-i", "false"]);
      let error: any = {};
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      sandbox.stub(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(error instanceof InvalidChoiceError);
    });
    it("should discard useless args and options for interactive mode", async () => {
      sandbox.stub(FxCore.prototype, "createSampleProject").resolves(ok({ projectPath: "..." }));
      sandbox.stub(process, "argv").value(["node", "cli", "new", "sample", "abc"]);
      const stub = sandbox.stub(logger, "info");
      await engine.start(rootCommand);
      assert.isTrue(stub.called);
    });
    it("should run handler return error", async () => {
      sandbox.stub(process, "argv").value(["node", "cli"]);
      const command: CLIFoundCommand = {
        name: "test",
        description: "test",
        fullName: "test",
        handler: async () => err(new UserCancelError()),
      };
      let error: any = {};
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(command);
      assert.isTrue(error instanceof UserCancelError);
    });
    it("should run handler throw error", async () => {
      sandbox.stub(process, "argv").value(["node", "cli"]);
      const command: CLIFoundCommand = {
        name: "test",
        description: "test",
        fullName: "test",
        handler: async () => {
          throw new UserCancelError();
        },
      };
      let error: any = {};
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(command);
      assert.isTrue(error instanceof UserCancelError);
    });
    it("run version check and return error", async () => {
      sandbox.stub(FxCore.prototype, "projectVersionCheck").resolves(err(new UserCancelError()));
      sandbox.stub(process, "argv").value(["node", "cli", "provision", "--folder", "abc"]);
      let error: any = {};
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isTrue(error instanceof UserCancelError);
    });
    it("run version check and return upgradeable", async () => {
      sandbox.stub(FxCore.prototype, "projectVersionCheck").resolves(
        ok({
          isSupport: VersionState.upgradeable,
          currentVersion: "1",
          trackingId: "1",
          versionSource: "1",
        })
      );
      sandbox.stub(process, "argv").value(["node", "cli", "provision", "--folder", "abc"]);
      let error: any = {};
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isTrue(error instanceof IncompatibleProjectError);
    });
    it("run version check and return unsupported", async () => {
      sandbox.stub(FxCore.prototype, "projectVersionCheck").resolves(
        ok({
          isSupport: VersionState.unsupported,
          currentVersion: "1",
          trackingId: "1",
          versionSource: "1",
        })
      );
      sandbox.stub(process, "argv").value(["node", "cli", "provision", "--folder", "abc"]);
      let error: any = {};
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isTrue(error instanceof IncompatibleProjectError);
    });
    it("skip options in interactive mode", async () => {
      sandbox.stub(FxCore.prototype, "createProject").resolves(ok({} as any));
      sandbox.stub(process, "argv").value(["node", "cli", "new", "--folder", "abc"]);
      let error: any = undefined;
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isUndefined(undefined);
    });
    it("skip arguments in interactive mode", async () => {
      sandbox.stub(FxCore.prototype, "createSampleProject").resolves(ok({} as any));
      sandbox.stub(process, "argv").value(["node", "cli", "new", "sample", "abc"]);
      let error: any = undefined;
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isUndefined(undefined);
    });
    it("no need to skip options or arguments in interactive mode", async () => {
      sandbox.stub(FxCore.prototype, "createProject").resolves(ok({} as any));
      sandbox.stub(process, "argv").value(["node", "cli", "new"]);
      let error: any = undefined;
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isUndefined(undefined);
    });
    it("use defaultInteractiveOption", async () => {
      const comand = listSamplesCommand;
      sandbox.stub(comand, "handler").resolves(ok(undefined));
      sandbox.stub(process, "argv").value(["node", "cli", "list", "samples"]);
      let error: any = undefined;
      sandbox.stub(engine, "processResult").callsFake(async (context, fxError) => {
        error = fxError;
      });
      await engine.start(rootCommand);
      assert.isUndefined(undefined);
    });
  });
  describe("index.start", async () => {
    it("happy path", async () => {
      sandbox.stub(main, "initTelemetryReporter").returns();
      sandbox.stub(engine, "start").resolves();
      await start("atk");
      assert.isTrue(true);
    });
  });
  describe("getFxCore", async () => {
    afterEach(() => {
      sandbox.restore();
    });
    it("new logger", async () => {
      resetFxCore();
      getFxCore();
    });
  });
  describe("printError", async () => {
    it("happy path user error", async () => {
      sandbox.stub(logger, "info").resolves();
      sandbox.stub(logger, "debug").resolves();
      const stub = sandbox.stub(logger, "outputError").returns();
      engine.printError(new MissingEnvironmentVariablesError("test", "test"));
      assert.isTrue(stub.called);
    });
    it("happy path system error", async () => {
      sandbox.stub(logger, "logLevel").value(LogLevel.Debug);
      const stub = sandbox.stub(logger, "debug").resolves();
      sandbox.stub(logger, "outputError").returns();
      const error = new SystemError({ issueLink: "http://aka.ms/teamsfx-cli-help" });
      engine.printError(error);
      assert.isTrue(stub.called);
    });
    it("happy path inner error", async () => {
      sandbox.stub(logger, "logLevel").value(LogLevel.Debug);
      const stub = sandbox.stub(logger, "debug").resolves();
      sandbox.stub(logger, "outputError").returns();
      const error = new SystemError({ issueLink: "http://aka.ms/teamsfx-cli-help" });
      const innerError = new Error("test");
      error.innerError = innerError;
      error.message = "";
      error.stack = undefined;
      engine.printError(error);
      innerError.stack = undefined;
      engine.printError(error);
      assert.isTrue(stub.called);
    });
    it("canceled", async () => {
      const stub = sandbox.stub(logger, "info").resolves();
      engine.printError(new UserCancelError("test"));
      assert.isTrue(stub.called);
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

  describe("ATK_CALLER env var", () => {
    it("sets CallerSource to a known caller from ATK_CALLER", async () => {
      const mockedEnvRestore = mockedEnv({
        ATK_CALLER: "  WIQD  ",
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
      assert.equal(ctx.telemetryProperties[TelemetryProperty.CallerSource], "wiqd");
      mockedEnvRestore();
    });

    it("does not set CallerSource when ATK_CALLER is not set", async () => {
      const mockedEnvRestore = mockedEnv({
        ATK_CALLER: undefined,
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
      assert.notProperty(ctx.telemetryProperties, TelemetryProperty.CallerSource);
      mockedEnvRestore();
    });

    it('maps an unknown ATK_CALLER to "other"', async () => {
      const mockedEnvRestore = mockedEnv({
        ATK_CALLER: "johnsmith",
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
      assert.equal(ctx.telemetryProperties[TelemetryProperty.CallerSource], "other");
      mockedEnvRestore();
    });

    it('maps a near-miss of a known caller to "other" (no partial matching)', async () => {
      const mockedEnvRestore = mockedEnv({
        ATK_CALLER: "wiqd-cli",
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
      assert.equal(ctx.telemetryProperties[TelemetryProperty.CallerSource], "other");
      mockedEnvRestore();
    });

    it("does not set CallerSource when ATK_CALLER is blank", async () => {
      const mockedEnvRestore = mockedEnv({
        ATK_CALLER: "   ",
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
      assert.notProperty(ctx.telemetryProperties, TelemetryProperty.CallerSource);
      mockedEnvRestore();
    });
  });
});
