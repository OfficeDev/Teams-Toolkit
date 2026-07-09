// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import path from "path";
import { afterEach, beforeEach, expect, vi } from "vitest";
import * as fetchHelper from "../../../src/common/fetchHelper";
import { cpUtils } from "../../../src/component/deps-checker/util/cpUtils";
import * as downloadHelper from "../../../src/component/deps-checker/util/downloadHelper";

// Store references to spies so tests can reconfigure them
export const depsCheckerSpies = {
  executeCommand: null as any,
  fetch: null as any,
  downloadToTempFile: null as any,
  unzip: null as any,
};

function isDepsCheckerTestFile(): boolean {
  const testPath = expect.getState().testPath ?? "";
  const marker = `${path.sep}tests${path.sep}component${path.sep}deps-checker${path.sep}`;
  return testPath.includes(marker);
}

function isGitHubHelpersTest(): boolean {
  const testName = expect.getState().currentTestName ?? "";
  return testName.includes("GitHubHelpers");
}

function createUnmockedDependencyError(name: string): Error {
  return new Error(
    `Unmocked dependency call detected: ${name}. ` +
      "Please mock this dependency in the test to keep UT deterministic and fast."
  );
}

beforeEach(() => {
  if (!isDepsCheckerTestFile()) {
    return;
  }

  depsCheckerSpies.executeCommand = vi
    .spyOn(cpUtils, "executeCommand")
    .mockRejectedValue(createUnmockedDependencyError("cpUtils.executeCommand"));

  if (!isGitHubHelpersTest()) {
    depsCheckerSpies.fetch = vi
      .spyOn(fetchHelper, "default")
      .mockRejectedValue(createUnmockedDependencyError("fetchHelper.default"));
  }

  depsCheckerSpies.downloadToTempFile = vi
    .spyOn(downloadHelper, "downloadToTempFile")
    .mockRejectedValue(createUnmockedDependencyError("downloadHelper.downloadToTempFile"));

  depsCheckerSpies.unzip = vi
    .spyOn(downloadHelper, "unzip")
    .mockRejectedValue(createUnmockedDependencyError("downloadHelper.unzip"));
});

afterEach(() => {
  if (!isDepsCheckerTestFile()) {
    return;
  }

  vi.restoreAllMocks();
});
