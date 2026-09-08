// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Result } from "neverthrow";
import { FxError } from "../error";
import { Inputs, OptionItem } from "../types";
import { Colors } from "./../utils/log";
import { LocalFunc, OnSelectionChangeFunc, StaticOptions } from "./question";

/**
 * A base structure of user interaction (UI) configuration
 */
export interface UIConfig<T> {
  /**
   * name is the identifier of the UI
   */
  name: string;
  /**
   * human readable meaningful display name of the UI
   */
  title: string;
  /**
   * placeholder in the UI
   */
  placeholder?: string;
  /**
   * prompt text providing some ask or explanation to the user
   */
  prompt?: string;
  /**
   * `step` and `totalSteps` are used to describe the progress in question flow
   * `step` is the sequence number of current question
   */
  step?: number;
  /**
   * `totalStep` is the number of questions totally
   */
  totalSteps?: number;
  /**
   * default input value
   */
  default?: T | (() => Promise<T>) | string;

  /**
   * A function that will be called to validate input and to give a hint to the user.
   *
   * @param input The current value of the input to be validated.
   * @return A human-readable string which is presented as diagnostic message.
   * Return `undefined` when 'value' is valid.
   */
  validation?: (input: T) => string | undefined | Promise<string | undefined>;

  /**
   * Actions that can be made within the question.
   * @param An array of actions
   * @param `icon` is the icon id of the action item
   * @param `tooltip` is the hint of the action item
   * @param `command` is the command name that will be executed when current action triggered
   */
  buttons?: { icon: string; tooltip: string; command: string }[];

  /**
   * `innerStep` and `innerTotalStep` are used to describe the inner step of a group of questions
   * `innerStep` is the sequence number of the current question in the group.
   *  VSC will display the innerStep and innerTotalStep in the question title.
   */
  innerStep?: number;
  /**
   * `innerTotalStep` is the number of questions in the group in total
   */
  innerTotalStep?: number;
}

export interface ConfirmConfig extends UIConfig<boolean> {
  /**
   * display text for option true or false
   */
  transformer?: (value: boolean) => string;
  /**
   * Whether false is an answer instead of cancellation.
   */
  isBoolean?: boolean;
}

/**
 * single selection UI config
 */
export interface SingleSelectConfig extends UIConfig<string> {
  /**
   * option array or a callback function which returns option array
   */
  options: StaticOptions | (() => Promise<StaticOptions>);

  default?: string | (() => Promise<string>);

  /**
   * This config only works for option items with `OptionItem[]` type. If `returnObject` is true, the answer value is an `OptionItem` object; otherwise, the answer value is the `id` string of the `OptionItem`.
   * In case of option items with `string[]` type, whether `returnObject` is true or false, the returned answer value is always a string.
   */
  returnObject?: boolean;

  /**
   * whether skip selection if there is only one option, default is false
   */
  skipSingleOption?: boolean;
}

/**
 * multiple selection UI config
 */
export interface MultiSelectConfig extends UIConfig<string[]> {
  /**
   * option array or a callback function which returns option array
   */
  options: StaticOptions | (() => Promise<StaticOptions>);

  default?: string[] | (() => Promise<string[]>) | "none" | "all";

  /**
   * This config only works for option items with `OptionItem[]` type. If `returnObject` is true, the answer value is an array of `OptionItem` objects; otherwise, the answer value is an array of `id` strings.
   * In case of option items with `string[]` type, whether `returnObject` is true or false, the returned answer value is always a string array.
   */
  returnObject?: boolean;
  /**
   * a callback function which is triggered when the selected values change, which can change the final selected values.
   * @param currentSelectedIds current selected option ids
   * @param previousSelectedIds previous selected option ids
   * @returns the final selected option ids
   */
  onDidChangeSelection?: OnSelectionChangeFunc;

  /**
   * whether skip selection if there is only one option, default is false
   */
  skipSingleOption?: boolean;
}

/**
 * text input UI config
 */
export interface InputTextConfig extends UIConfig<string> {
  /**
   * If the input value should be hidden. Defaults to false.
   */
  password?: boolean;

  default?: string | (() => Promise<string>);

  /**
   * A function that will be called to validate the input that user accepted.
   *
   * @param input The current value of the input to be validated.
   * @return A human-readable string which is presented as diagnostic message.
   * Return `undefined` when 'value' is valid.
   */
  additionalValidationOnAccept?: (
    input: string
  ) => string | undefined | Promise<string | undefined>;
}

/**
 * single file selector config
 */
export type SelectFileConfig = UIConfig<string> & {
  /**
   * This will only take effect in VSC.
   * A set of file filters that are used by the dialog. Each entry is a human-readable label,
   * like "TypeScript", and an array of extensions, e.g.
   * ```ts
   * {
   *     'Images': ['png', 'jpg']
   *     'TypeScript': ['ts', 'tsx']
   * }
   * ```
   */
  filters?: { [name: string]: string[] };

  default?: string | (() => Promise<string>);

  /**
   * Possible files that will be listed for users to select.
   * The id cannot be "default" or "browse" as they are reserved for default and browse options.
   */
  possibleFiles?: {
    id: string;
    label: string;
    description?: string;
  }[];

  /**
   * Default Uri when open file selector window.
   */
  defaultFolder?: string | (() => Promise<string>);
};

