const fs = require("node:fs");
const { parseDocument } = require("yaml");

const featureFlagPrefix = "feature_flag:";
const featureFlagPattern = /^([A-Z][A-Z0-9_]*)=(true|false)$/;

function readFeatureFlags(planText) {
  const plan = JSON.parse(planText);
  const tags = plan?.plan_metadata?.tags;
  if (!Array.isArray(tags)) {
    return [];
  }

  const flags = [];
  const names = new Set();
  for (const tag of tags) {
    if (typeof tag !== "string" || !tag.startsWith(featureFlagPrefix)) {
      continue;
    }

    const match = featureFlagPattern.exec(tag.slice(featureFlagPrefix.length));
    if (match === null || names.has(match[1])) {
      throw new Error(`Invalid plan feature flag tag: ${tag}`);
    }
    names.add(match[1]);
    flags.push({ name: match[1], value: match[2] });
  }
  return flags;
}

function prepareVscuseConfig(configText, planText) {
  const document = parseDocument(configText, { uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`Invalid vscuse config: ${document.errors[0].message}`);
  }

  for (const flag of readFeatureFlags(planText)) {
    document.setIn(["docker", "environment", flag.name], flag.value);
  }
  return document.toString();
}

function main(args) {
  if (args.length !== 3) {
    throw new Error(
      "Usage: node prepare-vscuse-config.cjs <config> <plan> <output>",
    );
  }
  const [configPath, planPath, outputPath] = args;
  const configText = fs.readFileSync(configPath, "utf8");
  const planText = fs.readFileSync(planPath, "utf8");
  fs.writeFileSync(
    outputPath,
    prepareVscuseConfig(configText, planText),
    "utf8",
  );
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { prepareVscuseConfig };
