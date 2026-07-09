// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { vi } from "vitest";
import { ConfigFolderName } from "@microsoft/teamsfx-api";

import { ServiceLogWriter } from "../../../../src/cmds/preview/serviceLogWriter";
import { expect } from "../../utils";

vi.mock("fs-extra", async () => {
  const actual = await vi.importActual<typeof import("fs-extra")>("fs-extra");
  return {
    ...actual,
    ensureDir: vi.fn(),
    readdir: vi.fn(),
    remove: vi.fn(),
    ensureFile: vi.fn(),
    appendFile: vi.fn(),
    pathExists: vi.fn(),
  };
});

describe("ServiceLogWriter", () => {
  const cliLogFolderName = "cli-log";
  const localPreviewLogFolderName = "local-preview";
  const localPreviewLogFolder = path.join(
    os.homedir(),
    `.${ConfigFolderName}`,
    cliLogFolderName,
    localPreviewLogFolderName
  );

  const folders = new Set<string>();
  const logs = new Map<string, string>();

  beforeEach(() => {
    vi.clearAllMocks();
    folders.clear();
    logs.clear();

    (fs.ensureDir as any).mockImplementation(async (dir: string) => {
      const basename = path.basename(dir);
      if (path.join(localPreviewLogFolder, basename) === dir) {
        folders.add(basename);
      }
    });
    (fs.readdir as any).mockImplementation(async (dir: string | Buffer) => {
      if (dir === localPreviewLogFolder) {
        return Array.from(folders);
      }
      return [];
    });
    (fs.remove as any).mockImplementation(async (dir: string) => {
      const basename = path.basename(dir);
      if (path.join(localPreviewLogFolder, basename) === dir) {
        folders.delete(basename);
      }
    });
    (fs.ensureFile as any).mockImplementation(async (file: string) => {
      if (!logs.has(file)) {
        logs.set(file, "");
      }
    });
    (fs.appendFile as any).mockImplementation(async (file: string | number | Buffer, data: any) => {
      logs.set(file as string, (logs.get(file as string) ?? "") + data);
    });
    (fs.pathExists as any).mockImplementation(async (file: string) => {
      return logs.has(file);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("init", () => {
    it("happy path", async () => {
      const datetime = new Date().toISOString();
      const stub = vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => {
        return datetime;
      });
      const serviceLogWriter = new ServiceLogWriter();
      await serviceLogWriter.init();
      expect(folders.size).equals(1);
      expect(folders.entries().next().value![0]).equals(
        datetime.replace(/:/g, "_").replace(/\./g, "_")
      );
      stub.mockRestore();
    });
  });

  describe("write and getLogFile", async () => {
    it("happy path", async () => {
      const datetime = new Date().toISOString();
      const stub = vi.spyOn(Date.prototype, "toISOString").mockImplementation(() => {
        return datetime;
      });
      const serviceLogWriter = new ServiceLogWriter();
      await serviceLogWriter.init();
      const serviceTitle = "test start";
      const message = "test started successfully.";
      await serviceLogWriter.write(serviceTitle, message);
      const logFile = await serviceLogWriter.getLogFile(serviceTitle);
      expect(logFile).to.not.equal(undefined);
      expect(logFile).equals(
        path.join(
          localPreviewLogFolder,
          datetime.replace(/:/g, "_").replace(/\./g, "_"),
          `${serviceTitle.split(" ").join("-")}.log`
        )
      );
      expect(logs.has(logFile as string)).equals(true);
      expect(logs.get(logFile as string)).equals(message);
      stub.mockRestore();
    });
  });
});
