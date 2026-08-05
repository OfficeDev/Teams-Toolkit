// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform, err, ok } from "@microsoft/teamsfx-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { teamsappMgr } from "../../src/component/driver/teamsApp/teamsappMgr";
import { PackageService } from "../../src/component/m365/packageService";
import { envUtil } from "../../src/component/utils/envUtil";
import { FxCore } from "../../src/core/FxCore";
import { FxCoreClient } from "../../src/core/FxCoreClient";
import { UserCancelError } from "../../src/error";
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

  it("provision_CompletedOperation_ReturnsEnvironmentOutputs", async () => {
    const controller = new AbortController();
    const provisionSpy = vi.spyOn(FxCore.prototype, "provisionResources").mockResolvedValue(ok());
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({ APP_ID: "app-id" }));
    const client = new FxCoreClient(new MockTools());

    const result = await client.provision(
      { platform: Platform.CLI, projectPath: "project", env: "dev" },
      { signal: controller.signal }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outputs).toEqual({ APP_ID: "app-id" });
    }
    expect(provisionSpy).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal })
    );
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

  it("package_AbortedDuringOperation_ReturnsUserCancel", async () => {
    const controller = new AbortController();
    vi.spyOn(FxCore.prototype, "packageTeamsAppCLIV3").mockImplementation(async () => {
      controller.abort();
      return ok();
    });
    const client = new FxCoreClient(new MockTools());

    const result = await client.package(
      { platform: Platform.CLI, projectPath: "project", env: "dev" },
      { signal: controller.signal }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("UserCancel");
    }
  });

  it("publish_CompletedOperation_ReturnsPackagePath", async () => {
    const publishSpy = vi.spyOn(FxCore.prototype, "publishTeamsAppCLIV3").mockResolvedValue(ok());
    const controller = new AbortController();
    const client = new FxCoreClient(new MockTools());

    const result = await client.publish(
      {
        platform: Platform.CLI,
        projectPath: "project",
        env: "dev",
        "package-file": "app.zip",
      },
      { signal: controller.signal }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.packagePath).toBe("app.zip");
    }
    expect(publishSpy).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal })
    );
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

  it("validate_WarningsAndNotes_MapsAllIssueSeverities", async () => {
    vi.spyOn(teamsappMgr, "validateTeamsAppForClient").mockResolvedValue(
      ok({
        status: "Accepted",
        errors: [],
        warnings: [
          {
            id: "warning-id",
            code: "warning-code",
            content: "",
            filePath: "",
            shortCodeNumber: 1,
            title: "Warning title",
            validationCategory: "manifest",
            helpUrl: "https://example.com/warning",
          },
        ],
        notes: [
          {
            id: "note-id",
            content: "Note content",
            shortCodeNumber: 2,
            title: "Note title",
            validationCategory: "manifest",
          },
        ],
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
        valid: true,
        issues: [
          {
            severity: "warning",
            message: "Warning title",
            path: undefined,
            code: "warning-code",
            helpUrl: "https://example.com/warning",
          },
          {
            severity: "info",
            message: "Note content",
            code: "note-id",
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

  it("getLaunchInfo_ManifestId_ReturnsServiceDocument", async () => {
    const launchInfo = { acquisition: { titleId: "T_test" }, name: "Test agent" };
    const serviceSpy = vi
      .spyOn(PackageService.prototype, "getLaunchInfoByManifestId")
      .mockResolvedValue(launchInfo);
    const controller = new AbortController();
    const client = new FxCoreClient(new MockTools());

    const result = await client.getLaunchInfo(
      { manifestId: "manifest-id" },
      { signal: controller.signal }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual(launchInfo);
    }
    expect(serviceSpy).toHaveBeenCalledWith("fakeToken", "manifest-id", controller.signal);
  });

  it("getLaunchInfo_AbortedAfterRequest_ReturnsUserCancel", async () => {
    const controller = new AbortController();
    vi.spyOn(PackageService.prototype, "getLaunchInfoByTitleId").mockImplementation(async () => {
      controller.abort();
      return { name: "Test agent" };
    });
    const client = new FxCoreClient(new MockTools());

    const result = await client.getLaunchInfo({ titleId: "T_test" }, { signal: controller.signal });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("UserCancel");
    }
  });

  it("getLaunchInfo_AbortedRequestThrows_ReturnsUserCancel", async () => {
    const controller = new AbortController();
    vi.spyOn(PackageService.prototype, "getLaunchInfoByTitleId").mockImplementation(async () => {
      controller.abort();
      throw new Error("aborted");
    });
    const client = new FxCoreClient(new MockTools());

    const result = await client.getLaunchInfo({ titleId: "T_test" }, { signal: controller.signal });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).toBe("UserCancel");
    }
  });

  it("getLaunchInfo_RequestThrows_ReturnsAssembledError", async () => {
    vi.spyOn(PackageService.prototype, "getLaunchInfoByTitleId").mockRejectedValue(
      new Error("service failure")
    );
    const client = new FxCoreClient(new MockTools());

    const result = await client.getLaunchInfo({ titleId: "T_test" });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.name).not.toBe("UserCancel");
    }
  });

  it("lifecycleOperations_EngineFailure_ReturnsOriginalError", async () => {
    const expectedError = new UserCancelError("test");
    vi.spyOn(FxCore.prototype, "provisionResources").mockResolvedValue(err(expectedError));
    vi.spyOn(FxCore.prototype, "packageTeamsAppCLIV3").mockResolvedValue(err(expectedError));
    vi.spyOn(FxCore.prototype, "publishTeamsAppCLIV3").mockResolvedValue(err(expectedError));
    vi.spyOn(teamsappMgr, "validateTeamsAppForClient").mockResolvedValue(err(expectedError));
    vi.spyOn(FxCore.prototype, "uninstall").mockResolvedValue(err(expectedError));
    const client = new FxCoreClient(new MockTools());
    const inputs = { platform: Platform.CLI, projectPath: "project", env: "dev" };

    const results = await Promise.all([
      client.provision(inputs),
      client.package(inputs),
      client.publish(inputs),
      client.validate(inputs),
      client.uninstall({ ...inputs, options: [] }),
    ]);

    for (const result of results) {
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(expectedError);
      }
    }
  });

  it("uninstall_CompletedOperation_ReturnsRemovedOptions", async () => {
    const uninstallSpy = vi.spyOn(FxCore.prototype, "uninstall").mockResolvedValue(ok());
    const controller = new AbortController();
    const client = new FxCoreClient(new MockTools());
    const inputs = {
      platform: Platform.CLI,
      projectPath: "project",
      options: ["m365-app"],
    };

    const result = await client.uninstall(inputs, { signal: controller.signal });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.removed).toEqual(["m365-app"]);
    }
    expect(uninstallSpy).toHaveBeenCalledWith(
      expect.objectContaining({ abortSignal: controller.signal })
    );
  });
});
