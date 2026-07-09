// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import { chai, vi } from "vitest";
import { M365TitleAcquireDriver } from "../../../../src/component/driver/m365/acquire";
import { PackageService } from "../../../../src/component/m365/packageService";
import {
  FileNotFoundError,
  InvalidActionInputError,
  UnhandledError,
} from "../../../../src/error/common";
import { MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";

vi.mock("fs-extra");

describe("teamsApp/extendToM365", async () => {
  const acquireDriver = new M365TitleAcquireDriver();
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
    projectPath: "./",
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("run: happy path", async () => {
    const args = {
      appPackagePath: "fakePath",
    };

    const result = await acquireDriver.run(args, mockedDriverContext);
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.isTrue(result.error instanceof InvalidActionInputError);
      chai.assert.isTrue(result.error.message.includes("writeToEnvironmentFile"));
    }
  });

  it("execute: invalid param error", async () => {
    const args = {
      appPackagePath: false,
    } as any;
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
    ]);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert(result.result.isErr());
    if (result.result.isErr()) {
      chai.assert.isTrue(result.result.error instanceof InvalidActionInputError);
      chai.assert.isTrue(result.result.error.message.includes("appPackagePath"));
    }
  });

  it("execute: writeToEnvironmentFile undefined", async () => {
    const args = {
      appPackagePath: "fakePath",
    };

    const result = await acquireDriver.execute(args, mockedDriverContext, undefined);
    chai.assert(result.result.isErr());
    if (result.result.isErr()) {
      chai.assert.isTrue(result.result.error instanceof InvalidActionInputError);
      chai.assert.isTrue(result.result.error.message.includes("writeToEnvironmentFile"));
    }
  });

  it("execute: missing titleId", async () => {
    const args = {
      appPackagePath: "fakePath",
    };
    const outputEnvVarNames = new Map([["appId", "MY_APP_ID"]]);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert(result.result.isErr());
    if (result.result.isErr()) {
      chai.assert.isTrue(result.result.error instanceof InvalidActionInputError);
      chai.assert.isTrue(result.result.error.message.includes("writeToEnvironmentFile"));
    }
  });

  it("execute: missing appId", async () => {
    const args = {
      appPackagePath: "fakePath",
    };
    const outputEnvVarNames = new Map([["titleId", "MY_TITLE_ID"]]);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert(result.result.isErr());
    if (result.result.isErr()) {
      chai.assert.isTrue(result.result.error instanceof InvalidActionInputError);
      chai.assert.isTrue(result.result.error.message.includes("writeToEnvironmentFile"));
    }
  });

  it("execute: should throw error if file not exists", async () => {
    const args = {
      appPackagePath: "fakePath",
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
    ]);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert(result.result.isErr());
    if (result.result.isErr()) {
      chai.assert.isTrue(result.result.error instanceof FileNotFoundError);
    }
  });

  it("execute: unhandled error", async () => {
    const args = {
      appPackagePath: "fakePath",
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
    ]);

    vi.spyOn(PackageService.prototype, "sideLoading").mockImplementation(() => {
      throw new Error("test error");
    });
    vi.mocked(fs.pathExists).mockResolvedValue(true);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert(result.result.isErr());
    if (result.result.isErr()) {
      chai.assert.isTrue(result.result.error instanceof UnhandledError);
    }
  });

  it("execute: UserError with undefined displayMessage should fallback to message", async () => {
    const args = {
      appPackagePath: "fakePath",
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
    ]);

    const mockError = new FileNotFoundError("test", "test-file-path");
    (mockError as any).displayMessage = undefined;

    vi.spyOn(PackageService.prototype, "sideLoading").mockRejectedValue(mockError);
    vi.mocked(fs.pathExists).mockResolvedValue(true);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert(result.result.isErr());
    if (result.result.isErr()) {
      chai.assert.isTrue(result.result.error instanceof FileNotFoundError);
    }
  });

  it("execute: happy path", async () => {
    const args = {
      appPackagePath: "fakePath",
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
    ]);

    vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue([
      "test-title-id",
      "test-app-id",
      "",
    ]);
    vi.mocked(fs.pathExists).mockResolvedValue(true);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    chai.assert.equal((result.result as any).value.get("MY_TITLE_ID"), "test-title-id");
    chai.assert.equal((result.result as any).value.get("MY_APP_ID"), "test-app-id");
  });

  it("execute: invalid scope parameter", async () => {
    const args = {
      appPackagePath: "fakePath",
      scope: "invalid-scope" as any,
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
    ]);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert(result.result.isErr());
    if (result.result.isErr()) {
      chai.assert.isTrue(result.result.error instanceof InvalidActionInputError);
      chai.assert.isTrue(result.result.error.message.includes("scope"));
    }
  });

  it("execute: valid scope personal", async () => {
    const args = {
      appPackagePath: "fakePath",
      scope: "personal" as any,
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
    ]);

    vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue([
      "test-title-id",
      "test-app-id",
      "https://example.com/sharelink",
    ]);
    vi.mocked(fs.pathExists).mockResolvedValue(true);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    chai.assert.equal((result.result as any).value.get("MY_TITLE_ID"), "test-title-id");
    chai.assert.equal((result.result as any).value.get("MY_APP_ID"), "test-app-id");
  });

  it("execute: valid scope shared", async () => {
    const args = {
      appPackagePath: "fakePath",
      scope: "shared" as any,
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
    ]);

    vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue([
      "test-title-id",
      "test-app-id",
      "https://example.com/sharelink",
    ]);
    vi.mocked(fs.pathExists).mockResolvedValue(true);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    chai.assert.equal((result.result as any).value.get("MY_TITLE_ID"), "test-title-id");
    chai.assert.equal((result.result as any).value.get("MY_APP_ID"), "test-app-id");
  });

  it("execute: with shareLink output key", async () => {
    const args = {
      appPackagePath: "fakePath",
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
      ["shareLink", "MY_SHARE_LINK"],
    ]);

    vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue([
      "test-title-id",
      "test-app-id",
      "https://example.com/sharelink",
    ]);
    vi.mocked(fs.pathExists).mockResolvedValue(true);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    chai.assert.equal((result.result as any).value.get("MY_TITLE_ID"), "test-title-id");
    chai.assert.equal((result.result as any).value.get("MY_APP_ID"), "test-app-id");
    chai.assert.equal(
      (result.result as any).value.get("MY_SHARE_LINK"),
      "https://example.com/sharelink"
    );
  });

  it("execute: without shareLink output key should not include it in result", async () => {
    const args = {
      appPackagePath: "fakePath",
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
    ]);

    vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue([
      "test-title-id",
      "test-app-id",
      "https://example.com/sharelink",
    ]);
    vi.mocked(fs.pathExists).mockResolvedValue(true);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    chai.assert.equal((result.result as any).value.get("MY_TITLE_ID"), "test-title-id");
    chai.assert.equal((result.result as any).value.get("MY_APP_ID"), "test-app-id");
    chai.assert.isFalse((result.result as any).value.has("MY_SHARE_LINK"));
    chai.assert.equal((result.result as any).value.size, 2);
  });

  it("execute: with scope and shareLink together", async () => {
    const args = {
      appPackagePath: "fakePath",
      scope: "shared" as any,
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
      ["shareLink", "MY_SHARE_LINK"],
    ]);

    vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue([
      "test-title-id",
      "test-app-id",
      "https://example.com/sharelink",
    ]);
    vi.mocked(fs.pathExists).mockResolvedValue(true);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    chai.assert.equal((result.result as any).value.get("MY_TITLE_ID"), "test-title-id");
    chai.assert.equal((result.result as any).value.get("MY_APP_ID"), "test-app-id");
    chai.assert.equal(
      (result.result as any).value.get("MY_SHARE_LINK"),
      "https://example.com/sharelink"
    );
  });

  it("execute: empty shareLink from service should still be set", async () => {
    const args = {
      appPackagePath: "fakePath",
    };
    const outputEnvVarNames = new Map([
      ["titleId", "MY_TITLE_ID"],
      ["appId", "MY_APP_ID"],
      ["shareLink", "MY_SHARE_LINK"],
    ]);

    vi.spyOn(PackageService.prototype, "sideLoading").mockResolvedValue([
      "test-title-id",
      "test-app-id",
      "",
    ]);
    vi.mocked(fs.pathExists).mockResolvedValue(true);

    const result = await acquireDriver.execute(args, mockedDriverContext, outputEnvVarNames);
    chai.assert.isTrue(result.result.isOk());
    chai.assert.equal((result.result as any).value.get("MY_TITLE_ID"), "test-title-id");
    chai.assert.equal((result.result as any).value.get("MY_APP_ID"), "test-app-id");
    chai.assert.equal((result.result as any).value.get("MY_SHARE_LINK"), "");
  });
});
