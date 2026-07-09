// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * CD wrapper (v4-isolated): compute the digests of the staged v4 artifacts and
 * append a `{ version, artifacts }` entry to the v4 channel's NDJSON tag-list.
 *
 * The v4 channel tag-list is one JSON object per line (NDJSON), unlike v3's
 * newline-separated git-tag text — because v4 carries a content digest that is
 * not derivable from git tags. `parseArtifactTagList` in
 * packages/fx-core/src/v4/distribution/templateArtifacts.ts reads exactly this
 * format. Each artifact digest is `sha256:<hex>` over that artifact's raw
 * bytes, matching `computeDigest` in templateSource.ts (the single digest
 * authority).
 *
 * Re-running for an already-published version replaces that version's line
 * (idempotent), so a CD re-run does not duplicate entries.
 *
 * Usage (run AFTER the templates build, with build/v4 artifacts present):
 *   node .github/scripts/v4/generate-v4-tag-list.js \
 *     --create-selector <path to create-selector.json> \
 *     --modify-selector <path to modify-selector.json> \
 *     --metadata <path to templates-metadata.zip> \
 *     --templates <path to templates.zip> \
 *     --version <semver> \
 *     --ndjson <path to read existing + write merged NDJSON>
 *
 * The --ndjson file may be absent (first release); it is created.
 */

const crypto = require("crypto");
const fs = require("fs");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key || !key.startsWith("--") || value === undefined) {
      throw new Error(`Malformed argument near "${key}". Expected --flag value pairs.`);
    }
    args[key.slice(2)] = value;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const createSelector = args["create-selector"];
const modifySelector = args["modify-selector"];
const metadata = args.metadata;
const templates = args.templates;
const version = args.version;
const ndjson = args.ndjson;
if (!createSelector || !modifySelector || !metadata || !templates || !version || !ndjson) {
  throw new Error(
    "Missing required argument. Need --create-selector, --modify-selector, --metadata, --templates, --version and --ndjson."
  );
}

function digestFile(filePath) {
  const bytes = fs.readFileSync(filePath);
  return "sha256:" + crypto.createHash("sha256").update(bytes).digest("hex");
}

function artifact(file, filePath) {
  return { file, digest: digestFile(filePath) };
}

function isFinalEntry(value) {
  if (!value || typeof value !== "object" || typeof value.version !== "string") {
    return false;
  }
  if (Object.prototype.hasOwnProperty.call(value, "digest")) {
    return false;
  }
  const existingArtifacts = value.artifacts;
  return (
    existingArtifacts &&
    typeof existingArtifacts === "object" &&
    existingArtifacts["create-selector"]?.file === "create-selector.json" &&
    existingArtifacts["modify-selector"]?.file === "modify-selector.json" &&
    existingArtifacts.metadata?.file === "templates-metadata.zip" &&
    existingArtifacts.templates?.file === "templates.zip"
  );
}

const artifacts = {
  "create-selector": artifact("create-selector.json", createSelector),
  "modify-selector": artifact("modify-selector.json", modifySelector),
  metadata: artifact("templates-metadata.zip", metadata),
  templates: artifact("templates.zip", templates),
};

// Read the existing NDJSON (if any) and index by version so a re-run replaces
// rather than duplicates. Missing file = first release.
const entries = new Map();
let existing = "";
try {
  existing = fs.readFileSync(ndjson, "utf8");
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}
for (const line of existing.split("\n")) {
  const trimmed = line.replace(/\r$/, "").trim();
  if (trimmed === "") {
    continue;
  }
  const parsed = JSON.parse(trimmed);
  if (!isFinalEntry(parsed)) {
    throw new Error(
      `Existing v4 tag-list entry for "${parsed.version ?? "unknown"}" is not in final { version, artifacts } shape.`
    );
  }
  entries.set(parsed.version, parsed);
}

entries.set(version, { version, artifacts });

const merged = [...entries.values()].map((entry) => JSON.stringify(entry)).join("\n") + "\n";
fs.writeFileSync(ndjson, merged);

console.log(
  `================== v4 tag-list entry: ${JSON.stringify(entries.get(version))} (${entries.size} total) ==================`
);
