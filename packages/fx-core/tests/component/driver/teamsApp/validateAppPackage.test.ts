// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform, TeamsAppManifest, err } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import mockedEnv from "mocked-env";
import { chai, expect, vi } from "vitest";
import { teamsDevPortalClient } from "../../../../src/client/teamsDevPortalClientProvider";
import { SovereignCloudEnvironment } from "../../../../src/common/accountUtils";
import { FeatureFlagName } from "../../../../src/common/featureFlags";
import {
  Constants,
  GeneralValidationErrorId,
} from "../../../../src/component/driver/teamsApp/constants";
import { AppStudioError } from "../../../../src/component/driver/teamsApp/errors";
import { ValidateAppPackageArgs } from "../../../../src/component/driver/teamsApp/interfaces/ValidateAppPackageArgs";
import { IAppValidationNote } from "../../../../src/component/driver/teamsApp/interfaces/appdefinitions/IValidationResult";
import { ValidateAppPackageDriver } from "../../../../src/component/driver/teamsApp/validateAppPackage";
import { metadataUtil } from "../../../../src/component/utils/metadataUtil";
import { UserCancelError } from "../../../../src/error";
import { MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";

describe("teamsApp/validateAppPackage", async () => {
  const teamsAppDriver = new ValidateAppPackageDriver();
  let restoreEnv: (() => void) | undefined;
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
    projectPath: "./",
  };
  const contextWithoutUI: any = {
    m365TokenProvider: new MockedM365Provider(),
    logProvider: new MockedLogProvider(),
    projectPath: "./",
  };

  afterEach(() => {
    vi.restoreAllMocks();
    (mockedDriverContext.logProvider as MockedLogProvider).msg = "";
    restoreEnv?.();
    restoreEnv = undefined;
  });

  beforeEach(() => {
    vi.spyOn(metadataUtil, "parseManifest").mockReturnValue(undefined);
  });

  it("validateForClient_RejectedPackage_ReturnsStructuredOutcome", async () => {
    const controller = new AbortController();
    const validationResult = {
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
    };
    const validationSpy = vi
      .spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation")
      .mockResolvedValue(validationResult);
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("package"));

    const result = await teamsAppDriver.validateForClient(
      { appPackagePath: "fakePath" },
      { ...mockedDriverContext, signal: controller.signal }
    );

    chai.assert(result.isOk());
    if (result.isOk()) {
      expect(result.value).toEqual(validationResult);
    }
    expect(validationSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      controller.signal
    );
  });

  it("validateForClient_PreAbortedSignal_DoesNotInvokeService", async () => {
    const controller = new AbortController();
    controller.abort();
    const validationSpy = vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation");

    const result = await teamsAppDriver.validateForClient(
      { appPackagePath: "fakePath" },
      { ...mockedDriverContext, signal: controller.signal }
    );

    chai.assert(result.isErr());
    if (result.isErr()) {
      expect(result.error.name).toBe("UserCancel");
    }
    expect(validationSpy).not.toHaveBeenCalled();
  });

  it("validateForClient_EmptyPackagePath_ReturnsInputError", async () => {
    const pathExistsSpy = vi.spyOn(fs, "pathExists");

    const result = await teamsAppDriver.validateForClient(
      { appPackagePath: "" },
      mockedDriverContext
    );

    chai.assert(result.isErr());
    expect(pathExistsSpy).not.toHaveBeenCalled();
  });

  it("validateForClient_MissingPackage_ReturnsFileNotFound", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);

    const result = await teamsAppDriver.validateForClient(
      { appPackagePath: "missing.zip" },
      mockedDriverContext
    );

    chai.assert(result.isErr());
    if (result.isErr()) {
      expect(result.error.name).toBe(AppStudioError.FileNotFoundError.name);
    }
  });

  it("validateForClient_AbortedAfterReadingPackage_ReturnsUserCancel", async () => {
    const controller = new AbortController();
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      controller.abort();
      return Buffer.from("package");
    });
    const tokenSpy = vi.spyOn(mockedDriverContext.m365TokenProvider, "getAccessToken");

    const result = await teamsAppDriver.validateForClient(
      { appPackagePath: "app.zip" },
      { ...mockedDriverContext, signal: controller.signal }
    );

    chai.assert(result.isErr());
    if (result.isErr()) {
      expect(result.error.name).toBe("UserCancel");
    }
    expect(tokenSpy).not.toHaveBeenCalled();
  });

  it("validateForClient_TokenFailure_ReturnsOriginalError", async () => {
    const expectedError = new UserCancelError("test");
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("package"));
    vi.spyOn(mockedDriverContext.m365TokenProvider, "getAccessToken").mockResolvedValue(
      err(expectedError)
    );

    const result = await teamsAppDriver.validateForClient(
      { appPackagePath: "app.zip" },
      mockedDriverContext
    );

    chai.assert(result.isErr());
    if (result.isErr()) {
      expect(result.error).toBe(expectedError);
    }
  });

  it("validateForClient_AbortedAfterServiceCall_ReturnsUserCancel", async () => {
    const controller = new AbortController();
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("package"));
    vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation").mockImplementation(
      async () => {
        controller.abort();
        return {
          status: "Accepted",
          errors: [],
          warnings: [],
          notes: [],
          addInDetails: {
            displayName: "Test app",
            developerName: "Test developer",
            version: "1.0.0",
            manifestVersion: "1.22",
          },
        };
      }
    );

    const result = await teamsAppDriver.validateForClient(
      { appPackagePath: "app.zip" },
      { ...mockedDriverContext, signal: controller.signal }
    );

    chai.assert(result.isErr());
    if (result.isErr()) {
      expect(result.error.name).toBe("UserCancel");
    }
  });

  it("validateForClient_AbortedServiceThrows_ReturnsUserCancel", async () => {
    const controller = new AbortController();
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("package"));
    vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation").mockImplementation(
      async () => {
        controller.abort();
        throw new Error("aborted");
      }
    );

    const result = await teamsAppDriver.validateForClient(
      { appPackagePath: "app.zip" },
      { ...mockedDriverContext, signal: controller.signal }
    );

    chai.assert(result.isErr());
    if (result.isErr()) {
      expect(result.error.name).toBe("UserCancel");
    }
  });

  it("validateForClient_ServiceThrows_ReturnsAssembledError", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from("package"));
    vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation").mockRejectedValue(
      new Error("service failure")
    );

    const result = await teamsAppDriver.validateForClient(
      { appPackagePath: "app.zip" },
      mockedDriverContext
    );

    chai.assert(result.isErr());
    if (result.isErr()) {
      expect(result.error.name).not.toBe("UserCancel");
    }
  });

  it("file not found - app package", async () => {
    const args: ValidateAppPackageArgs = {
      appPackagePath: "fakepath",
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(AppStudioError.FileNotFoundError.name, result.error.name);
    }
  });

  it("skip validation in GCCH", async () => {
    restoreEnv = mockedEnv({
      [FeatureFlagName.SovereignCloudEnvironment]: SovereignCloudEnvironment.GCCH,
    });
    const partnerCenterValidationSpy = vi.spyOn(
      teamsDevPortalClient,
      "partnerCenterAppPackageValidation"
    );
    const pathExistsStub = vi.spyOn(fs, "pathExists");

    const args: ValidateAppPackageArgs = {
      appPackagePath: "fakePath",
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    expect(partnerCenterValidationSpy).not.toHaveBeenCalled();
    expect(pathExistsStub).not.toHaveBeenCalled();
  });

  it("skip validation in DoD", async () => {
    restoreEnv = mockedEnv({
      [FeatureFlagName.SovereignCloudEnvironment]: SovereignCloudEnvironment.DOD,
    });
    const partnerCenterValidationSpy = vi.spyOn(
      teamsDevPortalClient,
      "partnerCenterAppPackageValidation"
    );
    const pathExistsStub = vi.spyOn(fs, "pathExists");

    const args: ValidateAppPackageArgs = {
      appPackagePath: "fakePath",
    };

    const result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());
    expect(partnerCenterValidationSpy).not.toHaveBeenCalled();
    expect(pathExistsStub).not.toHaveBeenCalled();
  });

  it("validate app package - error", async () => {
    vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation").mockResolvedValue({
      errors: [
        {
          id: "fakeId",
          content: "Reserved Tab Name property should not be specified.",
          filePath: "",
          helpUrl: "https://docs.microsoft.com",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
        {
          id: "fakeId",
          content: "Reserved Tab Name property should not be specified.",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
        {
          id: GeneralValidationErrorId,
          content: "content",
          code: "Invalid TypeB Plugin document",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
        {
          id: GeneralValidationErrorId,
          content: "content",
          code: "Invalid DC document",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
        {
          id: GeneralValidationErrorId,
          content: "content with code missing",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
      ],
      status: "Rejected",
      warnings: [
        {
          id: "fakeId",
          content: "Valid domains cannot contain a hosting site with a wildcard.",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "domain",
          title: "valid domain",
        },
        {
          id: "fakeId",
          content: "Valid domains cannot contain a hosting site with a wildcard.",
          filePath: "",
          helpUrl: "https://docs.microsoft.com",
          shortCodeNumber: 123,
          validationCategory: "domain",
          title: "valid domain",
        },
      ],
      notes: [
        {
          id: "fakeId",
          content: "Schema URL is present.",
          title: "schema",
        },
      ],
      addInDetails: {
        displayName: "fake name",
        developerName: "fake name",
        version: "1.14.1",
        manifestVersion: "1.14.1",
      },
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    // vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(""));
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });
    vi.spyOn(metadataUtil, "parseManifest");

    const args: ValidateAppPackageArgs = {
      appPackagePath: "fakePath",
      showMessage: true,
    };
    let result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());

    result = (await teamsAppDriver.execute(args, contextWithoutUI)).result;
    chai.assert(result.isErr());

    const msg = (mockedDriverContext.logProvider as MockedLogProvider).msg;
    chai.assert(
      msg.includes("Invalid API Plugin document") &&
        msg.includes("Invalid DC document") &&
        msg.includes("content with code missing")
    );
  });

  it("validate app package - no error", async () => {
    vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation").mockResolvedValue({
      errors: [],
      status: "Accepted",
      warnings: [],
      notes: [
        {
          id: "fakeId",
          content: "Schema URL is present.",
          title: "schema",
        },
        {
          id: "632652a7-0cf8-43c7-a65d-6a19e5822467",
          title: "Manifest Version is valid",
          code: "The app is using manifest version '1.17'",
        } as any as IAppValidationNote,
      ],
      addInDetails: {
        displayName: "fake name",
        developerName: "fake name",
        version: "1.14.1",
        manifestVersion: "1.14.1",
      },
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    // vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(""));
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });
    vi.spyOn(metadataUtil, "parseManifest");

    const args: ValidateAppPackageArgs = {
      appPackagePath: "fakePath",
      showMessage: true,
    };
    let result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isOk());

    result = (await teamsAppDriver.execute(args, contextWithoutUI)).result;
    chai.assert(result.isOk());
  });

  it("validate app package - stop-on-error", async () => {
    vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation").mockResolvedValue({
      errors: [
        {
          id: "fakeId",
          content: "Reserved Tab Name property should not be specified.",
          filePath: "",
          helpUrl: "https://docs.microsoft.com",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
      ],
      status: "Rejected",
      warnings: [],
      notes: [],
      addInDetails: {
        displayName: "fake name",
        developerName: "fake name",
        version: "1.14.1",
        manifestVersion: "1.14.1",
      },
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    // vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(""));
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });
    vi.spyOn(metadataUtil, "parseManifest");

    const args: ValidateAppPackageArgs = {
      appPackagePath: "fakePath",
      showMessage: false,
    };
    let result = (await teamsAppDriver.execute(args, mockedDriverContext)).result;
    chai.assert(result.isErr());

    result = (await teamsAppDriver.execute(args, contextWithoutUI)).result;
    chai.assert(result.isErr());
  });

  it("errors - cli", async () => {
    vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation").mockResolvedValue({
      errors: [
        {
          id: "fakeId",
          content: "Reserved Tab Name property should not be specified.",
          filePath: "",
          helpUrl: "https://docs.microsoft.com",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
        {
          id: "fakeId",
          content: "Reserved Tab Name property should not be specified.",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
        {
          id: GeneralValidationErrorId,
          content: "content",
          code: "Invalid TypeB Plugin document",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
        {
          id: GeneralValidationErrorId,
          content: "content",
          code: "Invalid DC document",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
        {
          id: GeneralValidationErrorId,
          content: "content with code missing",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
      ],
      status: "Rejected",
      warnings: [
        {
          id: "fakeId",
          content: "Valid domains cannot contain a hosting site with a wildcard.",
          filePath: "",
          helpUrl: "https://docs.microsoft.com",
          shortCodeNumber: 123,
          validationCategory: "domain",
          title: "valid domain",
        },
        {
          id: "fakeId",
          content: "Valid domains cannot contain a hosting site with a wildcard.",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "domain",
          title: "valid domain",
        },
      ],
      notes: [
        {
          id: "fakeId",
          content: "Schema URL is present.",
          title: "schema",
        },
      ],
      addInDetails: {
        displayName: "fake name",
        developerName: "fake name",
        version: "1.14.1",
        manifestVersion: "1.14.1",
      },
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    // vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(""));
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });
    vi.spyOn(metadataUtil, "parseManifest");

    const args: ValidateAppPackageArgs = {
      appPackagePath: "fakePath",
    };

    const mockedCliDriverContext = {
      ...mockedDriverContext,
      platform: Platform.CLI,
    };

    const result = (await teamsAppDriver.execute(args, mockedCliDriverContext)).result;
    chai.assert(result.isErr());
  });

  it("validation with only errors - cli", async () => {
    vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation").mockResolvedValue({
      errors: [
        {
          id: "fakeId",
          content: "Reserved Tab Name property should not be specified.",
          filePath: "",
          helpUrl: "https://docs.microsoft.com",
          shortCodeNumber: 123,
          validationCategory: "tab",
          title: "tab name",
        },
      ],
      status: "Rejected",
      warnings: [],
      notes: [
        {
          id: "fakeId",
          content: "Schema URL is present.",
          title: "schema",
        },
      ],
      addInDetails: {
        displayName: "fake name",
        developerName: "fake name",
        version: "1.14.1",
        manifestVersion: "1.14.1",
      },
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    // vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(""));
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });
    vi.spyOn(metadataUtil, "parseManifest");

    const args: ValidateAppPackageArgs = {
      appPackagePath: "fakePath",
    };

    const mockedCliDriverContext = {
      ...mockedDriverContext,
      platform: Platform.CLI,
    };

    const result = (await teamsAppDriver.execute(args, mockedCliDriverContext)).result;
    chai.assert(result.isErr());
  });

  it("validation with warnings - cli", async () => {
    vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation").mockResolvedValue({
      errors: [],
      status: "Rejected",
      warnings: [
        {
          id: "fakeId",
          content: "Valid domains cannot contain a hosting site with a wildcard.",
          filePath: "",
          helpUrl: "https://docs.microsoft.com",
          shortCodeNumber: 123,
          validationCategory: "domain",
          title: "valid domain",
        },
        {
          id: "fakeId",
          content: "Valid domains cannot contain a hosting site with a wildcard.",
          filePath: "",
          shortCodeNumber: 123,
          validationCategory: "domain",
          title: "valid domain",
        },
      ],
      notes: [
        {
          id: "fakeId",
          content: "Schema URL is present.",
          title: "schema",
        },
      ],
      addInDetails: {
        displayName: "fake name",
        developerName: "fake name",
        version: "1.14.1",
        manifestVersion: "1.14.1",
      },
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    // vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(""));
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });
    vi.spyOn(metadataUtil, "parseManifest");

    const args: ValidateAppPackageArgs = {
      appPackagePath: "fakePath",
    };

    const mockedCliDriverContext = {
      ...mockedDriverContext,
      platform: Platform.CLI,
    };

    const result = (await teamsAppDriver.execute(args, mockedCliDriverContext)).result;
    chai.assert(result.isOk());
  });

  it("happy path - cli", async () => {
    vi.spyOn(teamsDevPortalClient, "partnerCenterAppPackageValidation").mockResolvedValue({
      errors: [],
      status: "Rejected",
      warnings: [],
      notes: [
        {
          id: "fakeId",
          content: "Schema URL is present.",
          title: "schema",
        },
        {
          id: "632652a7-0cf8-43c7-a65d-6a19e5822467",
          title: "Manifest Version is valid",
          code: "The app is using manifest version '1.17'",
        } as any as IAppValidationNote,
      ],
      addInDetails: {
        displayName: "fake name",
        developerName: "fake name",
        version: "1.14.1",
        manifestVersion: "1.14.1",
      },
    });
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    // vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(""));
    vi.spyOn(fs, "readFile").mockImplementation(async () => {
      const zip = new AdmZip();
      zip.addFile(Constants.MANIFEST_FILE, Buffer.from(JSON.stringify(new TeamsAppManifest())));
      zip.addFile("color.png", Buffer.from(""));
      zip.addFile("outlie.png", Buffer.from(""));

      const archivedFile = zip.toBuffer();
      return archivedFile;
    });
    vi.spyOn(metadataUtil, "parseManifest");

    const args: ValidateAppPackageArgs = {
      appPackagePath: "fakePath",
    };

    const mockedCliDriverContext = {
      ...mockedDriverContext,
      platform: Platform.CLI,
    };

    const result = (await teamsAppDriver.execute(args, mockedCliDriverContext)).result;
    chai.assert(result.isOk());
  });
});
