// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import os from "os";
import path from "path";
import { UserError } from "@microsoft/teamsfx-api";
import { err, ok } from "neverthrow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FxCoreClient, WorkerReferenceInput } from "../../src/core/FxCoreClient";
import {
  validateWorkerAgentGraph,
  workerAgentAtomicIo,
  workerValidationError,
} from "../../src/core/workerAgents";
import { MockTools } from "./utils";

interface TestManifest {
  version: string;
  name: string;
  description: string;
  instructions: string;
  worker_agents?: unknown[];
  unknown_root?: unknown;
}

function manifest(overrides: Partial<TestManifest> = {}): TestManifest {
  return {
    version: "v1.8",
    name: "Test agent",
    description: "Test agent description",
    instructions: "Answer test questions.",
    ...overrides,
  };
}

describe("Worker agent lifecycle", () => {
  let projectPath: string;
  let appPackagePath: string;
  let rootManifestPath: string;
  let client: FxCoreClient;
  let tools: MockTools;

  beforeEach(async () => {
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), "fx-worker-agent-"));
    appPackagePath = path.join(projectPath, "appPackage");
    rootManifestPath = path.join(appPackagePath, "declarativeAgent.json");
    await fs.ensureDir(appPackagePath);
    await fs.writeJson(rootManifestPath, manifest(), { spaces: 2 });
    tools = new MockTools();
    client = new FxCoreClient(tools);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    delete process.env.WORKER_TEST_DA_FILE;
    await fs.remove(projectPath);
  });

  it("WORKER-ADD-01: adds a trimmed opaque ID", async () => {
    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "  TitleId.declarativeAgent  " },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        changed: true,
        type: "id",
        reference: "TitleId.declarativeAgent",
        manifestPath: "appPackage/declarativeAgent.json",
      });
    }
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({
      worker_agents: [{ id: "TitleId.declarativeAgent" }],
    });
  });

  it("uses the DA file declared by the Teams manifest for public operations", async () => {
    const declaredRootPath = path.join(appPackagePath, "repairDeclarativeAgent.json");
    await fs.writeJson(path.join(appPackagePath, "manifest.json"), {
      manifestVersion: "future",
      copilotAgents: {
        declarativeAgents: [{ id: "repair", file: "repairDeclarativeAgent.json" }],
      },
    });
    await fs.writeJson(declaredRootPath, manifest());
    await fs.remove(rootManifestPath);

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.manifestPath).toBe("appPackage/repairDeclarativeAgent.json");
    }
    await expect(fs.readJson(declaredRootPath)).resolves.toMatchObject({
      worker_agents: [{ id: "worker-id" }],
    });
  });

  it("resolves the DA file environment variable for public operations", async () => {
    const declaredRootPath = path.join(appPackagePath, "environmentDeclarativeAgent.json");
    process.env.WORKER_TEST_DA_FILE = "environmentDeclarativeAgent.json";
    await fs.writeJson(path.join(appPackagePath, "manifest.json"), {
      manifestVersion: "future",
      copilotAgents: {
        declarativeAgents: [{ id: "environment", file: "${{WORKER_TEST_DA_FILE}}" }],
      },
    });
    await fs.writeJson(declaredRootPath, manifest());
    await fs.remove(rootManifestPath);

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });

    expect(result.isOk()).toBe(true);
    await expect(fs.readJson(declaredRootPath)).resolves.toMatchObject({
      worker_agents: [{ id: "worker-id" }],
    });
  });

  it("WORKER-ADD-02: adds an existing local DA file reference", async () => {
    await fs.ensureDir(path.join(appPackagePath, "workers"));
    await fs.writeJson(path.join(appPackagePath, "workers", "research.json"), manifest());

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "file", file: "workers/research.json" },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        changed: true,
        type: "file",
        reference: "workers/research.json",
        manifestPath: "appPackage/declarativeAgent.json",
      });
    }
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({
      worker_agents: [{ file: "workers/research.json" }],
    });
  });

  it("WORKER-ADD-03: equivalent canonical file aliases are idempotent", async () => {
    await fs.ensureDir(path.join(appPackagePath, "workers"));
    await fs.writeJson(path.join(appPackagePath, "workers", "research.json"), manifest());
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "workers/research.json" }] }),
      { spaces: 2 }
    );
    const original = await fs.readFile(rootManifestPath);

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "file", file: "workers/./research.json" },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        changed: false,
        type: "file",
        reference: "workers/research.json",
        manifestPath: "appPackage/declarativeAgent.json",
      });
    }
    expect(await fs.readFile(rootManifestPath)).toEqual(original);
  });

  it("WORKER-ADD-11: stores Windows-style and redundant file input in portable form", async () => {
    await fs.ensureDir(path.join(appPackagePath, "workers"));
    await fs.writeJson(path.join(appPackagePath, "workers", "research.json"), manifest());

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "file", file: ".\\workers\\.\\research.json" },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.reference).toBe("workers/research.json");
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({
      worker_agents: [{ file: "workers/research.json" }],
    });
  });

  it("compares distinct existing local files before adding a Worker", async () => {
    await fs.writeJson(path.join(appPackagePath, "existing.json"), manifest());
    await fs.writeJson(path.join(appPackagePath, "new.json"), manifest());
    await fs.writeJson(rootManifestPath, manifest({ worker_agents: [{ file: "existing.json" }] }));

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "file", file: "new.json" },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.changed).toBe(true);
  });

  it("returns no change for duplicate IDs and rejects missing or non-regular local files", async () => {
    await fs.writeJson(rootManifestPath, manifest({ worker_agents: [{ id: "worker-id" }] }));
    const duplicate = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });
    expect(duplicate.isOk()).toBe(true);
    if (duplicate.isOk()) expect(duplicate.value.changed).toBe(false);

    const missing = await client.addWorkerAgent({
      projectPath,
      reference: { type: "file", file: "missing.json" },
    });
    await fs.ensureDir(path.join(appPackagePath, "directory"));
    const directory = await client.addWorkerAgent({
      projectPath,
      reference: { type: "file", file: "directory" },
    });
    for (const result of [missing, directory]) {
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.name).toBe("WORKER_FILE_MISSING_OR_NOT_REGULAR");
    }
  });

  it("WORKER-ADD-04: preserves unknown root properties", async () => {
    await fs.writeJson(rootManifestPath, manifest({ unknown_root: { future: true } }), {
      spaces: 2,
    });

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });

    expect(result.isOk()).toBe(true);
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({
      unknown_root: { future: true },
      worker_agents: [{ id: "worker-id" }],
    });
  });

  it("WORKER-ADD-10: accepts versions at or above v1.6 and rejects older versions", async () => {
    for (const version of ["v1.6", "v1.9"]) {
      await fs.writeJson(rootManifestPath, manifest({ version }), { spaces: 2 });

      const supportedResult = await client.addWorkerAgent({
        projectPath,
        reference: { type: "id", id: "worker-id" },
      });

      expect(supportedResult.isOk()).toBe(true);
    }

    await fs.writeJson(rootManifestPath, manifest({ version: "v1.5" }), { spaces: 2 });
    const unsupportedResult = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });

    expect(unsupportedResult.isErr()).toBe(true);
    if (unsupportedResult.isErr()) {
      expect(unsupportedResult.error.name).toBe("WORKER_SCHEMA_UNSUPPORTED");
    }
  });

  it("WORKER-ADD-10: accepts local files from v1.7 and rejects them for v1.6", async () => {
    const workerPath = path.join(appPackagePath, "workers", "worker.json");
    await fs.ensureDir(path.dirname(workerPath));
    await fs.writeJson(workerPath, manifest());
    await fs.writeJson(rootManifestPath, manifest({ version: "v1.6" }), { spaces: 2 });
    const original = await fs.readFile(rootManifestPath);

    const unsupportedResult = await client.addWorkerAgent({
      projectPath,
      reference: { type: "file", file: "workers/worker.json" },
    });

    expect(unsupportedResult.isErr()).toBe(true);
    if (unsupportedResult.isErr()) {
      expect(unsupportedResult.error.name).toBe("WORKER_SCHEMA_UNSUPPORTED");
    }
    expect(await fs.readFile(rootManifestPath)).toEqual(original);

    await fs.writeJson(rootManifestPath, manifest({ version: "v1.7" }), { spaces: 2 });
    const supportedResult = await client.addWorkerAgent({
      projectPath,
      reference: { type: "file", file: "workers/worker.json" },
    });

    expect(supportedResult.isOk()).toBe(true);
  });

  it("WORKER-ADD-05: invalid and escaping references preserve original bytes", async () => {
    const original = await fs.readFile(rootManifestPath);
    const inputs: WorkerReferenceInput[] = [
      { type: "id", id: "" },
      { type: "file", file: path.resolve(projectPath, "outside.json") },
      { type: "file", file: "../outside.json" },
    ];

    for (const reference of inputs) {
      const result = await client.addWorkerAgent({ projectPath, reference });
      expect(result.isErr()).toBe(true);
      expect(await fs.readFile(rootManifestPath)).toEqual(original);
    }
  });

  it("WORKER-ADD-05: rejects a conflicting runtime DTO", async () => {
    const original = await fs.readFile(rootManifestPath);

    const result = await client.addWorkerAgent({
      projectPath,
      // @ts-expect-error Exercise the runtime boundary used by non-TypeScript consumers.
      reference: { type: "id", id: "id", file: "worker.json" },
    });

    expect(result.isErr()).toBe(true);
    expect(await fs.readFile(rootManifestPath)).toEqual(original);
  });

  it("WORKER-ADD-05: public operations reject invalid options and empty references", async () => {
    const add = await client.addWorkerAgent({
      projectPath,
      reference: { type: "file", file: "" },
    });
    const remove = await client.removeWorkerAgent({
      projectPath: "",
      reference: { type: "id", id: "x" },
    });
    // @ts-expect-error Exercise the runtime boundary used by non-TypeScript consumers.
    const inspect = await client.inspectWorkerAgents(undefined);
    // @ts-expect-error Exercise the runtime boundary used by non-TypeScript consumers.
    const validate = await client.validateWorkerAgents({ projectPath: 1 });

    expect([add, remove, inspect, validate].every((result) => result.isErr())).toBe(true);
    if (add.isErr()) expect(add.error.name).toBe("WORKER_REFERENCE_EMPTY");
    for (const result of [remove, inspect, validate]) {
      if (result.isErr()) expect(result.error.name).toBe("WORKER_OPTIONS_INVALID");
    }
  });

  it("WORKER-ADD-05: rejects malformed runtime reference variants", async () => {
    const references: unknown[] = [
      undefined,
      { type: "other" },
      { type: "id", id: 1 },
      { type: "file", file: 1 },
      { type: "id", id: "worker-id", other: true },
    ];

    for (const reference of references) {
      const result = await client.addWorkerAgent({
        projectPath,
        // @ts-expect-error Exercise runtime DTO validation.
        reference,
      });
      expect(result.isErr()).toBe(true);
    }
  });

  it("WORKER-ADD-05: reports malformed Teams manifest root discovery", async () => {
    await fs.writeFile(path.join(appPackagePath, "manifest.json"), "{");

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("WORKER_MANIFEST_INVALID");
  });

  it("discovers legacy and resolved DA roots from the Teams manifest", async () => {
    const declaredRootPath = path.join(appPackagePath, "resolved.json");
    await fs.writeJson(declaredRootPath, manifest({ worker_agents: [{ id: "worker-id" }] }));
    await fs.writeJson(path.join(appPackagePath, "manifest.json"), {
      copilotExtensions: { declarativeCopilots: [{ file: "authored.json" }] },
    });

    const resolved = await validateWorkerAgentGraph({
      projectPath,
      resolveAgentFile: async (authored, containingManifestPath) => {
        expect(authored).toBe("authored.json");
        expect(containingManifestPath).toBe(path.join(appPackagePath, "manifest.json"));
        return ok("resolved.json");
      },
    });
    expect(resolved.isOk()).toBe(true);
    if (resolved.isOk()) expect(resolved.value.valid).toBe(true);

    const resolutionError = new UserError({
      source: "test",
      name: "ResolveFailed",
      message: "Resolve failed",
    });
    const failed = await validateWorkerAgentGraph({
      projectPath,
      resolveAgentFile: async () => err(resolutionError),
    });
    expect(failed.isErr()).toBe(true);
    if (failed.isErr()) expect(failed.error).toBe(resolutionError);
  });

  it("handles Teams manifests without a usable declarative agent root", async () => {
    const teamsManifestPath = path.join(appPackagePath, "manifest.json");
    await fs.writeJson(teamsManifestPath, []);
    const nonObject = await validateWorkerAgentGraph({ projectPath, allowMissingRoot: true });
    expect(nonObject.isOk()).toBe(true);

    await fs.writeJson(teamsManifestPath, {
      copilotAgents: { declarativeAgents: "invalid" },
      copilotExtensions: { declarativeCopilots: [{}] },
    });
    const noAgent = await validateWorkerAgentGraph({ projectPath, allowMissingRoot: true });
    expect(noAgent.isOk()).toBe(true);

    await fs.writeJson(teamsManifestPath, {
      copilotAgents: { declarativeAgents: [{ file: "../outside.json" }] },
    });
    const outside = await validateWorkerAgentGraph({ projectPath });
    expect(outside.isErr()).toBe(true);
    if (outside.isErr()) expect(outside.error.name).toBe("WORKER_FILE_OUTSIDE_PACKAGE");
  });

  it("uses the default root when Teams manifest has no DA and preserves discovery I/O errors", async () => {
    const teamsManifestPath = path.join(appPackagePath, "manifest.json");
    await fs.writeJson(teamsManifestPath, {});
    const defaultRoot = await validateWorkerAgentGraph({ projectPath });
    expect(defaultRoot.isOk()).toBe(true);

    const readFile = fs.readFile;
    vi.spyOn(fs, "readFile").mockImplementation(async (...args) => {
      if (path.resolve(String(args[0])) === teamsManifestPath) throw "read failed";
      return readFile(...args);
    });
    const failed = await validateWorkerAgentGraph({ projectPath });
    expect(failed.isErr()).toBe(true);
    if (failed.isErr()) expect(failed.error.name).toBe("WORKER_MANIFEST_READ_FAILED");
  });

  it("WORKER-ADD-05: reports malformed authored JSON as a user error", async () => {
    await fs.writeFile(rootManifestPath, "{");

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(UserError);
      expect(result.error.name).toBe("WORKER_MANIFEST_INVALID_JSON");
    }
    expect(await fs.readFile(rootManifestPath, "utf8")).toBe("{");
  });

  it("WORKER-ADD-06: rejects a candidate that creates a cycle", async () => {
    const workerPath = path.join(appPackagePath, "workers", "worker.json");
    await fs.ensureDir(path.dirname(workerPath));
    await fs.writeJson(
      workerPath,
      manifest({ worker_agents: [{ file: "../declarativeAgent.json" }] })
    );
    const original = await fs.readFile(rootManifestPath);

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "file", file: "workers/worker.json" },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("WORKER_CYCLE");
    expect(await fs.readFile(rootManifestPath)).toEqual(original);
  });

  it("WORKER-ADD-07: pre-cancelled mutation preserves original bytes", async () => {
    const original = await fs.readFile(rootManifestPath);
    const controller = new AbortController();
    controller.abort();

    const result = await client.addWorkerAgent(
      { projectPath, reference: { type: "id", id: "worker-id" } },
      { signal: controller.signal }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("UserCancel");
    expect(await fs.readFile(rootManifestPath)).toEqual(original);
  });

  it("WORKER-ADD-08: cancellation after replacement starts reports the committed result", async () => {
    const controller = new AbortController();
    const rename = workerAgentAtomicIo.rename;
    vi.spyOn(workerAgentAtomicIo, "rename").mockImplementation(async (source, target) => {
      controller.abort();
      await rename(source, target);
    });

    const result = await client.addWorkerAgent(
      { projectPath, reference: { type: "id", id: "worker-id" } },
      { signal: controller.signal }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.changed).toBe(true);
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({
      worker_agents: [{ id: "worker-id" }],
    });
    expect((await fs.readdir(appPackagePath)).some((file) => file.endsWith(".tmp"))).toBe(false);
  });

  it("WORKER-ADD-07: cancellation after staging removes the temporary file", async () => {
    const controller = new AbortController();
    const writeFile = workerAgentAtomicIo.writeFile;
    vi.spyOn(workerAgentAtomicIo, "writeFile").mockImplementation(async (filePath, content) => {
      await writeFile(filePath, content);
      controller.abort();
    });

    const result = await client.addWorkerAgent(
      { projectPath, reference: { type: "id", id: "worker-id" } },
      { signal: controller.signal }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("UserCancel");
    expect((await fs.readdir(appPackagePath)).some((file) => file.endsWith(".tmp"))).toBe(false);
  });

  it("WORKER-ADD-12: cancellation while nested I/O is blocked stops traversal and mutation", async () => {
    const firstWorkerPath = path.join(appPackagePath, "first.json");
    const secondWorkerPath = path.join(appPackagePath, "second.json");
    await fs.writeJson(firstWorkerPath, manifest());
    await fs.writeJson(secondWorkerPath, manifest());
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "first.json" }, { file: "second.json" }] })
    );
    const original = await fs.readFile(rootManifestPath);
    const controller = new AbortController();
    let releaseRead: (() => void) | undefined;
    let signalReadStarted: (() => void) | undefined;
    const readStarted = new Promise<void>((resolve) => (signalReadStarted = resolve));
    const blocked = new Promise<void>((resolve) => (releaseRead = resolve));
    const readFile = fs.readFile;
    const nestedReads: string[] = [];
    vi.spyOn(fs, "readFile").mockImplementation(async (...args) => {
      const target = path.resolve(String(args[0]));
      if (target === firstWorkerPath || target === secondWorkerPath) {
        nestedReads.push(target);
      }
      if (target === firstWorkerPath) {
        signalReadStarted?.();
        await blocked;
      }
      return readFile(...args);
    });

    const operation = client.addWorkerAgent(
      { projectPath, reference: { type: "id", id: "new-worker" } },
      { signal: controller.signal }
    );
    await readStarted;
    controller.abort();
    releaseRead?.();
    const result = await operation;

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("UserCancel");
    expect(nestedReads).toEqual([firstWorkerPath]);
    expect(await fs.readFile(rootManifestPath)).toEqual(original);
    expect((await fs.readdir(appPackagePath)).some((file) => file.endsWith(".tmp"))).toBe(false);
  });

  it("WORKER-ADD-09: replacement failure preserves original bytes", async () => {
    const original = await fs.readFile(rootManifestPath);
    vi.spyOn(workerAgentAtomicIo, "rename").mockRejectedValue(new Error("replace failed"));

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });

    expect(result.isErr()).toBe(true);
    expect(await fs.readFile(rootManifestPath)).toEqual(original);
    expect((await fs.readdir(appPackagePath)).some((file) => file.endsWith(".tmp"))).toBe(false);
  });

  it("WORKER-ADD-09: preserves the primary write error when cleanup also fails", async () => {
    vi.spyOn(workerAgentAtomicIo, "writeFile").mockRejectedValue(new Error("write failed"));
    vi.spyOn(workerAgentAtomicIo, "remove").mockRejectedValue(new Error("cleanup failed"));

    const result = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("WORKER_MANIFEST_WRITE_FAILED");
  });

  it("WORKER-REMOVE-01: removes all equivalent hand-authored IDs", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ id: "worker-id" }, { id: "worker-id" }, { id: "other" }] })
    );

    const result = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "id", id: " worker-id " },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.changed).toBe(true);
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({
      worker_agents: [{ id: "other" }],
    });
  });

  it("WORKER-REMOVE-04: removes a stale missing-file reference by lexical key", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "workers/missing.json" }] })
    );

    const result = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "file", file: "workers/./missing.json" },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.changed).toBe(true);
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({ worker_agents: [] });
  });

  it("keeps non-equivalent malformed and stale file entries during removal", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [null, { file: "../outside.json" }, { file: "other.json" }] })
    );

    const result = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "file", file: "missing.json" },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.changed).toBe(false);
  });

  it("returns public operation errors for invalid references and invalid DA roots", async () => {
    const invalidReference = await client.removeWorkerAgent({
      projectPath,
      // @ts-expect-error Exercise runtime DTO validation.
      reference: undefined,
    });
    expect(invalidReference.isErr()).toBe(true);
    if (invalidReference.isErr()) {
      expect(invalidReference.error.name).toBe("WORKER_REFERENCE_INVALID");
    }

    await fs.writeJson(rootManifestPath, { version: "v1.8" });
    const add = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });
    const inspect = await client.inspectWorkerAgents({ projectPath });
    for (const result of [add, inspect]) {
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.name).toBe("WORKER_MANIFEST_INVALID");
    }
  });

  it("WORKER-REMOVE-02: removes all equivalent existing file aliases", async () => {
    await fs.writeJson(path.join(appPackagePath, "worker.json"), manifest());
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "worker.json" }, { file: "./worker.json" }] })
    );

    const result = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "file", file: "worker.json" },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.changed).toBe(true);
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({ worker_agents: [] });
  });

  it("WORKER-REMOVE-03: absent reference is a byte-preserving no-op", async () => {
    const original = await fs.readFile(rootManifestPath);

    const result = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "id", id: "absent" },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        changed: false,
        type: "id",
        reference: "absent",
        manifestPath: "appPackage/declarativeAgent.json",
      });
    }
    expect(await fs.readFile(rootManifestPath)).toEqual(original);
  });

  it("WORKER-REMOVE-09: repairs stale ID and missing file references in v1.5", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({
        version: "v1.5",
        worker_agents: [{ id: "stale-id" }, { file: "workers/missing.json" }],
      })
    );

    const removeId = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "id", id: "stale-id" },
    });
    const removeFile = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "file", file: "workers\\.\\missing.json" },
    });

    expect(removeId.isOk()).toBe(true);
    expect(removeFile.isOk()).toBe(true);
    if (removeId.isOk()) expect(removeId.value.changed).toBe(true);
    if (removeFile.isOk()) expect(removeFile.value.changed).toBe(true);
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({ worker_agents: [] });
  });

  it("returns stable errors for unsupported schemas and malformed worker collections", async () => {
    await fs.writeJson(rootManifestPath, manifest({ version: "not-semver" }));
    const unsupported = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });
    expect(unsupported.isErr()).toBe(true);
    if (unsupported.isErr()) expect(unsupported.error.name).toBe("WORKER_SCHEMA_UNSUPPORTED");

    await fs.writeJson(rootManifestPath, { ...manifest(), worker_agents: {} });
    const add = await client.addWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });
    const remove = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "id", id: "worker-id" },
    });
    const inspect = await client.inspectWorkerAgents({ projectPath });
    for (const result of [add, remove]) {
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.name).toBe("WORKER_ENTRIES_INVALID");
    }
    expect(inspect.isOk()).toBe(true);
    if (inspect.isOk()) {
      expect(inspect.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_ENTRIES_INVALID" })
      );
    }
  });

  it("WORKER-REMOVE-05: removes matching entries despite unrelated graph errors", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({
        worker_agents: [
          { id: "remove-me" },
          { id: "remove-me" },
          { file: "missing.json" },
          { unsupported: true },
        ],
      })
    );

    const result = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "id", id: "remove-me" },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.changed).toBe(true);
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({
      worker_agents: [{ file: "missing.json" }, { unsupported: true }],
    });
  });

  it("WORKER-REMOVE-06: preserves unrelated properties and referenced worker files", async () => {
    const workerPath = path.join(appPackagePath, "worker.json");
    await fs.writeJson(workerPath, manifest({ unknown_root: { worker: true } }));
    const workerBytes = await fs.readFile(workerPath);
    await fs.writeJson(
      rootManifestPath,
      manifest({
        unknown_root: { root: true },
        worker_agents: [{ id: "remove-me" }, { file: "worker.json" }],
      })
    );

    const result = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "id", id: "remove-me" },
    });

    expect(result.isOk()).toBe(true);
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({
      unknown_root: { root: true },
      worker_agents: [{ file: "worker.json" }],
    });
    expect(await fs.readFile(workerPath)).toEqual(workerBytes);
  });

  it("WORKER-REMOVE-07: invalid input and commit failure preserve original bytes", async () => {
    const original = await fs.readFile(rootManifestPath);
    const invalid = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "file", file: "../outside.json" },
    });
    expect(invalid.isErr()).toBe(true);
    expect(await fs.readFile(rootManifestPath)).toEqual(original);

    await fs.writeJson(rootManifestPath, manifest({ worker_agents: [{ id: "remove-me" }] }));
    const beforeCommit = await fs.readFile(rootManifestPath);
    vi.spyOn(workerAgentAtomicIo, "rename").mockRejectedValue(new Error("replace failed"));
    const failedCommit = await client.removeWorkerAgent({
      projectPath,
      reference: { type: "id", id: "remove-me" },
    });
    expect(failedCommit.isErr()).toBe(true);
    expect(await fs.readFile(rootManifestPath)).toEqual(beforeCommit);
  });

  it("WORKER-REMOVE-08: cancellation after replacement starts reports committed removal", async () => {
    await fs.writeJson(rootManifestPath, manifest({ worker_agents: [{ id: "remove-me" }] }));
    const controller = new AbortController();
    const rename = workerAgentAtomicIo.rename;
    vi.spyOn(workerAgentAtomicIo, "rename").mockImplementation(async (source, target) => {
      controller.abort();
      await rename(source, target);
    });

    const result = await client.removeWorkerAgent(
      { projectPath, reference: { type: "id", id: "remove-me" } },
      { signal: controller.signal }
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.changed).toBe(true);
    await expect(fs.readJson(rootManifestPath)).resolves.toMatchObject({ worker_agents: [] });
  });

  it("WORKER-INSPECT-03: inspects mixed direct references without expansion", async () => {
    await fs.ensureDir(path.join(appPackagePath, "workers"));
    await fs.writeJson(path.join(appPackagePath, "workers", "present.json"), manifest());
    await fs.writeJson(
      rootManifestPath,
      manifest({
        worker_agents: [
          { id: "published-id" },
          { file: "workers/present.json" },
          { file: "workers/missing.json" },
        ],
      })
    );

    const result = await client.inspectWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toEqual([
        { type: "id", id: "published-id" },
        { type: "file", file: "workers/present.json", exists: true },
        { type: "file", file: "workers/missing.json", exists: false },
      ]);
    }
  });

  it("reports conflicting and unsupported direct entry properties", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ id: "id", file: "worker.json" }] })
    );
    const conflicting = await client.inspectWorkerAgents({ projectPath });
    expect(conflicting.isOk()).toBe(true);
    if (conflicting.isOk()) {
      expect(conflicting.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_REFERENCE_CONFLICTING" })
      );
    }

    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ id: "id", unsupported: true }] })
    );
    const unsupported = await client.inspectWorkerAgents({ projectPath });
    expect(unsupported.isOk()).toBe(true);
    if (unsupported.isOk()) {
      expect(unsupported.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_REFERENCE_UNSUPPORTED_PROPERTY" })
      );
    }
  });

  it("WORKER-INSPECT-01: returns authored direct IDs in manifest order", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ id: "published-two" }, { id: "published-one" }] })
    );

    const result = await client.inspectWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toEqual([
        { type: "id", id: "published-two" },
        { type: "id", id: "published-one" },
      ]);
    }
  });

  it("WORKER-INSPECT-02: reports authored present and missing file references", async () => {
    await fs.writeJson(path.join(appPackagePath, "present.json"), manifest());
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "./present.json" }, { file: "missing.json" }] })
    );

    const result = await client.inspectWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toEqual([
        { type: "file", file: "./present.json", exists: true },
        { type: "file", file: "missing.json", exists: false },
      ]);
    }
  });

  it("WORKER-INSPECT-02: reports non-regular and escaping files as absent", async () => {
    await fs.ensureDir(path.join(appPackagePath, "directory"));
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "directory" }, { file: "../outside.json" }] })
    );

    const result = await client.inspectWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.items).toEqual([
        { type: "file", file: "directory", exists: false },
        { type: "file", file: "../outside.json", exists: false },
      ]);
    }
  });

  it("WORKER-INSPECT-04: returns no items when worker_agents is absent or empty", async () => {
    const absent = await client.inspectWorkerAgents({ projectPath });
    expect(absent.isOk() && absent.value.items).toEqual([]);

    await fs.writeJson(rootManifestPath, manifest({ worker_agents: [] }));
    const empty = await client.inspectWorkerAgents({ projectPath });
    expect(empty.isOk() && empty.value.items).toEqual([]);
  });

  it("WORKER-INSPECT-06: inspects legacy projects without applying add capability checks", async () => {
    await fs.writeJson(rootManifestPath, manifest({ version: "v1.5" }));
    const empty = await client.inspectWorkerAgents({ projectPath });
    expect(empty.isOk()).toBe(true);
    if (empty.isOk()) expect(empty.value).toEqual({ items: [], diagnostics: [] });

    await fs.writeJson(
      rootManifestPath,
      manifest({ version: "v1.5", worker_agents: [{ id: "stale-id" }, { invalid: true }] })
    );
    const configured = await client.inspectWorkerAgents({ projectPath });
    expect(configured.isOk()).toBe(true);
    if (configured.isOk()) {
      expect(configured.value.items).toEqual([{ type: "id", id: "stale-id" }]);
      expect(configured.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_REFERENCE_UNSUPPORTED_PROPERTY" })
      );
    }
  });

  it("WORKER-INSPECT-05: treats published IDs as opaque without network access", async () => {
    await fs.writeJson(rootManifestPath, manifest({ worker_agents: [{ id: "published-id" }] }));
    const tokenCall = vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken");

    const result = await client.inspectWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.items).toEqual([{ type: "id", id: "published-id" }]);
    expect(tokenCall).not.toHaveBeenCalled();
  });

  it("cancels remove, inspect, and validate before reading project files", async () => {
    const controller = new AbortController();
    controller.abort();
    const context = { signal: controller.signal };

    const remove = await client.removeWorkerAgent(
      { projectPath, reference: { type: "id", id: "worker-id" } },
      context
    );
    const inspect = await client.inspectWorkerAgents({ projectPath }, context);
    const validate = await client.validateWorkerAgents({ projectPath }, context);

    for (const result of [remove, inspect, validate]) {
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.name).toBe("UserCancel");
    }
  });

  it("WORKER-VALIDATE-01: returns no diagnostics without worker_agents", async () => {
    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ valid: true, diagnostics: [] });
  });

  it("returns an FxError when root manifest canonicalization fails", async () => {
    vi.spyOn(fs, "realpath")
      .mockResolvedValueOnce(appPackagePath)
      .mockRejectedValueOnce(new Error("canonicalization failed"));

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.name).toBe("WORKER_MANIFEST_READ_FAILED");
  });

  it("WORKER-VALIDATE-04: strict validation handles a malformed root after probing", async () => {
    await fs.writeFile(rootManifestPath, "{");

    const result = await validateWorkerAgentGraph({
      projectPath,
      validateOnlyIfWorkerAgentsConfigured: true,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.valid).toBe(false);
      expect(result.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_FILE_INVALID_JSON" })
      );
    }
  });

  it("WORKER-VALIDATE-01: an allowed missing root returns an empty valid graph", async () => {
    await fs.remove(rootManifestPath);

    const result = await validateWorkerAgentGraph({ projectPath, allowMissingRoot: true });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ valid: true, diagnostics: [], localManifests: [] });
    }
  });

  it("WORKER-VALIDATE-01: an allowed missing appPackage returns an empty valid graph", async () => {
    await fs.remove(appPackagePath);

    const result = await validateWorkerAgentGraph({ projectPath, allowMissingRoot: true });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({ valid: true, diagnostics: [], localManifests: [] });
    }
  });

  it("WORKER-VALIDATE-02: validates explicit invalid roots and worker collections", async () => {
    const invalidRoot = await validateWorkerAgentGraph({
      projectPath,
      rootManifestPath,
      rootDocument: [],
    });
    const invalidEntries = await validateWorkerAgentGraph({
      projectPath,
      rootManifestPath,
      rootDocument: { ...manifest(), worker_agents: {} },
    });
    const unsupportedSchema = await validateWorkerAgentGraph({
      projectPath,
      rootManifestPath,
      rootDocument: manifest({ version: "v1.5", worker_agents: [{ id: "worker-id" }] }),
    });

    for (const result of [invalidRoot, invalidEntries, unsupportedSchema]) {
      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.valid).toBe(false);
    }
    if (invalidEntries.isOk()) {
      expect(invalidEntries.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_ENTRIES_INVALID" })
      );
    }
    if (unsupportedSchema.isOk()) {
      expect(unsupportedSchema.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_SCHEMA_UNSUPPORTED" })
      );
    }
  });

  it("WORKER-VALIDATE-02: rejects non-object roots and non-string DA versions", async () => {
    await fs.writeJson(rootManifestPath, []);
    const nonObject = await client.validateWorkerAgents({ projectPath });
    expect(nonObject.isErr()).toBe(true);
    if (nonObject.isErr()) expect(nonObject.error.name).toBe("WORKER_MANIFEST_INVALID");

    for (const worker_agents of [[{ id: "worker-id" }], [{ file: "worker.json" }]]) {
      const result = await validateWorkerAgentGraph({
        projectPath,
        rootManifestPath,
        rootDocument: { ...manifest(), version: 1, worker_agents },
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.diagnostics).toContainEqual(
          expect.objectContaining({ code: "WORKER_FILE_NOT_DECLARATIVE_AGENT" })
        );
      }
    }
  });

  it("WORKER-VALIDATE-04: preserves loader and nested filesystem failures", async () => {
    const workerPath = path.join(appPackagePath, "worker.json");
    const rootDocument = manifest({ worker_agents: [{ file: "worker.json" }] });
    await fs.writeJson(workerPath, manifest());
    const loaderError = new UserError({
      source: "test",
      name: "WorkerLoaderFailed",
      message: "Worker loader failed",
    });
    const loadFailure = await validateWorkerAgentGraph({
      projectPath,
      rootManifestPath,
      rootDocument,
      loadManifest: async () => err(loaderError),
    });
    expect(loadFailure.isErr()).toBe(true);
    if (loadFailure.isErr()) expect(loadFailure.error).toBe(loaderError);

    const nonAgent = await validateWorkerAgentGraph({
      projectPath,
      rootManifestPath,
      rootDocument,
      loadManifest: async () => ok({ content: "{}", document: {} }),
    });
    expect(nonAgent.isOk()).toBe(true);
    if (nonAgent.isOk()) {
      expect(nonAgent.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_FILE_NOT_DECLARATIVE_AGENT" })
      );
    }

    vi.spyOn(fs, "realpath")
      .mockResolvedValueOnce(appPackagePath)
      .mockResolvedValueOnce(rootManifestPath)
      .mockRejectedValueOnce(new Error("worker canonicalization failed"));
    const canonicalFailure = await validateWorkerAgentGraph({
      projectPath,
      rootManifestPath,
      rootDocument,
    });
    expect(canonicalFailure.isOk()).toBe(true);
    if (canonicalFailure.isOk()) {
      expect(canonicalFailure.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_FILE_STAT_FAILED" })
      );
    }
  });

  it("WORKER-VALIDATE-04: preserves the first error when multiple custom loads fail", async () => {
    const firstPath = path.join(appPackagePath, "first.json");
    const secondPath = path.join(appPackagePath, "second.json");
    await fs.writeJson(firstPath, manifest());
    await fs.writeJson(secondPath, manifest());
    const firstError = new UserError({
      source: "test",
      name: "FirstLoaderFailed",
      message: "First loader failed",
    });
    const secondError = new UserError({
      source: "test",
      name: "SecondLoaderFailed",
      message: "Second loader failed",
    });

    const result = await validateWorkerAgentGraph({
      projectPath,
      rootManifestPath,
      rootDocument: manifest({
        worker_agents: [{ file: "first.json" }, { file: "second.json" }],
      }),
      loadManifest: async (target) => err(target === firstPath ? firstError : secondError),
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error).toBe(firstError);
  });

  it("WORKER-VALIDATE-04: diagnoses nested stat and read failures", async () => {
    const workerPath = path.join(appPackagePath, "worker.json");
    const rootDocument = manifest({ worker_agents: [{ file: "worker.json" }] });
    await fs.writeJson(workerPath, manifest());

    vi.spyOn(fs, "stat").mockRejectedValueOnce(
      Object.assign(new Error("stat failed"), { code: "EACCES" })
    );
    const statFailure = await validateWorkerAgentGraph({
      projectPath,
      rootManifestPath,
      rootDocument,
    });
    expect(statFailure.isOk()).toBe(true);
    if (statFailure.isOk()) {
      expect(statFailure.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_FILE_STAT_FAILED" })
      );
    }

    vi.restoreAllMocks();
    const readFile = fs.readFile;
    vi.spyOn(fs, "readFile").mockImplementation(async (...args) => {
      if (path.resolve(String(args[0])) === workerPath) throw new Error("read failed");
      return readFile(...args);
    });
    const readFailure = await validateWorkerAgentGraph({
      projectPath,
      rootManifestPath,
      rootDocument,
    });
    expect(readFailure.isOk()).toBe(true);
    if (readFailure.isOk()) {
      expect(readFailure.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_FILE_READ_FAILED" })
      );
    }
  });

  it("maps validation diagnostics to an optional blocking FxError", () => {
    expect(workerValidationError({ valid: true, diagnostics: [] })).toBeUndefined();
    const error = workerValidationError({
      valid: false,
      diagnostics: [
        {
          severity: "warning",
          code: "WORKER_DEPTH_RECOMMENDED",
          message: "warning",
        },
        { severity: "error", code: "WORKER_CYCLE", message: "blocking" },
      ],
    });
    expect(error?.name).toBe("WORKER_CYCLE");
  });

  it("WORKER-VALIDATE-11: published IDs are opaque leaves with no network call", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ id: "opaque-published-id" }] })
    );
    const tokenCall = vi.spyOn(tools.tokenProvider.m365TokenProvider, "getAccessToken");

    const result = await validateWorkerAgentGraph({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.valid).toBe(true);
    expect(tokenCall).not.toHaveBeenCalled();
  });

  it("WORKER-VALIDATE-04: diagnoses missing, directory, malformed, and non-DA targets", async () => {
    const workersPath = path.join(appPackagePath, "workers");
    await fs.ensureDir(path.join(workersPath, "directory"));
    await fs.writeFile(path.join(workersPath, "malformed.json"), "{");
    await fs.writeJson(path.join(workersPath, "not-da.json"), { version: "v1.8" });
    await fs.writeJson(
      rootManifestPath,
      manifest({
        worker_agents: [
          { file: "workers/missing.json" },
          { file: "workers/directory" },
          { file: "workers/malformed.json" },
          { file: "workers/not-da.json" },
        ],
      })
    );

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.valid).toBe(false);
      expect(result.value.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        "WORKER_FILE_MISSING",
        "WORKER_FILE_NOT_REGULAR",
        "WORKER_FILE_INVALID_JSON",
        "WORKER_FILE_NOT_DECLARATIVE_AGENT",
      ]);
    }
  });

  it("WORKER-VALIDATE-02: diagnoses malformed, empty, and unsupported entries by path", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({
        worker_agents: [null, { id: "" }, { id: "id", file: "worker.json" }, { other: true }],
      })
    );

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.valid).toBe(false);
      expect(result.value.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "WORKER_REFERENCE_INVALID", path: "$.worker_agents[0]" }),
          expect.objectContaining({ code: "WORKER_REFERENCE_EMPTY", path: "$.worker_agents[1]" }),
          expect.objectContaining({
            code: "WORKER_REFERENCE_CONFLICTING",
            path: "$.worker_agents[2]",
          }),
          expect.objectContaining({
            code: "WORKER_REFERENCE_UNSUPPORTED_PROPERTY",
            path: "$.worker_agents[3]",
          }),
        ])
      );
    }
  });

  it("WORKER-VALIDATE-02: handles malformed probes and file entry values", async () => {
    await fs.writeJson(rootManifestPath, []);
    const skipped = await validateWorkerAgentGraph({
      projectPath,
      validateOnlyIfWorkerAgentsConfigured: true,
    });
    expect(skipped.isOk()).toBe(true);
    if (skipped.isOk()) expect(skipped.value.valid).toBe(true);

    const invalidFiles = await validateWorkerAgentGraph({
      projectPath,
      rootManifestPath,
      rootDocument: manifest({ worker_agents: [{ file: 1 }, { file: "" }] }),
    });
    expect(invalidFiles.isOk()).toBe(true);
    if (invalidFiles.isOk()) {
      expect(invalidFiles.value.diagnostics).toEqual([
        expect.objectContaining({ code: "WORKER_REFERENCE_EMPTY" }),
        expect.objectContaining({ code: "WORKER_REFERENCE_EMPTY" }),
      ]);
    }
  });

  it("WORKER-VALIDATE-03: rejects absolute and escaping paths without reading targets", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({
        worker_agents: [
          { file: path.resolve(projectPath, "outside.json") },
          { file: "../outside.json" },
        ],
      })
    );
    const stat = vi.spyOn(fs, "stat");

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.diagnostics.map((item) => item.code)).toEqual([
        "WORKER_FILE_ABSOLUTE",
        "WORKER_FILE_OUTSIDE_PACKAGE",
      ]);
    }
    expect(stat).not.toHaveBeenCalled();
  });

  it("WORKER-VALIDATE-03: rejects a file outside the logical generated package root", async () => {
    const generatedPath = path.join(appPackagePath, ".generated");
    const resourcesPath = path.join(generatedPath, "resources");
    const generatedRootPath = path.join(resourcesPath, "declarativeAgent.json");
    await fs.ensureDir(resourcesPath);
    await fs.writeJson(path.join(appPackagePath, "outside.json"), manifest());
    const rootDocument = manifest({ worker_agents: [{ file: "../../outside.json" }] });
    await fs.writeJson(generatedRootPath, rootDocument);

    const result = await validateWorkerAgentGraph({
      projectPath,
      packageRootPath: generatedPath,
      rootManifestPath: generatedRootPath,
      rootDocument,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.valid).toBe(false);
      expect(result.value.diagnostics).toContainEqual(
        expect.objectContaining({ code: "WORKER_FILE_OUTSIDE_PACKAGE" })
      );
    }
  });

  it("WORKER-VALIDATE-07: diagnoses self-reference", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "declarativeAgent.json" }] })
    );

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.valid).toBe(false);
      expect(result.value.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        "WORKER_SELF_REFERENCE"
      );
    }
  });

  it("WORKER-VALIDATE-06: diagnoses duplicate IDs and canonical files", async () => {
    await fs.writeJson(path.join(appPackagePath, "worker.json"), manifest());
    await fs.writeJson(
      rootManifestPath,
      manifest({
        worker_agents: [
          { id: "same" },
          { id: "same" },
          { file: "worker.json" },
          { file: "./worker.json" },
        ],
      })
    );

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(
        result.value.diagnostics.filter(
          (diagnostic) => diagnostic.code === "WORKER_DUPLICATE_REFERENCE"
        )
      ).toHaveLength(2);
    }
  });

  it("WORKER-VALIDATE-06: Windows case aliases share one canonical identity", async ({ skip }) => {
    if (process.platform !== "win32") {
      skip();
      return;
    }
    await fs.writeJson(path.join(appPackagePath, "Worker.json"), manifest());
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "Worker.json" }, { file: "worker.JSON" }] })
    );

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.diagnostics).toEqual([
        expect.objectContaining({ code: "WORKER_DUPLICATE_REFERENCE" }),
      ]);
    }
  });

  it("WORKER-VALIDATE-08: diagnoses a nested cycle relative to containing manifests", async () => {
    const workersPath = path.join(appPackagePath, "workers");
    await fs.ensureDir(workersPath);
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "workers/one.json" }] })
    );
    await fs.writeJson(
      path.join(workersPath, "one.json"),
      manifest({ worker_agents: [{ file: "two.json" }] })
    );
    await fs.writeJson(
      path.join(workersPath, "two.json"),
      manifest({ worker_agents: [{ file: "one.json" }] })
    );

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.valid).toBe(false);
      expect(result.value.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        "WORKER_CYCLE"
      );
    }
  });

  it("WORKER-VALIDATE-13: allows a Worker shared by two graph branches", async () => {
    const workersPath = path.join(appPackagePath, "workers");
    await fs.ensureDir(workersPath);
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "workers/one.json" }, { file: "workers/two.json" }] })
    );
    await fs.writeJson(
      path.join(workersPath, "one.json"),
      manifest({ worker_agents: [{ file: "shared.json" }] })
    );
    await fs.writeJson(
      path.join(workersPath, "two.json"),
      manifest({ worker_agents: [{ file: "shared.json" }] })
    );
    await fs.writeJson(path.join(workersPath, "shared.json"), manifest());

    const result = await validateWorkerAgentGraph({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.valid).toBe(true);
      expect(result.value.diagnostics).toEqual([]);
      expect(result.value.localManifests.map((item) => item.packagePath).sort()).toEqual([
        "workers/one.json",
        "workers/shared.json",
        "workers/two.json",
      ]);
    }
  });

  it("WORKER-VALIDATE-10: diagnostics are stable across repeated runs", async () => {
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "z.json" }, { file: "a.json" }, { id: "" }] })
    );

    const first = await client.validateWorkerAgents({ projectPath });
    const second = await client.validateWorkerAgents({ projectPath });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isOk() && second.isOk()) {
      expect(second.value.diagnostics).toEqual(first.value.diagnostics);
    }
  });

  it("WORKER-VALIDATE-09: depth greater than two is a non-blocking warning", async () => {
    await fs.ensureDir(path.join(appPackagePath, "workers"));
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "workers/one.json" }] })
    );
    await fs.writeJson(
      path.join(appPackagePath, "workers", "one.json"),
      manifest({ worker_agents: [{ file: "two.json" }] })
    );
    await fs.writeJson(
      path.join(appPackagePath, "workers", "two.json"),
      manifest({ worker_agents: [{ file: "three.json" }] })
    );
    await fs.writeJson(path.join(appPackagePath, "workers", "three.json"), manifest());

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.valid).toBe(true);
      expect(result.value.diagnostics).toEqual([
        expect.objectContaining({
          severity: "warning",
          code: "WORKER_DEPTH_RECOMMENDED",
        }),
      ]);
    }
  });

  it("WORKER-VALIDATE-05: rejects a symlink that canonically escapes appPackage", async ({
    skip,
  }) => {
    const externalPath = path.join(projectPath, "external.json");
    const linkPath = path.join(appPackagePath, "linked.json");
    await fs.writeJson(externalPath, manifest());
    try {
      await fs.symlink(externalPath, linkPath, "file");
    } catch (error) {
      if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "EPERM") {
        skip();
        return;
      }
      throw error;
    }
    await fs.writeJson(rootManifestPath, manifest({ worker_agents: [{ file: "linked.json" }] }));

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.diagnostics).toEqual([
        expect.objectContaining({ code: "WORKER_FILE_CANONICAL_OUTSIDE_PACKAGE" }),
      ]);
    }
  });

  it("WORKER-VALIDATE-12: an internal alias keeps its lexical nested-reference base", async ({
    skip,
  }) => {
    const workersPath = path.join(appPackagePath, "workers");
    const targetsPath = path.join(appPackagePath, "targets");
    await fs.ensureDir(workersPath);
    await fs.ensureDir(targetsPath);
    await fs.writeJson(
      path.join(targetsPath, "worker.json"),
      manifest({ worker_agents: [{ file: "nested.json" }] })
    );
    await fs.writeJson(path.join(workersPath, "nested.json"), manifest());
    try {
      await fs.symlink(
        path.join(targetsPath, "worker.json"),
        path.join(workersPath, "alias.json"),
        "file"
      );
    } catch (error) {
      if (typeof error === "object" && error !== null && Reflect.get(error, "code") === "EPERM") {
        skip();
        return;
      }
      throw error;
    }
    await fs.writeJson(
      rootManifestPath,
      manifest({ worker_agents: [{ file: "workers/alias.json" }] })
    );

    const result = await client.validateWorkerAgents({ projectPath });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.valid).toBe(true);
  });
});
