// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ProjectType } from "@microsoft/m365-spec-parser";
import { Platform } from "@microsoft/teamsfx-api";
import { assert } from "vitest";
import { createContext, setTools } from "../../../../src/common/globalVars";
import { getTemplateInfosFromApiSpec } from "../../../../src/component/generator/openApiSpec/common";
import { QuestionNames } from "../../../../src/question";
import { ProgrammingLanguage } from "../../../../src/question/constants";
import { MockTools } from "../../../core/utils";

describe("getTemplateInfosFromApiSpec", () => {
  it("succeeds without a telemetry reporter", async () => {
    const tools = new MockTools();
    tools.telemetryReporter = undefined;
    setTools(tools);
    const context = createContext();

    const result = await getTemplateInfosFromApiSpec(
      context,
      {
        platform: Platform.CLI,
        [QuestionNames.TemplateName]: "test-template",
        [QuestionNames.AppName]: "test-app",
        [QuestionNames.ProgrammingLanguage]: ProgrammingLanguage.TypeScript,
        [QuestionNames.ApiSpecLocation]: "openapi.yaml",
      },
      ProjectType.Copilot
    );

    assert.isTrue(result.isOk());
    assert.isUndefined(context.telemetryReporter);
  });
});
