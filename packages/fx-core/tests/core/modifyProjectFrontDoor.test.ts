// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, Inputs, Platform, SystemError, UserInteraction } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import {
  Answers,
  BuildTarget,
  DeclarativeLocator,
  TemplateArtifactKind,
  TemplateArtifactSnapshot,
} from "../../src/v4";
import { ModifyFrontDoorDeps, modifyProjectFrontDoor } from "../../src/core/modifyProjectFrontDoor";
import { assert } from "vitest";
import type { ResolvedV4ChannelPackage } from "../../src/component/generator/v4TemplateBridge";

const EMPTY_FLOOR = Buffer.alloc(0);

const V4_TARGET: BuildTarget = {
  templateId: "add-mcp-server",
  engine: "v4",
  answers: { addCapability: "add-action", actionSource: "mcp" },
};

const V3_CORE_TARGET: BuildTarget = {
  templateId: "addPlugin",
  engine: "v3-core-method",
  answers: { addCapability: "add-action", actionSource: "mcp" },
};

function recorder<A extends unknown[], R>(
  impl: (...args: A) => R
): { fn: (...args: A) => R; calls: A[] } {
  const calls: A[] = [];
  return {
    calls,
    fn: (...args: A): R => {
      calls.push(args);
      return impl(...args);
    },
  };
}

const stubUI = {} as unknown as UserInteraction;
const okTarget = (target: BuildTarget): Promise<Result<BuildTarget, FxError>> =>
  Promise.resolve(ok(target));
const okAnswers = (answers: Answers): Promise<Result<Answers, FxError>> =>
  Promise.resolve(ok(answers));
const okUndefined = (): Promise<Result<undefined, FxError>> => Promise.resolve(ok(undefined));

function selectorRecorder(target: BuildTarget) {
  return recorder(
    (
      _floor: Buffer,
      _ui: UserInteraction,
      _surface: string,
      _deps?: {
        flagReader?: (name: string) => boolean;
        interactive?: boolean;
        prefilled?: Record<string, string>;
        selectorBytesKind?: "zip" | "json";
        v4Registry?: (templateId: string) => boolean;
      }
    ): Promise<Result<BuildTarget, FxError>> => {
      void _floor;
      void _ui;
      void _surface;
      void _deps;
      return okTarget(target);
    }
  );
}

function inputsRecorder(answers: Answers) {
  return recorder(
    (
      _floor: Buffer,
      _locator: DeclarativeLocator,
      _entry: Answers,
      _ui: UserInteraction,
      _deps?: { flagReader?: (name: string) => boolean; surface?: string }
    ): Promise<Result<Answers, FxError>> => {
      void _floor;
      void _locator;
      void _entry;
      void _ui;
      void _deps;
      return okAnswers(answers);
    }
  );
}

function artifactSnapshotRecorder(bytesByKind: Record<TemplateArtifactKind, Buffer>): {
  snapshot: TemplateArtifactSnapshot;
  calls: TemplateArtifactKind[];
} {
  const calls: TemplateArtifactKind[] = [];
  return {
    calls,
    snapshot: {
      version: "6.11.0",
      origin: "online",
      artifacts: {
        "create-selector": {
          kind: "create-selector",
          file: "create-selector.json",
          digest: "sha256:create",
        },
        "modify-selector": {
          kind: "modify-selector",
          file: "modify-selector.json",
          digest: "sha256:modify",
        },
        metadata: { kind: "metadata", file: "templates-metadata.zip", digest: "sha256:metadata" },
        templates: { kind: "templates", file: "templates.zip", digest: "sha256:templates" },
      },
      bytes(kind: TemplateArtifactKind): Promise<Result<Buffer, FxError>> {
        calls.push(kind);
        return Promise.resolve(ok(bytesByKind[kind]));
      },
    },
  };
}

const failRunSelector = (): Promise<Result<BuildTarget, FxError>> => {
  throw new Error("runSelector must not run on this path");
};
const failRunInputs = (): Promise<Result<Answers, FxError>> => {
  throw new Error("runInputs must not run on this path");
};
const failScaffoldV4 = (
  _inputs?: Inputs,
  _target?: BuildTarget,
  _answers?: Answers,
  _resolvedPackage?: ResolvedV4ChannelPackage
): Promise<Result<undefined, FxError>> => {
  throw new Error("scaffoldV4 must not run on this path");
};
const failCoreMethod = (): Promise<Result<undefined, FxError>> => {
  throw new Error("callCoreMethod must not run on this path");
};

