// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { CLIContext, err, ok, SystemError } from "@microsoft/teamsfx-api";
import { FxCore, UserCancelError } from "@microsoft/teamsfx-core";
import { initCommand } from "../../../../../src/commands/models/init/init";
import { logger } from "../../../../../src/commonlib/logger";
import { assert, expect, vi } from "vitest";

describe("init command", () => {
  const sandbox = vi;

  beforeEach(() => {
    vi.spyOn(logger, "info").mockResolvedValue(true);
    vi.spyOn(logger, "error").mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("handler", () => {
    it("should successfully generate config files with all options", async () => {
      const generateConfigFilesStub = vi
        .spyOn(FxCore.prototype, "generateConfigFiles")
        .mockResolvedValue(ok(undefined));

      const ctx: CLIContext = {
        command: { ...initCommand, fullName: "init" },
        optionValues: {
          playground: true,
          local: true,
          remote: true,
          language: "typescript",
          "teams-manifest-file": "./appPackage/manifest.json",
          folder: "./",
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const result = await initCommand.handler!(ctx);

      assert.isTrue(result.isOk());
      expect(generateConfigFilesStub).toHaveBeenCalledExactlyOnceWith(ctx.optionValues as any);
    });

    it("should successfully generate config files with default options", async () => {
      const generateConfigFilesStub = vi
        .spyOn(FxCore.prototype, "generateConfigFiles")
        .mockResolvedValue(ok(undefined));

      const ctx: CLIContext = {
        command: { ...initCommand, fullName: "init" },
        optionValues: {
          playground: true,
          local: true,
          remote: false,
          language: "typescript",
          "teams-manifest-file": "./appPackage/manifest.json",
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const result = await initCommand.handler!(ctx);

      assert.isTrue(result.isOk());
      expect(generateConfigFilesStub).toHaveBeenCalledExactlyOnceWith(ctx.optionValues as any);
    });

    it("should return error when generateConfigFiles fails with UserCancelError", async () => {
      const expectedError = new UserCancelError();
      vi.spyOn(FxCore.prototype, "generateConfigFiles").mockResolvedValue(err(expectedError));

      const ctx: CLIContext = {
        command: { ...initCommand, fullName: "init" },
        optionValues: {
          playground: true,
          local: true,
          remote: false,
          language: "typescript",
          "teams-manifest-file": "./appPackage/manifest.json",
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const result = await initCommand.handler!(ctx);

      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.equal(result.error, expectedError);
      }
    });

    it("should return error when generateConfigFiles fails with SystemError", async () => {
      const expectedError = new SystemError("TestSource", "TestError", "Test error message");
      vi.spyOn(FxCore.prototype, "generateConfigFiles").mockResolvedValue(err(expectedError));

      const ctx: CLIContext = {
        command: { ...initCommand, fullName: "init" },
        optionValues: {
          playground: false,
          local: true,
          remote: true,
          language: "typescript",
          "teams-manifest-file": "./manifest.json",
          folder: "./test",
        },
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const result = await initCommand.handler!(ctx);

      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.equal(result.error, expectedError);
      }
    });

    it("should pass correct inputs to generateConfigFiles", async () => {
      const generateConfigFilesStub = vi
        .spyOn(FxCore.prototype, "generateConfigFiles")
        .mockResolvedValue(ok(undefined));

      const expectedInputs = {
        playground: false,
        local: false,
        remote: true,
        language: "typescript",
        "teams-manifest-file": "./custom/path/manifest.json",
        folder: "./custom/folder",
      };

      const ctx: CLIContext = {
        command: { ...initCommand, fullName: "init" },
        optionValues: expectedInputs,
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const result = await initCommand.handler!(ctx);

      assert.isTrue(result.isOk());
      assert.isTrue(generateConfigFilesStub.mock.calls.length === 1);
      const actualInputs = generateConfigFilesStub.mock.calls[0][0];
      assert.equal(actualInputs.playground, expectedInputs.playground);
      assert.equal(actualInputs.local, expectedInputs.local);
      assert.equal(actualInputs.remote, expectedInputs.remote);
      assert.equal(actualInputs.language, expectedInputs.language);
      assert.equal(actualInputs["teams-manifest-file"], expectedInputs["teams-manifest-file"]);
      assert.equal(actualInputs.folder, expectedInputs.folder);
    });

    it("should handle empty option values", async () => {
      vi.spyOn(FxCore.prototype, "generateConfigFiles").mockResolvedValue(ok(undefined));

      const ctx: CLIContext = {
        command: { ...initCommand, fullName: "init" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };

      const result = await initCommand.handler!(ctx);

      assert.isTrue(result.isOk());
    });
  });
});
