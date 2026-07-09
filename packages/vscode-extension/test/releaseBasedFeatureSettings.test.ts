import { assert } from "vitest";
import { releaseControlledFeatureSettings } from "../src/releaseBasedFeatureSettings";

describe("releaseControlledFeatureSettings", () => {
  it("verify default values", async () => {
    const settings = releaseControlledFeatureSettings;
    assert.isFalse(settings.shouldEnableTeamsCopilotChatUI);
  });
});
