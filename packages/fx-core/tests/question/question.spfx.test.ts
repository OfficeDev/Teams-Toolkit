import { SPFxPackageSelectQuestion, SPFxWebpartNameQuestion } from "../../src/question/create";
import mockedEnv, { RestoreFn } from "mocked-env";
import {
  FuncValidation,
  Inputs,
  OptionItem,
  Platform,
  SingleSelectQuestion,
  Stage,
  TextInputQuestion,
} from "@microsoft/teamsfx-api";
import { getLocalizedString } from "../../src/common/localizeUtils";
import * as path from "path";
import fs from "fs-extra";
import { Utils } from "../../src/component/generator/spfx/utils/utils";
import { getValidationFunction } from "../../src/ui/validationUtils";
import { SPFxVersionOptionIds } from "../../src";
import { chai, vi } from "vitest";
describe("SPFx question-helpers", () => {
  describe("SPFxWebpartNameQuestion", () => {
    let mockedEnvRestore: RestoreFn;
    const previousInputs: Inputs = { platform: Platform.VSCode };
    beforeEach(() => {
      mockedEnvRestore = mockedEnv({ TEAMSFX_V3: "false" });
      previousInputs["projectPath"] = "c:\\testPath";
    });
    afterEach(() => {
      mockedEnvRestore();
    });

    it("Returns undefined when web part name not duplicated in create stage", async () => {
      previousInputs.stage = Stage.create;

      const res = await (
        (SPFxWebpartNameQuestion() as TextInputQuestion).validation! as FuncValidation<string>
      ).validFunc("helloworld", previousInputs);

      chai.expect(res).equal(undefined);
    });

    it("Returns not match pattern when web part name pattern mismatch in create stage", async () => {
      previousInputs.stage = Stage.create;
      const input = "1";

      const res = await (
        (SPFxWebpartNameQuestion() as TextInputQuestion).validation! as FuncValidation<string>
      ).validFunc(input, previousInputs);

      chai
        .expect(res)
        .equal(
          getLocalizedString(
            "plugins.spfx.questions.webpartName.error.notMatch",
            input,
            "^[a-zA-Z_][a-zA-Z0-9_]*$"
          )
        );
    });

    it("Returns undefined when web part name pattern duplicated in create stage", async () => {
      previousInputs.stage = Stage.create;
      const input = "helloworld";
      vi.spyOn(fs, "pathExists").mockImplementation(async (directory) => {
        if (
          directory === path.join(previousInputs!.projectPath!, "SPFx", "src", "webparts", input)
        ) {
          return true;
        }
      });

      const res = await (
        (SPFxWebpartNameQuestion() as TextInputQuestion).validation! as FuncValidation<string>
      ).validFunc(input, previousInputs);

      chai.expect(res).equal(undefined);
      vi.restoreAllMocks();
    });

    it("Returns undefined when web part name not duplicated in addFeature stage", async () => {
      previousInputs.stage = Stage.addFeature;
      const input = "helloworld";
      vi.spyOn(fs, "pathExists").mockImplementation(async (directory) => {
        if (
          directory === path.join(previousInputs!.projectPath!, "SPFx", "src", "webparts", input)
        ) {
          return false;
        }
      });
      previousInputs["spfx-folder"] = path.join(previousInputs!.projectPath!, "SPFx");
      const res = await (
        (SPFxWebpartNameQuestion() as TextInputQuestion).validation! as FuncValidation<string>
      ).validFunc(input, previousInputs);

      chai.expect(res).equal(undefined);
      vi.restoreAllMocks();
    });

    it("Returns not match pattern when web part name pattern mismatch in addFeature stage", async () => {
      previousInputs.stage = Stage.addFeature;
      const input = "1";

      const res = await (
        (SPFxWebpartNameQuestion() as TextInputQuestion).validation! as FuncValidation<string>
      ).validFunc(input, previousInputs);

      chai
        .expect(res)
        .equal(
          getLocalizedString(
            "plugins.spfx.questions.webpartName.error.notMatch",
            input,
            "^[a-zA-Z_][a-zA-Z0-9_]*$"
          )
        );
    });

    it("Returns duplicated when web part name pattern duplicated in addFeature stage", async () => {
      previousInputs.stage = Stage.addFeature;
      const input = "helloworld";
      vi.spyOn(fs, "pathExists").mockImplementation(async (directory) => {
        if (
          directory === path.join(previousInputs!.projectPath!, "SPFx", "src", "webparts", input)
        ) {
          return true;
        }
      });
      previousInputs["spfx-folder"] = path.join(previousInputs!.projectPath!, "SPFx");
      const res = await (
        (SPFxWebpartNameQuestion() as TextInputQuestion).validation! as FuncValidation<string>
      ).validFunc(input, previousInputs);

      chai
        .expect(res)
        .equal(
          getLocalizedString(
            "plugins.spfx.questions.webpartName.error.duplicate",
            path.join(previousInputs!.projectPath!, "SPFx", "src", "webparts", input)
          )
        );
      vi.restoreAllMocks();
    });
  });

  describe("SPFxPackageSelectQuestion", async () => {
    const sandbox = vi;

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("return undefined if choosing to install locally", async () => {
      const func = getValidationFunction<string>(
        (SPFxPackageSelectQuestion() as SingleSelectQuestion).validation!,
        { platform: Platform.VSCode }
      );
      const res = await func(SPFxVersionOptionIds.installLocally);
      chai.expect(res).equal(undefined);
    });

    it("return undefined if package exists", async () => {
      const func = getValidationFunction<string>(
        (SPFxPackageSelectQuestion() as SingleSelectQuestion).validation!,
        {
          platform: Platform.VSCode,
          globalSpfxPackageVersion: "1.17.0",
          globalYeomanPackageVersion: "1.0.0",
        }
      );
      const res = await func(SPFxVersionOptionIds.globalPackage);
      chai.expect(res).equal(undefined);
    });

    it("return undefined if missing Yeoman", async () => {
      const func = getValidationFunction<string>(
        (SPFxPackageSelectQuestion() as SingleSelectQuestion).validation!,
        { platform: Platform.VSCode, globalSpfxPackageVersion: "1.17.0" }
      );
      let error;
      try {
        await func(SPFxVersionOptionIds.globalPackage);
      } catch (e) {
        error = e;
      }
      chai.expect(error.name).equal("DevEnvironmentSetupError");
    });

    it("return undefined if missing SPFX generator", async () => {
      const func = getValidationFunction<string>(
        (SPFxPackageSelectQuestion() as SingleSelectQuestion).validation!,
        { platform: Platform.VSCode, globalYeomanPackageVersion: "4.3.0" }
      );
      let error;
      try {
        await func(SPFxVersionOptionIds.globalPackage);
      } catch (e) {
        error = e;
      }
      chai.expect(error.name).equal("DevEnvironmentSetupError");
    });

    it("throws error if inputs is undefined", async () => {
      const question = SPFxPackageSelectQuestion();

      let error;
      try {
        await (question.validation! as FuncValidation<string>).validFunc!(
          SPFxVersionOptionIds.globalPackage
        );
      } catch (e) {
        error = e;
      }
      chai.expect(error.name).equal("DevEnvironmentSetupError");
    });

    it("returns two options with package versions after loading", async () => {
      vi.spyOn(Utils, "findGloballyInstalledVersion").mockResolvedValue("1.17.0");
      vi.spyOn(Utils, "findLatestVersion").mockResolvedValue("1.17.4");

      const question = SPFxPackageSelectQuestion();
      const options = await question.dynamicOptions!({ platform: Platform.VSCode });

      chai.expect(options.length).equal(2);
      chai.expect((options[0] as OptionItem).label.includes("1.17.4")).equal(true);
    });

    it("returns two options without package versions after loading", async () => {
      vi.spyOn(Utils, "findGloballyInstalledVersion").mockResolvedValue(undefined);
      vi.spyOn(Utils, "findLatestVersion").mockResolvedValue(undefined);

      const question = SPFxPackageSelectQuestion();
      const options = await question.dynamicOptions!({ platform: Platform.VSCode });

      chai.expect(options.length).equal(2);
      chai
        .expect((options[0] as OptionItem).label)
        .equal(
          getLocalizedString("plugins.spfx.questions.packageSelect.installLocally.noVersion.label")
        );
      chai
        .expect((options[1] as OptionItem).label)
        .equal(
          getLocalizedString(
            "plugins.spfx.questions.packageSelect.useGlobalPackage.noVersion.label"
          )
        );
    });
  });
});
