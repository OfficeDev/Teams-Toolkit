// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { confirm, input, password } from "@inquirer/prompts";
import {
  Colors,
  ConfirmConfig,
  ConfirmResult,
  FxError,
  IProgressHandler,
  InputTextConfig,
  InputTextResult,
  MultiSelectConfig,
  MultiSelectResult,
  OptionItem,
  Result,
  SelectFileConfig,
  SelectFileResult,
  SelectFilesConfig,
  SelectFilesResult,
  SelectFolderConfig,
  SelectFolderResult,
  SingleFileOrInputConfig,
  SingleSelectConfig,
  SingleSelectResult,
  StaticOptions,
  UserInteraction,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import {
  InputValidationError,
  ScriptExecutionError,
  SelectSubscriptionError,
  UserCancelError,
  assembleError,
} from "@microsoft/teamsfx-core";
import child_process from "child_process";
import fs from "fs-extra";
import open from "open";
import path from "path";
import * as util from "util";
import { logger } from "./commonlib/logger";
import Progress from "./console/progress";
import ScreenManager from "./console/screen";
import { cliSource } from "./constants";
import { CheckboxChoice, SelectChoice, checkbox, select } from "./prompts";
import { errors } from "./resource";
import { getColorizedString } from "./utils";

export const inquirerPrompts = {
  confirm,
  password,
  input,
};

/// TODO: input can be undefined
type ValidationType<T> = (input: T) => string | boolean | Promise<string | boolean>;

class CLIUserInteraction implements UserInteraction {
  private _interactive = true;
  get interactive(): boolean {
    if (process.env.CI_ENABLED === "true") {
      return false;
    } else {
      return this._interactive;
    }
  }

  set interactive(value: boolean) {
    this._interactive = value;
  }

  async singleSelect(
    name: string,
    message: string,
    choices: SelectChoice[],
    defaultValue?: string
  ): Promise<Result<string, FxError>> {
    if (!this.interactive) {
      return ok(defaultValue || choices[0].id);
    }
    ScreenManager.pause();
    const answer = await select({
      message,
      choices,
      defaultValue,
    });
    ScreenManager.continue();
    return ok(answer);
  }

  async multiSelect(
    name: string,
    message: string,
    choices: CheckboxChoice[],
    defaultValues?: string[],
    validateValues?: (value: string[]) => string | Promise<string | undefined> | undefined
  ): Promise<Result<string[], FxError>> {
    if (!this.interactive) {
      return ok(defaultValues || []);
    }
    ScreenManager.pause();
    const answer = await checkbox({
      message,
      choices,
      defaultValues,
      validateValues,
    });
    ScreenManager.continue();
    return ok(answer);
  }

  async input(
    name: string,
    message: string,
    defaultValue?: string,
    validate?: ValidationType<string>
  ): Promise<Result<string, FxError>> {
    if (!this.interactive) {
      return ok(defaultValue || "");
    }
    ScreenManager.pause();
    const answer = await inquirerPrompts.input({
      message,
      default: defaultValue,
      validate,
      theme: {
        prefix: {
          idle: "\x1b[32m?\x1b[0m", // Green question mark displayed when input is in progress
          done: "\x1b[32m?\x1b[0m", // Green question mark displayed when input is completed
        },
      },
    });
    ScreenManager.continue();
    return ok(answer);
  }

  async password(
    name: string,
    message: string,
    defaultValue?: string,
    validate?: ValidationType<string>
  ): Promise<Result<string, FxError>> {
    if (!this.interactive) {
      return ok(defaultValue || "");
    }
    ScreenManager.pause();
    const answer = await inquirerPrompts.password({
      message,
      mask: "*",
      validate,
    });
    ScreenManager.continue();
    return ok(answer);
  }

  async confirm(config: ConfirmConfig): Promise<Result<ConfirmResult, FxError>> {
    const loadRes = await this.loadDefaultValue(config);
    if (loadRes.isErr()) {
      return err(loadRes.error);
    }
    const result = await this._confirm(
      config.title,
      config.default as boolean | undefined,
      config.transformer
    );
    if (result.isErr()) return err(result.error);
    if (result.value) return ok({ type: "success", result: result.value });
    else return err(new UserCancelError());
  }

  async _confirm(
    message: string,
    defaultValue?: boolean,
    transformer?: (input: boolean) => string
  ): Promise<Result<boolean, FxError>> {
    if (!this.interactive) {
      return ok(defaultValue !== undefined ? defaultValue : true);
    }
    ScreenManager.pause();
    const answer = await inquirerPrompts.confirm({
      message,
      default: defaultValue ?? true,
      transformer,
    });
    ScreenManager.continue();
    return ok(answer);
  }

  private findIndex(choices: (string | undefined)[], answer?: string): number {
    return choices.findIndex((choice) => choice === answer);
  }

  private findIndexes(choices: (string | undefined)[], answers?: string[]): number[] {
    const indexes = answers?.map((answer) => this.findIndex(choices, answer));
    return indexes?.filter((index) => index >= 0) || [];
  }

  private getSubArray<T = string | OptionItem>(array: T[], indexes: number[]): T[] {
    return indexes.map((index) => array[index]);
  }

  private toChoices<T>(option: StaticOptions, defaultValue?: T): [SelectChoice[], T | undefined] {
    const labelClean = (label: string) => {
      return label
        .replace("$(browser)", "")
        .replace("$(hubot)", "")
        .replace("$(comment-discussion)", "");
    };
    if (typeof option[0] === "string") {
      const choices = (option as string[]).map((op) => {
        return {
          id: op,
          title: op,
        };
      });
      return [choices, defaultValue];
    } else {
      const choices = (option as OptionItem[]).map((op) => {
        return {
          id: op.id,
          title: !op.description
            ? labelClean(op.label)
            : labelClean(op.label) + ` (${op.description})`,
          detail: op.detail,
        };
      });
      const ids = (option as OptionItem[]).map((op) => op.id);
      if (typeof defaultValue === "string" || typeof defaultValue === "undefined") {
        const index = this.findIndex(ids, defaultValue);
        return [choices, choices[index]?.id as any];
      } else {
        const indexes = this.findIndexes(ids, defaultValue as any);
        return [choices, this.getSubArray(choices, indexes).map((choice) => choice.id) as any];
      }
    }
  }

  private toValidationFunc(
    validate?: (input: string) => string | undefined | Promise<string | undefined>,
    mapping?: { [x: string]: string }
  ): ValidationType<string> {
    return async (input: string) => {
      if (mapping) {
        input = mapping[input];
      }
      const result = await validate?.(input);
      if (result === undefined) {
        return true;
      } else {
        return result;
      }
    };
  }

  public async selectOption(
    config: SingleSelectConfig
  ): Promise<Result<SingleSelectResult, FxError>> {
    if (config.name === "subscription") {
      const subscriptions = config.options as string[];
      if (subscriptions.length === 0) {
        return err(new SelectSubscriptionError(cliSource));
      } else if (subscriptions.length === 1) {
        const sub = subscriptions[0];
        logger.warning(`Your Azure account only has one subscription (${sub}). Use it as default.`);
        return ok({ type: "skip", result: sub });
      }
    }
    const loadRes = await this.loadSelectDynamicData(config);
    if (loadRes.isErr()) {
      return err(loadRes.error);
    }
    if (config.options.length === 1 && config.skipSingleOption) {
      const answer = (config.options as StaticOptions)[0];
      if (config.returnObject) {
        return ok({ type: "skip", result: answer, options: config.options as StaticOptions });
      } else {
        if (typeof answer === "string") {
          return ok({ type: "skip", result: answer, options: config.options as StaticOptions });
        } else {
          return ok({ type: "skip", result: answer.id, options: config.options as StaticOptions });
        }
      }
    }
    const [choices, defaultValue] = this.toChoices(
      config.options as StaticOptions,
      config.default as string
    );
    const result = await this.singleSelect(config.name, config.title, choices, defaultValue);
    if (result.isOk()) {
      const index = this.findIndex(
        choices.map((choice) => choice.id),
        result.value
      );
      if (index < 0) {
        const error = new InputValidationError(
          config.name,
          util.format(
            errors["error.InvalidOptionErrorReason"],
            result.value,
            choices.map((choice) => choice.id).join(",")
          )
        );
        error.source = cliSource;
        return err(error);
      }
      const answer = (config.options as StaticOptions)[index];
      if (!answer || config.returnObject) {
        return ok({ type: "success", result: answer });
      } else {
        if (typeof answer === "string") {
          return ok({ type: "success", result: answer, options: config.options as StaticOptions });
        } else {
          return ok({
            type: "success",
            result: answer.id,
            options: config.options as StaticOptions,
          });
        }
      }
    } else {
      return err(result.error);
    }
  }

  async loadSelectDynamicData(
    config: MultiSelectConfig | SingleSelectConfig
  ): Promise<Result<undefined, FxError>> {
    if (typeof config.options === "function" || typeof config.default === "function") {
      // const bar = this.createProgressBar(config.title, 1);
      // await bar.start();
      // await bar.next(loadingOptionsPlaceholder());
      try {
        if (typeof config.options === "function") {
          const options = await config.options();
          config.options = options;
        }
        if (typeof config.default === "function") {
          config.default = await config.default();
        }
        return ok(undefined);
      } catch (e) {
        return err(assembleError(e));
      } finally {
        // await bar.end(true, true);
      }
    }
    return ok(undefined);
  }

  async loadDefaultValue(
    config: InputTextConfig | SelectFileConfig | SelectFilesConfig | ConfirmConfig
  ): Promise<Result<undefined, FxError>> {
    if (typeof config.default === "function") {
      // const bar = this.createProgressBar(config.title, 1);
      // await bar.start();
      // await bar.next(loadingOptionsPlaceholder());
      try {
        if (typeof config.default === "function") {
          config.default = await config.default();
        }
        return ok(undefined);
      } catch (e) {
        return err(assembleError(e));
      } finally {
        // await bar.end(true, true);
      }
    }
    return ok(undefined);
  }

  public async selectOptions(
    config: MultiSelectConfig
  ): Promise<Result<MultiSelectResult, FxError>> {
    const loadRes = await this.loadSelectDynamicData(config);
    if (loadRes.isErr()) {
      return err(loadRes.error);
    }
    if (config.options.length === 1 && config.skipSingleOption) {
      const answers = config.options as StaticOptions;
      if (config.returnObject) {
        return ok({ type: "skip", result: answers });
      } else {
        if (typeof answers[0] === "string") {
          return ok({ type: "skip", result: answers });
        } else {
          return ok({ type: "skip", result: (answers as OptionItem[]).map((a) => a.id) });
        }
      }
    }
    if (config.default === "all") {
      config.default = (config.options as StaticOptions).map((o) =>
        typeof o === "string" ? o : o.id
      );
    } else if (config.default === "none") {
      config.default = [];
    }
    const [choices, defaultValue] = this.toChoices(
      config.options as StaticOptions,
      config.default as string[]
    );
    const result = await this.multiSelect(
      config.name,
      config.title,
      choices,
      defaultValue,
      config.validation
    );
    if (result.isOk()) {
      const indexes = this.findIndexes(
        choices.map((choice) => choice.id),
        result.value
      );
      if (result.value.length > 0 && indexes.length === 0) {
        // the condition means the user input is invalid, none of the choices is in the provided values
        const error = new InputValidationError(
          config.name,
          util.format(
            errors["error.InvalidOptionErrorReason"],
            result.value.join(","),
            choices.map((choice) => choice.id).join(",")
          )
        );
        error.source = cliSource;
        return err(error);
      }

      const anwers = this.getSubArray(config.options as StaticOptions as any[], indexes);
      if (config.returnObject) {
        return ok({ type: "success", result: anwers });
      } else {
        if (typeof anwers[0] === "string") {
          return ok({ type: "success", result: anwers });
        } else {
          return ok({
            type: "success",
            result: (anwers as OptionItem[]).map((answer) => answer.id),
          });
        }
      }
    } else {
      return err(result.error);
    }
  }

  public async inputText(config: InputTextConfig): Promise<Result<InputTextResult, FxError>> {
    const loadRes = await this.loadDefaultValue(config);
    if (loadRes.isErr()) {
      return err(loadRes.error);
    }

    let validationFunc: (input: string) => string | undefined | Promise<string | undefined> = (
      input
    ) => {
      return undefined;
    };
    if (config.validation || config.additionalValidationOnAccept) {
      validationFunc = async (input: string) => {
        let res: string | undefined = undefined;
        if (config.validation) {
          res = await config.validation(input);
        }

        if (!res && !!config.additionalValidationOnAccept) {
          res = await config.additionalValidationOnAccept(input);
        }
        return res;
      };
    }
    const result = await (config.password ? this.password.bind(this) : this.input.bind(this))(
      config.name,
      config.title,
      config.default as string,
      this.toValidationFunc(validationFunc)
    );
    if (result.isOk()) {
      return ok({ type: "success", result: result.value });
    } else {
      return err(result.error);
    }
  }

  public async selectFileOrInput(
    config: SingleFileOrInputConfig
  ): Promise<Result<InputTextResult, FxError>> {
    const loadRes = await this.loadDefaultValue(config.inputBoxConfig);
    if (loadRes.isErr()) return err(loadRes.error);
    return this.inputText({
      ...config.inputBoxConfig,
      additionalValidationOnAccept: config.validation,
    });
  }
  public async selectFile(config: SelectFileConfig): Promise<Result<SelectFileResult, FxError>> {
    const loadRes = await this.loadDefaultValue(config);
    if (loadRes.isErr()) {
      return err(loadRes.error);
    }
    const newConfig: InputTextConfig = {
      name: config.name,
      title: config.title,
      default: config.default as string,
      validation: config.validation || pathValidation,
    };
    return this.inputText(newConfig);
  }
  public async selectFiles(config: SelectFilesConfig): Promise<Result<SelectFilesResult, FxError>> {
    const loadRes = await this.loadDefaultValue(config);
    if (loadRes.isErr()) {
      return err(loadRes.error);
    }
    const validation = async (input: string) => {
      const strings = input.split(";").map((s) => s.trim());
      if (config.validation) {
        return config.validation(strings);
      } else {
        for (const s of strings) {
          const result = await pathValidation(s);
          if (result !== undefined) {
            return result;
          }
        }
      }
      return undefined;
    };
    const newConfig: InputTextConfig = {
      name: config.name,
      title: config.title + " (Please use ';' to split file paths)",
      default: (config.default as string[])?.join("; "),
      validation,
    };
    const result = await this.inputText(newConfig);
    if (result.isOk()) {
      return ok({
        type: "success",
        result: result.value.result?.split(";").map((s) => s.trim()),
      });
    } else {
      return err(result.error);
    }
  }

  public async selectFolder(
    config: SelectFolderConfig
  ): Promise<Result<SelectFolderResult, FxError>> {
    const loadRes = await this.loadDefaultValue(config);
    if (loadRes.isErr()) {
      return err(loadRes.error);
    }
    const newConfig: InputTextConfig = {
      name: config.name,
      title: config.title,
      default: (config.default as string) || "./",
      validation: config.validation || pathValidation,
    };
    return this.inputText(newConfig);
  }

  public async openUrl(link: string): Promise<Result<boolean, FxError>> {
    if (!this.interactive) await open(link);
    return ok(true);
  }

  public async showMessage(
    level: "info" | "warn" | "error",
    message: string | Array<{ content: string; color: Colors }>,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>> {
    let plainText: string;
    if (message instanceof Array) {
      plainText = message.map((x) => x.content).join("");
    } else {
      plainText = message;
    }
    switch (items.length) {
      case 0:
        switch (level) {
          case "info":
            if (message instanceof Array) {
              logger.info(getColorizedString(message));
            } else {
              logger.info(message);
            }
            break;
          case "warn":
            logger.warning(plainText);
            break;
          case "error":
            logger.error(plainText);
            break;
        }
        return ok(undefined);
      case 1: {
        const result = await this._confirm(plainText);
        if (result.isOk()) {
          if (result.value) {
            return ok(items[0]);
          } else {
            return ok(undefined);
          }
        } else {
          return err(result.error);
        }
      }
      default: {
        /// default value is set to the first element of items.
        const [choices, defaultValue] = this.toChoices(
          modal ? items.concat("Cancel") : items,
          items[0]
        );
        const result = await this.singleSelect("showMessageName", plainText, choices, defaultValue);
        if (result.isOk()) {
          if (result.value !== "Cancel") {
            return ok(result.value);
          } else {
            return ok(undefined);
          }
        } else {
          return err(result.error);
        }
      }
    }
  }

  public createProgressBar(title: string, totalSteps: number): IProgressHandler {
    return new Progress(title, totalSteps);
  }

  async runCommand(args: {
    cmd: string;
    workingDirectory?: string | undefined;
    shell?: string | undefined;
    timeout?: number | undefined;
    env?: { [k: string]: string } | undefined;
    shellName?: string;
    iconPath?: string;
  }): Promise<Result<string, FxError>> {
    return new Promise<Result<string, FxError>>((resolve) => {
      const isWindows = process.platform === "win32";
      const command = args.shell ? args.shell : isWindows ? "cmd.exe" : "/bin/bash";
      const commandArgs = isWindows ? ["/c", args.cmd] : ["-c", args.cmd];
      logger.info(`Executing task: ${args.cmd}`);
      let output = "";
      const childProcess = child_process.spawn(command, commandArgs, {
        stdio: ["inherit", "pipe", "pipe"],
        cwd: args.workingDirectory,
        timeout: args.timeout,
        env: args.env,
      });
      childProcess.stdout?.on("data", (data) => {
        const str = data.toString();
        process.stdout.write(str); // Real-time output to terminal
        output += str;
      });
      childProcess.stderr?.on("data", (data) => {
        const str = data.toString();
        process.stderr.write(str); // Real-time output to terminal
        output += str;
      });
      childProcess.on("close", (code: number) => {
        if (code === 0) {
          resolve(ok(output));
        } else {
          logger.error("Execute task failed with code:" + code);
          resolve(
            err(
              new ScriptExecutionError(
                new Error("Execute task failed with exit code:" + code),
                args.cmd
              )
            )
          );
        }
      });
    });
  }
}

async function pathValidation(p: string): Promise<string | undefined> {
  if (p === "") {
    return "Path cannot be empty.";
  }
  if (await fs.pathExists(path.resolve(p))) {
    return undefined;
  } else {
    return `${path.resolve(p)} does not exist.`;
  }
}
const CLIUIInstance = new CLIUserInteraction();
export default CLIUIInstance;
