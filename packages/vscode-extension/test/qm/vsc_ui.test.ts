// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { vi, expect } from "vitest";
import { createMock } from "../mocks/vitestMockUtils";
import {
  commands,
  DiagnosticCollection,
  Disposable,
  ExtensionContext,
  languages,
  QuickInputButton,
  QuickPick,
  tasks,
  Terminal,
  TextDocument,
  window,
  workspace,
} from "vscode";

import {
  err,
  ok,
  SelectFileConfig,
  SelectFolderConfig,
  SingleFileOrInputConfig,
  SingleSelectConfig,
  UserError,
} from "@microsoft/teamsfx-api";
import { FxQuickPickItem, sleep, UserCancelError } from "@microsoft/vscode-ui";
import { VsCodeUI } from "../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { VsCodeLogProvider } from "../../src/commonlib/log";
import { featureFlagManager } from "@microsoft/teamsfx-core";
import * as globalVariables from "../../src/globalVariables";

describe("UI Unit Tests", async () => {
  describe("Manually", () => {
    it("Show Progress 2", async () => {
      const VS_CODE_UI = new VsCodeUI(<ExtensionContext>{});
      const handler = VS_CODE_UI.createProgressBar("Test Progress Bar", 3);

      await handler.start("Prepare");
      await sleep(1);

      await handler.next("First step");
      await sleep(1);

      await handler.next("Second step");
      await sleep(1);

      await handler.next("Third step");
      await sleep(1);

      await handler.end(true);
    }, 30000);
  });

  describe("Select Folder", () => {
    it("has returns default folder", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SelectFolderConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        default: "default folder",
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "default" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      // const telemetryStub = vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectFolder(config);

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("default folder");
      }
      // expect(
      //   telemetryStub.calledOnceWith("select-folder", {
      //     "selected-option": "default",
      //   })
      // ).is.true;
    });

    it("has returns user cancel", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SelectFolderConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        default: "default folder",
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "browse" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      vi.spyOn(window, "showOpenDialog").mockResolvedValue(undefined);
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectFolder(config);

      expect(result.isErr()).is.true;
      if (result.isErr()) {
        expect(result.error instanceof UserCancelError).is.true;
      }
    });
  });

  describe("Select File", () => {
    it("has returns default file", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SelectFileConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        default: "default file",
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "default" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectFile(config);

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("default file");
      }
    });

    it("has returns user cancel", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SelectFileConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        default: "default folder",
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let onHideListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        onHideListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "browse" } as FxQuickPickItem];
        onHideListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      vi.spyOn(window, "showOpenDialog").mockResolvedValue(undefined);
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectFile(config);

      expect(result.isErr()).is.true;
      if (result.isErr()) {
        expect(result.error instanceof UserCancelError).is.true;
      }
    });

    it("has returns item in possible files", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SelectFileConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        default: "default folder",
        possibleFiles: [
          {
            id: "1",
            label: "1",
          },
          {
            id: "2",
            label: "2",
          },
        ],
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "1" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectFile(config);

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("1");
      }
    });

    it("has returns invalid input item id", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SelectFileConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        default: "default",
        possibleFiles: [
          {
            id: "default",
            label: "default",
          },
        ],
      };

      const result = await ui.selectFile(config);

      expect(result.isErr()).is.true;
      if (result.isErr()) {
        expect(result.error.name).to.equal("InvalidInput");
      }
    });

    it("selects a file which pass validation", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SelectFileConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        default: "default file",
        validation: (input: string) => {
          if (input === "default file") {
            return undefined;
          }
          return "validation failed";
        },
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "default" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });

      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const res = await ui.selectFile(config);
      expect(res.isOk()).is.true;
    });

    it("selects a file with error thrown when validating result", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SelectFileConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        default: "default file",
        validation: (input: string) => {
          throw new UserError("source", "name", "", "");
        },
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "default" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });

      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const res = await ui.selectFile(config);
      expect(res.isErr()).is.true;
    });
  });

  describe("Open File", () => {
    it("open the preview of Markdown file", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      vi.spyOn(workspace, "openTextDocument").mockResolvedValue({} as TextDocument);
      let executedCommand = "";
      vi.spyOn(commands, "executeCommand").mockImplementation((command: string, ...args: any[]) => {
        executedCommand = command;
        return Promise.resolve();
      });
      const showTextStub = vi.spyOn(window, "showTextDocument");

      const result = await ui.openFile("test.md");

      expect(result.isOk()).is.true;
      expect(showTextStub.calledOnce).to.be.false;
      expect(executedCommand).to.equal("markdown.showPreview");
    });
  });

  describe("single select", () => {
    it("select success with validation", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      let hasRun = false;
      const config: SingleSelectConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        options: [{ id: "1", label: "label1" }],
        validation: (input: string) => {
          if (input === "1") {
            hasRun = true;
            return undefined;
          }
        },
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.onDidTriggerItemButton.mockImplementation((listener: (e: any) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "1" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectOption(config);

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("1");
      }
    });

    it("select fail with validation", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const hasRun = false;
      const config: SingleSelectConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        options: [{ id: "1", label: "label1" }],
        validation: (input: string) => {
          throw new UserError("name", "source", "msg", "msg");
        },
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.onDidTriggerItemButton.mockImplementation((listener: (e: any) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "1" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectOption(config);

      expect(result.isErr()).is.true;
    });

    it("loads dynamic options in a short time", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SingleSelectConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        options: async () => {
          return Promise.resolve([{ id: "1", label: "label1" }]);
        },
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.onDidTriggerItemButton.mockImplementation((listener: (e: any) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "1" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectOption(config);

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("1");
      }
    });

    it("loads dynamic option in a short time and auto select", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SingleSelectConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        options: async () => {
          return Promise.resolve([{ id: "1", label: "label1" }]);
        },
        skipSingleOption: true,
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.onDidTriggerItemButton.mockImplementation((listener: (e: any) => unknown) => {
        return mockDisposable;
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectOption(config);

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("1");
      }
      vi.restoreAllMocks();
    });

    it("loads dynamic options in a short time and shows", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SingleSelectConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        options: async () => {
          return Promise.resolve([
            { id: "1", label: "label1" },
            { id: "2", label: "label2" },
          ]);
        },
        skipSingleOption: true,
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.onDidTriggerItemButton.mockImplementation((listener: (e: any) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "1" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectOption(config);

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("1");
        expect(mockQuickPick.show.called).is.true;
      }
      vi.restoreAllMocks();
    });

    it("loads dynamic option in a long time and shows", async function (this: Mocha.Context) {
      const clock = vi.useFakeTimers();
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SingleSelectConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        options: async () => {
          await sleep(1000);
          return Promise.resolve([{ id: "1", label: "label1" }]);
        },
        skipSingleOption: true,
      };

      const mockQuickPick = createMock<QuickPick<FxQuickPickItem>>();
      const mockDisposable = createMock<Disposable>();
      let acceptListener: (e: void) => any;
      mockQuickPick.onDidAccept.mockImplementation((listener: (e: void) => unknown) => {
        acceptListener = listener;
        return mockDisposable;
      });
      mockQuickPick.onDidHide.mockImplementation((listener: (e: void) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.onDidTriggerButton.mockImplementation(
        (listener: (e: QuickInputButton) => unknown) => {
          return mockDisposable;
        }
      );
      mockQuickPick.onDidTriggerItemButton.mockImplementation((listener: (e: any) => unknown) => {
        return mockDisposable;
      });
      mockQuickPick.show.mockImplementation(() => {
        mockQuickPick.selectedItems = [{ id: "1" } as FxQuickPickItem];
        acceptListener();
      });
      vi.spyOn(window, "createQuickPick").mockImplementation(() => {
        return mockQuickPick;
      });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const selectTask = ui.selectOption(config);
      await clock.tickAsync(1100);
      const result = await selectTask;

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("1");
        expect(mockQuickPick.show.called).is.true;
      }
      clock.restore();
      vi.restoreAllMocks();
    });
  });

  describe("Select local file or input", () => {
    it("selects local file successfully", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SingleFileOrInputConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        inputOptionItem: {
          id: "input",
          label: "input",
        },
        inputBoxConfig: {
          prompt: "prompt",
          title: "title",
          name: "input name",
        },
      };

      vi.spyOn(VsCodeUI.prototype, "selectFile").mockResolvedValue(
        ok({ type: "success", result: "file" })
      );
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectFileOrInput(config);

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("file");
      }
    });

    it("selects local file error", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SingleFileOrInputConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        inputOptionItem: {
          id: "input",
          label: "input",
        },
        inputBoxConfig: {
          prompt: "prompt",
          title: "title",
          name: "input name",
        },
      };

      vi.spyOn(VsCodeUI.prototype, "selectFile").mockResolvedValue(
        err(new UserError("source", "name", "msg", "msg"))
      );
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectFileOrInput(config);

      expect(result.isErr()).is.true;
      if (result.isErr()) {
        expect(result.error.name).to.equal("name");
      }
    });

    it("inputs a value sucessfully", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SingleFileOrInputConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        inputOptionItem: {
          id: "input",
          label: "input",
        },
        inputBoxConfig: {
          prompt: "prompt",
          title: "title",
          name: "input name",
        },
      };

      vi.spyOn(VsCodeUI.prototype, "selectFile").mockResolvedValue(
        ok({ type: "success", result: "input" })
      );
      vi.spyOn(VsCodeUI.prototype, "inputText").mockResolvedValue(
        ok({ type: "success", result: "testUrl" })
      );
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectFileOrInput(config);

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("testUrl");
      }
    });

    it("inputs a value error", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SingleFileOrInputConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        inputOptionItem: {
          id: "input",
          label: "input",
        },
        inputBoxConfig: {
          prompt: "prompt",
          title: "title",
          name: "input name",
        },
      };

      vi.spyOn(VsCodeUI.prototype, "selectFile").mockResolvedValue(
        ok({ type: "success", result: "input" })
      );
      vi.spyOn(VsCodeUI.prototype, "inputText").mockResolvedValue(
        err(new UserError("source", "name", "msg", "msg"))
      );
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectFileOrInput(config);

      expect(result.isErr()).is.true;
      if (result.isErr()) {
        expect(result.error.name).to.equal("name");
      }
    });

    it("inputs a value back and then sucessfully", async function (this: Mocha.Context) {
      const ui = new VsCodeUI(<ExtensionContext>{});
      const config: SingleFileOrInputConfig = {
        name: "name",
        title: "title",
        placeholder: "placeholder",
        inputOptionItem: {
          id: "input",
          label: "input",
        },
        inputBoxConfig: {
          prompt: "prompt",
          title: "title",
          name: "input name",
        },
      };

      vi.spyOn(VsCodeUI.prototype, "selectFile").mockResolvedValue(
        ok({ type: "success", result: "input" })
      );
      vi.spyOn(VsCodeUI.prototype, "inputText")
        .onFirstCall()
        .mockResolvedValue(ok({ type: "back" }))
        .onSecondCall()
        .mockResolvedValue(ok({ type: "success", result: "testUrl" }));
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");

      const result = await ui.selectFileOrInput(config);

      expect(result.isOk()).is.true;
      if (result.isOk()) {
        expect(result.value.result).to.equal("testUrl");
      }
    });
  });

  describe("showDiagnosticInfo", () => {
    let collection: DiagnosticCollection | undefined;

    afterEach(() => {
      vi.restoreAllMocks();
      globalVariables.setDiagnosticCollection(undefined as unknown as DiagnosticCollection);
    });

    it("do nothing if feature flag is disabled", () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      const ui = new VsCodeUI(<ExtensionContext>{});
      ui.showDiagnosticInfo([]);
    });

    it("show diagnostics first time if feature flag is enabled", () => {
      const records: [string, { message: string }][] = [];
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      collection = {
        set: (filePath: string, diag: { message: string }) => {
          records.push([filePath, diag]);
        },
      } as unknown as DiagnosticCollection;

      vi.spyOn(languages, "createDiagnosticCollection").mockReturnValue(collection as any);
      const ui = new VsCodeUI(<ExtensionContext>{});

      ui.showDiagnosticInfo([
        {
          startIndex: 0,
          startLine: 1,
          endIndex: 10,
          endLine: 10,
          severity: 2,
          filePath: "test",
          message: "error",
        },
      ]);

      expect(globalVariables.diagnosticCollection).not.undefined;
      expect(records.length).equals(1);
    });

    it("show diagnostics not first time if feature flag is enabled", () => {
      const records: [string, { message: string }][] = [];
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
      collection = {
        clear: () => {
          return;
        },
        set: (filePath: string, diag: { message: string }) => {
          records.push([filePath, diag]);
        },
      } as unknown as DiagnosticCollection;

      globalVariables.setDiagnosticCollection(collection);
      const ui = new VsCodeUI(<ExtensionContext>{});

      ui.showDiagnosticInfo([
        {
          startIndex: 0,
          startLine: 1,
          endIndex: 10,
          endLine: 10,
          severity: 2,
          filePath: "test",
          message: "error",
          code: {
            value: "test",
            link: "https://test.com",
          },
        },
      ]);

      expect(globalVariables.diagnosticCollection).not.undefined;
      expect(records.length).equals(1);
    });
  });
});
