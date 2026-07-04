// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  CLICommand,
  CLICommandArgument,
  CLICommandOption,
  CLIContext,
  CLIFoundCommand,
  FxError,
  LogLevel,
  Platform,
  Result,
  SystemError,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import {
  Correlator,
  IncompatibleProjectError,
  VersionState,
  assembleError,
  getHashedEnv,
  isUserCancelError,
  maskSecret,
  telemetryUtils,
} from "@microsoft/teamsfx-core";
import { cloneDeep, pick } from "lodash";
import path from "path";
import { getFxCore } from "../activate";
import { TextType, colorize } from "../colorize";
import { tryDetectCICDPlatform } from "../commonlib/common/cicdPlatformDetector";
import { logger } from "../commonlib/logger";
import Progress from "../console/progress";
import {
  InvalidChoiceError,
  MissingRequiredArgumentError,
  MissingRequiredOptionError,
  UnknownArgumentError,
  UnknownCommandError,
  UnknownOptionError,
} from "../error";
import CliTelemetry from "../telemetry/cliTelemetry";
import { TelemetryComponentType, TelemetryProperty } from "../telemetry/cliTelemetryEvents";
import UI from "../userInteraction";
import { editDistance, getSystemInputs } from "../utils";
import { helper } from "./helper";

class CLIEngine {
  /**
   * @description cached debug logsd
   */
  debugLogs: string[] = [];

  /**
   * detect whether the process is a bundled electrop app
   */
  isBundledElectronApp(): boolean {
    return process.versions && process.versions.electron && !(process as any).defaultApp
      ? true
      : false;
  }

  /**
   * entry point of the CLI engine
   */
  async start(rootCmd: CLICommand): Promise<void> {
    // Seed the correlation id from ATK_CLI_CORRELATION_ID when a parent process
    // (e.g. the wiqd CLI) passes one, so this run's telemetry shares the parent's
    // `correlation-id`. Absent/malformed values fall back to a fresh UUID.
    Correlator.setId(process.env.ATK_CLI_CORRELATION_ID);

    // Fire-and-forget: fetch latest metadata in background, same as VSC extension activation
    void getFxCore().fetchOnlineTemplateMetadata();

    this.debugLogs = [];

    const root = cloneDeep(rootCmd);

    // get user args
    const args = this.isBundledElectronApp() ? process.argv.slice(1) : process.argv.slice(2);
    this.debugLogs.push(`user argument list: ${JSON.stringify(args)}`);

    // find command
    const findRes = this.findCommand(rootCmd, args);
    const foundCommand = findRes.cmd;
    const remainingArgs = findRes.remainingArgs;

    this.debugLogs.push(`matched command: ${colorize(foundCommand.fullName, TextType.Commands)}`);

    const context: CLIContext = {
      command: foundCommand,
      optionValues: {},
      globalOptionValues: {},
      argumentValues: [],
      telemetryProperties: {
        [TelemetryProperty.CommandFull]: maskSecret(args.join(" "), {
          replace: "***",
        }),
        [TelemetryProperty.CommandName]: foundCommand.fullName,
        [TelemetryProperty.Component]: TelemetryComponentType,
        [TelemetryProperty.RunFrom]: tryDetectCICDPlatform(),
        [TelemetryProperty.BinName]: rootCmd.name,
      },
    };

    const executeRes = await this.execute(context, root, remainingArgs);
    if (executeRes.isErr()) {
      await this.processResult(context, executeRes.error);
    } else {
      await this.processResult(context);
    }
    if (context.command.name !== "preview" || context.globalOptionValues.help) {
      // TODO: consider to remove the hardcode
      await CliTelemetry.flush();
      process.exit();
    }
  }

  isTelemetryEnabled(context?: CLIContext) {
    return context?.globalOptionValues.telemetry === false ? false : true;
  }

