// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform, ok } from "@microsoft/teamsfx-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { teamsappMgr } from "../../src/component/driver/teamsApp/teamsappMgr";
import { PackageService } from "../../src/component/m365/packageService";
import { FxCore } from "../../src/core/FxCore";
import { FxCoreClient } from "../../src/core/FxCoreClient";
import { MockTools } from "./utils";

describe("FxCoreClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("provision_PreAbortedSignal_DoesNotInvokeEngine", async () => {
    const provisionSpy = vi.spyOn(FxCore.prototype, "provisionResources");
    const controller = new AbortController();
    controller.abort();
    const client = new FxCoreClient(new MockTools());

    const result = await client.provision(
      { platform: Platform.CLI, projectPath: "project", env: "dev" },
      { signal: controller.signal }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("UserCancel");
    }
    expect(provisionSpy).not.toHaveBeenCalled();
  });

  it("package_CompletedOperation_ReturnsProducedPath", async () => {
    vi.spyOn(FxCore.prototype, "packageTeamsAppCLIV3").mockImplementation(async (inputs) => {
      inputs["output-package-file"] = "project/appPackage/build/appPackage.dev.zip";
      return ok(undefined);
    });
    const client = new FxCoreClient(new MockTools());

    const result = await client.package({
      platform: Platform.CLI,
      projectPath: "project",
      env: "dev",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.packagePath).toBe("project/appPackage/build/appPackage.dev.zip");
    }
  });

  it("validate_RejectedPackage_ReturnsSuccessfulDomainOutcome", async () => {
    vi.spyOn(teamsappMgr, "validateTeamsAppForClient").mockResolvedValue(
      ok({
        status: "Rejected",
        errors: [
          {
            id: "invalid-manifest",
            content: "The manifest is invalid.",
            filePath: "manifest.json",
            shortCodeNumber: 1,
            title: "Invalid manifest",
            validationCategory: "manifest",
          },
        ],
        warnings: [],
        notes: [],
        addInDetails: {
          displayName: "Test app",
          developerName: "Test developer",
          version: "1.0.0",
          manifestVersion: "1.22",
        },
      })
    );
    const client = new FxCoreClient(new MockTools());

    const result = await client.validate({
      platform: Platform.CLI,
      projectPath: "project",
      "package-file": "app.zip",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        valid: false,
        issues: [
          {
            severity: "error",
            message: "The manifest is invalid.",
            path: "manifest.json",
            code: "invalid-manifest",
            helpUrl: undefined,
          },
        ],
      });
    }
  });

  it("getLaunchInfo_TitleId_ReturnsServiceDocument", async () => {
    const launchInfo = { acquisition: { titleId: "T_test" }, name: "Test agent" };
    const serviceSpy = vi
      .spyOn(PackageService.prototype, "getLaunchInfoByTitleId")
      .mockResolvedValue(launchInfo);
    const controller = new AbortController();
    const client = new FxCoreClient(new MockTools());

    const result = await client.getLaunchInfo({ titleId: "T_test" }, { signal: controller.signal });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(launchInfo);
    }
    expect(serviceSpy).toHaveBeenCalledWith("fakeToken", "T_test", controller.signal);
  });
});
