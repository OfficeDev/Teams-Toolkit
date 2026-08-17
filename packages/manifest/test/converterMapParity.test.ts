// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as chai from "chai";
import fs from "fs-extra";
import "mocha";
import * as path from "path";
import {
  ApiPluginManifestConverter,
  DeclarativeAgentManifestConverter,
  TeamsManifestConverter,
} from "../src";

// These tests guard against drift between the JSON schema folders under
// src/json-schemas and the converter dispatch maps in src/generated-types/index.ts.
// When a new schema version is added (and `npm run convert` regenerates the per-version
// type files), the corresponding entry in the converter map must also be added.
// Without these tests, a missing map entry silently degrades `jsonToManifest` to an
// unchecked cast (the source of issue #15837 for declarative-agent v1.5/v1.6).

const schemasRoot = path.join(__dirname, "..", "src", "json-schemas");

function listVersions(folder: string): string[] {
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function probeConverter(
  converter: { jsonToManifest(json: string): unknown },
  versionField: string,
  versionValue: string
): boolean {
  // A registered version throws on invalid shape (quicktype `cast()`).
  // An unregistered version returns the unchecked cast without throwing.
  const badJson = JSON.stringify({ [versionField]: versionValue });
  try {
    converter.jsonToManifest(badJson);
    return false;
  } catch {
    return true;
  }
}

describe("Converter map parity with json-schemas folders", () => {
  it("declarative-agent: every schema folder has a registered converter", () => {
    const folder = path.join(schemasRoot, "copilot", "declarative-agent");
    const versions = listVersions(folder);
    chai.expect(versions.length, "no declarative-agent schemas found").to.be.greaterThan(0);

    const missing = versions.filter(
      (v) => !probeConverter(DeclarativeAgentManifestConverter, "version", v)
    );
    chai
      .expect(missing, `daConverterMap missing entries for: ${missing.join(", ")}`)
      .to.deep.equal([]);
  });

  it("api-plugin: every schema folder has a registered converter", () => {
    const folder = path.join(schemasRoot, "copilot", "plugin");
    const versions = listVersions(folder);
    chai.expect(versions.length, "no plugin schemas found").to.be.greaterThan(0);

    const missing = versions.filter(
      (v) => !probeConverter(ApiPluginManifestConverter, "schema_version", v)
    );
    chai
      .expect(missing, `ApiPluginConverterMap missing entries for: ${missing.join(", ")}`)
      .to.deep.equal([]);
  });

  it("teams: every schema folder has a registered converter (with documented exemptions)", () => {
    const folder = path.join(schemasRoot, "teams");
    const versions = listVersions(folder);
    chai.expect(versions.length, "no teams schemas found").to.be.greaterThan(0);

    // Folder names use "v1.5"; map keys use "1.5". devPreview maps as-is.
    const toMapKey = (folderName: string) =>
      folderName === "vDevPreview" ? "devPreview" : folderName.replace(/^v/, "");

    // v1.0 has historically been intentionally absent from TeamsManifestConverterMap.
    // Add to this list if a future version is deliberately skipped, with a short reason.
    const knownExemptions = new Set<string>(["1.0"]);

    const missing = versions
      .map(toMapKey)
      .filter(
        (v) =>
          !knownExemptions.has(v) && !probeConverter(TeamsManifestConverter, "manifestVersion", v)
      );
    chai
      .expect(missing, `TeamsManifestConverterMap missing entries for: ${missing.join(", ")}`)
      .to.deep.equal([]);
  });
});