  async execute(
    context: CLIContext,
    root: CLICommand,
    remainingArgs: string[]
  ): Promise<Result<undefined, FxError>> {
    // parse args
    const parseRes = this.parseArgs(context, root, remainingArgs);
    // create FxCore for anycase, because Tools will be initialized in FxCore
    const core = getFxCore();
    // load project meta in telemetry properties
    if (context.optionValues.projectPath) {
      const res = await core.checkProjectType(context.optionValues.projectPath as string);
      if (res.isOk()) {
        const projectTypeResult = res.value;
        telemetryUtils.fillinProjectTypeProperties(context.telemetryProperties, projectTypeResult);
      }
    }

    logger.debug(
      `parsed context: ${JSON.stringify(
        pick(context, [
          "optionValues",
          "globalOptionValues",
          "argumentValues",
          "telemetryProperties",
        ]),
        null,
        2
      )}`
    );

    // send start event
    if (context.command.telemetry) {
      CliTelemetry.sendTelemetryEvent(
        context.command.telemetry.event + "-start",
        context.telemetryProperties
      );
    }

    if (parseRes.isErr()) {
      return err(parseRes.error);
    }

    // 3. --version
    if (context.globalOptionValues.version === true) {
      logger.info(root.version ?? "1.0.0");
      return ok(undefined);
    }

    // 4. --help
    if (context.globalOptionValues.help === true) {
      const helpText = helper.formatHelp(
        context.command,
        context.command.fullName !== root.fullName ? root : undefined
      );
      logger.info(helpText);
      return ok(undefined);
    }

    // 5. validate
    if (!context.globalOptionValues.interactive) {
      const validateRes = this.validateOptionsAndArguments(context.command);
      if (validateRes.isErr()) {
        return err(validateRes.error);
      }
    } else {
      // discard other options and args for interactive mode
      const reservedOptionNames = (
        context.command.reservedOptionNamesInInteractiveMode || []
      ).concat([
        "projectPath",
        "projectPathSkipValidation",
        "env",
        "correlationId",
        "platform",
        "nonInteractive",
      ]);
      const trimOptionValues = pick(context.optionValues, reservedOptionNames);
      if (
        Object.keys(trimOptionValues).length < Object.keys(context.optionValues).length ||
        context.argumentValues.length
      ) {
        logger.info(
          `Some arguments/options are useless because the interactive mode is opened.` +
            ` If you want to run the command non-interactively, add '--interactive false' after your command.`
        );
        context.optionValues = trimOptionValues;
        context.argumentValues = [];
        logger.debug(
          `trimmed context for interactive mode: ${JSON.stringify(
            pick(context, ["optionValues", "argumentValues"]),
            null,
            2
          )}`
        );
      }
    }

    // 6. version check
    const inputs = getSystemInputs(context.optionValues.projectPath as string);
    inputs.ignoreEnvInfo = true;
    const skipCommands = ["new", "sample", "update", "package", "publish", "validate", "deploy"];
    if (
      !skipCommands.includes(context.command.name) &&
      context.optionValues.projectPath &&
      !context.optionValues.projectPathSkipValidation
    ) {
      const core = getFxCore();
      const res = await core.projectVersionCheck(inputs);
      if (res.isErr()) {
        return err(res.error);
      } else {
        if (res.value.isSupport === VersionState.unsupported) {
          return err(new IncompatibleProjectError("core.migrationV3.abandonedProject"));
        } else if (res.value.isSupport === VersionState.upgradeable) {
          return err(new IncompatibleProjectError("core.migrationV3.notAllowedMigration"));
        }
      }
    }

    try {
      // 7. run handler
      if (context.command.handler) {
        const handleRes = await Correlator.run(context.command.handler, context);
        if (handleRes.isErr()) {
          return err(handleRes.error);
        }
      } else {
        const helpText = helper.formatHelp(context.command, root);
        logger.info(helpText);
      }
    } catch (e) {
      Progress.end(false);
      return err(assembleError(e));
    } finally {
      Progress.end(true);
    }

    return ok(undefined);
  }

  findCommand(
    model: CLICommand,
    args: string[]
  ): { cmd: CLIFoundCommand; remainingArgs: string[] } {
    let i = 0;
    let cmd = model;
    let token: string | undefined;
    for (; i < args.length; i++) {
      token = args[i];
      const command = cmd.commands?.find(
        (c) => c.name === token || (token && c.aliases?.includes(token))
      );
      if (command) {
        cmd = command;
      } else {
        break;
      }
    }
    const command: CLIFoundCommand = {
      fullName: [model.name, ...args.slice(0, i)].join(" "),
      ...cloneDeep(cmd),
    };
    return { cmd: command, remainingArgs: args.slice(i) };
  }

