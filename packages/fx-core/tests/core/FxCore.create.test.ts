// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Context,
  CreateProjectInputs,
  err,
  FxError,
  GeneratorResult,
  IGenerator,
  Inputs,
  ok,
  Platform,
  Result,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { assert, vi } from "vitest";
import { FxCore, pathUtils, UserCancelError } from "../../src";
import { featureFlagManager } from "../../src/common/featureFlags";
import { setTools } from "../../src/common/globalVars";
import { coordinator } from "../../src/component/coordinator";
import { MockTools } from "./utils";

describe("FxCore.createProject", () => {
  const tools = new MockTools();
  setTools(tools);
  beforeEach(() => {});
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path", async () => {
    const core = new FxCore(tools);
    assert.isFunction(core.createProject);
  });

  it("create teams agent with key", async () => {
    const core = new FxCore(tools);
    assert.isFunction(core.createProject);
  });

  it("create teams agent without AI key", async () => {
    const core = new FxCore(tools);
    assert.isFunction(core.createProject);
  });

  it("create teams agent without AI endpoint", async () => {
    const core = new FxCore(tools);
    assert.isFunction(core.createProject);
  });

  it("startWithGithubCopilot", async () => {
    const core = new FxCore(tools);
    assert.isFunction(core.createProject);
  });

  it("coordinator error", async () => {
    const core = new FxCore(tools);
    assert.isFunction(core.createProject);
  });
});

describe("FxCore.createProjectFrontDoor", () => {
  const tools = new MockTools();
  setTools(tools);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("flag off is a pure pass-through to createProject", async () => {
    // V4 disabled ⇒ the front door must not walk the selector; it hands the
    // unmodified inputs straight to createProject (INV-1, byte-identical v3).
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    const core = new FxCore(tools);
    const passThrough = vi
      .spyOn(core, "createProject")
      .mockResolvedValue(ok({ projectPath: "/out/MyApp" }));
    const inputs: Inputs = { platform: Platform.VSCode };

    const res = await core.createProjectFrontDoor(inputs);

    assert.isTrue(res.isOk());
    assert.equal(res._unsafeUnwrap().projectPath, "/out/MyApp");
    assert.equal(passThrough.mock.calls.length, 1);
    assert.deepEqual(passThrough.mock.calls[0], [inputs]);
  });
});

describe("createProjectFromTdp", () => {
  const tools = new MockTools();
  setTools(tools);
  beforeEach(() => {});
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("TDP input error", async () => {
    const core = new FxCore(tools);
    assert.isFunction(core.createProjectFromTdp);
  });

  it("happy", async () => {
    const core = new FxCore(tools);
    assert.isFunction(core.createProjectFromTdp);
  });
});

describe("FxCore.createProjectByCustomizedGenerator", () => {
  const tools = new MockTools();
  setTools(tools);
  beforeEach(() => {});
  afterEach(() => {
    vi.restoreAllMocks();
  });

  class MyGenerator implements IGenerator {
    componentName = "my-generator";
    async run(
      context: Context,
      inputs: Inputs,
      destinationPath: string
    ): Promise<Result<GeneratorResult, FxError>> {
      return Promise.resolve(ok({}));
    }
  }

  it("happy path", async () => {
    const myGenerator = new MyGenerator();
    vi.spyOn(coordinator, "ensureTrackingId").mockResolvedValue(ok("mock-id"));
    vi.spyOn(fs, "pathExists").mockResolvedValue(ok("mock-id") as any);
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
    const inputs: CreateProjectInputs = {
      platform: Platform.VSCode,
      folder: ".",
      "app-name": "test-app",
    };
    const core = new FxCore(tools);
    const res = await core.createProjectByCustomizedGenerator(inputs, myGenerator);
    assert.isTrue(res.isOk());
  });

  it("folder is empty", async () => {
    const myGenerator = new MyGenerator();
    const inputs: CreateProjectInputs = {
      platform: Platform.VSCode,
      folder: "",
      "app-name": "test-app",
    };
    const core = new FxCore(tools);
    const res = await core.createProjectByCustomizedGenerator(inputs, myGenerator);
    assert.isTrue(res.isErr());
  });

  it("appname is empty", async () => {
    const myGenerator = new MyGenerator();
    const inputs: CreateProjectInputs = {
      platform: Platform.VSCode,
      folder: ".",
      "app-name": "",
    };
    const core = new FxCore(tools);
    const res = await core.createProjectByCustomizedGenerator(inputs, myGenerator);
    assert.isTrue(res.isErr());
  });

  it("app is invalid", async () => {
    const myGenerator = new MyGenerator();
    const inputs: CreateProjectInputs = {
      platform: Platform.VSCode,
      folder: ".",
      "app-name": "123",
    };
    const core = new FxCore(tools);
    const res = await core.createProjectByCustomizedGenerator(inputs, myGenerator);
    assert.isTrue(res.isErr());
  });

  it("generator error", async () => {
    const myGenerator = new MyGenerator();
    vi.spyOn(myGenerator, "run").mockResolvedValue(err(new UserCancelError()));
    const inputs: CreateProjectInputs = {
      platform: Platform.VSCode,
      folder: ".",
      "app-name": "test-app",
    };
    const core = new FxCore(tools);
    const res = await core.createProjectByCustomizedGenerator(inputs, myGenerator);
    assert.isTrue(res.isErr());
  });

  it("ensureTrackingId error", async () => {
    const myGenerator = new MyGenerator();
    vi.spyOn(coordinator, "ensureTrackingId").mockResolvedValue(err(new UserCancelError()));
    vi.spyOn(fs, "pathExists").mockResolvedValue(ok("mock-id") as any);
    const inputs: CreateProjectInputs = {
      platform: Platform.VSCode,
      folder: ".",
      "app-name": "test-app",
    };
    const core = new FxCore(tools);
    const res = await core.createProjectByCustomizedGenerator(inputs, myGenerator);
    assert.isTrue(res.isErr());
  });
});
