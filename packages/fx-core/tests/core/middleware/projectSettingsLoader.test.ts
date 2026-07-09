// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import path from "path";
import { assert, vi } from "vitest";
import { featureFlagManager, FeatureFlags } from "../../../src/common/featureFlags";
import { pathUtils } from "../../../src/component/utils/pathUtils";
import { getProjectSettingsPath } from "../../../src/core/middleware/projectSettingsLoader";

describe("projectSettingsLoader - getProjectSettingsPath", () => {
  let flagStub: any;
  let availablePathStub: any;
  let ymlPathStub: any;

  const projectPath = "/tmp/project";

  beforeEach(() => {
    flagStub = vi
      .spyOn(featureFlagManager, "getBooleanValue")
      .mockImplementation((flag) => flag === FeatureFlags.GenerateConfigFiles);
    availablePathStub = vi.spyOn(pathUtils, "getAvailableYmlFilePath");
    ymlPathStub = vi.spyOn(pathUtils, "getYmlFilePath");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns playground config path when flag enabled and playground exists", () => {
    const playgroundPath = path.join(projectPath, "m365agents.playground.yml");
    availablePathStub.mockReturnValue(playgroundPath);

    const result = getProjectSettingsPath(projectPath);

    assert.equal(result, playgroundPath);
    assert.isTrue(availablePathStub.mock.calls.length === 1);
    assert.isTrue(flagStub.mock.calls.length === 1);
    assert.isTrue(ymlPathStub.mock.calls.length === 0);
  });
});