  optionInputKey(option: CLICommandOption | CLICommandArgument) {
    return option.questionName || option.name;
  }

  findMostSimilarCommand(context: CLIContext, token: string): CLICommand | undefined {
    let mini = token.length;
    let mostSimilarCommand: CLICommand | undefined = undefined;
    for (const cmd of context.command.commands || []) {
      const d = editDistance(token, cmd.name);
      if (d < mini && d <= 2) {
        mini = d;
        mostSimilarCommand = cmd;
      }
    }
    return mostSimilarCommand;
  }

  parseArgs(
    context: CLIContext,
    rootCommand: CLICommand,
    args: string[]
  ): Result<undefined, UnknownOptionError> {
    let argumentIndex = 0;
    const command = context.command;
    const options = (rootCommand.options || []).concat(command.options || []);
    const optionName2OptionMap = new Map<string, CLICommandOption>();
    options.forEach((option) => {
      optionName2OptionMap.set(option.name, option);
      if (option.shortName) {
        optionName2OptionMap.set(option.shortName, option);
      }
    });
    const remainingArgs = cloneDeep(args);
    const findOption = (token: string) => {
      if (token.startsWith("-") || token.startsWith("--")) {
        const trimmedToken = token.startsWith("--") ? token.substring(2) : token.substring(1);
        let key: string;
        let value: string | undefined;
        if (trimmedToken.includes("=")) {
          [key, value] = trimmedToken.split("=");
          //process key, value
          remainingArgs.unshift(value);
        } else {
          key = trimmedToken;
        }
        const option = optionName2OptionMap.get(key);
        return {
          key: key,
          value: value,
          option: option,
        };
      }
      return undefined;
    };
    while (remainingArgs.length) {
      const token = remainingArgs.shift();
      if (!token) continue;
      if (token.startsWith("-") || token.startsWith("--")) {
        const findOptionRes = findOption(token);
        if (findOptionRes?.option) {
          const option = findOptionRes.option;
          if (option.type === "boolean") {
            // boolean: try next token
            const nextToken = remainingArgs[0];
            if (nextToken) {
              if (nextToken.toLowerCase() === "false") {
                option.value = false;
                remainingArgs.shift();
              } else if (nextToken.toLowerCase() === "true") {
                option.value = true;
                remainingArgs.shift();
              } else {
                // not a boolean value, no matter what next token is, current option value is true
                option.value = true;
              }
            } else {
              option.value = true;
            }
          } else if (option.type === "string") {
            // string
            const nextToken = remainingArgs[0];
            if (nextToken) {
              const findNextOptionRes = findOption(nextToken);
              if (findNextOptionRes?.option) {
                // next token is an option, current option value is undefined
              } else {
                option.value = nextToken;
                remainingArgs.shift();
              }
            }
          } else {
            // array
            const nextToken = remainingArgs[0];
            if (nextToken) {
              const findNextOptionRes = findOption(nextToken);
              if (findNextOptionRes?.option) {
                // next token is an option, current option value is undefined
              } else {
                if (option.value === undefined) {
                  option.value = [];
                }
                const values = nextToken.split(",");
                for (const v of values) {
                  option.value.push(v);
                }
                remainingArgs.shift();
              }
            }
          }
          const isCommandOption =
            command.options?.includes(option) &&
            command.fullName !== process.env.TEAMSFX_CLI_BIN_NAME;
          const inputValues = isCommandOption ? context.optionValues : context.globalOptionValues;
          const inputKey = this.optionInputKey(option);
          const logObject = {
            token: token,
            option: option.name,
            value: option.value,
            isGlobal: !isCommandOption,
          };
          if (option.value !== undefined) inputValues[inputKey] = option.value;
          this.debugLogs.push(`find option: ${JSON.stringify(logObject)}`);
        } else {
          return err(new UnknownOptionError(command.fullName, token));
        }
      } else {
        if (command.arguments && command.arguments[argumentIndex]) {
          const argument = command.arguments[argumentIndex];
          if (argument.type === "array") {
            argument.value = token.split(",");
          } else if (argument.type === "string") {
            argument.value = token;
          } else {
            argument.value = Boolean(token);
          }
          context.argumentValues.push(argument.value);
          argumentIndex++;
        } else {
          if (!command.arguments || command.arguments.length === 0) {
            const mostSimilarCommand = this.findMostSimilarCommand(context, token);
            return err(new UnknownCommandError(token, command.fullName, mostSimilarCommand?.name));
          } else {
            return err(new UnknownArgumentError(command.fullName, token));
          }
        }
      }
    }
    // for required options or arguments, set default value if not set
    if (command.options) {
      for (const option of command.options) {
        if (option.required && option.value === undefined) {
          if (option.default !== undefined) {
            option.value = option.default;
            context.optionValues[this.optionInputKey(option)] = option.default;
            this.debugLogs.push(
              `set required option with default value, ${option.name}=${JSON.stringify(
                option.default
              )}`
            );
          }
        }
      }
    }
    if (command.arguments) {
      for (let i = 0; i < command.arguments.length; ++i) {
        const argument = command.arguments[i];
        if (argument.required && argument.value === undefined) {
          if (argument.default !== undefined) {
            argument.value = argument.default;
            context.argumentValues[i] = argument.default as string;
            this.debugLogs.push(
              `set required argument with default value, ${argument.name}=${JSON.stringify(
                argument.default
              )}`
            );
          }
        }
        // set argument value in optionValues
        if (argument.value !== undefined) {
          context.optionValues[this.optionInputKey(argument)] = argument.value;
        }
      }
    }

    // set log level
    const logLevel = context.globalOptionValues.debug ? LogLevel.Debug : LogLevel.Info;
    logger.logLevel = logLevel;
    for (const log of this.debugLogs) {
      logger.debug(log);
    }
    this.debugLogs = [];

    // disable telemetry of turned off
    const telemetryEnabled = this.isTelemetryEnabled(context);
    CliTelemetry.enable = telemetryEnabled;

    // special process for global options
    // interactive
    // if user not input "--interactive" option value explicitly, toolkit will use default value defined by `defaultInteractiveOption`
    // if `defaultInteractiveOption` is undefined, use default value = true
    if (context.globalOptionValues.interactive === undefined) {
      if (context.command.defaultInteractiveOption !== undefined) {
        logger.debug(
          `set interactive from command.defaultInteractiveOption (value=${context.command.defaultInteractiveOption})`
        );
        context.globalOptionValues.interactive = context.command.defaultInteractiveOption;
      } else {
        const configValue = true;
        logger.debug(`set interactive from default (value=${configValue})`);
        context.globalOptionValues.interactive = configValue;
      }
    }

    // read CI_ENABLED from env
    if (process.env.CI_ENABLED === "true") {
      context.globalOptionValues.interactive = false;
    }

    // set interactive into inputs, usage: if required inputs is not preset in non-interactive mode, FxCore will return Error instead of trigger UI
    context.optionValues.nonInteractive = !context.globalOptionValues.interactive;
    context.optionValues.correlationId = Correlator.getId(); //no need to initialize a correlationId, which is initialized by Correlator.setId()
    context.optionValues.platform = Platform.CLI;
    // set projectPath
    const projectFolderOption = context.command.options?.find(
      (o) => o.questionName === "projectPath" && o.required
    );
    if (projectFolderOption) {
      // resolve projectPath
      const projectPath = path.resolve(projectFolderOption.value as string);
      projectFolderOption.value = projectPath;
      context.optionValues.projectPath = projectPath;
      context.optionValues.projectPathSkipValidation = (projectFolderOption as any).skipValidation;
      if (projectPath) {
        CliTelemetry.withRootFolder(projectPath);
      }
    }

    UI.interactive = context.globalOptionValues.interactive as boolean;

    // set global option telemetry property
    context.telemetryProperties[TelemetryProperty.CommandDebug] =
      context.globalOptionValues.debug + "";
    context.telemetryProperties[TelemetryProperty.CommandVerbose] =
      context.globalOptionValues.verbose + "";
    context.telemetryProperties[TelemetryProperty.CommandHelp] =
      context.globalOptionValues.help + "";
    context.telemetryProperties[TelemetryProperty.CommandInteractive] =
      context.globalOptionValues.interactive + "";
    context.telemetryProperties[TelemetryProperty.CommandVersion] =
      context.globalOptionValues.version + "";
    if (process.env.ATK_CLI_SKILL === "true") {
      context.telemetryProperties[TelemetryProperty.Skill] = "true";
      CliTelemetry.reporter?.addSharedProperty(TelemetryProperty.Skill, "true");
    }
    // context.telemetryProperties[TelemetryProperty.CorrelationId] =
    //   context.optionValues.correlationId;

    return ok(undefined);
  }

