import { OptionItem, err, ok } from "@microsoft/teamsfx-api";
import { PanelType } from "../../src/controls/PanelType";
import { WebviewPanel } from "../../src/controls/webviewPanel";
import { TreatmentVariableValue } from "../../src/exp/treatmentVariables";
import * as globalVariables from "../../src/globalVariables";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import { openTutorialHandler, selectTutorialsHandler } from "../../src/handlers/tutorialHandlers";
import * as vsc_ui from "../../src/qm/vsc_ui";
import { ExtTelemetry } from "../../src/telemetry/extTelemetry";
import { TelemetryTriggerFrom } from "../../src/telemetry/extTelemetryEvents";
import * as localizeUtils from "../../src/utils/localizeUtils";
import * as templatesMetadata from "@microsoft/teamsfx-core/build/component/generator/templates/metadata";

describe("tutorialHandlers", () => {
  describe("selectTutorialsHandler()", () => {
    it("Happy Path", async () => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      mockValue(TreatmentVariableValue, "inProductDoc", true);
      mockValue(globalVariables, "isSPFxProject", false);
      let tutorialOptions: OptionItem[] = [];
      vi.spyOn(vsc_ui, "VS_CODE_UI").value({
        selectOption: (options: any) => {
          tutorialOptions = options.options;
          return Promise.resolve(ok({ type: "success", result: { id: "test", data: "data" } }));
        },
        openUrl: () => Promise.resolve(ok(true)),
      });

      const result = await selectTutorialsHandler();

      assert.equal(tutorialOptions.length, 17);
      assert.isTrue(result.isOk());
      assert.equal(tutorialOptions[1].data, "https://aka.ms/teamsfx-notification-new");
    });

    it("SelectOption returns error", async () => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      mockValue(TreatmentVariableValue, "inProductDoc", true);
      mockValue(globalVariables, "isSPFxProject", false);
      let tutorialOptions: OptionItem[] = [];
      vi.spyOn(vsc_ui, "VS_CODE_UI").value({
        selectOption: (options: any) => {
          tutorialOptions = options.options;
          return Promise.resolve(err("error"));
        },
        openUrl: () => Promise.resolve(ok(true)),
      });

      const result = await selectTutorialsHandler();

      assert.equal(tutorialOptions.length, 17);
      assert.equal(result.isErr() ? result.error : "", "error");
    });

    it("SPFx projects - v3", async () => {
      vi.spyOn(localizeUtils, "localize").mockReturnValue("");
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      vi.spyOn(ExtTelemetry, "sendTelemetryErrorEvent");
      mockValue(TreatmentVariableValue, "inProductDoc", true);
      mockValue(globalVariables, "isSPFxProject", true);
      let tutorialOptions: OptionItem[] = [];
      vi.spyOn(vsc_ui, "VS_CODE_UI").value({
        selectOption: (options: any) => {
          tutorialOptions = options.options;
          return Promise.resolve(ok({ type: "success", result: { id: "test", data: "data" } }));
        },
        openUrl: () => Promise.resolve(ok(true)),
      });

      const result = await selectTutorialsHandler();

      assert.equal(tutorialOptions.length, 1);
      assert.isTrue(result.isOk());
      assert.equal(tutorialOptions[0].data, "https://aka.ms/teamsfx-add-cicd-new");
    });
  });

  describe("openTutorialHandler()", () => {
    it("Happy Path", async () => {
      vi.spyOn(vsc_ui, "VS_CODE_UI").value({
        openUrl: () => Promise.resolve(ok(true)),
      });
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(TreatmentVariableValue, "inProductDoc", true);
      const createOrShowStub = vi
        .spyOn(WebviewPanel, "createOrShow")
        .mockImplementation(() => undefined);

      const result = await openTutorialHandler([
        TelemetryTriggerFrom.Auto,
        { id: "cardActionResponse", data: "cardActionResponse" } as OptionItem,
      ]);

      assert.isTrue(result.isOk());
      assert.equal(result.isOk() ? result.value : "Not Equal", undefined);
      assert.isTrue(createOrShowStub.calledOnceWithExactly(PanelType.RespondToCardActions));
    });

    it("Template option", async () => {
      let openLink = "";
      vi.spyOn(ExtTelemetry, "sendTelemetryEvent");
      mockValue(TreatmentVariableValue, "inProductDoc", false);
      vi.spyOn(vsc_ui, "VS_CODE_UI").value({
        openUrl: (link: string) => {
          openLink = link;
          return Promise.resolve(ok(true));
        },
      });
      vi.spyOn(templatesMetadata, "getDefaultTemplatesOnPlatform").mockReturnValue([
        {
          id: "test",
          description: "test",
          language: "none",
          name: "test",
          link: "testLink",
        },
      ]);

      const result = await openTutorialHandler([
        TelemetryTriggerFrom.Auto,
        { id: "test", data: "test" } as OptionItem,
      ]);

      assert.isTrue(result.isOk());
      assert.equal(openLink, "testLink");
    });

    it("Args less than 2", async () => {
      const result = await openTutorialHandler();
      assert.isTrue(result.isOk());
      assert.equal(result.isOk() ? result.value : "Not Equal", undefined);
    });
  });
});
