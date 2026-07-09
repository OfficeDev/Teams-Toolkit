// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import { Mutex } from "async-mutex";
import * as util from "util";
import { ProgressLocation, window } from "vscode";

import { IProgressHandler, ok } from "@microsoft/teamsfx-api";
import * as localizeUtils from "../utils/localizeUtils";

export class ProgressHandler implements IProgressHandler {
  private totalSteps: number;
  private currentStep: number;
  private title: string;
  private detail?: string;
  private ended: boolean;
  private mutex: Mutex;
  private view: string;

  private resolve?: (value: unknown) => void;

  constructor(title: string, totalSteps: number, view: "output" | "terminal" = "output") {
    this.totalSteps = totalSteps;
    this.currentStep = 0;
    this.title = title;
    this.ended = false;
    this.mutex = new Mutex();
    this.view = view;
  }

  private generateWholeMessage(): string {
    const head = this.title;
    const step = `[${this.currentStep}/${this.totalSteps}]`;
    let tail = "";
    if (this.view === "output") {
      tail = ` ${util.format(
        localizeUtils.localize("teamstoolkit.progressHandler.showOutputLink"),
        "command:fx-extension.showOutputChannel"
      )}`;
    } else if (this.view === "terminal") {
      tail = ` ${util.format(
        localizeUtils.localize("teamstoolkit.progressHandler.showTerminalLink"),
        "command:workbench.action.terminal.focus"
      )}`;
    }
    const detail = this.detail
      ? ` ${this.detail}`
      : localizeUtils.localize("teamstoolkit.progressHandler.prepareTask");

    return util.format(
      localizeUtils.localize("teamstoolkit.progressHandler.reloadNotice"),
      `${head}: ${step}`,
      detail,
      tail
    );
  }

  public start(detail?: string): Promise<void> {
    this.resolve = undefined;
    this.currentStep = 0;
    this.ended = false;

    this.detail = detail;

    void window.withProgress(
      {
        location: ProgressLocation.Notification,
        cancellable: false,
      },
      async (progress) => {
        do {
          const status = { message: this.generateWholeMessage() };
          progress.report(status);
          await new Promise((_resolve) => (this.resolve = _resolve));
        } while (!this.ended);
        return ok(null);
      }
    );
    return Promise.resolve(undefined);
  }

  public end(success: boolean) {
    this.ended = true;
    if (this.resolve) {
      this.resolve(null);
    }
    return Promise.resolve(undefined);
  }

  public async next(detail?: string) {
    await this.mutex.runExclusive(() => {
      this.detail = detail;
      this.currentStep++;
      this.totalSteps = Math.max(this.currentStep, this.totalSteps);
      if (this.resolve) {
        this.resolve(null);
      }
    });
  }
}
