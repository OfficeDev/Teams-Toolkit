const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { syncVscodeFeatureFlags } = require("./sync-vscode-feature-flags.cjs");

test("VCB-102: CEA environment is synchronized only when declared", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vscuse-settings-"));
  context.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  const settingsPath = path.join(directory, "settings.json");
  fs.writeFileSync(settingsPath, JSON.stringify({ "editor.codeLens": true }));

  syncVscodeFeatureFlags({
    environment: {},
    settingsPaths: [settingsPath],
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, "utf8")), {
    "editor.codeLens": true,
  });

  syncVscodeFeatureFlags({
    environment: { TEAMSFX_CEA_ENABLED: "true" },
    settingsPaths: [settingsPath],
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, "utf8")), {
    "editor.codeLens": true,
    "M365AgentsToolkit.enableLaunchAgentForTeamsInCopilot": true,
  });

  syncVscodeFeatureFlags({
    environment: { TEAMSFX_CEA_ENABLED: "false" },
    settingsPaths: [settingsPath],
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(settingsPath, "utf8")), {
    "editor.codeLens": true,
    "M365AgentsToolkit.enableLaunchAgentForTeamsInCopilot": false,
  });
});
