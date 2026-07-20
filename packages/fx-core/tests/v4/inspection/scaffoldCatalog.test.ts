// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import * as fs from "fs-extra";
import { err, ok } from "neverthrow";
import * as os from "os";
import * as path from "path";
import { assert } from "vitest";
import { getLocalizedString } from "../../../src/common/localizeUtils";
import {
  ScaffoldMetadataSource,
  inspectScaffoldCatalog,
} from "../../../src/v4/inspection/scaffoldCatalog";
import {
  authoredDirectoryMetadataSource,
  metadataArchiveSource,
} from "../../../src/v4/inspection/scaffoldMetadataSource";

interface PackageFixture {
  descriptor?: unknown;
  questions?: unknown;
  pipeline?: unknown;
}

type PackageMetadataFile = keyof PackageFixture;

function addJson(zip: AdmZip, file: string, value: unknown): void {
  zip.addFile(file, Buffer.from(JSON.stringify(value)));
}

function buildMetadataArchive(
  selector: unknown,
  packages: Readonly<Record<string, PackageFixture>>,
  fragments: Readonly<Record<string, unknown>> = {}
): Buffer {
  const zip = new AdmZip();
  addJson(zip, "v4/create/selector.json", selector);
  for (const [templateId, fixture] of Object.entries(packages)) {
    const root = `v4/create/${templateId}`;
    if (fixture.descriptor !== undefined) {
      addJson(zip, `${root}/descriptor.json`, fixture.descriptor);
    }
    if (fixture.questions !== undefined) {
      addJson(zip, `${root}/questions.json`, fixture.questions);
    }
    if (fixture.pipeline !== undefined) {
      addJson(zip, `${root}/pipeline.json`, fixture.pipeline);
    }
  }
  for (const [name, fragment] of Object.entries(fragments)) {
    addJson(zip, `v4/_shared/questions/${name}.json`, fragment);
  }
  return zip.toBuffer();
}

function makeMetadataFileInvalid(bytes: Buffer, file: PackageMetadataFile): Buffer {
  const zip = new AdmZip(bytes);
  const entry = zip.getEntry(`v4/create/alpha/${file}.json`);
  assert.isNotNull(entry);
  entry!.setData(Buffer.from("{"));
  return zip.toBuffer();
}

function sourceFrom(bytes: Buffer): ScaffoldMetadataSource {
  return { load: () => ok(bytes) };
}

function writeJson(root: string, relativePath: string, value: unknown): void {
  const file = path.join(root, relativePath);
  fs.ensureDirSync(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value));
}

function writeAuthoredFixture(root: string): void {
  const selector = {
    questions: [],
    routes: [
      { when: "projectType == 'beta'", engine: "v4", templateId: "beta" },
      { when: "projectType == 'alpha'", engine: "v4", templateId: "alpha" },
    ],
  };
  writeJson(root, "create/selector.json", selector);
  writeJson(root, "create/alpha/descriptor.json", { id: "alpha", languages: ["ts"] });
  writeJson(root, "create/alpha/questions.json", { questions: [{ use: "base" }] });
  writeJson(root, "create/alpha/pipeline.json", { pipeline: "default", steps: [] });
  writeJson(root, "create/beta/descriptor.json", { id: "beta", languages: ["common"] });
  writeJson(root, "create/beta/questions.json", { questions: [] });
  writeJson(root, "create/beta/pipeline.json", { pipeline: "default", steps: [] });
  writeJson(root, "_shared/questions/base.json", {
    questions: [{ name: "model", type: "singleSelect", staticOptions: [] }],
  });
  writeJson(root, "schema/selector.schema.json", { title: "must not be archived" });
  writeJson(root, "create/alpha/notes.json", { title: "unrelated package JSON" });
  writeJson(root, "unrelated.json", { title: "unrelated root JSON" });
  fs.ensureDirSync(path.join(root, "create/alpha/content"));
  fs.writeFileSync(path.join(root, "create/alpha/content/secret.txt"), "must not be archived");
}

function buildEquivalentAuthoredArchive(): Buffer {
  return buildMetadataArchive(
    {
      questions: [],
      routes: [
        { when: "projectType == 'beta'", engine: "v4", templateId: "beta" },
        { when: "projectType == 'alpha'", engine: "v4", templateId: "alpha" },
      ],
    },
    {
      alpha: {
        descriptor: { id: "alpha", languages: ["ts"] },
        questions: { questions: [{ use: "base" }] },
        pipeline: { pipeline: "default", steps: [] },
      },
      beta: {
        descriptor: { id: "beta", languages: ["common"] },
        questions: { questions: [] },
        pipeline: { pipeline: "default", steps: [] },
      },
    },
    {
      base: {
        questions: [{ name: "model", type: "singleSelect", staticOptions: [] }],
      },
    }
  );
}

