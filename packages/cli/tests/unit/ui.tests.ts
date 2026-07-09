/* eslint-disable import-x/no-duplicates */
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Colors,
  InputTextConfig,
  LogLevel,
  MultiSelectConfig,
  SelectFileConfig,
  SelectFilesConfig,
  SelectFolderConfig,
  SingleSelectConfig,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import { SelectSubscriptionError, UserCancelError } from "@microsoft/teamsfx-core";
import { logger } from "../../src/commonlib/logger";
import * as customizedPrompts from "../../src/prompts";
import UI, { inquirerPrompts } from "../../src/userInteraction";
import { expect } from "./utils";
import mockedEnv from "mocked-env";
import { vi } from "vitest";
describe("User Interaction Tests", function () {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("selectOption", async () => {
    it("(Hardcode) Subscription: EmptySubConfigOptions Error", async () => {
      const config: SingleSelectConfig = {
        name: "subscription",
        title: "Select a subscription",
        options: [],
      };
      const result = await UI.selectOption(config);
      expect(result.isErr() && result.error instanceof SelectSubscriptionError);
    });

    it("(Hardcode) Subscription: only one sub", async () => {
      vi.spyOn(logger, "warning").mockReturnValue();
      const config: SingleSelectConfig = {
        name: "subscription",
        title: "Select a subscription",
        options: ["a"],
      };
      const result = await UI.selectOption(config);
      expect(result.isOk()).to.be.true;
    });

    it("Auto skip for single option (return object = true)", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: [
          {
            id: "a",
            cliName: "aa",
            label: "aaa",
          },
        ],
        skipSingleOption: true,
        returnObject: true,
      };
      const result = await UI.selectOption(config);
      expect(result.isOk());
      if (result.isOk()) {
        expect(result.value.result).deep.equals({
          id: "a",
          cliName: "aa",
          label: "aaa",
        });
      }
    });
    it("Auto skip for single option (return object = false)", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: [
          {
            id: "a",
            cliName: "aa",
            label: "aaa",
          },
        ],
        skipSingleOption: true,
        returnObject: false,
      };
      const result = await UI.selectOption(config);
      expect(result.isOk());
      if (result.isOk()) {
        expect(result.value.result).equals("a");
      }
    });

    it("Auto skip for single option 1", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: ["a"],
        skipSingleOption: true,
        returnObject: false,
      };
      const result = await UI.selectOption(config);
      expect(result.isOk());
      if (result.isOk()) {
        expect(result.value.result).equals("a");
      }
    });

    it("Auto skip for single option 2", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: ["a"],
        skipSingleOption: true,
        returnObject: true,
      };
      const result = await UI.selectOption(config);
      expect(result.isOk());
      if (result.isOk()) {
        expect(result.value.result).equals("a");
      }
    });

    it("Add description in title", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: [{ id: "id1", description: "some description", label: "label" }],
      };
      vi.spyOn(UI, "loadSelectDynamicData").mockResolvedValue(ok({} as any));
      vi.spyOn(UI, "singleSelect").mockResolvedValue(ok("id1"));
      const result = await UI.selectOption(config);
      expect(result.isOk());
      if (result.isOk()) {
        expect(result.value.result).equal("id1");
      }
    });

    it("No description in title", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: [{ id: "id1", label: "label" }],
      };
      vi.spyOn(UI, "loadSelectDynamicData").mockResolvedValue(ok({} as any));
      vi.spyOn(UI, "singleSelect").mockResolvedValue(ok("id1"));
      const result = await UI.selectOption(config);
      expect(result.isOk());
      if (result.isOk()) {
        expect(result.value.result).equal("id1");
      }
    });

    it("invalid option", async () => {
      vi.spyOn(UI, "singleSelect").mockResolvedValue(ok("c"));
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: ["a"],
      };
      const result = await UI.selectOption(config);
      expect(result.isErr());
      if (result.isErr()) {
        expect(result.error.name).equals("InputValidationError");
      }
    });
  });

  describe("selectOptions", () => {
    it("Auto skip for single option (return object = true)", async () => {
      const config: MultiSelectConfig = {
        name: "test",
        title: "test",
        options: [
          {
            id: "a",
            cliName: "aa",
            label: "aaa",
          },
        ],
        skipSingleOption: true,
        returnObject: true,
      };
      const result = await UI.selectOptions(config);
      expect(result.isOk());
      if (result.isOk()) {
        expect(result.value.result).deep.equals([
          {
            id: "a",
            cliName: "aa",
            label: "aaa",
          },
        ]);
      }
    });
    it("Auto skip for single option (return object = false)", async () => {
      const config: MultiSelectConfig = {
        name: "test",
        title: "test",
        options: [
          {
            id: "a",
            cliName: "aa",
            label: "aaa",
          },
        ],
        skipSingleOption: true,
        returnObject: false,
      };
      const result = await UI.selectOptions(config);
      expect(result.isOk());
      if (result.isOk()) {
        expect(result.value.result).deep.equals(["a"]);
      }
    });

    it("Auto skip for single option 1", async () => {
      const config: MultiSelectConfig = {
        name: "test",
        title: "test",
        options: ["a"],
        skipSingleOption: true,
        returnObject: false,
      };
      const result = await UI.selectOptions(config);
      expect(result.isOk());
      if (result.isOk()) {
        expect(result.value.result).deep.equals(["a"]);
      }
    });

    it("Auto skip for single option 2", async () => {
      const config: MultiSelectConfig = {
        name: "test",
        title: "test",
        options: ["a"],
        skipSingleOption: true,
        returnObject: true,
      };
      const result = await UI.selectOptions(config);
      expect(result.isOk());
      if (result.isOk()) {
        expect(result.value.result).deep.equals(["a"]);
      }
    });

    it("invalid options", async () => {
      vi.spyOn(UI, "multiSelect").mockResolvedValue(ok(["c"]));
      const config: MultiSelectConfig = {
        name: "test",
        title: "test",
        options: ["a"],
      };
      const result = await UI.selectOptions(config);
      expect(result.isErr());
      if (result.isErr()) {
        expect(result.error.name).equals("InputValidationError");
      }
    });
  });

  describe("multiSelect", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("interactive", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(true);
      vi.spyOn(customizedPrompts as any, "checkbox").mockImplementation(
        () => ["id1", "id2"] as any
      );
      const choices = [1, 2, 3].map((x) => ({
        id: `id${x}`,
        title: `title ${x}`,
        detail: `detail ${x}`,
      }));
      const result = await UI.multiSelect("test", "Select a string", choices, ["id1", "id2"]);
      expect(result.isOk() ? result.value : result.error).to.be.deep.equals(["id1", "id2"]);
    });

    it("non-interactive", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(false);
      const choices = [1, 2, 3].map((x) => ({
        id: `id${x}`,
        title: `title ${x}`,
        detail: `detail ${x}`,
      }));
      const result = await UI.multiSelect("test", "Select a string", choices, ["id1", "id2"]);
      expect(result.isOk() ? result.value : result.error).to.be.deep.equals(["id1", "id2"]);
    });

    it("non-interactive - no default value", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(false);
      const choices = [1, 2, 3].map((x) => ({
        id: `id${x}`,
        title: `title ${x}`,
        detail: `detail ${x}`,
      }));
      const result = await UI.multiSelect("test", "Select a string", choices);
      expect(result.isOk() ? result.value : result.error).to.be.deep.equals([]);
    });
  });

  describe("singleSelect", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("interactive", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(true);
      vi.spyOn(customizedPrompts as any, "select").mockImplementation(() => "id1" as any);
      const choices = [1, 2, 3].map((x) => ({
        id: `id${x}`,
        title: `title ${x}`,
        detail: `detail ${x}`,
      }));
      const result = await UI.singleSelect("test", "Select a string", choices, "id1");
      expect(result.isOk() ? result.value : result.error).to.be.deep.equals("id1");
    });
    it("non-interactive", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(false);
      const choices = [1, 2, 3].map((x) => ({
        id: `id${x}`,
        title: `title ${x}`,
        detail: `detail ${x}`,
      }));
      const result = await UI.singleSelect("test", "Select a string", choices, "id1");
      expect(result.isOk() ? result.value : result.error).to.be.deep.equals("id1");
    });
    it("non-interactive - no default value", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(false);
      const choices = [1, 2, 3].map((x) => ({
        id: `id${x}`,
        title: `title ${x}`,
        detail: `detail ${x}`,
      }));
      const result = await UI.singleSelect("test", "Select a string", choices);
      expect(result.isOk() ? result.value : result.error).to.be.deep.equals("id1");
    });
  });
  describe("_confirm", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("interactive", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(true);
      vi.spyOn(inquirerPrompts, "confirm").mockResolvedValue(false);
      const result = await UI._confirm("Select a string", false);
      expect(result.isOk() ? result.value : result.error).to.be.equals(false);
    });
    it("non-interactive", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(false);
      const result = await UI._confirm("Select a string", false);
      expect(result.isOk() ? result.value : result.error).to.be.equals(false);
    });
    it("non-interactive - no default value", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(false);
      const result = await UI._confirm("Select a string");
      expect(result.isOk() ? result.value : result.error).to.be.equals(true);
    });
  });
  describe("confirm", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("load default error", async () => {
      vi.spyOn(UI, "loadDefaultValue").mockResolvedValue(err(new UserCancelError()));
      const result = await UI.confirm({
        name: "test",
        title: "test",
        default: async () => true,
      });
      expect(result.isErr());
    });
    it("_confirm error", async () => {
      vi.spyOn(UI, "_confirm").mockResolvedValue(err(new UserCancelError()));
      const result = await UI.confirm({
        name: "test",
        title: "test",
      });
      expect(result.isErr());
    });
    it("confirm: yes", async () => {
      vi.spyOn(UI, "_confirm").mockResolvedValue(ok(true));
      const result = await UI.confirm({
        name: "test",
        title: "test",
      });
      expect(result.isOk());
    });
    it("confirm: no", async () => {
      vi.spyOn(UI, "_confirm").mockResolvedValue(ok(false));
      const result = await UI.confirm({
        name: "test",
        title: "test",
      });
      expect(result.isErr());
    });
  });
  describe("input", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("interactive", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(true);
      vi.spyOn(inquirerPrompts, "input").mockResolvedValue("abc");
      const result = await UI.input("test", "Input the password", "default string");
      expect(result.isOk() ? result.value : result.error).equals("abc");
    });
    it("non-interactive", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(false);
      const result = await UI.input("test", "Input the password", "default string");
      expect(result.isOk() ? result.value : result.error).equals("default string");
    });
    it("non-interactive - no default value", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(false);
      const result = await UI.input("test", "Input the password");
      expect(result.isOk() ? result.value : result.error).equals("");
    });
  });
  describe("password", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("interactive", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(true);
      vi.spyOn(inquirerPrompts, "password").mockResolvedValue("Password Result");
      const result = await UI.password("test", "Input the password");
      expect(result.isOk() ? result.value : result.error).equals("Password Result");
    });
    it("non-interactive", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(false);
      const result = await UI.password("test", "Input the password", "default string");
      expect(result.isOk() ? result.value : result.error).equals("default string");
    });
    it("non-interactive - no default value", async () => {
      vi.spyOn(UI, "interactive", "get").mockReturnValue(false);
      const result = await UI.password("test", "Input the password");
      expect(result.isOk() ? result.value : result.error).equals("");
    });
  });

  describe("other", async () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("interactive = true", async () => {
      const mockedEnvRestore = mockedEnv({
        CI_ENABLED: "true",
      });
      UI.interactive = true;
      expect(UI.interactive).equals(false);
      mockedEnvRestore();
    });
    it("interactive = false when ciEnabled", async () => {
      const mockedEnvRestore = mockedEnv({
        CI_ENABLED: "false",
      });
      UI.interactive = false;
      expect(UI.interactive).equals(false);
      mockedEnvRestore();
    });

    it("Create Progress Bar", async () => {
      UI.createProgressBar("title", 3);
    });

    it("Single Select File", async () => {
      vi.spyOn(UI, "inputText").mockResolvedValue(ok({ type: "success", result: "./" }));
      const config: SelectFileConfig = {
        name: "path",
        title: "Select a path",
      };
      const result = await UI.selectFile(config);
      expect(result.isOk() ? result.value.result : result.error).deep.equals("./");
    });

    it("Multi Select Files", async () => {
      vi.spyOn(UI, "inputText").mockResolvedValue(ok({ type: "success", result: "./;./" }));
      const config: SelectFilesConfig = {
        name: "paths",
        title: "Select a path",
      };
      const result = await UI.selectFiles(config);
      expect(result.isOk() ? result.value.result : result.error).deep.equals(["./", "./"]);
    });

    it("Select Folder", async () => {
      vi.spyOn(UI, "inputText").mockResolvedValue(ok({ type: "success", result: "./" }));
      const config: SelectFolderConfig = {
        name: "folder",
        title: "Select a folder",
      };
      const result = await UI.selectFolder(config);
      expect(result.isOk() ? result.value.result : result.error).deep.equals("./");
    });
    it("Input text", async () => {
      vi.spyOn(inquirerPrompts, "input").mockResolvedValue("abc");
      vi.spyOn(UI, "interactive", "get").mockReturnValue(true);
      const config: InputTextConfig = {
        name: "folder",
        title: "Select a folder",
        validation: () => {
          return undefined;
        },
        additionalValidationOnAccept: () => {
          return undefined;
        },
      };
      const result = await UI.inputText(config);
      expect(result.isOk() ? result.value.result : result.error).deep.equals("abc");
    });
  });

  describe("Show Message", () => {
    beforeEach(() => {
      vi.spyOn(logger, "info").mockReturnValue();
      vi.spyOn(logger, "warning").mockReturnValue();
      vi.spyOn(logger, "error").mockReturnValue();
    });
    const levels: ["info" | "warn" | "error", LogLevel][] = [
      ["info", LogLevel.Info],
      ["warn", LogLevel.Warning],
      ["error", LogLevel.Error],
    ];
    const msg1 = "No color";
    const msg2: Array<{ content: string; color: Colors }> = [
      { content: "BRIGHT_WHITE", color: Colors.BRIGHT_WHITE },
      { content: "WHITE", color: Colors.WHITE },
      { content: "BRIGHT_MAGENTA", color: Colors.BRIGHT_MAGENTA },
    ];
    const msgs = [msg1, msg2];
    const items = ["first", "second"];
    it("items.length is equal to 0", async () => {
      for (const [lv0, lv1] of levels) {
        for (const msg of msgs) {
          const result = await UI.showMessage(lv0, msg, false);
          expect(result.isOk()).to.be.true;
        }
      }
    });
    it("items.length is equal to 1 - confirm returns true", async () => {
      vi.spyOn(UI, "_confirm").mockResolvedValue(ok(true));
      const result = await UI.showMessage("info", msg1, true, items[0]);
      expect(result.isOk() && result.value === items[0]).to.be.true;
    });
    it("items.length is equal to 1 - confirm returns false", async () => {
      vi.spyOn(UI, "_confirm").mockResolvedValue(ok(false));
      const result = await UI.showMessage("info", msg1, true, items[0]);
      expect(result.isOk() && result.value === undefined).to.be.true;
    });
    it("items.length is equal to 1 - confirm returns error", async () => {
      vi.spyOn(UI, "_confirm").mockResolvedValue(err(new UserCancelError()));
      const result = await UI.showMessage("info", msg1, true, items[0]);
      expect(result.isErr()).to.be.true;
    });
    it("items.length is bigger than 1 - returns value", async () => {
      vi.spyOn(UI, "singleSelect").mockResolvedValue(ok(items[0]));
      const result = await UI.showMessage("info", msg1, false, items[0], items[1]);
      expect(result.isOk() && result.value === items[0]).to.be.true;
    });
    it("items.length is bigger than 1 - returns cancel", async () => {
      vi.spyOn(UI, "singleSelect").mockResolvedValue(ok("Cancel"));
      const result = await UI.showMessage("info", msg1, true, items[0], items[1]);
      expect(result.isOk() && result.value === undefined).to.be.true;
    });
    it("items.length is bigger than 1 - returns error", async () => {
      vi.spyOn(UI, "singleSelect").mockResolvedValue(err(new UserCancelError()));
      const result = await UI.showMessage("info", msg1, true, items[0], items[1]);
      expect(result.isErr()).to.be.true;
    });
  });
});
