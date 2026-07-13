// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError, UserError } from "@microsoft/teamsfx-api";
import * as path from "path";
import AdmZip from "adm-zip";
import { assert } from "vitest";
import { validateDeclarativeTemplateArchive } from "../../../src/v4/validation/templateArchiveValidation";

const V4_ROOT = path.resolve(__dirname, "../../../../../templates/v4");
let fullArchiveCache: Buffer | undefined;
const runtimeErrors = {
  user: (name: string, message: string) => new UserError({ source: "Scaffold", name, message }),
  system: (name: string, message: string) => new SystemError({ source: "Scaffold", name, message }),
};

function fullArchive(): Buffer {
  if (fullArchiveCache === undefined) {
    const zip = new AdmZip();
    zip.addLocalFolder(V4_ROOT, "v4");
    fullArchiveCache = zip.toBuffer();
  }
  return fullArchiveCache;
}

function selectorOnlyArchive(): AdmZip {
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(V4_ROOT, "schema"), "v4/schema");
  zip.addLocalFile(path.join(V4_ROOT, "create", "selector.json"), "v4/create");
  zip.addLocalFile(path.join(V4_ROOT, "modify", "selector.json"), "v4/modify");
  return zip;
}

describe("v4/validation/templateArchiveValidation", () => {
  it("AC-29: archive validation uses the caller-owned error factory", () => {
    const zip = selectorOnlyArchive();
    const selector = zip.getEntry("v4/create/selector.json");
    if (selector === null) {
      throw new Error("expected create selector entry");
    }
    selector.setData(Buffer.from(JSON.stringify({ routes: "not-an-array" }), "utf8"));

    const errors = {
      source: "TemplatesBuild",
      user(name: string, message: string) {
        return Object.assign(new Error(message), {
          name,
          source: this.source,
          timestamp: new Date(),
        });
      },
      system(name: string, message: string) {
        return Object.assign(new Error(message), {
          name,
          source: this.source,
          timestamp: new Date(),
        });
      },
    };

    const result = validateDeclarativeTemplateArchive(zip.toBuffer(), "build", "6.11.0", errors);

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().source, "TemplatesBuild");
  });

  it("AC-25: descriptor-less package metadata is not omitted from archive validation", () => {
    const zip = new AdmZip(fullArchive());
    zip.addFile(
      "v4/create/aa-orphan/questions.json",
      Buffer.from(JSON.stringify({ questions: [] }), "utf8")
    );
    zip.addFile(
      "v4/create/aa-orphan/pipeline.json",
      Buffer.from(JSON.stringify({ pipeline: "default", steps: [] }), "utf8")
    );

    const result = validateDeclarativeTemplateArchive(
      zip.toBuffer(),
      "build",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TemplatePackageRequiredFile");
    assert.include(result._unsafeUnwrapErr().message, "create/aa-orphan");
    assert.include(result._unsafeUnwrapErr().message, "descriptor.json");
  });

  it("AC-26: drive-qualified content paths are rejected before rendering", () => {
    const zip = new AdmZip(fullArchive());
    zip.addFile("v4/create/da/mcp-server/content/z:/payload.txt", Buffer.from("unsafe", "utf8"));

    const result = validateDeclarativeTemplateArchive(
      zip.toBuffer(),
      "build",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TemplatePackageUnsafePath");
    assert.include(result._unsafeUnwrapErr().message, "z:/payload.txt");
  });

  it("AC-27: selectors are schema-validated even when the archive has no packages", () => {
    const zip = selectorOnlyArchive();
    const selector = zip.getEntry("v4/create/selector.json");
    if (selector === null) {
      throw new Error("expected create selector entry");
    }
    selector.setData(Buffer.from(JSON.stringify({ routes: "not-an-array" }), "utf8"));

    const result = validateDeclarativeTemplateArchive(
      zip.toBuffer(),
      "build",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TemplatePackageSchema");
    assert.include(result._unsafeUnwrapErr().message, "v4/create/selector.json");
  });
});
