// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author zhaofengxu@microsoft.com
 */

import { err, Inputs, ok, OptionItem, Platform, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { RestoreFn } from "mocked-env";
import { createContext, setTools } from "../../../src/common/globalVars";
import { developerPortalScaffoldUtils } from "../../../src/component/developerPortalScaffoldUtils";
import { CombinedProjectGenerator } from "../../../src/component/generator/combinedProject/generator";
import { TemplateNames } from "../../../src/component/generator/templates/templateNames";
import { ApiAuthOptions, ProgrammingLanguage, QuestionNames } from "../../../src/question";
import {
  DACapabilityOptions,
  setTemplateNameAndGC,
} from "../../../src/question/scaffold/vsc/CapabilityOptions";
import { MockTools } from "../../core/utils";
import { assert, vi } from "vitest";

describe("combined generator", async () => {
  setTools(new MockTools());
  let mockedEnvRestore: RestoreFn | undefined;
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });
  describe("activate and get template name", async () => {
    it("declarative-agent-with-graph-connector", async () => {
      const generator = new CombinedProjectGenerator();
      const context = createContext();
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithGraphConnector,
        [QuestionNames.AppName]: "app",
      };
      let res = await generator.activate(context, inputs);
      let info = await generator.getTemplateInfos(context, inputs, ".");
      assert.isTrue(res);
      assert.equal(info.isOk() && info.value[0].templateName, TemplateNames.GraphConnector);

      inputs[QuestionNames.ProgrammingLanguage] = ProgrammingLanguage.CSharp;
      inputs[QuestionNames.ApiAuth] = ApiAuthOptions.microsoftEntra().id;
      inputs[QuestionNames.TemplateName] = TemplateNames.DeclarativeAgentBasic;
      res = await generator.activate(context, inputs);
      info = await generator.getTemplateInfos(context, inputs, ".");
      assert.isFalse(res);
      assert.equal(info.isOk() && info.value[0].templateName, TemplateNames.DeclarativeAgentBasic);
    });
  });

  describe("post", async () => {
    it("add plugin success", async () => {
      const generator = new CombinedProjectGenerator();
      const context = createContext();
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithGraphConnector,
        [QuestionNames.AppName]: "app",
      };

      vi.spyOn(fs, "copySync").mockReturnValue();
      vi.spyOn(fs, "removeSync").mockReturnValue();

      const res = await generator.post(context, inputs, "");
      assert.isTrue(res.isOk());
    });

    it("post calls updateFilesForTdp when teamsAppFromTdp is set", async () => {
      const generator = new CombinedProjectGenerator();
      const context = createContext();
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "./",
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithGraphConnector,
        [QuestionNames.AppName]: "app",
        teamsAppFromTdp: { teamsAppId: "fake-id" },
      };

      vi.spyOn(fs, "copySync").mockReturnValue();
      vi.spyOn(fs, "removeSync").mockReturnValue();
      vi.spyOn(developerPortalScaffoldUtils, "updateFilesForTdp").mockResolvedValue(ok(undefined));

      const res = await generator.post(context, inputs, "");
      assert.isTrue(res.isOk());
    });

    it("post returns error when updateFilesForTdp fails in TDP flow", async () => {
      const generator = new CombinedProjectGenerator();
      const context = createContext();
      const inputs: Inputs = {
        platform: Platform.VSCode,
        projectPath: "./",
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithGraphConnector,
        [QuestionNames.AppName]: "app",
        teamsAppFromTdp: { teamsAppId: "fake-id" },
      };

      vi.spyOn(fs, "copySync").mockReturnValue();
      vi.spyOn(fs, "removeSync").mockReturnValue();
      vi.spyOn(developerPortalScaffoldUtils, "updateFilesForTdp").mockResolvedValue(
        err(new UserError("fakeSource", "fakeError", "fakeError"))
      );

      const res = await generator.post(context, inputs, "");
      assert.isTrue(res.isErr() && res.error.name === "fakeError");
    });
  });

  describe("functions", async () => {
    it("setTemplateNameAndGC", async () => {
      const inputs: Inputs = {
        platform: Platform.CLI,
        projectPath: "./",
        [QuestionNames.Capabilities]: "api-plugin",
        [QuestionNames.TemplateName]: TemplateNames.DeclarativeAgentWithGraphConnector,
        [QuestionNames.AppName]: "app",
      };
      const optionItem = {
        id: DACapabilityOptions.withGC().id,
        data: "test-template",
      } as OptionItem;

      setTemplateNameAndGC(optionItem, inputs);

      optionItem.id = DACapabilityOptions.noPlugin().id;
      setTemplateNameAndGC(optionItem, inputs);
    });
  });
});