describe("inspectScaffoldCatalog", () => {
  it("ISC-01: groups every v4 route by template and reports non-v4 routes separately", () => {
    const firstRoute = { when: "projectType == 'alpha'", engine: "v4", templateId: "alpha" };
    const secondRoute = {
      when: "projectType == 'alpha-preview'",
      engine: "v4",
      templateId: "alpha",
      surfaces: ["vscode"],
    };
    const externalRoute = {
      when: "projectType == 'help'",
      engine: "surface-action",
      action: "open-help",
      surfaces: ["vscode"],
    };
    const bytes = buildMetadataArchive(
      { questions: [], routes: [firstRoute, secondRoute, externalRoute] },
      {
        alpha: {
          descriptor: { id: "alpha", languages: ["ts"] },
          questions: { questions: [] },
          pipeline: { pipeline: "default", steps: [] },
        },
      }
    );

    const result = inspectScaffoldCatalog(sourceFrom(bytes), "create");

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    const catalog = result._unsafeUnwrap();
    assert.strictEqual(catalog.kind, "create");
    assert.deepEqual(catalog.questions, []);
    assert.deepEqual(
      catalog.templates.map((template) => template.templateId),
      ["alpha"]
    );
    assert.deepEqual(catalog.templates[0].routes, [firstRoute, secondRoute]);
    assert.deepEqual(catalog.externalRoutes, [externalRoute]);
  });

  it("ISC-02: expands nested shared question fragments through the package loader", () => {
    const bytes = buildMetadataArchive(
      {
        questions: [],
        routes: [{ when: "projectType == 'alpha'", engine: "v4", templateId: "alpha" }],
      },
      {
        alpha: {
          descriptor: { id: "alpha", languages: ["ts"] },
          questions: { questions: [{ use: "outer" }] },
          pipeline: { pipeline: "default", steps: [] },
        },
      },
      {
        outer: {
          questions: [{ name: "model", type: "singleSelect", staticOptions: [] }, { use: "inner" }],
        },
        inner: { questions: [{ name: "endpoint", type: "text" }] },
      }
    );

    const result = inspectScaffoldCatalog(sourceFrom(bytes), "create");

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.deepEqual(
      result._unsafeUnwrap().templates[0].questions.map((question) => question.name),
      ["model", "endpoint"]
    );
  });

  it("ISC-04: fails the whole catalog when routed package metadata is missing or malformed", () => {
    const selector = {
      questions: [],
      routes: [{ when: "projectType == 'alpha'", engine: "v4", templateId: "alpha" }],
    };
    const completePackage = {
      descriptor: { id: "alpha", languages: ["ts"] },
      questions: { questions: [] },
      pipeline: { pipeline: "default", steps: [] },
    };
    const files: PackageMetadataFile[] = ["descriptor", "questions", "pipeline"];

    for (const file of files) {
      const missingPackage = { ...completePackage, [file]: undefined };
      const missing = inspectScaffoldCatalog(
        sourceFrom(buildMetadataArchive(selector, { alpha: missingPackage })),
        "create"
      );
      assert.isTrue(missing.isErr(), `expected missing ${file} to fail inspection`);
      assert.strictEqual(missing._unsafeUnwrapErr().name, "PackageFileMissing");

      const malformedBytes = makeMetadataFileInvalid(
        buildMetadataArchive(selector, { alpha: completePackage }),
        file
      );
      const malformed = inspectScaffoldCatalog(sourceFrom(malformedBytes), "create");
      assert.isTrue(malformed.isErr(), `expected malformed ${file} to fail inspection`);
      assert.strictEqual(malformed._unsafeUnwrapErr().name, "PackageFileInvalid");
    }
  });

  it("ISC-05: returns a metadata source error unchanged", () => {
    const sourceError = new SystemError({
      source: "ScaffoldCatalogTest",
      name: "FixtureSourceFailure",
      message: "fixture source failed",
    });
    const source: ScaffoldMetadataSource = { load: () => err(sourceError) };

    const result = inspectScaffoldCatalog(source, "create");

    assert.isTrue(result.isErr(), "expected source failure");
    assert.strictEqual(result._unsafeUnwrapErr(), sourceError);
  });

  it("ISC-03: produces equal catalogs from authored directory and archive sources", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atk-scaffold-catalog-"));
    try {
      writeAuthoredFixture(root);

      const fromDirectory = inspectScaffoldCatalog(authoredDirectoryMetadataSource(root), "create");
      const fromArchive = inspectScaffoldCatalog(
        metadataArchiveSource(buildEquivalentAuthoredArchive()),
        "create"
      );

      assert.isTrue(
        fromDirectory.isOk(),
        fromDirectory.isErr() ? fromDirectory.error.message : "expected directory catalog"
      );
      assert.isTrue(
        fromArchive.isOk(),
        fromArchive.isErr() ? fromArchive.error.message : "expected archive catalog"
      );
      assert.deepEqual(fromDirectory._unsafeUnwrap(), fromArchive._unsafeUnwrap());
      assert.deepEqual(
        fromDirectory._unsafeUnwrap().templates.map((template) => template.templateId),
        ["alpha", "beta"]
      );
    } finally {
      fs.removeSync(root);
    }
  });

  it("ISC-06: authored source archives metadata and fragments but excludes content and schemas", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atk-scaffold-source-"));
    try {
      writeAuthoredFixture(root);

      const loaded = authoredDirectoryMetadataSource(root).load();

      assert.isTrue(loaded.isOk(), loaded.isErr() ? loaded.error.message : "expected archive");
      const names = new AdmZip(loaded._unsafeUnwrap())
        .getEntries()
        .filter((entry) => !entry.isDirectory)
        .map((entry) => entry.entryName.replace(/\\/g, "/"));
      assert.deepEqual(names.sort(), [
        "v4/_shared/questions/base.json",
        "v4/create/alpha/descriptor.json",
        "v4/create/alpha/pipeline.json",
        "v4/create/alpha/questions.json",
        "v4/create/beta/descriptor.json",
        "v4/create/beta/pipeline.json",
        "v4/create/beta/questions.json",
        "v4/create/selector.json",
      ]);
    } finally {
      fs.removeSync(root);
    }
  });

  it("ISC-07: rejects malformed selector routes instead of silently omitting them", () => {
    const sensitiveWhen = "sensitive-route-condition-must-not-escape";
    const missingTemplateId = buildMetadataArchive(
      { questions: [], routes: [{ when: sensitiveWhen, engine: "v4" }] },
      {}
    );
    const foreignKey = buildMetadataArchive(
      {
        questions: [],
        routes: [
          {
            when: "true",
            engine: "v4",
            templateId: "alpha",
            coreMethod: "addPlugin",
          },
        ],
      },
      {}
    );
    const wrongTypedForeignKey = buildMetadataArchive(
      {
        questions: [],
        routes: [
          {
            when: "true",
            engine: "v4",
            templateId: "alpha",
            coreMethod: 42,
          },
        ],
      },
      {}
    );

    for (const bytes of [missingTemplateId, foreignKey]) {
      const result = inspectScaffoldCatalog(sourceFrom(bytes), "create");
      assert.isTrue(result.isErr(), "expected malformed route to fail inspection");
      assert.strictEqual(result._unsafeUnwrapErr().name, "BuildTargetMalformedRoute");
      assert.notInclude(result._unsafeUnwrapErr().message, sensitiveWhen);
    }
    const wrongTyped = inspectScaffoldCatalog(sourceFrom(wrongTypedForeignKey), "create");
    assert.isTrue(wrongTyped.isErr(), "expected wrong-typed route field to fail inspection");
    assert.strictEqual(wrongTyped._unsafeUnwrapErr().name, "BuildTargetMalformedSelector");
  });

  it("ISC-08: maps an authored directory read failure to the source error", () => {
    const missingRoot = path.join(os.tmpdir(), `atk-missing-scaffold-source-${Date.now()}`);

    const result = authoredDirectoryMetadataSource(missingRoot).load();

    assert.isTrue(result.isErr(), "expected the missing authored source to fail");
    const sourceError = result._unsafeUnwrapErr();
    assert.instanceOf(sourceError, SystemError);
    assert.strictEqual(sourceError.name, "ScaffoldMetadataSourceReadFailed");
    assert.strictEqual(
      sourceError.message,
      getLocalizedString("core.v4.scaffoldMetadataSourceReadFailed")
    );
    assert.instanceOf(sourceError.innerError, Error);
  });
});
