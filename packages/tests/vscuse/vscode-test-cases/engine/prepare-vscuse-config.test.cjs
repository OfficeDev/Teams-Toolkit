const assert = require("node:assert/strict");
const test = require("node:test");
const { parse } = require("yaml");

const { prepareVscuseConfig } = require("./prepare-vscuse-config.cjs");

test("VCB-101: run config contains only the selected plan feature flags", () => {
  const configText = `docker:
  image_name: test-image
  environment:
    EXISTING_FLAG: keep
execution:
  stop_on_error: true
`;
  const planText = JSON.stringify({
    plan_metadata: {
      tags: [
        "case_id:copilot-case",
        "feature_flag:TEAMSFX_CEA_ENABLED=true",
        "feature_flag:TEAMSFX_OTHER_FLAG=false",
      ],
    },
  });

  const preparedText = prepareVscuseConfig(configText, planText);
  const prepared = parse(preparedText);

  assert.deepEqual(prepared.docker.environment, {
    EXISTING_FLAG: "keep",
    TEAMSFX_CEA_ENABLED: "true",
    TEAMSFX_OTHER_FLAG: "false",
  });
  assert.equal(configText.includes("TEAMSFX_CEA_ENABLED"), false);
});
