// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import {
  inspectPathWithinRoot,
  readFileWithinRoot,
} from "../../../../src/component/generator/openPlugin/fileSystem";
import { chai, vi } from "vitest";

async function tmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("openPlugin.fileSystem", () => {
  it("AP-PATH-18: rejects a file used as an intermediate directory", async () => {
    const root = await tmp("op-fs-intermediate-file-");
    try {
      await fs.writeFile(path.join(root, "skills"), "not a directory");

      const inspected = await inspectPathWithinRoot(
        root,
        path.join("skills", "alpha-skill"),
        "directory"
      );

      chai.expect(inspected.status).to.equal("wrong-kind");
    } finally {
      await fs.remove(root);
    }
  });

  it("rejects descendants after the trusted root is replaced with a junction", async () => {
    const root = await tmp("op-fs-root-");
    const replacement = await tmp("op-fs-replacement-");
    const trustedRoot = await fs.realpath(root);
    try {
      await fs.ensureDir(path.join(replacement, "skills", "alpha-skill"));
      await fs.remove(root);
      await fs.ensureSymlink(replacement, root, process.platform === "win32" ? "junction" : "dir");

      const inspected = await inspectPathWithinRoot(
        trustedRoot,
        path.join("skills", "alpha-skill"),
        "directory"
      );

      chai.expect(inspected.status).not.to.equal("ok");
    } finally {
      await fs.remove(root);
      await fs.remove(replacement);
    }
  });

  it("rejects a file whose metadata changes during snapshot validation", async () => {
    const root = await tmp("op-fs-changed-");
    const file = path.join(root, "description.json");
    const originalLstat = fs.lstat.bind(fs);
    let fileLstatCount = 0;
    try {
      await fs.writeFile(file, "{}");
      vi.spyOn(fs, "lstat").mockImplementation(async (candidate) => {
        const stat = await originalLstat(candidate);
        if (path.resolve(candidate.toString()) === file && ++fileLstatCount === 3) {
          Object.defineProperty(stat, "mtimeMs", { value: stat.mtimeMs + 1 });
        }
        return stat;
      });

      const result = await readFileWithinRoot(root, "description.json");

      chai.expect(result.status).to.equal("changed");
    } finally {
      vi.restoreAllMocks();
      await fs.remove(root);
    }
  });
});
