// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { InputsWithProjectPath, Platform, Stage } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { Container } from "typedi";
import * as utils from "../../../src/common/globalVars";
import { setTools } from "../../../src/common/globalVars";
import "../../../src/component/feature/sso";
import * as templateUtils from "../../../src/component/generator/utils";
import { ComponentNames } from "../../../src/component/migrate";
import { MockTools, randomAppName } from "../../core/utils";
import { assert, vi } from "vitest";

describe("SSO can add in VS V3 project", () => {
  const sandbox = vi;
  const tools = new MockTools();
  setTools(tools);
  const appName = `unittest${randomAppName()}`;
  const context = utils.createContext();
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("happy path for VS v3 project", async () => {
    const component = Container.get(ComponentNames.SSO) as any;
    assert.isFunction(component.add);
  });

  it("add sso failed for VS v3 project due to project path is empty", async () => {
    const component = Container.get(ComponentNames.SSO) as any;
    const inputs: InputsWithProjectPath = {
      projectPath: "projectPath",
      platform: Platform.VS,
      language: "csharp",
      "app-name": appName,
      stage: Stage.addFeature,
    };

    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const ssoRes = await component.add(context, inputs);
    assert.isTrue(ssoRes.isErr() && ssoRes.error.name === "FileNotFoundError");
  });

  it("add sso failed for VS v3 project due to unexpected error", async () => {
    const component = Container.get(ComponentNames.SSO) as any;
    const inputs: InputsWithProjectPath = {
      projectPath: "projectPath",
      platform: Platform.VS,
      language: "csharp",
      "app-name": appName,
      stage: Stage.addFeature,
    };

    vi.spyOn(fs, "pathExists").mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.spyOn(fs, "ensureDir").mockRejectedValue(new Error("errorMessage"));
    vi.spyOn(fs, "remove").mockResolvedValue();
    vi.spyOn(templateUtils, "unzip").mockImplementation(() => {
      throw new Error("errorMessage");
    });
    const ssoRes = await component.add(context, inputs);
    assert.isTrue(ssoRes.isErr() && ssoRes.error.name === "FailedToCreateAuthFiles");
  });
});
