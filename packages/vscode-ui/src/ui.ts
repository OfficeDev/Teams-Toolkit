// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import { remove } from "lodash";
import * as path from "path";
import * as tmp from "tmp";
import {
  commands,
  Disposable,
  env,
  InputBox,
  QuickInputButton,
  QuickInputButtons,
  QuickPick,
  QuickPickItem,
  QuickPickItemKind,
  ShellExecution,
  Task,
  TaskProcessEndEvent,
  tasks,
  TaskScope,
  ThemeIcon,
  Uri,
  window,
  workspace,
} from "vscode";

import type {
  Colors,
  ConfirmConfig,
  ConfirmResult,
  ExecuteFuncConfig,
  FxError,
  InputResult,
  InputTextConfig,
  InputTextResult,
  IProgressHandler,
  MultiSelectConfig,
  MultiSelectResult,
  OptionItem,
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
  UIConfig,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import { SystemError } from "@microsoft/teamsfx-api";
import { err, ok, Result } from "neverthrow";
import {
  EmptyOptionsError,
  InternalUIError,
  ScriptExecutionError,
  ScriptTimeoutError,
  UserCancelError,
} from "./error";
import { DefaultLocalizer, Localizer } from "./localize";
import { ProgressHandler } from "./progressHandler";

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

export interface FxQuickPickItem extends QuickPickItem {
  id: string;
  data?: unknown;
}

function getOptionItem(item: FxQuickPickItem): OptionItem {
  return {
    id: item.id,
    label: item.label,
    description: item.description,
    detail: item.detail,
    data: item.data,
  };
}

function convertToFxQuickPickItems(options: StaticOptions): FxQuickPickItem[] {
  if (options && options.length > 0 && typeof options[0] === "string") {
    return (options as string[]).map((option: string) => {
      return { id: option, label: option };
    });
  } else {
    const result: FxQuickPickItem[] = [];
    const candidates = [...options];
    while (candidates.length > 0) {
      const groupName = (candidates[0] as OptionItem).groupName;
      const group = remove(
        candidates as OptionItem[],
        (option: OptionItem) => option.groupName === groupName
      );
      if (groupName) {
        result.push({
          id: groupName,
          label: groupName,
          kind: QuickPickItemKind.Separator,
        });
      }
      result.push(
        ...group.map((option) => {
          return {
            id: option.id,
            label: option.label,
            description: option.description,
            detail: option.detail,
            data: option.data,
            buttons: option.buttons?.map((button) => {
              return { iconPath: new ThemeIcon(button.iconPath), tooltip: button.tooltip };
            }),
          };
        })
      );
    }
    return result;
  }
}

function cloneSet(set: Set<string>): Set<string> {
  const res = new Set<string>();
  for (const e of set) res.add(e);
  return res;
}

function isSame(set1: Set<string>, set2: Set<string>): boolean {
  for (const i of set1) {
    if (!set2.has(i)) return false;
  }
  for (const i of set2) {
    if (!set1.has(i)) return false;
  }
  return true;
}

/***
 * This is the default implementation of UserInteraction in vscode.
 */
export class VSCodeUI implements UserInteraction {
  terminalName: string;
  assembleError: (e: any) => FxError;
  localizer: Localizer;
  constructor(terminalName: string, assembleError: (e: any) => FxError, localizer?: Localizer) {
    this.terminalName = terminalName;
    this.assembleError = assembleError;
    this.localizer = localizer || new DefaultLocalizer();
  }

  async selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    if (typeof config.options === "object" && config.options.length === 0) {
      return err(
        new EmptyOptionsError(
          this.localizer.emptyOptionErrorMessage(),
          this.localizer.emptyOptionErrorDisplayMessage()
        )
      );
    }
    const disposables: Disposable[] = [];
    try {
      const quickPick = window.createQuickPick<FxQuickPickItem>();
      quickPick.title = config.title;
      const buttons: QuickInputButton[] = config.buttons
        ? config.buttons.map((button) => {
            return {
              iconPath: new ThemeIcon(button.icon),
              tooltip: button.tooltip,
            } as QuickInputButton;
          })
        : [];
      if (config.step && config.step > 1) {
        quickPick.buttons = [QuickInputButtons.Back, ...buttons];
      } else {
        quickPick.buttons = buttons;
      }
      quickPick.placeholder = config.placeholder;
      quickPick.ignoreFocusOut = true;
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;
      quickPick.canSelectMany = false;
      return await new Promise<Result<SingleSelectResult, FxError>>((resolve) => {
        let options: StaticOptions = [];
        let defaultValue: string | undefined = undefined;
        let isSkip = false;
        const onDidAccept = async () => {
          const selectedItems = quickPick.selectedItems;
          if (selectedItems && selectedItems.length > 0) {
            const item = selectedItems[0];
            let result: string | OptionItem;
            if (
              typeof options[0] === "string" ||
              config.returnObject === undefined ||
              config.returnObject === false
            ) {
              result = item.id;
              if (config.validation) {
                try {
                  const validateRes = await config.validation(result);
                  if (validateRes) {
                    return;
                  }
                } catch (e) {
                  resolve(err(this.assembleError(e)));
                }
              }
            } else result = getOptionItem(item);
            resolve(ok({ type: isSkip ? "skip" : "success", result: result, options: options }));
          }
        };

        const loadDynamicData = async () => {
          quickPick.busy = true;
          quickPick.placeholder = this.localizer.loadingOptionsPlaceholder();
          try {
            if (typeof config.options === "function") {
              options = await config.options();
            } else {
              options = config.options;
            }
            if (typeof config.default === "function") {
              defaultValue = await config.default();
            } else {
              defaultValue = config.default;
            }
          } catch (e) {
            resolve(err(this.assembleError(e)));
          }
        };

        const onDataLoaded = () => {
          quickPick.busy = false;
          quickPick.placeholder = config.placeholder;
          quickPick.items = convertToFxQuickPickItems(options);
          if (config.skipSingleOption && options.length === 1) {
            quickPick.selectedItems = [quickPick.items[0]];
            isSkip = true;
            void onDidAccept();
            return;
          }
          if (defaultValue) {
            if (options && options.length > 0 && typeof options[0] === "string") {
              const defaultOption = (options as string[]).find((o) => o == defaultValue);
              if (defaultOption) {
                const newItems = (options as string[]).filter((o) => o != defaultValue);
                newItems.unshift(defaultOption);
                quickPick.items = convertToFxQuickPickItems(newItems);
              }
            } else {
              const defaultOption = (options as OptionItem[]).find((o) => o.id == defaultValue);
              if (defaultOption) {
                const newItems = (options as OptionItem[]).filter((o) => o.id != defaultValue);
                newItems.unshift(defaultOption);
                quickPick.items = convertToFxQuickPickItems(newItems);
              }
            }
          }
        };

        disposables.push(
          quickPick.onDidAccept(onDidAccept),
          quickPick.onDidHide(() => {
            resolve(
              err(
                new UserCancelError(
                  this.localizer.cancelErrorMessage(),
                  this.localizer.cancelErrorDisplayMessage()
                )
              )
            );
          }),
          quickPick.onDidTriggerButton(async (button) => {
            if (button === QuickInputButtons.Back) resolve(ok({ type: "back" }));
            else if (config.buttons && buttons.indexOf(button) !== -1) {
              const curButton = config.buttons?.find((btn) => {
                return (
                  btn.icon === (button.iconPath as ThemeIcon).id && btn.tooltip === button.tooltip
                );
              });
              if (curButton) {
                await commands.executeCommand(curButton.command);
              }
            } else {
              quickPick.selectedItems = quickPick.activeItems;
              await onDidAccept();
            }
          }),
          quickPick.onDidTriggerItemButton(async (event) => {
            const itemOptions: StaticOptions = options;
            if (itemOptions.length > 0 && typeof itemOptions[0] === "string") {
              return;
            }
            const triggerItem: OptionItem | undefined = (itemOptions as OptionItem[]).find(
              (singleOption: string | OptionItem) => {
                if (typeof singleOption !== "string") {
                  return singleOption.id === event.item.id;
                }
              }
            );
            if (triggerItem) {
              const triggerButton = triggerItem.buttons?.find((button) => {
                return button.iconPath === (event.button.iconPath as ThemeIcon).id;
              });
              if (triggerButton) {
                await commands.executeCommand(triggerButton.command, event.item);
              }
            }
          })
        );
        disposables.push(quickPick);

        if (typeof config.options === "function" || typeof config.default === "function") {
          // try to load dynamic data in a very short time
          const timeoutPromise = new Promise((resolve) => {
            setTimeout(resolve, 500, this.localizer.loadingOptionsTimeoutMessage());
          });
          Promise.race([loadDynamicData(), timeoutPromise])
            .then((value) => {
              if (value != this.localizer.loadingOptionsTimeoutMessage()) {
                if (config.skipSingleOption && options.length === 1) {
                  quickPick.items = convertToFxQuickPickItems(options);
                  quickPick.selectedItems = [quickPick.items[0]];
                  isSkip = true;
                  void onDidAccept();
                  return;
                } else {
                  onDataLoaded();
                  quickPick.show();
                }
              } else {
                quickPick.show();
                loadDynamicData()
                  .then(onDataLoaded)
                  .catch((e) => resolve(err(this.assembleError(e))));
              }
            })
            .catch((e) => resolve(err(this.assembleError(e))));
        } else {
          options = config.options;
          defaultValue = config.default;
          onDataLoaded();
          quickPick.show();
        }
      });
    } finally {
      disposables.forEach((d) => {
        d.dispose();
      });
    }
  }

  async selectOptions(config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> {
    if (typeof config.options === "object" && config.options.length === 0) {
      return err(
        new EmptyOptionsError(
          this.localizer.emptyOptionErrorMessage(),
          this.localizer.emptyOptionErrorDisplayMessage()
        )
      );
    }
    const disposables: Disposable[] = [];
    try {
      const quickPick: QuickPick<FxQuickPickItem> = window.createQuickPick<FxQuickPickItem>();
      quickPick.title = config.title;
      if (config.step && config.step > 1) {
        quickPick.buttons = [QuickInputButtons.Back];
      }
      quickPick.placeholder = config.placeholder
        ? config.placeholder + this.localizer.multiSelectKeyboardPlaceholder()
        : this.localizer.multiSelectKeyboardPlaceholder();
      quickPick.ignoreFocusOut = true;
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;
      quickPick.canSelectMany = true;
      const preIds: Set<string> = new Set<string>();
      return await new Promise<Result<MultiSelectResult, FxError>>((resolve) => {
        let options: StaticOptions = [];
        let isSkip = false;
        let defaultValue: string[] = [];
        const optionMap = new Map<string, FxQuickPickItem>();
        const loadDynamicData = async () => {
          quickPick.busy = true;
          quickPick.placeholder = this.localizer.loadingOptionsPlaceholder();
          try {
            if (typeof config.options === "function") {
              options = await config.options();
            } else {
              options = config.options;
            }
            if (typeof config.default === "function") {
              defaultValue = await config.default();
            } else if (config.default === "all") {
              defaultValue = options.map((o) => (typeof o === "string" ? o : o.id));
            } else if (config.default === "none") {
              defaultValue = [];
            }
          } catch (e) {
            resolve(err(this.assembleError(e)));
          }
        };

        const onDidAccept = async () => {
          const strArray = Array.from(quickPick.selectedItems.map((i) => i.id));
          if (config.validation) {
            const validateRes = await config.validation(strArray);
            if (validateRes) {
              void this.showMessage("error", validateRes, false);
              return;
            }
          }
          let result: OptionItem[] | string[] = strArray;
          if (
            typeof options[0] === "string" ||
            config.returnObject === undefined ||
            config.returnObject === false
          )
            result = strArray;
          else result = quickPick.selectedItems.map((i) => getOptionItem(i));
          resolve(ok({ type: isSkip ? "skip" : "success", result: result }));
        };

        const onDataLoaded = () => {
          quickPick.busy = false;
          quickPick.placeholder = config.placeholder;
          quickPick.items = convertToFxQuickPickItems(options);
          for (const item of quickPick.items) {
            optionMap.set(item.id, item);
          }
          if (config.skipSingleOption && options.length === 1) {
            quickPick.selectedItems = [quickPick.items[0]];
            isSkip = true;
            void onDidAccept();
            return;
          }
          if (defaultValue) {
            const selectedItems: FxQuickPickItem[] = [];
            preIds.clear();
            for (const id of defaultValue) {
              const item = optionMap.get(id);
              if (item) {
                selectedItems.push(item);
                preIds.add(id);
              }
            }
            quickPick.selectedItems = selectedItems;
          }
        };

        disposables.push(
          quickPick.onDidAccept(onDidAccept),
          quickPick.onDidHide(() => {
            resolve(
              err(
                new UserCancelError(
                  this.localizer.emptyOptionErrorMessage(),
                  this.localizer.emptyOptionErrorDisplayMessage()
                )
              )
            );
          }),
          quickPick.onDidTriggerButton(async (button) => {
            if (button === QuickInputButtons.Back) resolve(ok({ type: "back" }));
            else {
              await onDidAccept();
            }
          })
        );

        if (config.onDidChangeSelection) {
          const changeHandler = async function (items: readonly FxQuickPickItem[]): Promise<any> {
            let currentIds = new Set<string>();
            for (const item of items) {
              currentIds.add(item.id);
            }
            if (config.onDidChangeSelection) {
              const currentClone = cloneSet(currentIds);
              currentIds = await config.onDidChangeSelection(currentIds, preIds);
              const selectedItems: FxQuickPickItem[] = [];
              preIds.clear();
              for (const id of currentIds) {
                const item = optionMap.get(id);
                if (item) {
                  selectedItems.push(item);
                  preIds.add(id);
                }
              }
              if (!isSame(currentClone, currentIds)) {
                quickPick.selectedItems = selectedItems;
              }
            }
          };
          disposables.push(quickPick.onDidChangeSelection(changeHandler));
        }
        disposables.push(quickPick);

        if (typeof config.options === "function" || typeof config.default === "function") {
          // try to load dynamic data in a very short time
          const timeoutPromise = new Promise((resolve) => {
            setTimeout(resolve, 500, this.localizer.loadingOptionsTimeoutMessage());
          });
          Promise.race([loadDynamicData(), timeoutPromise])
            .then((value) => {
              if (value != this.localizer.loadingOptionsTimeoutMessage()) {
                if (config.skipSingleOption && options.length === 1) {
                  quickPick.items = convertToFxQuickPickItems(options);
                  quickPick.selectedItems = [quickPick.items[0]];
                  isSkip = true;
                  void onDidAccept();
                  return;
                } else {
                  onDataLoaded();
                  quickPick.show();
                }
              } else {
                quickPick.show();
                loadDynamicData()
                  .then(onDataLoaded)
                  .catch((e) => resolve(err(this.assembleError(e))));
              }
            })
            .catch((e) => resolve(err(this.assembleError(e))));
        } else {
          options = config.options;
          defaultValue = config.default as string[] | [];
          onDataLoaded();
          quickPick.show();
        }
      });
    } finally {
      disposables.forEach((d) => {
        d.dispose();
      });
    }
  }

  async inputText(config: InputTextConfig): Promise<Result<InputTextResult, FxError>> {
    const disposables: Disposable[] = [];
    try {
      const inputBox: InputBox = window.createInputBox();
      inputBox.title = config.title;
      if (config.step && config.step > 1) {
        inputBox.buttons = [QuickInputButtons.Back];
      }
      inputBox.ignoreFocusOut = true;
      inputBox.password = config.password === true;
      inputBox.prompt = config.prompt;
      return await new Promise<Result<InputTextResult, FxError>>((resolve): void => {
        let defaultValue: string | undefined = undefined;
        const loadDynamicData = async () => {
          try {
            if (typeof config.default === "function") {
              defaultValue = await config.default();
            }
          } catch (e) {
            resolve(err(this.assembleError(e)));
          }
        };
        const onDataLoaded = () => {
          inputBox.busy = false;
          inputBox.enabled = true;
          inputBox.placeholder = config.placeholder;
          inputBox.value = defaultValue || "";
        };

        const onDidAccept = async () => {
          const validationRes = config.validation
            ? await config.validation(inputBox.value)
            : undefined;
          if (!validationRes) {
            inputBox.enabled = false;
            inputBox.busy = true;
            if (config.additionalValidationOnAccept) {
              const oldValue = inputBox.value;
              inputBox.placeholder = "Validating...";
              inputBox.value = "";
              try {
                const additionalValidationOnAcceptRes =
                  await config.additionalValidationOnAccept(oldValue);

                if (!additionalValidationOnAcceptRes) {
                  resolve(ok({ type: "success", result: oldValue }));
                } else {
                  inputBox.validationMessage = additionalValidationOnAcceptRes;
                  inputBox.busy = false;
                  inputBox.enabled = true;
                  inputBox.value = oldValue;
                  return;
                }
              } catch (e) {
                resolve(err(this.assembleError(e)));
              }
            } else {
              resolve(ok({ type: "success", result: inputBox.value }));
            }
            resolve(ok({ type: "success", result: inputBox.value }));
          } else {
            inputBox.validationMessage = validationRes;
          }
        };

        if (typeof config.default === "function") {
          inputBox.busy = true;
          inputBox.enabled = false;
          inputBox.placeholder = this.localizer.loadingDefaultPlaceholder();
          loadDynamicData()
            .then(onDataLoaded)
            .catch((e) => resolve(err(this.assembleError(e))));
        } else {
          defaultValue = config.default || "";
          onDataLoaded();
        }

        disposables.push(
          inputBox.onDidChangeValue(async (text) => {
            if (config.validation) {
              const validationRes = config.validation ? await config.validation(text) : undefined;
              if (!!validationRes) {
                inputBox.validationMessage = validationRes;
              } else {
                inputBox.validationMessage = undefined;
              }
            }
          }),
          inputBox.onDidAccept(onDidAccept),
          inputBox.onDidHide(() => {
            resolve(
              err(
                new UserCancelError(
                  this.localizer.emptyOptionErrorMessage(),
                  this.localizer.emptyOptionErrorDisplayMessage()
                )
              )
            );
          }),
          inputBox.onDidTriggerButton(async (button) => {
            if (button === QuickInputButtons.Back) resolve(ok({ type: "back" }));
            else {
              await onDidAccept();
            }
          })
        );
        disposables.push(inputBox);
        inputBox.show();
      });
    } finally {
      disposables.forEach((d) => {
        d.dispose();
      });
    }
  }

  async selectFolder(config: SelectFolderConfig): Promise<Result<SelectFolderResult, FxError>> {
    const disposables: Disposable[] = [];
    try {
      const quickPick = window.createQuickPick<FxQuickPickItem>();
      quickPick.title = config.title;
      if (config.step && config.step > 1) {
        quickPick.buttons = [QuickInputButtons.Back];
      }
      quickPick.placeholder = config.placeholder;
      quickPick.ignoreFocusOut = true;
      quickPick.matchOnDescription = true;
      quickPick.matchOnDetail = true;
      quickPick.canSelectMany = false;
      return await new Promise<Result<SelectFolderResult, FxError>>((resolve) => {
        let defaultValue: string | undefined = undefined;
        const loadDynamicData = async () => {
          try {
            if (typeof config.default === "function") {
              defaultValue = await config.default();
            }
          } catch (e) {
            resolve(err(this.assembleError(e)));
          }
        };
        const onDataLoaded = () => {
          quickPick.busy = false;
          quickPick.placeholder = config.placeholder;
          quickPick.items = [
            ...(defaultValue
              ? [
                  {
                    id: "default",
                    label: this.localizer.defaultFolder(),
                    description: defaultValue,
                  },
                ]
              : []),
            {
              id: "browse",
              label: `$(folder) ${this.localizer.browse()}`,
            },
          ];
        };

        if (typeof config.default === "function") {
          quickPick.busy = true;
          quickPick.placeholder = this.localizer.loadingDefaultPlaceholder();
          loadDynamicData()
            .then(onDataLoaded)
            .catch((e) => resolve(err(this.assembleError(e))));
        } else {
          defaultValue = config.default;
          onDataLoaded();
        }

        let hideByDialog = false;
        const onDidAccept = async () => {
          const selectedItems = quickPick.selectedItems;
          if (selectedItems && selectedItems.length > 0) {
            const item = selectedItems[0];
            if (item.id === "default") {
              resolve(ok({ type: "success", result: defaultValue as string }));
            } else {
              hideByDialog = true;
              const uriList: Uri[] | undefined = await window.showOpenDialog({
                defaultUri: defaultValue ? Uri.file(defaultValue) : undefined,
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                title: config.title,
              });
              if (uriList && uriList.length > 0) {
                const result = uriList[0].fsPath;
                resolve(ok({ type: "success", result: result }));
              } else {
                resolve(
                  err(
                    new UserCancelError(
                      this.localizer.emptyOptionErrorMessage(),
                      this.localizer.emptyOptionErrorDisplayMessage()
                    )
                  )
                );
              }
            }
          }
        };

        disposables.push(
          quickPick.onDidAccept(onDidAccept),
          quickPick.onDidHide(() => {
            if (!hideByDialog) {
              resolve(
                err(
                  new UserCancelError(
                    this.localizer.emptyOptionErrorMessage(),
                    this.localizer.emptyOptionErrorDisplayMessage()
                  )
                )
              );
            }
          }),
          quickPick.onDidTriggerButton((button) => {
            if (button === QuickInputButtons.Back) resolve(ok({ type: "back" }));
          })
        );

        disposables.push(quickPick);
        quickPick.show();
      });
    } finally {
      disposables.forEach((d) => {
        d.dispose();
      });
    }
  }

  async selectFile(config: SelectFileConfig): Promise<Result<SelectFileResult, FxError>> {
    if (config.default && typeof config.default === "function") {
      //TODO quick workaround solution, which will blocking the UI popup
      config.default = await config.default();
    }
    if (config.defaultFolder && typeof config.defaultFolder === "function") {
      config.defaultFolder = await config.defaultFolder();
    }
    return this.selectFileInQuickPick(config, "file", config.default as string);
  }

  async selectFiles(config: SelectFilesConfig): Promise<Result<SelectFilesResult, FxError>> {
    if (config.default && typeof config.default === "function") {
      //TODO  quick workaround solution, which will blocking the UI popup
      config.default = await config.default();
    }
    return this.selectFileInQuickPick(
      config,
      "files",
      config.default && typeof config.default !== "string" ? config.default.join(";") : undefined
    );
  }

  async selectFileInQuickPick(
    config: SelectFileConfig,
    type: "file" | "files",
    defaultValue?: string
  ): Promise<Result<SelectFileResult, FxError>>;
  async selectFileInQuickPick(
    config: SelectFilesConfig,
    type: "file" | "files",
    defaultValue?: string
  ): Promise<Result<SelectFilesResult, FxError>>;
  async selectFileInQuickPick(
    config: UIConfig<any> & {
      filters?: { [name: string]: string[] };
      possibleFiles?: {
        id: string;
        label: string;
        description?: string;
      }[];
      defaultFolder?: string;
    },
    type: "file" | "files",
    defaultValue?: string
  ): Promise<Result<InputResult<string[] | string>, FxError>> {
    if (config.possibleFiles) {
      if (config.possibleFiles.find((o) => o.id === "browse" || o.id === "default")) {
        return Promise.resolve(
          err(
            new SystemError(
              "UI",
              "InvalidInput",
              'Possible files should not contain item with id "browse" or "default".'
            )
          )
        );
      }
    }
    /// TODO: use generic constraints.
    const disposables: Disposable[] = [];
    try {
      const quickPick: QuickPick<FxQuickPickItem> = window.createQuickPick();
      quickPick.title = config.title;
      if (config.step && config.step > 1) {
        quickPick.buttons = [QuickInputButtons.Back];
      }
      if (!!config.innerStep && !!config.innerTotalStep) {
        quickPick.totalSteps = config.innerTotalStep;
        quickPick.step = config.innerStep;
      }
      quickPick.ignoreFocusOut = true;
      quickPick.placeholder = config.placeholder;
      quickPick.matchOnDescription = false;
      quickPick.matchOnDetail = false;
      quickPick.canSelectMany = false;
      let fileSelectorIsOpen = false;
      return await new Promise((resolve) => {
        // set options
        quickPick.items = [
          ...(config.possibleFiles
            ? config.possibleFiles
            : defaultValue
              ? [
                  {
                    id: "default",
                    label: `$(file) ${path.basename(defaultValue)}`,
                    description: path.dirname(defaultValue),
                  },
                ]
              : []),
          {
            id: "browse",
            label: `$(file) ${this.localizer.browse()}`,
          },
        ];

        const onDidAccept = async () => {
          const selectedItems = quickPick.selectedItems;
          let result;
          if (selectedItems && selectedItems.length > 0) {
            const item = selectedItems[0];
            if (item.id === "default") {
              result = config.default as string;
            } else if (item.id === "browse") {
              fileSelectorIsOpen = true;
              const uriList: Uri[] | undefined = await window.showOpenDialog({
                defaultUri: config.defaultFolder
                  ? Uri.file(config.defaultFolder)
                  : config.default
                    ? Uri.file(config.default as string)
                    : undefined,
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: type === "files",
                filters: config.filters,
                title: config.title,
              });
              if (uriList && uriList.length > 0) {
                if (type === "files") {
                  const results = uriList.map((u) => u.fsPath);
                  result = results;
                } else {
                  result = uriList[0].fsPath;
                }
              } else {
                quickPick.selectedItems = [];
                return;
              }
            } else {
              result = config.possibleFiles?.find((f) => f.id === item.id)?.id;
            }

            if (config.validation && result !== undefined) {
              quickPick.busy = true;
              quickPick.enabled = false;
              try {
                const validationResult = await config.validation(result);
                quickPick.busy = false;
                quickPick.enabled = true;
                if (validationResult) {
                  void this.showMessage("error", validationResult, false);
                  quickPick.selectedItems = [];
                  quickPick.activeItems = [];
                  return;
                }
              } catch (e) {
                resolve(err(this.assembleError(e)));
              }
            }

            resolve(ok({ type: "success", result: result }));
          }
        };

        disposables.push(
          quickPick.onDidAccept(onDidAccept),
          quickPick.onDidHide(() => {
            if (fileSelectorIsOpen === false)
              resolve(
                err(
                  new UserCancelError(
                    this.localizer.emptyOptionErrorMessage(),
                    this.localizer.emptyOptionErrorDisplayMessage()
                  )
                )
              );
          }),
          quickPick.onDidTriggerButton((button) => {
            if (button === QuickInputButtons.Back) resolve(ok({ type: "back" }));
          })
        );

        disposables.push(quickPick);
        quickPick.show();
      });
    } finally {
      disposables.forEach((d) => {
        d.dispose();
      });
    }
  }

  async openUrl(link: string): Promise<Result<boolean, FxError>> {
    const uri = Uri.parse(link);
    const result = await env.openExternal(uri);
    if (result) {
      return ok(result);
    } else {
      return err(
        new InternalUIError(
          this.localizer.internalErrorMessage(`env.openExternal('${link}')`),
          this.localizer.internalErrorDisplayMessage(`env.openExternal('${link}')`)
        )
      );
    }
  }

  async selectFileOrInput(
    config: SingleFileOrInputConfig
  ): Promise<Result<InputResult<string>, FxError>> {
    const validtionOnSelect = async (input: string) => {
      if (input === config.inputOptionItem.id) {
        return undefined;
      }

      if (config.validation) {
        return await config.validation(input);
      }
    };

    const selectFileConfig: SelectFileConfig = {
      ...config,
      validation: validtionOnSelect,
      possibleFiles: [config.inputOptionItem],
    };

    while (true) {
      const selectFileOrItemRes = await this.selectFile(selectFileConfig);
      if (selectFileOrItemRes.isOk()) {
        if (selectFileOrItemRes.value.result === config.inputOptionItem.id) {
          const inputRes = await this.inputText({
            ...config.inputBoxConfig,
            additionalValidationOnAccept: config.validation,
          });
          if (inputRes.isOk()) {
            if (inputRes.value.type === "back") continue;
            return ok(inputRes.value);
          } else {
            return err(inputRes.error);
          }
        } else {
          return ok(selectFileOrItemRes.value);
        }
      } else {
        return err(selectFileOrItemRes.error);
      }
    }
  }

  async confirm(config: ConfirmConfig): Promise<Result<ConfirmResult, FxError>> {
    const confirmText = config.transformer?.(true) || "Confirm";
    const res = await this.showMessage("warn", config.title, true, confirmText);
    if (res.isErr()) {
      return err(res.error);
    }
    const value = res.value;
    if (value === confirmText) return ok({ type: "success", result: true });
    return err(
      new UserCancelError(
        this.localizer.emptyOptionErrorMessage(),
        this.localizer.emptyOptionErrorDisplayMessage()
      )
    );
  }

  public async showMessage(
    level: "info" | "warn" | "error",
    message: string,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>>;

  public async showMessage(
    level: "info" | "warn" | "error",
    message: Array<{ content: string; color: Colors }>,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>>;

  async showMessage(
    level: "info" | "warn" | "error",
    message: string | Array<{ content: string; color: Colors }>,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>> {
    if (message instanceof Array) {
      message = message.map((x) => x.content).join("");
    }
    return new Promise((resolve) => {
      const option = { modal: modal };
      try {
        let promise: Thenable<string | undefined>;
        switch (level) {
          case "info": {
            promise = window.showInformationMessage(message, option, ...items);
            break;
          }
          case "warn": {
            promise = window.showWarningMessage(message, option, ...items);
            break;
          }
          case "error":
            promise = window.showErrorMessage(message, option, ...items);
        }
        promise.then(
          (v) => {
            if (v) resolve(ok(v));
            else
              resolve(
                err(
                  new UserCancelError(
                    this.localizer.emptyOptionErrorMessage(),
                    this.localizer.emptyOptionErrorDisplayMessage()
                  )
                )
              );
          },
          (error) => {}
        );
      } catch (error) {
        resolve(err(this.assembleError(error)));
      }
    });
  }

  public createProgressBar(title: string, totalSteps: number): IProgressHandler {
    return new ProgressHandler(title, totalSteps);
  }

  async executeFunction(config: ExecuteFuncConfig): Promise<unknown> {
    const quickPick = window.createQuickPick<FxQuickPickItem>();
    quickPick.title = config.title;
    quickPick.busy = true;
    quickPick.enabled = false;
    quickPick.show();
    try {
      return (await config.func(config.inputs)) as unknown;
    } finally {
      quickPick.hide();
      quickPick.dispose();
    }
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
    const cmd = args.cmd;
    const workingDirectory = args.workingDirectory;
    const timeout = args.timeout;
    const env = args.env;

    // Create temporary files for output and script
    const tempFile = tmp.tmpNameSync({ prefix: "task-output-", postfix: ".txt" });

    // Ensure temp file exists before execution
    fs.writeFileSync(tempFile, "", "utf-8");

    // Detect the platform and use appropriate script format
    const isWindows = process.platform === "win32";
    const scriptExt = isWindows ? ".ps1" : ".sh";
    const scriptFile = tmp.tmpNameSync({ prefix: "task-script-", postfix: scriptExt });

    // Create platform-specific script content
    let scriptContent: string;
    let wrappedCmd: string;

    if (isWindows) {
      // PowerShell script for Windows
      // Capture output to file within the script itself for compatibility
      scriptContent = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8; $ErrorActionPreference = 'Continue'\n& {\n${cmd}\n} 2>&1 | ForEach-Object { $_ | Out-File -FilePath "${tempFile}" -Encoding utf8 -Append; $_ }\nexit $LASTEXITCODE\n`;
      // Use the shell parameter if provided, otherwise default to powershell for broader compatibility
      const shellCmd = args.shell || "powershell";
      wrappedCmd = `${shellCmd} -NoProfile -ExecutionPolicy Bypass -File "${scriptFile}"`;
    } else {
      // Bash script for Unix-like systems
      // Use tee inside the script to display output in the terminal while capturing to file,
      // then exit with the command's actual exit code via PIPESTATUS.
      scriptContent = `#!/bin/bash\nset +e\n( ${cmd} ) 2>&1 | tee "${tempFile}"\nexit \${PIPESTATUS[0]}\n`;
      wrappedCmd = `bash "${scriptFile}"`;
    }

    fs.writeFileSync(scriptFile, scriptContent, "utf-8");

    // Make script executable on Unix-like systems
    if (!isWindows) {
      fs.chmodSync(scriptFile, 0o755);
    }

    const timeoutPromise = timeout
      ? new Promise<never>((_, reject) => {
          setTimeout(
            () => {
              reject(
                new ScriptTimeoutError(
                  this.localizer.commandTimeoutErrorMessage(cmd),
                  this.localizer.commandTimeoutErrorDisplayMessage(cmd)
                )
              );
            },
            timeout ?? 1000 * 60 * 30
          );
        })
      : undefined;

    const taskPromise = new Promise<string>((resolve, reject) => {
      const task = new Task(
        { type: "shell", task: "Execute script action" },
        TaskScope.Workspace,
        "Execute script action",
        "ms-teams-vscode-extension",
        new ShellExecution(wrappedCmd, {
          cwd: workingDirectory,
          env: env,
        })
      );
      task.isBackground = true;
      void tasks.executeTask(task);

      tasks.onDidEndTaskProcess((e: TaskProcessEndEvent) => {
        if (
          e.execution.task.name === "Execute script action" &&
          e.execution.task.source === "ms-teams-vscode-extension"
        ) {
          try {
            const output = fs.readFileSync(tempFile, "utf-8");
            fs.unlinkSync(tempFile); // Clean up temporary output file
            fs.unlinkSync(scriptFile); // Clean up temporary script file

            if (e.exitCode === 0) {
              resolve(output);
            } else {
              void window.showErrorMessage(
                `Execute task failed with exit code ${e.exitCode || ""}`
              );
              reject(
                new ScriptExecutionError(
                  `${this.localizer.commandExecutionErrorMessage(cmd)}\n${output}`,
                  `${this.localizer.commandExecutionErrorDisplayMessage(cmd)}\n${output}`
                )
              );
            }
          } catch (err) {
            reject(err);
          }
        }
      });
    });

    try {
      let output = "";
      if (timeout) {
        output = (await Promise.race([taskPromise, timeoutPromise])) || "";
      } else {
        output = await taskPromise;
      }
      return ok(output);
    } catch (error) {
      return err(this.assembleError(error));
    }
  }

  public async openFile(filePath: string): Promise<Result<boolean, FxError>> {
    const uri = Uri.file(filePath);
    const doc = await workspace.openTextDocument(uri);
    if (doc) {
      if (filePath.endsWith(".md")) {
        await commands.executeCommand("markdown.showPreview", uri);
      } else {
        await window.showTextDocument(doc);
      }
      return ok(true);
    } else {
      return err(
        new InternalUIError(
          this.localizer.internalErrorMessage(`workspace.openTextDocument('${filePath}')`),
          this.localizer.internalErrorDisplayMessage(`workspace.openTextDocument('${filePath}')`)
        )
      );
    }
  }
}
