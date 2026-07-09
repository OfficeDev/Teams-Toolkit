import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { LocalEnvManager, TaskOverallLabel } from "@microsoft/teamsfx-core";
import path from "path";
import * as vscode from "vscode";
import {
  DefaultPlaceholder,
  getTaskInfo,
  maskArrayValue,
  maskValue,
  UndefinedPlaceholder,
} from "../../src/debug/localTelemetryReporter";
import * as globalVariables from "../../src/globalVariables";

describe("LocalTelemetryReporter", () => {
  describe("maskValue()", () => {
    it("mask undefined value without known values", () => {
      const res = maskValue(undefined);
      assert.equal(res, UndefinedPlaceholder);
    });

    it("mask unknown value without known values", () => {
      const res = maskValue("unknown test value");
      assert.equal(res, "<unknown>");
    });

    it("mask undefined value with string known values", () => {
      const res = maskValue(undefined, ["test known value"]);
      assert.equal(res, UndefinedPlaceholder);
    });

    it("mask unknown value with string known values", () => {
      const res = maskValue("unknown test value", ["test known value"]);
      assert.equal(res, "<unknown>");
    });

    it("mask known value with string known values", () => {
      const res = maskValue("test known value", ["test known value"]);
      assert.equal(res, "test known value");
    });

    it("mask undefined value with mask value", () => {
      const res = maskValue(undefined, [{ value: "test known value", mask: DefaultPlaceholder }]);
      assert.equal(res, UndefinedPlaceholder);
    });

    it("mask unknown value with mask values", () => {
      const res = maskValue("unknown test value", [
        { value: "test known value", mask: DefaultPlaceholder },
      ]);
      assert.equal(res, "<unknown>");
    });

    it("mask known value with mask values", () => {
      const res = maskValue("test known value", [
        { value: "test known value", mask: DefaultPlaceholder },
      ]);
      assert.equal(res, DefaultPlaceholder);
    });
  });

  describe("maskArrayValue()", () => {
    it("mask undefined value without known values", () => {
      const res = maskArrayValue(undefined);
      assert.equal(res, UndefinedPlaceholder);
    });

    it("mask empty array value without known values", () => {
      const res = maskArrayValue([]);
      assert.sameDeepOrderedMembers(res as string[], []);
    });

    it("mask unknown array value without known values", () => {
      const res = maskArrayValue(["unknown test value1", "unknown test value2"]);
      assert.sameDeepOrderedMembers(res as string[], ["<unknown>", "<unknown>"]);
    });

    it("mask values with string known values", () => {
      const res = maskArrayValue(["test known value", "unknown test value"], ["test known value"]);
      assert.sameDeepOrderedMembers(res as string[], ["test known value", "<unknown>"]);
    });

    it("mask values with mask value", () => {
      const res = maskArrayValue(
        ["test known value"],
        [{ value: "test known value", mask: DefaultPlaceholder }]
      );
      assert.sameDeepOrderedMembers(res as string[], [DefaultPlaceholder]);
    });
  });

  describe("getTaskInfo()", () => {
    afterEach(async () => {
      vi.restoreAllMocks();
    });

    it("Failed to get task.json", async () => {
      mockValue(globalVariables, "isTeamsFxProject", true);
      vi.spyOn(globalVariables, "workspaceUri").value(
        vscode.Uri.parse(path.resolve(__dirname, "unknown"))
      );
      vi.spyOn(LocalEnvManager.prototype, "getTaskJson").mockReturnValue(
        Promise.resolve(undefined)
      );
      const res = await getTaskInfo();
      assert.isUndefined(res);
    });

    it("Failed to get renamed label", async () => {
      mockValue(globalVariables, "isTeamsFxProject", true);
      vi.spyOn(globalVariables, "workspaceUri").value(
        vscode.Uri.parse(path.resolve(__dirname, "data", "renameLabel"))
      );
      const res = await getTaskInfo();
      assert.isEmpty(res?.PreLaunchTaskInfo);
      assert.isFalse(res?.IsTransparentTask);
    });

    it("task.json of old tab project", async () => {
      mockValue(globalVariables, "isTeamsFxProject", true);
      vi.spyOn(globalVariables, "workspaceUri").value(
        vscode.Uri.parse(path.resolve(__dirname, "data", "oldTab"))
      );
      const res = await getTaskInfo();
      assert.exists(res?.PreLaunchTaskInfo);
      assert.sameDeepOrderedMembers(res?.PreLaunchTaskInfo?.[TaskOverallLabel.NextDefault] ?? [], [
        {
          command: "<unknown>",
          label: "<unknown>",
          type: "<unknown>",
        },
        {
          command: "<unknown>",
          label: "<unknown>",
          type: "<unknown>",
        },
        {
          command: UndefinedPlaceholder,
          label: "<unknown>",
          type: UndefinedPlaceholder,
        },
      ]);
      assert.isFalse(res?.IsTransparentTask);
    });

    it("task.json of a tab + bot + func project", async () => {
      mockValue(globalVariables, "isTeamsFxProject", true);
      vi.spyOn(globalVariables, "workspaceUri").value(
        vscode.Uri.parse(path.resolve(__dirname, "data", "tabbotfunc"))
      );
      const res = await getTaskInfo();
      assert.isTrue(res?.IsTransparentTask);
      assert.isUndefined(res?.PreLaunchTaskInfo?.[TaskOverallLabel.TransparentM365]);
      assert.exists(res?.PreLaunchTaskInfo?.[TaskOverallLabel.TransparentDefault]);
      assert.sameDeepOrderedMembers(
        res?.PreLaunchTaskInfo?.[TaskOverallLabel.TransparentDefault] ?? [],
        [
          {
            command: "debug-check-prerequisites",
            label: "Validate & install prerequisites",
            type: "teamsfx",
          },
          {
            command: "debug-npm-install",
            label: "Install npm packages",
            type: "teamsfx",
          },
          {
            command: "debug-start-local-tunnel",
            label: "Start local tunnel",
            type: "teamsfx",
          },
          {
            command: "debug-set-up-tab",
            label: "Set up tab",
            type: "teamsfx",
          },
          {
            command: "debug-set-up-bot",
            label: "Set up bot",
            type: "teamsfx",
          },
          {
            command: "debug-set-up-sso",
            label: "Set up SSO",
            type: "teamsfx",
          },
          {
            command: "debug-prepare-manifest",
            label: "Build & upload Teams manifest",
            type: "teamsfx",
          },
          {
            command: UndefinedPlaceholder,
            label: "Start services",
            type: UndefinedPlaceholder,
          },
        ]
      );
    });

    it("task.json of a m365 project", async () => {
      mockValue(globalVariables, "isTeamsFxProject", true);
      vi.spyOn(globalVariables, "workspaceUri").value(
        vscode.Uri.parse(path.resolve(__dirname, "data", "m365"))
      );
      const res = await getTaskInfo();
      assert.isTrue(res?.IsTransparentTask);
      assert.exists(res?.PreLaunchTaskInfo?.[TaskOverallLabel.TransparentM365]);
      assert.sameDeepOrderedMembers(
        res?.PreLaunchTaskInfo?.[TaskOverallLabel.TransparentM365] ?? [],
        [
          {
            command: "debug-check-prerequisites",
            label: "Validate & install prerequisites",
            type: "teamsfx",
          },
          {
            command: "debug-npm-install",
            label: "Install npm packages",
            type: "teamsfx",
          },
          {
            command: "debug-set-up-tab",
            label: "Set up tab",
            type: "teamsfx",
          },
          {
            command: "debug-set-up-sso",
            label: "Set up SSO",
            type: "teamsfx",
          },
          {
            command: "debug-prepare-manifest",
            label: "Build & upload Teams manifest",
            type: "teamsfx",
          },
          {
            command: UndefinedPlaceholder,
            label: "Start services",
            type: UndefinedPlaceholder,
          },
          {
            command: "<unknown>",
            label: "Install app in Teams",
            type: "<unknown>",
          },
        ]
      );
      assert.exists(res?.PreLaunchTaskInfo?.[TaskOverallLabel.TransparentDefault]);
      assert.sameDeepOrderedMembers(
        res?.PreLaunchTaskInfo?.[TaskOverallLabel.TransparentDefault] ?? [],
        [
          {
            command: "debug-check-prerequisites",
            label: "Validate & install prerequisites",
            type: "teamsfx",
          },
          {
            command: "debug-npm-install",
            label: "Install npm packages",
            type: "teamsfx",
          },
          {
            command: "debug-set-up-tab",
            label: "Set up tab",
            type: "teamsfx",
          },
          {
            command: "debug-set-up-sso",
            label: "Set up SSO",
            type: "teamsfx",
          },
          {
            command: "debug-prepare-manifest",
            label: "Build & upload Teams manifest",
            type: "teamsfx",
          },
          {
            command: UndefinedPlaceholder,
            label: "Start services",
            type: UndefinedPlaceholder,
          },
        ]
      );
    });
    it("task.json of user customized project", async () => {
      mockValue(globalVariables, "isTeamsFxProject", true);
      vi.spyOn(globalVariables, "workspaceUri").value(
        vscode.Uri.parse(path.resolve(__dirname, "data", "customized"))
      );
      const res = await getTaskInfo();
      assert.isTrue(res?.IsTransparentTask);
      assert.isUndefined(res?.PreLaunchTaskInfo?.[TaskOverallLabel.TransparentM365]);
      assert.exists(res?.PreLaunchTaskInfo?.[TaskOverallLabel.TransparentDefault]);
      assert.sameDeepOrderedMembers(
        res?.PreLaunchTaskInfo?.[TaskOverallLabel.TransparentDefault] ?? [],
        [
          {
            command: "debug-npm-install",
            label: "Install npm packages",
            type: "teamsfx",
          },
          {
            command: "<unknown>",
            label: "<unknown>",
            type: "<unknown>",
          },
          {
            command: "debug-set-up-tab",
            label: "<unknown>",
            type: "teamsfx",
          },
          {
            command: "debug-set-up-bot",
            label: "<unknown>",
            type: "teamsfx",
          },
          {
            command: "debug-set-up-sso",
            label: "Set up SSO",
            type: "teamsfx",
          },
          {
            command: "debug-prepare-manifest",
            label: "Build & upload Teams manifest",
            type: "teamsfx",
          },
          {
            command: UndefinedPlaceholder,
            label: "Start services",
            type: UndefinedPlaceholder,
          },
        ]
      );
    });
  });
});
