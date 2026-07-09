// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author yefuwang@microsoft.com
 */

import { err, Inputs, ok, Platform } from "@microsoft/teamsfx-api";
import { createContext, setTools } from "../../../src/common/globalVars";
import { developerPortalScaffoldUtils } from "../../../src/component/developerPortalScaffoldUtils";
import { TdpGenerator } from "../../../src/component/generator/other/tdpGenerator";
import { InputValidationError, UserCancelError } from "../../../src/error";
import { ProgrammingLanguage, QuestionNames } from "../../../src/question";
import { MockTools } from "../../core/utils";
import { chai, vi } from "vitest";

describe("TdpGenerator", function () {
  const sandbox = vi;

  beforeEach(() => {
    setTools(new MockTools());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("activate()", () => {
    it("return true", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: ".",
        teamsAppFromTdp: {},
      };
      const context = createContext();
      const generator = new TdpGenerator();
      const res = generator.activate(context, inputs);
      chai.assert.isTrue(res);
    });
  });
  describe("getTemplateInfos()", () => {
    it("InputValidationError", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: ".",
        teamsAppFromTdp: {},
      };
      const context = createContext();
      const generator = new TdpGenerator();
      const res = await generator.getTemplateInfos(context, inputs, ".");
      chai.assert.isTrue(res.isErr());
      if (res.isErr()) {
        chai.assert.isTrue(res.error instanceof InputValidationError);
      }
    });
    it("happy", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: ".",
        teamsAppFromTdp: {},
        [QuestionNames.TemplateName]: "non-sso-tab-ssr",
        [QuestionNames.AppName]: "test",
        [QuestionNames.SafeProjectName]: "safeprojectname",
        [QuestionNames.ProgrammingLanguage]: ProgrammingLanguage.CSharp,
        ["targetFramework"]: "net8.0",
      };
      const context = createContext();
      const generator = new TdpGenerator();
      let res = await generator.getTemplateInfos(context, inputs, ".");
      chai.assert.isTrue(res.isOk());
      if (res.isOk()) {
        chai.assert.equal(res.value[0].replaceMap?.["IsNet8Framework"], "true");
      }

      inputs["targetFramework"] = "net7.0";
      res = await generator.getTemplateInfos(context, inputs, ".");
      if (res.isOk()) {
        chai.assert.equal(res.value[0].replaceMap?.["IsNet8Framework"], "");
      }
    });
  });
  describe("post()", () => {
    it("update error", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: ".",
        teamsAppFromTdp: {},
      };
      vi.spyOn(developerPortalScaffoldUtils, "updateFilesForTdp").mockResolvedValue(
        err(new UserCancelError())
      );
      const context = createContext();
      const generator = new TdpGenerator();
      const res = await generator.post(context, inputs, ".");
      chai.assert.isTrue(res.isErr());
    });
    it("happy", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: ".",
        teamsAppFromTdp: {},
      };
      vi.spyOn(developerPortalScaffoldUtils, "updateFilesForTdp").mockResolvedValue(ok(undefined));
      const context = createContext();
      const generator = new TdpGenerator();
      const res = await generator.post(context, inputs, ".");
      chai.assert.isTrue(res.isOk());
    });
  });
});
