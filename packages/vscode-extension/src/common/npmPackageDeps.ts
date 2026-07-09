// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Centralized dependency injection for read-only npm packages.
 *
 * This module wraps all external npm package methods that need to be mocked in tests.
 * Internal modules (fileSystemUtils, appDefinitionUtils, etc.) should be imported directly.
 *
 * Principle:
 * - ✅ npm packages (fs-extra, @microsoft/teamsfx-core, etc.) → goes here
 * - ✅ internal modules → import directly, mock with vi.mock() in tests
 */

import fs from "fs-extra";
import { dotenvUtil } from "@microsoft/teamsfx-core/build/component/utils/envUtil";
import { exec } from "child_process";
import * as os from "os";
import kill from "tree-kill";
import { glob } from "glob";
import path from "path";

/**
 * File system operations adapter for fs-extra
 */
export const fsAdapter = {
  pathExists: (filePath: string) => fs.pathExists(filePath),
  readFileSync: (filePath: string, encoding: BufferEncoding) => fs.readFileSync(filePath, encoding),
  writeFileSync: (filePath: string, content: string, encoding?: BufferEncoding) =>
    fs.writeFileSync(filePath, content, encoding || "utf-8"),
  existsSync: (filePath: string) => fs.existsSync(filePath),
  mkdirSync: (dirPath: string, options?: any) => fs.mkdirSync(dirPath, options),
  closeSync: (fd: number) => fs.closeSync(fd),
  openSync: (filePath: string, flags: number | string, mode?: number) =>
    fs.openSync(filePath, flags, mode),
  open: (filePath: string, flag: string) => fs.open(filePath, flag),
  fstat: (fd: number) => fs.fstat(fd),
  read: (fd: number, buffer: Uint8Array, offset: number, length: number, position: number | null) =>
    fs.read(fd, buffer, offset, length, position),
  close: (fd: number) => fs.close(fd),
};

/**
 * Environment file parsing adapter for @microsoft/teamsfx-core
 */
export const envParseAdapter = {
  deserializeDotenv: (content: string) => dotenvUtil.deserialize(content),
  isTestToolEnabledProject: (projectPath: string) => {
    const { isTestToolEnabledProject } = require("@microsoft/teamsfx-core");
    return isTestToolEnabledProject(projectPath);
  },
};

/**
 * Process utilities adapter for os and child_process
 */
export const processAdapter = {
  platform: () => os.platform(),
  type: () => os.type(),
  exec: (cmd: string, callback?: (error: any, stdout: string, stderr: string) => void) =>
    exec(cmd, callback),
  execWithOptions: (
    cmd: string,
    options: any,
    callback?: (error: any, stdout: string, stderr: string) => void
  ) => exec(cmd, options, callback),
  killTree: (pid: number, signal: string, callback: (err?: any) => void) =>
    kill(pid, signal, callback),
};

/**
 * Path utilities adapter (node path module)
 */
export const pathAdapter = {
  join: (...args: string[]) => path.join(...args),
  resolve: (...args: string[]) => path.resolve(...args),
  dirname: (filePath: string) => path.dirname(filePath),
  basename: (filePath: string, ext?: string) => path.basename(filePath, ext),
};

/**
 * Glob adapter for glob package
 */
export const globAdapter = {
  glob: (pattern: string, options?: any) => glob(pattern, options),
};