function deps(overrides: Partial<ModifyFrontDoorDeps>): ModifyFrontDoorDeps {
  return {
    readFloorBytes: () => EMPTY_FLOOR,
    flagReader: () => true,
    ui: stubUI,
    runSelector: failRunSelector,
    runInputs: failRunInputs,
    scaffoldV4: failScaffoldV4,
    callCoreMethod: failCoreMethod,
    ...overrides,
  };
}

describe("modifyProjectFrontDoor", () => {
  it("MDE-01: engine v4 runs modify Q2 via runInputs then scaffoldV4", async () => {
    const runSelector = selectorRecorder(V4_TARGET);
    const q2: Answers = {
      mcpServerUrl: "https://example.com/mcp",
      teamsManifestPath: "manifest.json",
      authType: "none",
    };
    const runInputs = inputsRecorder(q2);
    const scaffoldV4 = recorder(
      (
        _inputs: Inputs,
        _target: BuildTarget,
        _answers: Answers,
        _resolvedPackage?: ResolvedV4ChannelPackage
      ) => {
        void _inputs;
        void _target;
        void _answers;
        void _resolvedPackage;
        return okUndefined();
      }
    );
    const coreMethod = recorder((_inputs: Inputs, _target: BuildTarget) => {
      void _inputs;
      void _target;
      return okUndefined();
    });

    const res = await modifyProjectFrontDoor(
      { platform: Platform.VSCode },
      { addCapability: "add-action", actionSource: "mcp" },
      { mcpServerUrl: "https://example.com/mcp" },
      deps({
        runSelector: runSelector.fn,
        runInputs: runInputs.fn,
        scaffoldV4: scaffoldV4.fn,
        callCoreMethod: coreMethod.fn,
      })
    );

    assert.isTrue(res.isOk());
    assert.equal(runSelector.calls.length, 1);
    assert.deepEqual(runSelector.calls[0][3]?.prefilled, {
      addCapability: "add-action",
      actionSource: "mcp",
    });
    assert.equal(runSelector.calls[0][2], "vscode");
    assert.equal(runInputs.calls.length, 1);
    assert.deepEqual(runInputs.calls[0][1], { kind: "modify", templateId: "add-mcp-server" });
    assert.deepEqual(runInputs.calls[0][2], {
      addCapability: "add-action",
      actionSource: "mcp",
      mcpServerUrl: "https://example.com/mcp",
    });
    assert.equal(runInputs.calls[0][4]?.surface, "vscode");
    assert.equal(scaffoldV4.calls.length, 1);
    assert.deepEqual(scaffoldV4.calls[0][1], V4_TARGET);
    assert.deepEqual(scaffoldV4.calls[0][2], q2);
    assert.equal(coreMethod.calls.length, 0);
  });

  it("MDE-01b: interactive modify uses one staged snapshot for selector, metadata, and templates", async () => {
    const selectorBytes = Buffer.from("modify-selector-json");
    const metadataBytes = Buffer.from("metadata-zip");
    const templatesBytes = Buffer.from("templates-zip");
    const artifactSnapshot = artifactSnapshotRecorder({
      "create-selector": Buffer.from("create-selector-json"),
      "modify-selector": selectorBytes,
      metadata: metadataBytes,
      templates: templatesBytes,
    });
    const runSelector = selectorRecorder(V4_TARGET);
    const runInputs = inputsRecorder({ authType: "none" });
    const scaffoldV4 = recorder((_inputs: Inputs, _target: BuildTarget, _answers: Answers) => {
      void _inputs;
      void _target;
      void _answers;
      return okUndefined();
    });

    const res = await modifyProjectFrontDoor(
      { platform: Platform.VSCode },
      { addCapability: "add-action", actionSource: "mcp" },
      {},
      deps({
        artifactSnapshot: artifactSnapshot.snapshot,
        v4Registry: () => true,
        runSelector: runSelector.fn,
        runInputs: runInputs.fn,
        scaffoldV4: scaffoldV4.fn,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(artifactSnapshot.calls, ["modify-selector", "metadata", "templates"]);
    assert.strictEqual(runSelector.calls[0][0], selectorBytes);
    assert.strictEqual(runSelector.calls[0][3]?.selectorBytesKind, "json");
    assert.strictEqual(runSelector.calls[0][3]?.v4Registry?.("add-mcp-server"), true);
    assert.strictEqual(runInputs.calls[0][0], metadataBytes);
    assert.deepEqual(scaffoldV4.calls[0][3], {
      source: {
        origin: "online",
        version: "6.11.0",
        digest: "sha256:templates",
        location: "templates.zip",
      },
      bytes: templatesBytes,
    });
  });

  it("MDE-01c: modify resolves one staged artifact snapshot before walking Q1", async () => {
    const selectorBytes = Buffer.from("modify-selector-json");
    const metadataBytes = Buffer.from("metadata-zip");
    const templatesBytes = Buffer.from("templates-zip");
    const artifactSnapshot = artifactSnapshotRecorder({
      "create-selector": Buffer.from("create-selector-json"),
      "modify-selector": selectorBytes,
      metadata: metadataBytes,
      templates: templatesBytes,
    });
    const resolveArtifactSnapshot = recorder((_kind: TemplateArtifactKind) =>
      Promise.resolve(ok(artifactSnapshot.snapshot))
    );
    const runSelector = selectorRecorder(V4_TARGET);
    const runInputs = inputsRecorder({ authType: "none" });
    const scaffoldV4 = recorder((_inputs: Inputs, _target: BuildTarget, _answers: Answers) => {
      void _inputs;
      void _target;
      void _answers;
      return okUndefined();
    });

    const res = await modifyProjectFrontDoor(
      { platform: Platform.VSCode },
      { addCapability: "add-action", actionSource: "mcp" },
      {},
      deps({
        resolveArtifactSnapshot: resolveArtifactSnapshot.fn,
        v4Registry: () => true,
        runSelector: runSelector.fn,
        runInputs: runInputs.fn,
        scaffoldV4: scaffoldV4.fn,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(resolveArtifactSnapshot.calls, [["modify-selector"]]);
    assert.deepEqual(artifactSnapshot.calls, ["modify-selector", "metadata", "templates"]);
    assert.strictEqual(runSelector.calls[0][0], selectorBytes);
    assert.strictEqual(runInputs.calls[0][0], metadataBytes);
    assert.strictEqual(scaffoldV4.calls[0][3]?.bytes, templatesBytes);
  });

  it("MDE-01d: modify returns staged artifact resolution errors before reading bundled floor", async () => {
    const artifactError = new SystemError({
      source: "Test",
      name: "ArtifactResolveFailed",
      message: "artifact failed",
    });

    const res = await modifyProjectFrontDoor(
      { platform: Platform.VSCode },
      {},
      {},
      deps({
        resolveArtifactSnapshot: () => Promise.resolve(err(artifactError)),
        readFloorBytes: () => {
          throw new Error("readFloorBytes must not run");
        },
      })
    );

    assert.isTrue(res.isErr());
    assert.strictEqual(res._unsafeUnwrapErr().name, "ArtifactResolveFailed");
  });

  it("MDE-01e: modify returns staged selector, metadata, and template byte errors", async () => {
    const selectorError = new SystemError({
      source: "Test",
      name: "SelectorBytesFailed",
      message: "selector failed",
    });
    const metadataError = new SystemError({
      source: "Test",
      name: "MetadataBytesFailed",
      message: "metadata failed",
    });
    const templatesError = new SystemError({
      source: "Test",
      name: "TemplatesBytesFailed",
      message: "templates failed",
    });
    const selectorSnapshot = artifactSnapshotRecorder({
      "create-selector": Buffer.from("create-selector-json"),
      "modify-selector": Buffer.from("modify-selector-json"),
      metadata: Buffer.from("metadata-zip"),
      templates: Buffer.from("templates-zip"),
    });
    selectorSnapshot.snapshot.bytes = (kind: TemplateArtifactKind) =>
      Promise.resolve(kind === "modify-selector" ? err(selectorError) : ok(Buffer.from(kind)));
    const metadataSnapshot = artifactSnapshotRecorder({
      "create-selector": Buffer.from("create-selector-json"),
      "modify-selector": Buffer.from("modify-selector-json"),
      metadata: Buffer.from("metadata-zip"),
      templates: Buffer.from("templates-zip"),
    });
    metadataSnapshot.snapshot.bytes = (kind: TemplateArtifactKind) =>
      Promise.resolve(kind === "metadata" ? err(metadataError) : ok(Buffer.from(kind)));
    const templatesSnapshot = artifactSnapshotRecorder({
      "create-selector": Buffer.from("create-selector-json"),
      "modify-selector": Buffer.from("modify-selector-json"),
      metadata: Buffer.from("metadata-zip"),
      templates: Buffer.from("templates-zip"),
    });
    templatesSnapshot.snapshot.bytes = (kind: TemplateArtifactKind) =>
      Promise.resolve(kind === "templates" ? err(templatesError) : ok(Buffer.from(kind)));

    const selectorResult = await modifyProjectFrontDoor(
      { platform: Platform.VSCode },
      {},
      {},
      deps({ artifactSnapshot: selectorSnapshot.snapshot })
    );
    const metadataResult = await modifyProjectFrontDoor(
      { platform: Platform.VSCode },
      {},
      {},
      deps({
        artifactSnapshot: metadataSnapshot.snapshot,
        runSelector: selectorRecorder(V4_TARGET).fn,
        runInputs: failRunInputs,
      })
    );
    const templatesResult = await modifyProjectFrontDoor(
      { platform: Platform.VSCode },
      {},
      {},
      deps({
        artifactSnapshot: templatesSnapshot.snapshot,
        runSelector: selectorRecorder(V4_TARGET).fn,
        runInputs: inputsRecorder({}).fn,
      })
    );

    assert.strictEqual(selectorResult._unsafeUnwrapErr(), selectorError);
    assert.strictEqual(metadataResult._unsafeUnwrapErr(), metadataError);
    assert.strictEqual(templatesResult._unsafeUnwrapErr(), templatesError);
  });

  it("MDE-02: engine v3-core-method dispatches to the core-method handler without v4 Q2", async () => {
    const runSelector = selectorRecorder(V3_CORE_TARGET);
    const coreMethod = recorder((_inputs: Inputs, _target: BuildTarget) => {
      void _inputs;
      void _target;
      return okUndefined();
    });

    const res = await modifyProjectFrontDoor(
      { platform: Platform.CLI },
      { addCapability: "add-action", actionSource: "mcp" },
      {},
      deps({
        runSelector: runSelector.fn,
        callCoreMethod: coreMethod.fn,
      })
    );

    assert.isTrue(res.isOk());
    assert.equal(runSelector.calls[0][2], "cli");
    assert.equal(coreMethod.calls.length, 1);
    assert.deepEqual(coreMethod.calls[0][1], V3_CORE_TARGET);
  });

  it("MDE-03: unsupported selector engines fail loudly", async () => {
    const target: BuildTarget = { templateId: "x", engine: "surface-action" };

    const res = await modifyProjectFrontDoor(
      { platform: Platform.VSCode },
      {},
      {},
      deps({ runSelector: () => okTarget(target) })
    );

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.instanceOf(res.error, SystemError);
      assert.equal(res.error.name, "UnsupportedModifyEngine");
    }
  });

  it("MDE-04: selector errors are returned without dispatching", async () => {
    const selectorError = new SystemError({
      source: "Test",
      name: "SelectorFailed",
      message: "selector failed",
    });

    const res = await modifyProjectFrontDoor(
      { platform: Platform.VSCode },
      {},
      {},
      deps({ runSelector: () => Promise.resolve(err(selectorError)) })
    );

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "SelectorFailed");
    }
  });

  it("MDE-05: floor read exceptions are returned as SystemError results", async () => {
    const res = await modifyProjectFrontDoor(
      { platform: Platform.VSCode },
      {},
      {},
      deps({
        readFloorBytes: () => {
          throw new Error("missing templates.zip");
        },
      })
    );

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.instanceOf(res.error, SystemError);
      assert.equal(res.error.name, "ModifyTemplatePackageReadFailed");
    }
  });
});
