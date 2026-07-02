// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import {
  bundledFloorDir,
  bundledFloorFrom,
  loadBundledFloor,
  loadBundledTemplateArtifacts,
} from "../../../src/v4/distribution/bundledFloor";
import { computeArtifactDigest } from "../../../src/v4/distribution/templateArtifacts";
import { computeDigest } from "../../../src/v4/distribution/templateSource";
import { assert } from "vitest";

describe("bundledFloor (v4)", () => {
  describe("bundledFloorFrom (pure)", () => {
    it("computes the digest from the bytes (not baked, decision #6)", () => {
      const bytes = Buffer.from("floor-bytes");
      const floor = bundledFloorFrom("6.11.0", bytes, "/some/templates.zip");
      assert.deepEqual(floor, {
        version: "6.11.0",
        digest: computeDigest(bytes),
        location: "/some/templates.zip",
      });
    });
  });

  describe("bundledFloorDir (location contract)", () => {
    it("resolves the baked floor under the templates folder's v4 subdirectory", () => {
      assert.strictEqual(path.basename(bundledFloorDir()), "v4");
    });
  });

  describe("loadBundledFloor (IO)", () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "v4-floor-"));
    });

    afterEach(() => {
      fs.removeSync(dir);
    });

    it("reads floor.json + templates.zip and computes the digest", () => {
      const bytes = Buffer.from("the-floor-package");
      fs.writeJsonSync(path.join(dir, "floor.json"), { version: "6.11.0" });
      fs.writeFileSync(path.join(dir, "templates.zip"), bytes);

      const floor = loadBundledFloor(dir);
      assert.strictEqual(floor.version, "6.11.0");
      assert.strictEqual(floor.digest, computeDigest(bytes));
      assert.strictEqual(floor.location, path.join(dir, "templates.zip"));
    });

    it("reads staged artifact locations and computes their digests", () => {
      const createSelector = Buffer.from("create-selector");
      const modifySelector = Buffer.from("modify-selector");
      const metadata = Buffer.from("metadata");
      const templates = Buffer.from("templates");
      fs.writeJsonSync(path.join(dir, "floor.json"), { version: "6.11.0" });
      fs.writeFileSync(path.join(dir, "create-selector.json"), createSelector);
      fs.writeFileSync(path.join(dir, "modify-selector.json"), modifySelector);
      fs.writeFileSync(path.join(dir, "templates-metadata.zip"), metadata);
      fs.writeFileSync(path.join(dir, "templates.zip"), templates);

      const artifacts = loadBundledTemplateArtifacts(dir);

      assert.strictEqual(artifacts.version, "6.11.0");
      assert.strictEqual(
        artifacts.artifacts["create-selector"].digest,
        computeArtifactDigest(createSelector)
      );
      assert.strictEqual(
        artifacts.artifacts["modify-selector"].digest,
        computeArtifactDigest(modifySelector)
      );
      assert.strictEqual(artifacts.artifacts.metadata.digest, computeArtifactDigest(metadata));
      assert.strictEqual(artifacts.artifacts.templates.digest, computeDigest(templates));
      assert.strictEqual(
        artifacts.locations["create-selector"],
        path.join(dir, "create-selector.json")
      );
      assert.strictEqual(artifacts.locations.templates, path.join(dir, "templates.zip"));
    });

    it("throws BundledFloorMissing when the manifest is absent", () => {
      expect(() => loadBundledFloor(dir)).toThrow(/BundledFloorMissing|manifest is missing/);
    });

    it("throws BundledFloorMissing when the package zip is absent", () => {
      fs.writeJsonSync(path.join(dir, "floor.json"), { version: "6.11.0" });
      expect(() => loadBundledFloor(dir)).toThrow(/BundledFloorMissing|package is missing/);
    });

    it("throws BundledFloorMalformed when version is missing", () => {
      fs.writeJsonSync(path.join(dir, "floor.json"), { notVersion: "x" });
      fs.writeFileSync(path.join(dir, "templates.zip"), Buffer.from("z"));
      expect(() => loadBundledFloor(dir)).toThrow(/BundledFloorMalformed|no string "version"/);
    });

    it("throws BundledTemplateArtifactMissing when a staged artifact is absent", () => {
      fs.writeJsonSync(path.join(dir, "floor.json"), { version: "6.11.0" });
      fs.writeFileSync(path.join(dir, "modify-selector.json"), Buffer.from("modify-selector"));
      fs.writeFileSync(path.join(dir, "templates-metadata.zip"), Buffer.from("metadata"));
      fs.writeFileSync(path.join(dir, "templates.zip"), Buffer.from("templates"));

      expect(() => loadBundledTemplateArtifacts(dir)).toThrow(
        /BundledTemplateArtifactMissing|missing or unreadable/
      );
    });
  });
});
