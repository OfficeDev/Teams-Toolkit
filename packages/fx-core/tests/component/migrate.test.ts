import { convertProjectSettingsV2ToV3 } from "../../src/component/migrate";
import { assert } from "vitest";

describe("convertProjectSettingsV2ToV3", () => {
  it("happy", async () => {
    const settings: any = {
      appName: "test",
      projectId: "test",
      solutionSettings: {
        name: "fx-solution-azure",
        version: "1.0.0",
        activeResourcePlugins: ["fx-resource-bot"],
        capabilities: ["message-extension"],
      },
      pluginSettings: {
        "fx-resource-bot": {
          "host-type": "azure-functions",
          capabilities: [],
        },
      },
    };
    const res = convertProjectSettingsV2ToV3(settings, ".");
    assert.isDefined(res);
    const botComponent = res.components.find((c: any) => c.name === "teams-bot");
    assert.isDefined(botComponent);
    if (botComponent) {
      assert.include(botComponent.capabilities, "message-extension");
    }
  });
});
