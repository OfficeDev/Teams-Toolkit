// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import AdmZip, { EntryHeader } from "adm-zip";
import * as fs from "fs-extra";
import { Ignore } from "ignore";
import klaw from "klaw";
import path from "path";
import { CacheFileInUse, DeployEmptyFolderError, ZipFileError } from "../../error/deploy";

const createZip = () => new AdmZip();
const writeZip = async (zip: AdmZip, cache: string) =>
  await new Promise((resolve, reject) => {
    zip.writeZip(cache, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve({});
      }
    });
  });

export const fileOperationDeps = {
  createZip,
  writeZip,
  existsSync: fs.existsSync,
  remove: fs.remove,
  mkdirs: fs.mkdirs,
  createReadStream: fs.createReadStream,
};

/**
 * Asynchronously zip a folder and return buffer
 * @param sourceDir base dir
 * @param notIncluded block list
 * @param cache zip cache file location
 */
export async function zipFolderAsync(
  sourceDir: string,
  cache: string,
  notIncluded: Ignore
): Promise<fs.ReadStream> {
  const tasks: Promise<void>[] = [];
  const ig = notIncluded;
  // always delete cache if exists
  if (fileOperationDeps.existsSync(cache)) {
    try {
      await fileOperationDeps.remove(cache);
    } catch (e) {
      if (e instanceof Error && (e as any)?.code === "EBUSY") {
        throw new CacheFileInUse(cache, e);
      }
      throw e;
    }
  }
  const zip = fileOperationDeps.createZip();

  const addFileIntoZip = async (
    zp: AdmZip,
    filePath: string,
    zipPath: string,
    stats?: fs.Stats
  ) => {
    const content = await fs.readFile(filePath);
    zp.addFile(zipPath, content);
    if (stats) {
      (zp.getEntry(zipPath)?.header as EntryHeader).time = stats.mtime;
    }
  };

  await forEachFileAndDir(
    sourceDir,
    (itemPath: string, stats: fs.Stats) => {
      const relativePath: string = path.relative(sourceDir, itemPath);
      const zipPath = path.normalize(relativePath).split("\\").join("/");
      if (relativePath && !stats.isDirectory()) {
        const fullPath = path.join(sourceDir, relativePath);
        const task = addFileIntoZip(zip, fullPath, zipPath, stats);
        tasks.push(task);
      }
    },
    (itemPath: string) => {
      return !ig.test(path.relative(sourceDir, itemPath)).ignored;
    }
  );

  if (tasks.length === 0) {
    throw new DeployEmptyFolderError(sourceDir);
  }

  await Promise.all(tasks);
  // save to cache if exists
  if (cache && tasks) {
    await fileOperationDeps.mkdirs(path.dirname(cache));
    try {
      await fileOperationDeps.writeZip(zip, cache);
    } catch (e) {
      if (e instanceof Error && (e as any)?.code === "ERR_OUT_OF_RANGE") {
        throw new ZipFileError(e);
      }
    }
  }
  return fileOperationDeps.createReadStream(cache);
}

export async function forEachFileAndDir(
  root: string,
  callback: (itemPath: string, stats: fs.Stats) => boolean | void,
  filter?: (itemPath: string) => boolean
): Promise<void> {
  await new Promise((resolve, reject) => {
    const stream: klaw.Walker = klaw(root, { filter: filter });
    stream
      .on("data", (item) => {
        if (callback(item.path, item.stats)) {
          stream.emit("close");
        }
      })
      .on("end", () => resolve({}))
      .on("error", (err) => reject(err))
      .on("close", () => resolve({}));
  });
}
