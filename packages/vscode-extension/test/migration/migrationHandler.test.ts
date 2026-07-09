import { vi, expect } from "vitest";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { TeamsAppMigrationHandler } from "../../src/migration/migrationHandler";
import vsCodeLogProvider from "../../src/commonlib/log";
import * as localizeUtils from "../../src/utils/localizeUtils";
import * as replaceTsSDK from "../../src/migration/migrationTool/ts/replaceTsSDK";
import fs from "fs-extra";
import {
  teamsClientSDKVersion,
  teamsManifestSchema,
  teamsManifestVersion,
} from "../../src/migration/constants";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { ExtensionErrors } from "../../src/error/error";
const PackageJson = require("@npmcli/package-json");

describe("TeamsAppMigrationHandler", () => {
  describe("updateCodes", () => {
    it("happy path", async () => {
      vi.spyOn(fs, "readdir").mockResolvedValue(["test.ts", "test.js"] as any);
      vi.spyOn(fs, "stat").mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      vi.spyOn(fs, "readFile").mockResolvedValue(Buffer.from(""));
      vi.spyOn(vsCodeLogProvider, "info").mockResolvedValue();
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(replaceTsSDK, "default").mockReturnValue("");
      vi.spyOn(fs, "writeFile").mockResolvedValue();

      const migrationHandler = new TeamsAppMigrationHandler("test");
      const result = await migrationHandler.updateCodes();
      expect(result.isOk()).equals(true);
      expect((result as any).value.length).equals(0);
    });

    it("some failures", async () => {
      vi.spyOn(fs, "readdir").mockResolvedValue(["test.ts"] as any);
      vi.spyOn(fs, "stat").mockResolvedValue({
        isDirectory: () => false,
        isFile: () => true,
      } as any);
      vi.spyOn(fs, "readFile").throws(new Error("exception"));
      vi.spyOn(vsCodeLogProvider, "info").mockResolvedValue();
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(replaceTsSDK, "default").mockReturnValue("");
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent").mockResolvedValue();

      const migrationHandler = new TeamsAppMigrationHandler("test");
      const result = await migrationHandler.updateCodes();
      expect(result.isOk()).equals(true);
      expect((result as any).value.length).equals(1);
    });
  });

  describe("updatePackageJson", () => {
    it("happy path", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      let packageJson;
      vi.spyOn(PackageJson, "load").mockResolvedValue({
        content: {
          dependencies: {
            "@microsoft/teams-js": "1.0.0",
          },
        },
        update: (content: any) => {
          packageJson = content;
        },
        save: () => {},
      });
      const migrationHandler = new TeamsAppMigrationHandler("test");
      const result = await migrationHandler.updatePackageJson();
      if (result.isErr()) {
        console.log(result.error);
      }
      expect(result.isOk()).equals(true);
      expect((result as any).value).equals(true);
      expect(packageJson).deep.equals({
        dependencies: {
          "@microsoft/teams-js": teamsClientSDKVersion,
        },
        devDependencies: undefined,
      });
    });

    it("no package.json", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const migrationHandler = new TeamsAppMigrationHandler("test");
      const result = await migrationHandler.updatePackageJson();
      expect(result.isOk()).equals(true);
      expect((result as any).value).equals(false);
    });
  });

  describe("updateManifest", async () => {
    it("happy path", async () => {
      vi.spyOn(fs, "readJSON").mockResolvedValue({
        $schema: "",
        manifestVersion: "",
      });
      let manifestJson;
      vi.spyOn(fs, "writeJSON").mockImplementation((_, object) => {
        manifestJson = object;
      });
      const migrationHandler = new TeamsAppMigrationHandler("test");
      const result = await migrationHandler.updateManifest();
      expect(result.isOk()).equals(true);
      expect((result as any).value).equals(null);
      expect(manifestJson).deep.equals({
        $schema: teamsManifestSchema,
        manifestVersion: teamsManifestVersion,
      });
    });

    it("exception", async () => {
      vi.spyOn(fs, "readJSON").throws(new Error("exception"));
      const migrationHandler = new TeamsAppMigrationHandler("test");
      const result = await migrationHandler.updateManifest();
      expect(result.isErr()).equals(true);
      expect((result as any).error.name).equals(ExtensionErrors.UpdateManifestError);
    });
  });
});
