// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import path from "path";
import {
  openCreateSelector,
  openSelectorFromJsonBytes,
  openSelectorPresentationFromJsonBytes,
} from "../../../src/v4/distribution/createSelector";
import { SelectorRoute } from "../../../src/v4/buildTarget/resolveBuildTarget";
import { assert } from "vitest";

/** The loose authoring tree the shipped `templates.zip` is built from. */
const TEMPLATES_V4_DIR = path.resolve(__dirname, "../../../../../templates/v4");

/**
 * Build an in-memory channel floor from the loose `templates/v4` source — the
 * same `addLocalFolder(templates/v4, "v4")` layout `generateV4Zip.js` ships, so
 * the test exercises the real `v4/create/selector.json` entry with no built
 * `templates.zip` artifact (CI-clean).
 */
function buildFloor(): Buffer {
  const zip = new AdmZip();
  zip.addLocalFolder(TEMPLATES_V4_DIR, "v4");
  return zip.toBuffer();
}

describe("openCreateSelector (resolve-build-target AC-22)", () => {
  it("AC-23: reads and parses raw create-selector.json bytes without a full package", () => {
    const bytes = fs.readFileSync(path.join(TEMPLATES_V4_DIR, "create", "selector.json"));

    const result = openSelectorFromJsonBytes(bytes, "create");

    assert.isTrue(result.isOk());
    if (result.isOk()) {
      const v4Route = result.value.routes.find(
        (route: SelectorRoute) => route.engine === "v4" && route.templateId === "da/mcp-server"
      );
      assert.isDefined(v4Route, "the raw create selector carries the v4 da/mcp-server route");
    }
  });

  it("AC-23: invalid raw selector JSON returns PackageFileInvalid", () => {
    const result = openSelectorFromJsonBytes(Buffer.from("{"), "create");

    assert.isTrue(result.isErr());
    assert.strictEqual(result._unsafeUnwrapErr().name, "PackageFileInvalid");
  });

  it("AC-23: reads selector presentation from raw selector bytes", () => {
    const bytes = fs.readFileSync(path.join(TEMPLATES_V4_DIR, "modify", "selector.json"));

    const result = openSelectorPresentationFromJsonBytes(bytes, "modify");

    assert.isTrue(result.isOk());
    if (result.isOk()) {
      assert.isArray(result.value.questions);
    }
  });

  it("AC-22: reads and parses the real shipped create selector from the floor", () => {
    const result = openCreateSelector(buildFloor());

    assert.isTrue(result.isOk());
    if (result.isOk()) {
      const v4Route = result.value.routes.find(
        (route: SelectorRoute) => route.engine === "v4" && route.templateId === "da/mcp-server"
      );
      assert.isDefined(v4Route, "the shipped selector carries the v4 da/mcp-server route");
      assert.isArray(result.value.questions);
    }
  });

  it("AC-22: bytes that are not a valid archive -> SystemError", () => {
    const result = openCreateSelector(Buffer.from("this is not a zip"));

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.instanceOf(result.error, SystemError);
      assert.equal(result.error.name, "TemplatePackageCorrupt");
    }
  });

  it("AC-22: a floor missing the selector entry -> SystemError", () => {
    const zip = new AdmZip();
    zip.addFile("v4/create/da/mcp-server/descriptor.json", Buffer.from("{}"));

    const result = openCreateSelector(zip.toBuffer());

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.instanceOf(result.error, SystemError);
      assert.equal(result.error.name, "PackageFileMissing");
    }
  });

  it("AC-22: a selector entry that is not valid JSON -> SystemError", () => {
    const zip = new AdmZip();
    zip.addFile("v4/create/selector.json", Buffer.from("{ not valid json"));

    const result = openCreateSelector(zip.toBuffer());

    assert.isTrue(result.isErr());
    if (result.isErr()) {
      assert.instanceOf(result.error, SystemError);
      assert.equal(result.error.name, "PackageFileInvalid");
    }
  });

  it("AC-22: a structurally malformed selector -> parseSelectorSpec error", () => {
    const zip = new AdmZip();
    zip.addFile("v4/create/selector.json", Buffer.from(JSON.stringify({ questions: {} })));

    const result = openCreateSelector(zip.toBuffer());

    assert.isTrue(result.isErr());
  });
});
