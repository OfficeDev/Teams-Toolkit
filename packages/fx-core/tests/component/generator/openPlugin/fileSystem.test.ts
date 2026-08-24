// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { inspectPathWithinRoot } from "../../../../src/component/generator/openPlugin/fileSystem";
import { chai } from "vitest";

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
});
