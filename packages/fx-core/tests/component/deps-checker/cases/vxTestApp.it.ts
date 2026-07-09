// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// Use require so we can mock it
import fs from "fs-extra";
import mockFs from "mock-fs";
import * as os from "os";
import * as path from "path";
import * as tmp from "tmp";
import { CheckerFactory } from "../../../../src/component/deps-checker/checkerFactory";
import { DepsType } from "../../../../src/component/deps-checker/depsChecker";
import { VxTestAppChecker } from "../../../../src/component/deps-checker/internal/vxTestAppChecker";
import { isMacOS, isWindows } from "../../../../src/component/deps-checker/util";
import { TestLogger } from "../adapters/testLogger";
import { TestTelemetry } from "../adapters/testTelemetry";
import { chai, vi } from "vitest";

describe("VxTestAppChecker E2E Test", async () => {
  const fakeProjectPath = "fake project path";
  const vxTestAppExecutableName = isWindows()
    ? "video-extensibility-test-app.exe"
    : isMacOS()
      ? "video-extensibility-test-app.app"
      : "video-extensibility-test-app";
  let sandbox: any;

  beforeEach(() => {
    sandbox = vi;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFs.restore();
  });

  it("VxTestApp already installed", async function () {
    mockFs({
      [path.join(
        fakeProjectPath,
        ".tools",
        "video-extensibility-test-app",
        vxTestAppExecutableName
      )]: "",
    });
    const checker = new VxTestAppChecker(new TestLogger(), new TestTelemetry());
    const info = await checker.getInstallationInfo({
      projectPath: fakeProjectPath,
      version: "1.0.4",
    });

    chai.assert.isTrue(info.isInstalled);
  });

  it("VxTestApp not installed", async function () {
    // Currently vxTestApp only publishes Windows bits
    if (!isWindows()) {
      return;
    }

    const checker = CheckerFactory.createChecker(
      DepsType.VxTestApp,
      new TestLogger(),
      new TestTelemetry()
    );

    let tmpDir;
    try {
      tmpDir = tmp.dirSync({ unsafeCleanup: true });

      const res = await checker.resolve({ projectPath: tmpDir.name, version: "1.0.4" });
      chai.assert.isTrue(res.isInstalled);
      chai.assert.isTrue(
        fs.pathExistsSync(
          path.resolve(tmpDir.name, ".tools/video-extensibility-test-app", vxTestAppExecutableName)
        )
      );
      const stat = fs.lstatSync(path.resolve(tmpDir.name, ".tools/video-extensibility-test-app"));
      chai.assert.isTrue(stat.isSymbolicLink());
      chai.assert.isTrue(
        fs.pathExistsSync(
          path.resolve(
            os.homedir(),
            ".fx/bin/video-extensibility-test-app/1.0.4",
            vxTestAppExecutableName
          )
        )
      );
    } finally {
      tmpDir?.removeCallback();
    }
  });
});
