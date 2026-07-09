import { Inputs, Platform } from "@microsoft/teamsfx-api";
import path from "path";
import { assert, vi } from "vitest";
import { featureFlagManager, FeatureFlags } from "../../../src/common/featureFlags";
import { createContext, setTools } from "../../../src/common/globalVars";
import { DefaultTemplateGenerator } from "../../../src/component/generator/defaultGenerator";
import { Generator } from "../../../src/component/generator/generator";
import { Generators } from "../../../src/component/generator/generatorProvider";
import { TemplateInfo } from "../../../src/component/generator/templates/templateInfo";
import { TemplateNames } from "../../../src/component/generator/templates/templateNames";
import { ProgrammingLanguage } from "../../../src/question/constants";
import { QuestionNames } from "../../../src/question/questionNames";
import { TabCapabilityOptions } from "../../../src/question/scaffold/vsc/CapabilityOptions";
import { MockTools, randomAppName } from "../../core/utils";

describe("TemplateGenerator", () => {
  const testInputsToTemplateName = new Map([
    [
      {
        [QuestionNames.Capabilities]: TabCapabilityOptions.nonSsoTab().id,
        [QuestionNames.ProgrammingLanguage]: ProgrammingLanguage.CSharp,
        targetFramework: "net8.0",
      },
      TemplateNames.TabSSR,
    ],
    [
      {
        [QuestionNames.Capabilities]: TabCapabilityOptions.nonSsoTab().id,
        [QuestionNames.ProgrammingLanguage]: ProgrammingLanguage.CSharp,
        targetFramework: "net9.0",
      },
      TemplateNames.TabSSR,
    ],
  ]);

  setTools(new MockTools());
  const ctx = createContext();
  const destinationPath = path.join(__dirname, "tmp");
  const sandbox = vi;
  let scaffoldingSpy: any;
  let inputs: Inputs;

  beforeEach(() => {
    scaffoldingSpy = vi.spyOn(DefaultTemplateGenerator.prototype, "scaffolding" as any);
    vi.spyOn(Generator, "generate").mockResolvedValue();
    inputs = {
      platform: Platform.VS,
      [QuestionNames.AppName]: randomAppName(),
      [QuestionNames.ProgrammingLanguage]: ProgrammingLanguage.JS,
    } as Inputs;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  testInputsToTemplateName.forEach(async (templateName, _inputs) => {
    it(`scaffolding ${templateName}`, async () => {
      inputs = { ...inputs, ..._inputs, [QuestionNames.TemplateName]: templateName };
      const res = await Generators.find((g) => g.activate(ctx, inputs))?.run(
        ctx,
        inputs,
        destinationPath
      );

      assert.isTrue(res?.isOk());
      assert.isTrue(scaffoldingSpy.mock.calls.length === 1);
      assert.equal((scaffoldingSpy.mock.calls[0][2] as TemplateInfo).templateName, templateName);
      assert.equal(
        (scaffoldingSpy.mock.calls[0][2] as TemplateInfo).language,
        inputs?.[QuestionNames.ProgrammingLanguage] || ProgrammingLanguage.JS
      );
    });
  });

  it("keeps Platform.VS on the v3 channel when TEAMSFX_V4_ENABLED is on", async () => {
    const realGetBooleanValue = featureFlagManager.getBooleanValue.bind(featureFlagManager);
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
      (f) => f.name === FeatureFlags.V4Enabled.name || realGetBooleanValue(f)
    );
    inputs = {
      ...inputs,
      [QuestionNames.Capabilities]: TabCapabilityOptions.nonSsoTab().id,
      [QuestionNames.ProgrammingLanguage]: ProgrammingLanguage.CSharp,
      [QuestionNames.TemplateName]: TemplateNames.TabSSR,
      targetFramework: "net8.0",
    } as Inputs;

    const res = await Generators.find((g) => g.activate(ctx, inputs))?.run(
      ctx,
      inputs,
      destinationPath
    );

    assert.isTrue(res?.isOk());
    assert.isTrue((Generator.generate as any).mock.calls.length > 0);
  });
});
