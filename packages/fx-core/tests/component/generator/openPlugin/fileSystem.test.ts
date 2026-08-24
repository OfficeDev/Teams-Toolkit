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