  validateOptionsAndArguments(
    command: CLIFoundCommand
  ): Result<
    undefined,
    MissingRequiredOptionError | MissingRequiredArgumentError | InvalidChoiceError
  > {
    if (command.options) {
      for (const option of command.options) {
        const res = this.validateOption(command, option, "option");
        if (res.isErr()) {
          return err(res.error);
        }
      }
    }
    if (command.arguments) {
      for (const argument of command.arguments) {
        const res = this.validateOption(command, argument, "argument");
        if (res.isErr()) {
          return err(res.error);
        }
      }
    }
    return ok(undefined);
  }

  /**
   * validate option value
   */
  validateOption(
    command: CLIFoundCommand,
    option: CLICommandOption | CLICommandArgument,
    type: "option" | "argument"
  ): Result<undefined, MissingRequiredOptionError | MissingRequiredArgumentError> {
    if (option.required && option.default === undefined && option.value === undefined) {
      const error =
        type === "option"
          ? new MissingRequiredOptionError(command.fullName, option)
          : new MissingRequiredArgumentError(command.fullName, option);
      return err(error);
    }
    if (
      (option.type === "string" || option.type === "array") &&
      option.choices &&
      option.value !== undefined &&
      !option.skipValidation
    ) {
      if (option.type === "string") {
        if (!(option.choices as string[]).includes(option.value as string)) {
          return err(new InvalidChoiceError(command.fullName, option.value, option));
        }
      } else {
        const values = option.value as string[];
        for (const v of values) {
          if (!(option.choices as string[]).includes(v)) {
            return err(new InvalidChoiceError(command.fullName, v, option));
          }
        }
      }
    }
    return ok(undefined);
  }
  async processResult(context?: CLIContext, fxError?: FxError): Promise<void> {
    if (context && context.command.telemetry) {
      if (context.optionValues.env) {
        context.telemetryProperties[TelemetryProperty.Env] = getHashedEnv(
          context.optionValues.env as string
        );
      }
      if (fxError) {
        CliTelemetry.sendTelemetryErrorEvent(
          context.command.telemetry.event,
          fxError,
          context.telemetryProperties
        );
      } else {
        CliTelemetry.sendTelemetryEvent(
          context.command.telemetry.event,
          context.telemetryProperties
        );
      }
    }
    if (fxError) {
      this.printError(fxError);
      await CliTelemetry.flush();
      process.exit(1);
    }
  }

  printError(fxError: FxError): void {
    if (isUserCancelError(fxError)) {
      logger.info("User canceled.");
      return;
    }
    logger.outputError(
      `${fxError.source}.${fxError.name}: ${fxError.message || fxError.innerError?.message}`
    );
    if (fxError instanceof UserError && fxError.helpLink) {
      logger.outputError(
        `Get help from %s`,
        colorize(fxError.helpLink as string, TextType.Hyperlink)
      );
    }
    if (fxError instanceof SystemError && fxError.issueLink) {
      logger.outputError(
        `Report this issue at %s`,
        colorize(fxError.issueLink as string, TextType.Hyperlink)
      );
    }
    logger.debug(`Call stack: ${fxError.stack || fxError.innerError?.stack || ""}`);
  }
}

export const engine = new CLIEngine();