/**
 * multiple files selector config
 */
export type SelectFilesConfig = UIConfig<string[]> & {
  /**
   * This will only take effect in VSC.
   * A set of file filters that are used by the dialog. Each entry is a human-readable label,
   * like "TypeScript", and an array of extensions, e.g.
   * ```ts
   * {
   *     'Images': ['png', 'jpg']
   *     'TypeScript': ['ts', 'tsx']
   * }
   * ```
   */
  filters?: { [name: string]: string[] };

  default?: string[] | (() => Promise<string[]>);
};

/**
 * folder selector config
 */
export type SelectFolderConfig = UIConfig<string> & {
  default?: string | (() => Promise<string>);
};

/**
 * func execution config
 */
export interface ExecuteFuncConfig extends UIConfig<string> {
  func: LocalFunc<any>;
  inputs: Inputs;
}

export interface SingleFileOrInputConfig extends UIConfig<string> {
  /**
   * An item shown in the list in VSC that user can click to input text.
   */
  inputOptionItem: OptionItem;

  /**
   * Config for the input box.
   */
  inputBoxConfig: UIConfig<string>;

  /**
   * This will only take effect in VSC.
   * A set of file filters that are used by the dialog. Each entry is a human-readable label,
   * like "TypeScript", and an array of extensions, e.g.
   * ```ts
   * {
   *     'Images': ['png', 'jpg']
   *     'TypeScript': ['ts', 'tsx']
   * }
   * ```
   */
  filters?: { [name: string]: string[] };
}

/**
 * a wrapper of user input result
 */
export interface InputResult<T> {
  /**
   * `success`: the returned answer value is successfully collected when user click predefined confirm button/key, user will continue to answer the next question if available
   * `skip`: the answer value is automatically selected when `skipSingleOption` is true for single/multiple selection list, user will continue to answer the next question if available
   * `back`: the returned answer is undefined because user click the go-back button/key and will go back to re-answer the previous question in the question flow
   */
  type: "success" | "skip" | "back";
  /**
   * answer value
   */
  result?: T;

  /**
   * resolved option list
   */
  options?: StaticOptions;
}

export type ConfirmResult = InputResult<boolean>;

export type SingleSelectResult = InputResult<string | OptionItem>;

export type MultiSelectResult = InputResult<StaticOptions>;

export type InputTextResult = InputResult<string>;

export type SelectFileResult = InputResult<string>;

export type SelectFilesResult = InputResult<string[]>;

export type SelectFolderResult = InputResult<string>;

/**
 * Definition of user interaction, which is platform independent
 */
export interface UserInteraction {
  /**
   * Shows confirm dialog
   * @param config confirm config
   * @returns A promise that resolves to the confirm result wrapper or FxError
   * @throws FxError
   */
  confirm?: (config: ConfirmConfig) => Promise<Result<ConfirmResult, FxError>>;
  /**
   * Shows a single selection list
   * @param config single selection config
   * @returns A promise that resolves to the single select result wrapper or FxError
   * @throws FxError
   */
  selectOption: (config: SingleSelectConfig) => Promise<Result<SingleSelectResult, FxError>>;
  /**
   * Shows a multiple selection list
   * @param config multiple selection config
   * @returns A promise that resolves to the multiple select result wrapper or FxError
   * @throws FxError
   */
  selectOptions: (config: MultiSelectConfig) => Promise<Result<MultiSelectResult, FxError>>;
  /**
   * Opens an input box to ask the user for input.
   * @param config text input config
   * @returns A promise that resolves to the text input result wrapper or FxError
   * @throws FxError
   */
  inputText: (config: InputTextConfig) => Promise<Result<InputTextResult, FxError>>;
  /**
   * Shows a file open dialog to the user which allows to select a single file
   * @param config file selector config
   * @returns A promise that resolves to the file selector result wrapper or FxError
   * @throws FxError
   */
  selectFile: (config: SelectFileConfig) => Promise<Result<SelectFileResult, FxError>>;
  /**
   * Shows a file open dialog to the user which allows to select multiple files
   * @param config multiple files selector config
   * @returns A promise that resolves to the multiple files selector result wrapper or FxError
   * @throws FxError
   */
  selectFiles: (config: SelectFilesConfig) => Promise<Result<SelectFilesResult, FxError>>;
  /**
   * Shows a file open dialog to the user which allows to select a folder
   * @param config folder selector config
   * @returns A promise that resolves to the folder selector result wrapper or FxError
   * @throws FxError
   */
  selectFolder: (config: SelectFolderConfig) => Promise<Result<SelectFolderResult, FxError>>;

