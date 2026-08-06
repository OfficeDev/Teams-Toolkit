// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { assert } from "vitest";

import { normalizeLegacyCopilotUrl } from "../../src/debug/teamsfxDebugProvider";

describe("normalizeLegacyCopilotUrl", () => {
  it("rewrites the legacy local declarative-agent URL to the titleId form", () => {
    const legacy =
      "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${local:agent-hint}?auth=2&developerMode=Basic";
    assert.equal(
      normalizeLegacyCopilotUrl(legacy),
      "https://m365.cloud.microsoft/chat/?titleId=${local:agent-hint}&source=agents-toolkit"
    );
  });

  it("rewrites the legacy remote declarative-agent URL to the titleId form", () => {
    const legacy =
      "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${agent-hint}?auth=2&developerMode=Basic";
    assert.equal(
      normalizeLegacyCopilotUrl(legacy),
      "https://m365.cloud.microsoft/chat/?titleId=${agent-hint}&source=agents-toolkit"
    );
  });

  it("leaves URLs carrying ${account-hint} untouched", () => {
    const legacyWithAccountHint =
      "https://m365.cloud.microsoft/chat/entity1-d870f6cd-4aa5-4d42-9626-ab690c041429/${local:agent-hint}?auth=2&${account-hint}&developerMode=Basic";
    assert.equal(normalizeLegacyCopilotUrl(legacyWithAccountHint), legacyWithAccountHint);
  });

  it("leaves the already-updated titleId URL untouched (idempotent)", () => {
    const current =
      "https://m365.cloud.microsoft/chat/?titleId=${local:agent-hint}&source=agents-toolkit";
    assert.equal(normalizeLegacyCopilotUrl(current), current);
  });

  it("leaves non-Copilot URLs untouched", () => {
    const teams =
      "https://teams.microsoft.com/l/app/${{local:TEAMS_APP_ID}}?installAppPackage=true&webjoin=true&${account-hint}";
    assert.equal(normalizeLegacyCopilotUrl(teams), teams);
  });
});
