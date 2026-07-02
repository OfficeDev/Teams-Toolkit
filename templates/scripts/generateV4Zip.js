// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * Generate the single full v4 template package + bundled-floor manifest.
 *
 * Unlike the v3 per-language zips (common/js/ts/python.zip), the v4 channel
 * ships ONE `templates.zip` (ADR-0006 / scaffolding.create.proposal.md). This
 * script bundles two things into that single zip:
 *   1. the existing VSC template content under `<lang>/<scenario>/` paths
 *      (the v3 mirror, consumed by the transitional `{language, scenario}`
 *      locator), and
 *   2. the v4 authored packages under `v4/<kind>/<templateId>/`
 *      (descriptor/questions/pipeline JSON + a self-contained `content/`),
 *      consumed by the `{templateId}` locator once it ships.
 * v3 and v4 coexist; nothing here is stitched or synthesized — every byte is
 * authored (scaffolding.create.proposal.md §3 "authored, not generated").
 *
 * Outputs (both picked up by the `distribute` step → packages/fx-core/templates/v4/):
 *   - build/v4/templates.zip  — the full package
 *   - build/v4/floor.json     — { "version": <clean v4 publish version> }
 *
 * The floor version is the SAME clean, suffix-free version published to the v4
 * channel (computeV4PublishVersion / templates-config.json v4.localVersion), not
 * the raw minted package version: an odd-minor preview is minted as
 * `6.11.1-beta.<date>` but ships everywhere as `6.11.<date>`, so the bundled
 * floor and the online release report one identical version. Runs at build time
 * (lerna's `postversion` hook), so the minted version is already in package.json.
 *
 * The digest is NOT written here: it is computed from the bytes at load time
 * so `computeDigest` stays the single authority (resolve-template-source spec
 * decision #6). `loadBundledFloor` reads these two files.
 */

const AdmZip = require("adm-zip");
const { readdirSync, mkdirSync, writeFileSync, existsSync, copyFileSync } = require("node:fs");
const path = require("path");
const semver = require("semver");

// Mirror of packages/fx-core/src/v4/distribution/templateConfig.ts
// `computeV4PublishVersion` (canonical, unit-tested). Kept inline so the
// templates build needs no fx-core build output. A preview (-beta.<date>
// suffix) targets the odd-minor line, date-stamped patch (6.11.<date>) — an
// even-minor stable base bumps to the next odd minor, like the VSIX; stable
// (no date) is as-is. Keep in sync with canonical.
function computeV4PublishVersion(rawVersion) {
  const parsed = semver.parse(rawVersion);
  if (parsed === null) {
    throw new Error(`Cannot compute v4 publish version: "${rawVersion}" is not valid SemVer.`);
  }
  const dateStamp =
    parsed.prerelease[0] === "beta"
      ? parsed.prerelease.find((segment) => typeof segment === "number" && segment >= 1000000000)
      : undefined;
  if (dateStamp !== undefined) {
    const minor = parsed.minor % 2 === 0 ? parsed.minor + 1 : parsed.minor;
    return `${parsed.major}.${minor}.${dateStamp}`;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

function addV4MetadataFiles(zip, sourceRoot, zipRoot) {
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const zipPath = path.posix.join(zipRoot, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "content") {
        continue;
      }
      addV4MetadataFiles(zip, sourcePath, zipPath);
      continue;
    }
    if (
      ["selector.json", "descriptor.json", "questions.json", "pipeline.json"].includes(entry.name)
    ) {
      zip.addLocalFile(sourcePath, path.posix.dirname(zipPath));
    }
  }
}

const LANGUAGES = ["common", "js", "ts", "python"];
const BUILD_PATH = path.join(__dirname, "..", "build", "v4");
const rawVersion = require(path.join(__dirname, "..", "package.json")).version;
const version = computeV4PublishVersion(rawVersion);

mkdirSync(BUILD_PATH, { recursive: true });

const zip = new AdmZip();
LANGUAGES.forEach((lang) => {
  const langPath = path.join(__dirname, "..", "vsc", lang);
  readdirSync(langPath).forEach((scenario) => {
    zip.addLocalFolder(path.join(langPath, scenario), path.posix.join(lang, scenario));
  });
});

// v4 authored packages (templates/v4/{create,modify}/...) ship self-contained:
// each package carries its own descriptor/questions/pipeline JSON AND a complete
// content/ copied from v3 during the v3↔v4 coexistence window. Build only zips
// the authored bytes verbatim under the `v4/` prefix — no stitching, no
// synthesis (scaffolding.create.proposal.md §3 "authored, not generated").
const v4SourcePath = path.join(__dirname, "..", "v4");
if (existsSync(v4SourcePath)) {
  zip.addLocalFolder(v4SourcePath, "v4");

  copyFileSync(
    path.join(v4SourcePath, "create", "selector.json"),
    path.join(BUILD_PATH, "create-selector.json")
  );
  copyFileSync(
    path.join(v4SourcePath, "modify", "selector.json"),
    path.join(BUILD_PATH, "modify-selector.json")
  );

  const metadataZip = new AdmZip();
  addV4MetadataFiles(metadataZip, v4SourcePath, "v4");
  metadataZip.writeZip(path.join(BUILD_PATH, "templates-metadata.zip"));
}

console.log(`Generating v4 templates.zip (version ${version})`);
zip.writeZip(path.join(BUILD_PATH, "templates.zip"));

writeFileSync(path.join(BUILD_PATH, "floor.json"), JSON.stringify({ version }, null, 2) + "\n");
console.log(`Wrote v4 floor.json (version ${version})`);
