const path = require("path");
const semver = require("semver");
const fs = require("fs");

const templatePath = path.join(__dirname, "../../templates");
const templateVersion = require(path.join(
  templatePath,
  "package.json"
)).version;

const fxCorePath = path.join(__dirname, "../../packages/fx-core");
const templateConfigFile = path.join(
  fxCorePath,
  "./src/common/templates-config.json"
);
const templateConfigs = JSON.parse(fs.readFileSync(templateConfigFile));
const command = process.argv[2];

if (command === 'syncVersion') {
  syncTemplateVersion(templateVersion, templateConfigs);
} else if (command === 'updateUseLocalFlag') {
  updateUseLocalFlag(templateVersion, templateConfigs)
} else {
  console.warn(
    `================== invalid command '${command}' for fxcore-sync-up-version.js ==================`
  )
}

fs.writeFileSync(templateConfigFile, JSON.stringify(templateConfigs, null, 4));

function syncTemplateVersion(templateVersion, templateConfigs) {
  console.log(
    `================== template version: ${templateVersion} ==================`
  );

  console.log(
    `================== template version in fx-core configurate as ${templateConfigs.version} ==================`
  );
  templateConfigs.localVersion = templateVersion;
  if (!semver.prerelease(templateVersion)) {
    if (!semver.intersects(templateConfigs.version, templateVersion)) {
      const parsedTemplateVersion = semver.parse(templateVersion);
      const templateVersionRange = `~${parsedTemplateVersion.major}.${parsedTemplateVersion.minor}`;
      console.log(
        `================== template config version is not match with template latest release version, need bump up config version ${templateVersionRange} ==================`
      );
      templateConfigs.version = templateVersionRange;
    }
  } else if (templateVersion.includes("rc")) {
    console.log("sync up template in fx-core as 0.0.0-rc");
    templateConfigs.version = "0.0.0-rc";
  }
}

function updateUseLocalFlag(templateVersion, templateConfigs) {
  // Bundle the in-tree templates & metadata (useLocalTemplate = true) for every
  // build EXCEPT a stable production release, i.e. a stable (non-prerelease)
  // template version AND goproduct=true (PRODUCTION env). A stable production
  // release downloads the published templates instead; every other build (alpha,
  // preview/beta, rc, and any non-goproduct build) stays self-contained so a PR's
  // CD-built vsix reflects its own template/metadata/wizard changes.
  const isStableRelease = !semver.prerelease(templateVersion);
  const isProduction = process.env.PRODUCTION === "true";
  if (isStableRelease && isProduction) {
    templateConfigs.useLocalTemplate = false;
  } else {
    templateConfigs.useLocalTemplate = true;
  }
  console.log(`================== configure useLocalFlag: ${templateConfigs.useLocalTemplate} ==================`)
}
