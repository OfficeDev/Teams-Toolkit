import * as vscode from "vscode";
import * as globalVariables from "../../src/globalVariables";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { MockCore } from "../mocks/mockCore";
import { ok, err, UserError } from "@microsoft/teamsfx-api";
import { CollaborationState } from "@microsoft/teamsfx-core";
import VsCodeLogInstance from "../../src/commonlib/log";
import { manageCollaboratorHandler } from "../../src/handlers/collaboratorHandlers";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { vi, expect, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("manageCollaboratorHandler", () => {
  beforeEach(() => {
    vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
    vi.spyOn(VsCodeLogInstance, "outputChannel").value({
      name: "name",
      append: (value: string) => {},
      appendLine: (value: string) => {},
      replace: (value: string) => {},
      clear: () => {},
      show: (...params: any[]) => {},
      hide: () => {},
      dispose: () => {},
    });
  });

  it("happy path: grant permission", async () => {
    mockValue(globalVariables, "core", new MockCore());
    vi.spyOn(vsc_ui, "VS_CODE_UI").value({
      selectOption: () => Promise.resolve(ok({ type: "success", result: "grantPermission" })),
    });
    vi.spyOn(MockCore.prototype, "grantPermission").mockReturnValue(
      Promise.resolve(
        ok({
          state: CollaborationState.OK,
          userInfo: {
            userObjectId: "fake-user-object-id",
            userPrincipalName: "fake-user-principle-name",
          },
          permissions: [
            {
              name: "name",
              type: "type",
              resourceId: "id",
              roles: ["Owner"],
            },
          ],
        })
      )
    );

    const result = await manageCollaboratorHandler("env");
    expect(result.isOk()).equals(true);
  });

  it("happy path: list collaborator", async () => {
    mockValue(globalVariables, "core", new MockCore());
    vi.spyOn(vsc_ui, "VS_CODE_UI").value({
      selectOption: () => Promise.resolve(ok({ type: "success", result: "listCollaborator" })),
    });
    vi.spyOn(MockCore.prototype, "listCollaborator").mockReturnValue(
      Promise.resolve(
        ok({
          state: CollaborationState.OK,
          collaborators: [
            {
              userPrincipalName: "userPrincipalName",
              userObjectId: "userObjectId",
              isAadOwner: true,
              teamsAppResourceId: "teamsAppResourceId",
            },
          ],
        })
      )
    );

    const result = await manageCollaboratorHandler("env");
    expect(result.isOk()).equals(true);
  });

  it("happy path: list collaborator throws error", async () => {
    mockValue(globalVariables, "core", new MockCore());
    vi.spyOn(vsc_ui, "VS_CODE_UI").value({
      selectOption: () => Promise.resolve(ok({ type: "success", result: "listCollaborator" })),
    });
    vi.spyOn(MockCore.prototype, "listCollaborator").throws(new Error("Error"));

    const result = await manageCollaboratorHandler("env");
    expect(result.isErr()).equals(true);
  });

  it("happy path: list collaborator throws login error", async () => {
    mockValue(globalVariables, "core", new MockCore());
    vi.spyOn(vsc_ui, "VS_CODE_UI").value({
      selectOption: () => Promise.resolve(ok({ type: "success", result: "listCollaborator" })),
    });
    const showErrorMessageStub = vi
      .spyOn(vscode.window, "showErrorMessage")
      .mockResolvedValue(undefined);
    vi.spyOn(globalVariables.core, "listCollaborator").throws(
      new Error("Cannot get user login information")
    );

    const result = await manageCollaboratorHandler("env");
    expect(result.isErr()).equals(true);
    assert.isTrue(showErrorMessageStub.called);
  });

  it("User Cancel", async () => {
    mockValue(globalVariables, "core", new MockCore());
    vi.spyOn(vsc_ui, "VS_CODE_UI").value({
      selectOption: () =>
        Promise.resolve(err(new UserError("source", "errorName", "errorMessage"))),
    });

    const result = await manageCollaboratorHandler();
    expect(result.isErr()).equals(true);
  });
});
