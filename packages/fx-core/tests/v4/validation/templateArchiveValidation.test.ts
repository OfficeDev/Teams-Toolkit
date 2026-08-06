// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError, UserError } from "@microsoft/teamsfx-api";
import * as path from "path";
import AdmZip from "adm-zip";
import { assert } from "vitest";
import {
  validateDeclarativePackageArchive,
  validateDeclarativeTemplateArchive,
} from "../../../src/v4/validation/templateArchiveValidation";

const V4_ROOT = path.resolve(__dirname, "../../../../../templates/v4");
let fullArchiveCache: Buffer | undefined;
const runtimeErrors = {
  user: (name: string, message: string) => new UserError({ source: "Scaffold", name, message }),
  system: (name: string, message: string) => new SystemError({ source: "Scaffold", name, message }),
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fullArchive(): Buffer {
  if (fullArchiveCache === undefined) {
    const zip = new AdmZip();
    zip.addLocalFolder(V4_ROOT, "v4");
    fullArchiveCache = zip.toBuffer();
  }
  return fullArchiveCache;
}

function archiveWithUnsafePosixContentPath(): Buffer {
  const zip = new AdmZip(fullArchive());
  const safeEntryName = "v4/create/da/mcp-server/content/_payload.txt";
  const unsafeEntryName = "v4/create/da/mcp-server/content//payload.txt";
  zip.addFile(safeEntryName, Buffer.from("unsafe", "utf8"));

  // addFile normalizes repeated separators, so rewrite the same-length name in both ZIP headers.
  const archive = zip.toBuffer();
  const safeEntryNameBytes = Buffer.from(safeEntryName, "utf8");
  const unsafeEntryNameBytes = Buffer.from(unsafeEntryName, "utf8");
  assert.equal(safeEntryNameBytes.length, unsafeEntryNameBytes.length);

  let replacementCount = 0;
  let offset = archive.indexOf(safeEntryNameBytes);
  while (offset >= 0) {
    unsafeEntryNameBytes.copy(archive, offset);
    replacementCount++;
    offset = archive.indexOf(safeEntryNameBytes, offset + safeEntryNameBytes.length);
  }
  assert.equal(replacementCount, 2, "expected entry names in local and central ZIP headers");
  return archive;
}

function selectorOnlyArchive(): AdmZip {
  const zip = new AdmZip();
  zip.addLocalFolder(path.join(V4_ROOT, "schema"), "v4/schema");
  zip.addLocalFile(path.join(V4_ROOT, "create", "selector.json"), "v4/create");
  zip.addLocalFile(path.join(V4_ROOT, "modify", "selector.json"), "v4/modify");
  return zip;
}

describe("v4/validation/templateArchiveValidation", () => {
  it("validates the complete archive and opens one package from the same final bytes", () => {
    const bytes = fullArchive();

    const archiveResult = validateDeclarativeTemplateArchive(
      bytes,
      "build",
      "6.11.0",
      runtimeErrors
    );
    const packageResult = validateDeclarativePackageArchive(
      bytes,
      { kind: "create", templateId: "da/mcp-server" },
      "load",
      "6.11.0",
      runtimeErrors
    );

    if (archiveResult.isErr()) {
      throw archiveResult.error;
    }
    assert.include(archiveResult.value, "create/da/mcp-server");
    if (packageResult.isErr()) {
      throw packageResult.error;
    }
    const loadedPackage = packageResult.value;
    assert.isTrue(isRecord(loadedPackage.descriptor));
    if (!isRecord(loadedPackage.descriptor)) {
      throw new Error("expected descriptor object");
    }
    assert.equal(loadedPackage.descriptor.id, "da/mcp-server");
    assert.isAbove(loadedPackage.content.length, 0);
  });

  it("rejects bytes that are not a zip archive", () => {
    const result = validateDeclarativeTemplateArchive(
      Buffer.from("not-a-zip"),
      "build",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TemplatePackageCorrupt");
  });

  it("rejects non-zip bytes when opening one package", () => {
    const result = validateDeclarativePackageArchive(
      Buffer.from("not-a-zip"),
      { kind: "create", templateId: "da/mcp-server" },
      "load",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TemplatePackageCorrupt");
  });

  it("rejects an archive with a missing schema file", () => {
    const zip = selectorOnlyArchive();
    zip.deleteFile("v4/schema/pipeline.schema.json");

    const result = validateDeclarativePackageArchive(
      zip.toBuffer(),
      { kind: "create", templateId: "da/mcp-server" },
      "load",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "PackageFileMissing");
    assert.include(result._unsafeUnwrapErr().message, "pipeline.schema.json");
  });

  it("rejects a schema file containing malformed JSON", () => {
    const zip = selectorOnlyArchive();
    zip.updateFile("v4/schema/pipeline.schema.json", Buffer.from("{"));

    const result = validateDeclarativeTemplateArchive(
      zip.toBuffer(),
      "build",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "PackageFileInvalid");
    assert.include(result._unsafeUnwrapErr().message, "pipeline.schema.json");
  });

  it("rejects a schema file whose JSON value is not a schema", () => {
    const zip = selectorOnlyArchive();
    zip.updateFile("v4/schema/pipeline.schema.json", Buffer.from("[]"));

    const result = validateDeclarativeTemplateArchive(
      zip.toBuffer(),
      "build",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TemplateSchemaInvalid");
    assert.include(result._unsafeUnwrapErr().message, "pipeline.schema.json");
  });

  it("rejects a schema set that AJV cannot compile", () => {
    const zip = selectorOnlyArchive();
    zip.updateFile(
      "v4/schema/pipeline.schema.json",
      Buffer.from(JSON.stringify({ type: "not-a-json-schema-type" }))
    );

    const result = validateDeclarativeTemplateArchive(
      zip.toBuffer(),
      "build",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TemplateSchemaInvalid");
    assert.include(result._unsafeUnwrapErr().message, "could not be compiled");
  });

  it("rejects a selector containing malformed JSON", () => {
    const zip = selectorOnlyArchive();
    zip.updateFile("v4/modify/selector.json", Buffer.from("{"));

    const result = validateDeclarativeTemplateArchive(
      zip.toBuffer(),
      "build",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "PackageFileInvalid");
    assert.include(result._unsafeUnwrapErr().message, "v4/modify/selector.json");
  });

  it("rejects an invalid selector when opening one package", () => {
    const zip = selectorOnlyArchive();
    const selector = zip.getEntry("v4/create/selector.json");
    if (selector === null) {
      throw new Error("expected create selector entry");
    }
    selector.setData(Buffer.from(JSON.stringify({ routes: "not-an-array" }), "utf8"));

    const result = validateDeclarativePackageArchive(
      zip.toBuffer(),
      { kind: "create", templateId: "da/mcp-server" },
      "load",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TemplatePackageSchema");
    assert.include(result._unsafeUnwrapErr().message, "v4/create/selector.json");
  });

  it.each(["descriptor", "questions", "pipeline"])(
    "rejects a package whose %s JSON is malformed",
    (fileName) => {
      const zip = new AdmZip(fullArchive());
      zip.updateFile(`v4/create/da/mcp-server/${fileName}.json`, Buffer.from("{"));

      const result = validateDeclarativePackageArchive(
        zip.toBuffer(),
        { kind: "create", templateId: "da/mcp-server" },
        "load",
        "6.11.0",
        runtimeErrors
      );

      assert.isTrue(result.isErr());
      assert.equal(result._unsafeUnwrapErr().name, "PackageFileInvalid");
      assert.include(result._unsafeUnwrapErr().message, `${fileName}.json`);
    }
  );

  it("AC-26: POSIX-absolute content paths are rejected before rendering", () => {
    const result = validateDeclarativeTemplateArchive(
      archiveWithUnsafePosixContentPath(),
      "build",
      "6.11.0",
      runtimeErrors
    );

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, "TemplatePackageUnsafePath");
    assert.include(result._unsafeUnwrapErr().message, "content//payload.txt");
  });

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