  /**
   * Opens a link externally in the browser.
   * @param link The uri that should be opened.
   * @returns A promise indicating if open was successful.
   */
  openUrl(link: string): Promise<Result<boolean, FxError>>;
  /**
   * Show an information/warning/error message to users. Optionally provide an array of items which will be presented as clickable buttons.
   * @param level message level
   * @param message The message to show.
   * @param items A set of items that will be rendered as actions in the message.
   * @returns A promise that resolves to the selected item or `undefined` when being dismissed.
   */
  showMessage(
    level: "info" | "warn" | "error",
    message: string,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>>;

  /**
   * Show an information/warning/error message with different colors to users, which only works for CLI.
   * @param level message level
   * @param message The message with color to show. The color only works for CLI.
   * @param items A set of items that will be rendered as actions in the message.
   * @returns A promise that resolves to the selected item or `undefined` when being dismissed.
   */
  showMessage(
    level: "info" | "warn" | "error",
    message: Array<{ content: string; color: Colors }>,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>>;

  /**
   * Create a new progress bar with the specified title and the number of steps. It will
   * return a progress handler and you can use this handler to control the detail message
   * of it.
   * ${currentStep} will increase from 0 to ${totalSteps}.
   * @param title the title of this progress bar.
   * @param totalSteps the number of steps.
   * @returns the handler of a progress bar
   */
  createProgressBar: (title: string, totalSteps: number) => IProgressHandler;

  /**
   * Reload window to update user interface. (Only works for VS Code)
   * @returns A promise indicating if reload is successful.
   */
  reload?(): Promise<Result<boolean, FxError>>;

  /**
   * Execute a function. User interface can decide what the UX is.
   * @param config execute function configurations
   */
  executeFunction?(config: ExecuteFuncConfig): any | Promise<any>;

  /**
   * Opens a file.
   * @param filePath The path of the file that should be opened.
   * @returns A promise indicating if open was successful.
   */
  openFile?(filePath: string): Promise<Result<boolean, FxError>>;

  /**
   * run a user defined command in terminals of UI
   * @param args
   */
  runCommand?(args: {
    cmd: string;
    workingDirectory?: string;
    shell?: string;
    timeout?: number;
    env?: { [k: string]: string };
    shellName?: string;
    iconPath?: string;
  }): Promise<Result<string, FxError>>;

  /**
   * In VSC, it shows two options to user, one will open a dialog to the user which allows to select a single file, another one will show an input box asking to enter a value.
   * If CLI, it will directly asks user to enter a value.
   * @param config config to select local file or enter a value
   * @returns A promise that resolves to the local file path or the value entered by user or FxError
   * @throws FxError
   */
  selectFileOrInput?(
    config: SingleFileOrInputConfig
  ): Promise<Result<InputResult<string>, FxError>>;

  /**
   * Supports in VSC only for now. Show diagnostic message in editor.
   */
  showDiagnosticInfo?(diagnostics: IDiagnosticInfo[]): void;
}

export interface IProgressHandler {
  /**
   * Start this progress bar. After calling it, the progress bar will be seen to users with
   * ${currentStep} = 0 and ${detail} = detail.
   * @param detail the detail message of the next work.
   */
  start: (detail?: string) => Promise<void> | void;

  /**
   * Update the progress bar's message. After calling it, the progress bar will be seen to
   * users with ${currentStep}++ and ${detail} = detail.
   * This func must be called after calling start().
   * @param detail the detail message of the next work.
   */
  next: (detail?: string) => Promise<void> | void;

  /**
   * End the progress bar and tell if success. After calling it, the progress bar will disappear. This handler
   * can be reused after calling end().
   */
  end: (success: boolean, hideAfterFinish?: boolean) => Promise<void> | void;

  text?: (detail: string) => Promise<void> | void;
}

export enum DiagnosticSeverity {
  /**
   * Something not allowed by the rules of a language or other means.
   */
  Error = 0,

  /**
   * Something suspicious but allowed.
   */
  Warning = 1,

  /**
   * Something to inform about but not a problem.
   */
  Information = 2,

  /**
   * Something to hint to a better way of doing it, like proposing
   * a refactoring.
   */
  Hint = 3,
}

export interface IDiagnosticInfo {
  /**
   * Path of file where diagnostic shows.
   */
  filePath: string;
  /**
   * Line number where diagnostic info starts.
   */
  startLine: number;
  /**
   * Index of the beginning character where diagnostic info shows
   */
  startIndex: number;
  /**
   * Line number where diagnostic info ends.
   */
  endLine: number;
  /**
   * Index of the end character where diagnostic info ends.
   */
  endIndex: number;
  /**
   * Message.
   */
  message: string;
  /**
   * Severity.
   */
  severity: DiagnosticSeverity;
  /**
   * A code or identifier for this diagnostic.
   */
  code?: {
    /**
     * Value.
     */
    value: string;
    /**
     * Link to open with more information about the diagnostic error.
     */
    link: string;
  };
}
