// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError, UserError } from "@microsoft/teamsfx-api";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { StepContext } from "../../../../src/v4/pipeline/runScaffoldPipeline";
import { STEP_REGISTRY } from "../../../../src/v4/runtime/runtimeRegistry";
import {
  STEP_IMPORT_EXISTING_OFFICE_ADDIN_PROJECT,
  officeAddinImportExistingProject,
} from "../../../../src/v4/runtime/steps/officeAddin";
import { assert, afterEach, beforeEach, vi } from "vitest";

const mockConvertProject = vi.hoisted(() => vi.fn());

vi.mock("office-addin-project", () => ({
  convertProject: mockConvertProject,
}));

function makeCtx(initial: Record<string, string> = {}): {
  ctx: StepContext;
  files: Map<string, Buffer>;
} {
  const files = new Map<string, Buffer>();
  for (const [filePath, body] of Object.entries(initial)) {
    files.set(filePath, Buffer.from(body, "utf8"));
  }
  return {
    files,
    ctx: {
      read: (filePath) => files.get(filePath),
      write: (filePath, data) => {
        files.set(filePath, data);
      },
      manifestWrapper: () => ({ addAction: () => undefined }),
    },
  };
}

function text(files: Map<string, Buffer>, filePath: string): string {
  return files.get(filePath)?.toString("utf8") ?? "";
}

let tempRoots: string[] = [];

beforeEach(() => {
  tempRoots = [];
  mockConvertProject.mockReset();
  mockConvertProject.mockResolvedValue(undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  for (const tempRoot of tempRoots) {
    await fs.remove(tempRoot);
  }
});

async function makeTempRoot(): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "m365atk-office-test-"));
  tempRoots.push(tempRoot);
  return tempRoot;
}

async function writeSourceProject(root: string, manifestName: string): Promise<void> {
  await fs.ensureDir(path.join(root, "src"));
  await fs.writeFile(path.join(root, manifestName), "<OfficeApp></OfficeApp>");
  await fs.writeJson(path.join(root, "package.json"), { scripts: { start: "office" } });
  await fs.writeFile(path.join(root, "src", "taskpane.ts"), "export const pane = true;\n");
  await fs.ensureDir(path.join(root, "node_modules", "ignored"));
  await fs.writeFile(path.join(root, "node_modules", "ignored", "package.json"), "{}\n");
}

describe(`${STEP_IMPORT_EXISTING_OFFICE_ADDIN_PROJECT} (v4)`, () => {
  it("is registered in the v4 step registry", () => {
    assert.strictEqual(
      STEP_REGISTRY.get(STEP_IMPORT_EXISTING_OFFICE_ADDIN_PROJECT),
      officeAddinImportExistingProject
    );
  });

  it("validateParams reports missing import parameters", () => {
    assert.strictEqual(
      officeAddinImportExistingProject.validateParams({ manifestPath: "manifest.json" }),
      "missing string parameter 'sourceFolder'"
    );
    assert.strictEqual(
      officeAddinImportExistingProject.validateParams({ sourceFolder: "/project" }),
      "missing string parameter 'manifestPath'"
    );
  });

  it("returns SystemError when apply receives invalid resolved params", async () => {
    const result = await officeAddinImportExistingProject.apply(
      { sourceFolder: "/project" },
      makeCtx().ctx
    );

    assert.isTrue(result.isErr());
    assert.instanceOf(result._unsafeUnwrapErr(), SystemError);
    assert.strictEqual(result._unsafeUnwrapErr().name, "OfficeAddinImportParams");
  });

  it("returns UserError when the selected manifest is outside the source folder", async () => {
    const root = await makeTempRoot();
    const outside = path.join(await makeTempRoot(), "manifest.xml");
    await fs.writeFile(outside, "<OfficeApp></OfficeApp>");

    const result = await officeAddinImportExistingProject.apply(
      { sourceFolder: root, manifestPath: outside },
      makeCtx().ctx
    );

    assert.isTrue(result.isErr());
    assert.instanceOf(result._unsafeUnwrapErr(), UserError);
    assert.strictEqual(result._unsafeUnwrapErr().name, "OfficeAddinManifestOutsideSource");
  });

  it("imports source files, skips node_modules, and overlays rendered config files", async () => {
    const root = await makeTempRoot();
    await writeSourceProject(root, "manifest.json");
    const { ctx, files } = makeCtx({
      ".gitignore": "dist\n",
      "env/.env.dev": "TEAMS_APP_ID=test\n",
      "m365agents.yml": "provision:\n",
    });

    const result = await officeAddinImportExistingProject.apply(
      { sourceFolder: root, manifestPath: "manifest.json" },
      ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.include(text(files, "src/taskpane.ts"), "pane");
    assert.strictEqual(text(files, ".gitignore"), "dist\n");
    assert.strictEqual(text(files, "env/.env.dev"), "TEAMS_APP_ID=test\n");
    assert.strictEqual(text(files, "m365agents.yml"), "provision:\n");
    assert.isFalse(files.has("node_modules/ignored/package.json"));
  });

  it("converts XML manifests from the copied project and restores cwd", async () => {
    const root = await makeTempRoot();
    await writeSourceProject(root, "manifest.xml");
    const previousCwd = process.cwd();

    const result = await officeAddinImportExistingProject.apply(
      { sourceFolder: root, manifestPath: "manifest.xml" },
      makeCtx().ctx
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
    assert.strictEqual(process.cwd(), previousCwd);
    assert.strictEqual(mockConvertProject.mock.calls.length, 1);
  });

  it("returns UserError when copying or converting the source project fails", async () => {
    const root = await makeTempRoot();
    await writeSourceProject(root, "manifest.xml");
    mockConvertProject.mockRejectedValue(new Error("convert failed"));

    const result = await officeAddinImportExistingProject.apply(
      { sourceFolder: root, manifestPath: "manifest.xml" },
      makeCtx().ctx
    );

    assert.isTrue(result.isErr());
    assert.instanceOf(result._unsafeUnwrapErr(), UserError);
    assert.strictEqual(result._unsafeUnwrapErr().name, "OfficeAddinSourceProjectInvalid");
  });
});
