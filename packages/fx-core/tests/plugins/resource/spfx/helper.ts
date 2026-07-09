// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  Colors,
  ConfirmConfig,
  ConfirmResult,
  FxError,
  IProgressHandler,
  InputTextConfig,
  InputTextResult,
  M365TokenProvider,
  MultiSelectConfig,
  MultiSelectResult,
  Result,
  SelectFileConfig,
  SelectFileResult,
  SelectFilesConfig,
  SelectFilesResult,
  SelectFolderConfig,
  SelectFolderResult,
  SingleSelectConfig,
  SingleSelectResult,
  UserInteraction,
  ok,
} from "@microsoft/teamsfx-api";
import faker from "faker";
import { QuestionNames } from "../../../../src/question";
import { vi } from "vitest";

export class TestHelper {
  static getFakePluginContext(
    appName: string,
    testFolder: string,
    framework: string | undefined,
    webpartName?: string
  ): any {
    const pluginContext = {
      projectSettings: {
        appName: appName,
      },
      root: testFolder,
      m365TokenProvider: mockM365TokenProvider(),
      answers: {},
    } as any;
    pluginContext.answers![QuestionNames.SPFxWebpartName] = webpartName
      ? webpartName
      : "helloworld";
    pluginContext.answers![QuestionNames.SPFxWebpartDesc] = "test";
    pluginContext.answers![QuestionNames.SPFxFramework] = framework;
    return pluginContext;
  }
}

export class MockUserInteraction implements UserInteraction {
  selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectOptions(config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  inputText(config: InputTextConfig): Promise<Result<InputTextResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectFile(config: SelectFileConfig): Promise<Result<SelectFileResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectFiles(config: SelectFilesConfig): Promise<Result<SelectFilesResult, FxError>> {
    throw new Error("Method not implemented.");
  }
  selectFolder(config: SelectFolderConfig): Promise<Result<SelectFolderResult, FxError>> {
    throw new Error("Method not implemented.");
  }

  openUrl(link: string): Promise<Result<boolean, FxError>> {
    throw new Error("Method not implemented.");
  }
  async showMessage(
    level: "info" | "warn" | "error",
    message: string,
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string | undefined, FxError>>;

  async showMessage(
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
    return ok("OK");
  }

  createProgressBar(title: string, totalSteps: number): IProgressHandler {
    const handler: IProgressHandler = {
      start: async (detail?: string): Promise<void> => {},
      next: async (detail?: string): Promise<void> => {},
      end: async (): Promise<void> => {},
    };
    return handler;
  }
  async confirm(config: ConfirmConfig): Promise<Result<ConfirmResult, FxError>> {
    return ok({ type: "success", result: true });
  }
}

export function mockM365TokenProvider(): M365TokenProvider {
  const provider = <M365TokenProvider>{};
  const mockTokenObject = {
    tid: faker.datatype.uuid(),
  };

  provider.getAccessToken = vi.fn().mockReturnValue(ok("token"));
  provider.getJsonObject = vi.fn().mockReturnValue(ok(mockTokenObject));
  return provider;
}
