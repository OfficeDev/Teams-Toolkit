const fs = require("node:fs");

const ceaEnvironmentName = "TEAMSFX_CEA_ENABLED";
const ceaSettingName = "M365AgentsToolkit.enableLaunchAgentForTeamsInCopilot";
const defaultSettingsPaths = [
  "/tmp/vscode-settings/settings.json",
  "/home/vscode/.config/Code/User/settings.json",
];

function syncVscodeFeatureFlags({
  environment = process.env,
  settingsPaths = defaultSettingsPaths,
} = {}) {
  const ceaValue = environment[ceaEnvironmentName];
  if (ceaValue === undefined) {
    return [];
  }
  if (ceaValue !== "true" && ceaValue !== "false") {
    throw new Error(`${ceaEnvironmentName} must be true or false`);
  }

  const updatedPaths = [];
  for (const settingsPath of settingsPaths) {
    let settingsText;
    try {
      settingsText = fs.readFileSync(settingsPath, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }
      throw error;
    }

    const settings = JSON.parse(settingsText);
    if (
      settings === null ||
      Array.isArray(settings) ||
      typeof settings !== "object"
    ) {
      throw new Error(`VS Code settings must be an object: ${settingsPath}`);
    }
    settings[ceaSettingName] = ceaValue === "true";
    fs.writeFileSync(
      settingsPath,
      `${JSON.stringify(settings, null, 2)}\n`,
      "utf8",
    );
    updatedPaths.push(settingsPath);
  }

  if (updatedPaths.length === 0) {
    throw new Error("No seeded VS Code settings file was found");
  }
  return updatedPaths;
}

if (require.main === module) {
  syncVscodeFeatureFlags();
}

module.exports = { syncVscodeFeatureFlags };
