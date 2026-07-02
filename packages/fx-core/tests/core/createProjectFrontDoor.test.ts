// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  CreateProjectResult,
  FxError,
  Inputs,
  Platform,
  SystemError,
  UserError,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { assert } from "vitest";
import {
  Answers,
  BuildTarget,
  DeclarativeLocator,
  TemplateArtifactKind,
  TemplateArtifactSnapshot,
} from "../../src/v4";
import type { ResolvedV4ChannelPackage } from "../../src/component/generator/v4TemplateBridge";
import { CreateFrontDoorDeps, createProjectFrontDoor } from "../../src/core/createProjectFrontDoor";
import { FeatureFlags } from "../../src/common/featureFlags";
import { QuestionNames } from "../../src/question/questionNames";
import { TemplateNames } from "../../src/component/generator/templates/templateNames";

/**
 * Tests for docs/03-specs/operations/scaffolding/dispatch-create-by-engine.md.
 * One `it` per DCE-* acceptance-criteria row (DCE-09 is an L3 VS Code E2E,
 * documented in the spec, not exercised here). Every effectful seam is an
 * injected stub, so this is an L1 engine-tier test with no I/O (INV-4 / INV-6).
 */

const EMPTY_FLOOR = Buffer.alloc(0);

const V4_TARGET: BuildTarget = {
  templateId: "da/mcp-server",
  engine: "v4",
  answers: { projectType: "copilot-agent-type", daTemplate: "add-action", actionSource: "mcp" },
};
const V3_TARGET: BuildTarget = {
  templateId: "default-bot",
  engine: "v3",
  answers: {
    projectType: "teams-agent-and-app-type",
    teamsApp: "other",
    teamsOtherAppType: "default-bot",
  },
};
const STATIC_MCP_TARGET: BuildTarget = {
  templateId: "da/mcp-server-static",
  engine: "v4",
  answers: { projectType: "copilot-agent-type", daTemplate: "add-action", actionSource: "mcp" },
};
const SURFACE_ACTION_TARGET: BuildTarget = {
  templateId: "open-github-copilot-chat",
  engine: "surface-action",
  answers: { projectType: "start-with-github-copilot" },
};

function baseInputs(platform: Platform = Platform.VSCode): Inputs {
  return { platform };
}

/** Inputs with `template-name` preset (the CLI non-interactive contract); defaults to the CLI surface. */
function presetInputs(templateId: string, platform: Platform = Platform.CLI): Inputs {
  return { platform, "template-name": templateId };
}

/** A call-recording stub: `fn` runs `impl` and records each call's arguments. */
function recorder<A extends unknown[], R>(
  impl: (...args: A) => R
): {
  fn: (...args: A) => R;
  calls: A[];
} {
  const calls: A[] = [];
  return {
    calls,
    fn: (...args: A): R => {
      calls.push(args);
      return impl(...args);
    },
  };
}

const okResult = (projectPath: string): Promise<Result<CreateProjectResult, FxError>> =>
  Promise.resolve(ok({ projectPath }));
const okAnswers = (answers: Answers): Promise<Result<Answers, FxError>> =>
  Promise.resolve(ok(answers));
const okArtifactSnapshot = (
  snapshot: TemplateArtifactSnapshot
): Promise<Result<TemplateArtifactSnapshot, FxError>> => {
  const result: Result<TemplateArtifactSnapshot, FxError> = ok<TemplateArtifactSnapshot, FxError>(
    snapshot
  );
  return Promise.resolve(result);
};
const okTarget = (target: BuildTarget): Promise<Result<BuildTarget, FxError>> =>
  Promise.resolve(ok(target));
const okFloor = (): Promise<Result<undefined, FxError>> => Promise.resolve(ok(undefined));
const okScaffold = (
  _inputs: Inputs,
  _target: BuildTarget,
  _answers: Answers,
  _flagReader?: (name: string) => boolean,
  _resolvedPackage?: ResolvedV4ChannelPackage
): Promise<Result<CreateProjectResult, FxError>> => okResult("/v4");

/** A typed `runCreateSelector` stub that records its `(floor, ui, surface, deps)` args. */
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
    ): Promise<Result<BuildTarget, FxError>> => okTarget(target)
  );
}

/** A typed `runCreateInputs` stub that records its `(floor, locator, entry, ui, deps)` args. */
function inputsRecorder(answers: Answers) {
  return recorder(
    (
      _floor: Buffer,
      _locator: DeclarativeLocator,
      _entry: Answers,
      _ui: UserInteraction,
      _deps?: { flagReader?: (name: string) => boolean; surface?: string }
    ): Promise<Result<Answers, FxError>> => okAnswers(answers)
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
        const result: Result<Buffer, FxError> = ok<Buffer, FxError>(bytesByKind[kind]);
        return Promise.resolve(result);
      },
    },
  };
}

/** A typed `resolveCreateTargetByTemplateId` stub that records its `(floor, templateId)` args. */
function resolveByTemplateIdRecorder(target: BuildTarget) {
  return recorder(
    (_floor: Buffer, _templateId: string): Result<BuildTarget, FxError> => ok(target)
  );
}

// Handlers that must never run on the path under test — invoking one throws and fails the test.
const failCreateV3 = (_inputs: Inputs): Promise<Result<CreateProjectResult, FxError>> => {
  throw new Error("createV3 must not run on this path");
};
const failScaffoldV4 = (
  _inputs: Inputs,
  _target: BuildTarget,
  _answers: Answers,
  _flagReader?: (name: string) => boolean,
  _resolvedPackage?: ResolvedV4ChannelPackage
): Promise<Result<CreateProjectResult, FxError>> => {
  throw new Error("scaffoldV4 must not run on this path");
};
const failCollectFloor = (
  _inputs: Inputs,
  _ui: UserInteraction
): Promise<Result<undefined, FxError>> => {
  throw new Error("collectCreateFloor must not run on this path");
};
const failPreFill = (_inputs: Inputs, _target: BuildTarget): void => {
  throw new Error("applyV3PreFill must not run on this path");
};
const failRunInputs = (): Promise<Result<Answers, FxError>> => {
  throw new Error("runInputs must not run on this path");
};
const failRunSelector = (): Promise<Result<BuildTarget, FxError>> => {
  throw new Error("runSelector must not run on this path");
};
const failResolveByTemplateId = (): Result<BuildTarget, FxError> => {
  throw new Error("resolveByTemplateId must not run on this path");
};

// A do-nothing host UI; the flag-on path only hands it to the (stubbed) walks
// (the test-only cast keeps the src no-`as` rule out of scope here).
const stubUI = {} as unknown as UserInteraction;

/** Front-door deps with every seam defaulting to fail-if-called; override per test. */
function deps(overrides: Partial<CreateFrontDoorDeps>): CreateFrontDoorDeps {
  return {
    createV3: failCreateV3,
    scaffoldV4: failScaffoldV4,
    collectCreateFloor: failCollectFloor,
    applyV3PreFill: failPreFill,
    flagReader: () => true,
    readFloorBytes: () => EMPTY_FLOOR,
    ui: stubUI,
    runSelector: failRunSelector,
    resolveByTemplateId: failResolveByTemplateId,
    runInputs: failRunInputs,
    ...overrides,
  };
}

describe("createProjectFrontDoor (dispatch-create-by-engine)", () => {
  it("DCE-01: flag off delegates to createV3 and never walks the selector", async () => {
    const createV3 = recorder((_inputs: Inputs) => okResult("/v3"));
    let selectorWalked = false;

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({
        createV3: createV3.fn,
        flagReader: () => false,
        runSelector: () => {
          selectorWalked = true;
          return okTarget(V4_TARGET);
        },
      })
    );

    assert.isTrue(res.isOk());
    assert.equal(createV3.calls.length, 1);
    assert.isFalse(selectorWalked, "the selector is never walked on the flag-off path");
  });

  it("DCE-02: engine v4 runs Q2 via runInputs then scaffoldV4, never createV3", async () => {
    const q2: Answers = {
      mcpServerType: "remote",
      mcpServerUrl: "https://api/mcp",
      authType: "none",
    };
    const createV3 = recorder((_inputs: Inputs) => okResult("/v3"));
    const runInputs = inputsRecorder(q2);
    const scaffoldV4 = recorder(
      (_i: Inputs, _t: BuildTarget, _a: Answers, _flagReader: (name: string) => boolean) =>
        okResult("/v4")
    );
    const runSelector = selectorRecorder(V4_TARGET);
    const flagReader = (name: string): boolean => name === FeatureFlags.V4Enabled.name;

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({
        createV3: createV3.fn,
        scaffoldV4: scaffoldV4.fn,
        runSelector: runSelector.fn,
        runInputs: runInputs.fn,
        collectCreateFloor: okFloor,
        flagReader,
      })
    );

    assert.isTrue(res.isOk());
    assert.equal(runInputs.calls.length, 1);
    assert.equal(scaffoldV4.calls.length, 1);
    assert.equal(createV3.calls.length, 0);
    assert.equal(runSelector.calls[0][2], "vscode"); // host platform → selector surface
    assert.equal(runInputs.calls[0][4]?.surface, "vscode"); // host platform → inputs surface (gates csharp)
    assert.deepEqual(scaffoldV4.calls[0][1], V4_TARGET);
    assert.deepEqual(scaffoldV4.calls[0][2], q2);
    assert.strictEqual(scaffoldV4.calls[0][3], flagReader);
  });

  it("DCE-02b: interactive v4 uses one staged snapshot for selector, metadata, and templates", async () => {
    const selectorBytes = Buffer.from("selector-json");
    const metadataBytes = Buffer.from("metadata-zip");
    const templatesBytes = Buffer.from("templates-zip");
    const artifactSnapshot = artifactSnapshotRecorder({
      "create-selector": selectorBytes,
      "modify-selector": Buffer.from("modify-selector-json"),
      metadata: metadataBytes,
      templates: templatesBytes,
    });
    const runSelector = selectorRecorder(V4_TARGET);
    const runInputs = inputsRecorder({ authType: "none" });
    const scaffoldV4 = recorder(
      (
        _i: Inputs,
        _t: BuildTarget,
        _a: Answers,
        _flagReader: (name: string) => boolean,
        _resolvedPackage?: ResolvedV4ChannelPackage
      ) => okResult("/v4")
    );

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({
        artifactSnapshot: artifactSnapshot.snapshot,
        v4Registry: () => true,
        runSelector: runSelector.fn,
        runInputs: runInputs.fn,
        scaffoldV4: scaffoldV4.fn,
        collectCreateFloor: okFloor,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(artifactSnapshot.calls, ["create-selector", "metadata", "templates"]);
    assert.strictEqual(runSelector.calls[0][0], selectorBytes);
    assert.strictEqual(runSelector.calls[0][3]?.selectorBytesKind, "json");
    assert.strictEqual(runSelector.calls[0][3]?.v4Registry?.("da/mcp-server"), true);
    assert.strictEqual(runInputs.calls[0][0], metadataBytes);
    assert.deepEqual(scaffoldV4.calls[0][4], {
      source: {
        origin: "online",
        version: "6.11.0",
        digest: "sha256:templates",
        location: "templates.zip",
      },
      bytes: templatesBytes,
    });
  });

  it("DCE-02c: interactive v4 resolves one staged artifact snapshot before walking Q1", async () => {
    const selectorBytes = Buffer.from("selector-json");
    const metadataBytes = Buffer.from("metadata-zip");
    const templatesBytes = Buffer.from("templates-zip");
    const artifactSnapshot = artifactSnapshotRecorder({
      "create-selector": selectorBytes,
      "modify-selector": Buffer.from("modify-selector-json"),
      metadata: metadataBytes,
      templates: templatesBytes,
    });
    const resolveArtifactSnapshotCalls: TemplateArtifactKind[] = [];
    const resolveArtifactSnapshot = async (
      kind: TemplateArtifactKind
    ): Promise<Result<TemplateArtifactSnapshot, FxError>> => {
      resolveArtifactSnapshotCalls.push(kind);
      return await okArtifactSnapshot(artifactSnapshot.snapshot);
    };
    const runSelector = selectorRecorder(V4_TARGET);
    const runInputs = inputsRecorder({ authType: "none" });
    const scaffoldV4 = recorder(
      (
        _i: Inputs,
        _t: BuildTarget,
        _a: Answers,
        _flagReader: (name: string) => boolean,
        _resolvedPackage?: ResolvedV4ChannelPackage
      ) => okResult("/v4")
    );

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({
        resolveArtifactSnapshot,
        v4Registry: () => true,
        runSelector: runSelector.fn,
        runInputs: runInputs.fn,
        scaffoldV4: scaffoldV4.fn,
        collectCreateFloor: okFloor,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(resolveArtifactSnapshotCalls, ["create-selector"]);
    assert.deepEqual(artifactSnapshot.calls, ["create-selector", "metadata", "templates"]);
    assert.strictEqual(runSelector.calls[0][0], selectorBytes);
    assert.strictEqual(runInputs.calls[0][0], metadataBytes);
    assert.strictEqual(scaffoldV4.calls[0][4]?.bytes, templatesBytes);
  });

  it("returns staged artifact resolver and selector-byte errors before dispatching create", async () => {
    const artifactError = new SystemError({
      source: "Test",
      name: "ArtifactResolveFailed",
      message: "artifact failed",
    });
    const selectorError = new SystemError({
      source: "Test",
      name: "SelectorBytesFailed",
      message: "selector bytes failed",
    });
    const selectorSnapshot = artifactSnapshotRecorder({
      "create-selector": Buffer.from("selector-json"),
      "modify-selector": Buffer.from("modify-selector-json"),
      metadata: Buffer.from("metadata-zip"),
      templates: Buffer.from("templates-zip"),
    });
    selectorSnapshot.snapshot.bytes = (kind: TemplateArtifactKind) =>
      Promise.resolve(kind === "create-selector" ? err(selectorError) : ok(Buffer.from(kind)));

    const resolverResult = await createProjectFrontDoor(
      baseInputs(),
      deps({ resolveArtifactSnapshot: () => Promise.resolve(err(artifactError)) })
    );
    const selectorResult = await createProjectFrontDoor(
      baseInputs(),
      deps({ artifactSnapshot: selectorSnapshot.snapshot })
    );

    assert.strictEqual(resolverResult._unsafeUnwrapErr(), artifactError);
    assert.strictEqual(selectorResult._unsafeUnwrapErr(), selectorError);
  });

  it("returns staged metadata and template bytes errors before v4 scaffold", async () => {
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
    const metadataSnapshot = artifactSnapshotRecorder({
      "create-selector": Buffer.from("selector-json"),
      "modify-selector": Buffer.from("modify-selector-json"),
      metadata: Buffer.from("metadata-zip"),
      templates: Buffer.from("templates-zip"),
    });
    metadataSnapshot.snapshot.bytes = (kind: TemplateArtifactKind) =>
      Promise.resolve(kind === "metadata" ? err(metadataError) : ok(Buffer.from(kind)));
    const templatesSnapshot = artifactSnapshotRecorder({
      "create-selector": Buffer.from("selector-json"),
      "modify-selector": Buffer.from("modify-selector-json"),
      metadata: Buffer.from("metadata-zip"),
      templates: Buffer.from("templates-zip"),
    });
    templatesSnapshot.snapshot.bytes = (kind: TemplateArtifactKind) =>
      Promise.resolve(kind === "templates" ? err(templatesError) : ok(Buffer.from(kind)));

    const metadataResult = await createProjectFrontDoor(
      baseInputs(),
      deps({
        artifactSnapshot: metadataSnapshot.snapshot,
        runSelector: selectorRecorder(V4_TARGET).fn,
        runInputs: failRunInputs,
      })
    );
    const templatesResult = await createProjectFrontDoor(
      baseInputs(),
      deps({
        artifactSnapshot: templatesSnapshot.snapshot,
        runSelector: selectorRecorder(V4_TARGET).fn,
        runInputs: inputsRecorder({}).fn,
        collectCreateFloor: okFloor,
      })
    );

    assert.strictEqual(metadataResult._unsafeUnwrapErr(), metadataError);
    assert.strictEqual(templatesResult._unsafeUnwrapErr(), templatesError);
  });

  it("DCE-03: the Q2 answers reach scaffoldV4 under the create locator", async () => {
    const q2: Answers = {
      mcpServerType: "remote",
      mcpServerUrl: "https://api/mcp",
      authType: "none",
    };
    const runInputs = inputsRecorder(q2);
    const scaffoldV4 = recorder(
      (_i: Inputs, _t: BuildTarget, _a: Answers, _flagReader: (name: string) => boolean) =>
        okResult("/v4")
    );

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({
        scaffoldV4: scaffoldV4.fn,
        runSelector: () => okTarget(V4_TARGET),
        runInputs: runInputs.fn,
        collectCreateFloor: okFloor,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(runInputs.calls[0][1], { kind: "create", templateId: "da/mcp-server" });
    assert.deepEqual(runInputs.calls[0][2], V4_TARGET.answers);
    assert.deepEqual(scaffoldV4.calls[0][2], q2);
  });

  it("DCE-04: engine v3 pre-fills from the Q1 picks then delegates to createV3", async () => {
    const prefill = recorder((_i: Inputs, _t: BuildTarget) => undefined);
    const createV3 = recorder((_inputs: Inputs) => okResult("/v3"));
    const inputs = baseInputs();

    const res = await createProjectFrontDoor(
      inputs,
      deps({
        createV3: createV3.fn,
        applyV3PreFill: prefill.fn,
        runSelector: () => okTarget(V3_TARGET),
      })
    );

    assert.isTrue(res.isOk());
    assert.equal(prefill.calls.length, 1);
    assert.deepEqual(prefill.calls[0][1], V3_TARGET);
    assert.equal(createV3.calls.length, 1);
    // pre-fill mutates the same inputs object that is then handed to createV3.
    assert.strictEqual(prefill.calls[0][0], inputs);
    assert.strictEqual(createV3.calls[0][0], inputs);
  });

  it("DCE-05: DT-off DA+MCP resolves the v4 static route and bypasses createV3", async () => {
    const scaffoldV4 = recorder(
      (_i: Inputs, _t: BuildTarget, _a: Answers, _flagReader: (name: string) => boolean) =>
        okResult("/v4-static")
    );
    const runInputs = recorder((_floor: Buffer, _locator: DeclarativeLocator) =>
      Promise.resolve(ok<Answers, FxError>({ selectedMcpTools: ["search"] }))
    );

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({
        scaffoldV4: scaffoldV4.fn,
        runInputs: runInputs.fn,
        collectCreateFloor: okFloor,
        runSelector: () => okTarget(STATIC_MCP_TARGET),
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(runInputs.calls[0][1], { kind: "create", templateId: "da/mcp-server-static" });
    assert.deepEqual(scaffoldV4.calls[0][1], STATIC_MCP_TARGET);
  });

  it("DCE-06: a surface-action returns shouldInvokeTeamsAgent and scaffolds nothing", async () => {
    // createV3 / scaffoldV4 / applyV3PreFill / runInputs all default to fail-if-called.
    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({ runSelector: () => okTarget(SURFACE_ACTION_TARGET) })
    );

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.projectPath, "");
      assert.isTrue(res.value.shouldInvokeTeamsAgent);
    }
  });

  it("DCE-07: the DA+MCP v4 route bypasses createV3 (the v3 generator path)", async () => {
    // Under V4 the front door scaffolds DA+MCP directly through the v4 engine, so
    // createV3 (the v3 generator carrier) is never reached.
    const createV3 = recorder((_inputs: Inputs) => okResult("/v3"));

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({
        createV3: createV3.fn,
        scaffoldV4: (_i, _t, _a) => okResult("/v4"),
        runSelector: () => okTarget(V4_TARGET),
        runInputs: () => okAnswers({}),
        collectCreateFloor: okFloor,
      })
    );

    assert.isTrue(res.isOk());
    assert.equal(createV3.calls.length, 0);
  });

  it("DCE-08: a Q1 cancellation surfaces as the Result error and runs no hand-off", async () => {
    // every hand-off defaults to fail-if-called.
    const cancel = new UserError({ source: "Test", name: "UserCancelError", message: "cancel" });

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({ runSelector: () => Promise.resolve(err(cancel)) })
    );

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "UserCancelError");
    }
  });

  it("DCE-10: a preset template-name resolving to v3 skips Q1 + pre-fill, then delegates to createV3", async () => {
    // runSelector + applyV3PreFill default to fail-if-called: the preset path walks
    // neither (the v3 traverse short-circuits on template-name downstream).
    const resolveByTemplateId = resolveByTemplateIdRecorder({
      templateId: "default-bot",
      engine: "v3",
      answers: {},
    });
    const createV3 = recorder((_inputs: Inputs) => okResult("/v3"));
    const inputs = presetInputs("default-bot");

    const res = await createProjectFrontDoor(
      inputs,
      deps({ createV3: createV3.fn, resolveByTemplateId: resolveByTemplateId.fn })
    );

    assert.isTrue(res.isOk());
    assert.equal(resolveByTemplateId.calls.length, 1);
    assert.equal(resolveByTemplateId.calls[0][1], "default-bot"); // the preset id is forwarded
    assert.equal(createV3.calls.length, 1);
    assert.strictEqual(createV3.calls[0][0], inputs);
  });

  it("DCE-11: a preset template-name resolving to v4 runs Q2 then scaffoldV4, never createV3", async () => {
    const q2: Answers = {
      mcpServerType: "remote",
      mcpServerUrl: "https://api/mcp",
      authType: "none",
    };
    const resolveByTemplateId = resolveByTemplateIdRecorder({
      templateId: "da/mcp-server",
      engine: "v4",
      answers: {},
    });
    const runInputs = inputsRecorder(q2);
    const scaffoldV4 = recorder(
      (_i: Inputs, _t: BuildTarget, _a: Answers, _flagReader: (name: string) => boolean) =>
        okResult("/v4")
    );

    const res = await createProjectFrontDoor(
      presetInputs("da/mcp-server"),
      deps({
        scaffoldV4: scaffoldV4.fn,
        resolveByTemplateId: resolveByTemplateId.fn,
        runInputs: runInputs.fn,
        collectCreateFloor: okFloor,
      })
    );

    assert.isTrue(res.isOk());
    assert.equal(resolveByTemplateId.calls.length, 1);
    assert.equal(runInputs.calls.length, 1);
    assert.equal(scaffoldV4.calls.length, 1);
    assert.deepEqual(runInputs.calls[0][1], { kind: "create", templateId: "da/mcp-server" });
  });

  it("DCE-11b: preset v4 resolves templates artifact before resolving by template id", async () => {
    const artifactSnapshot = artifactSnapshotRecorder({
      "create-selector": Buffer.from("selector-json"),
      "modify-selector": Buffer.from("modify-selector-json"),
      metadata: Buffer.from("metadata-zip"),
      templates: Buffer.from("templates-zip"),
    });
    const resolveArtifactSnapshotCalls: TemplateArtifactKind[] = [];
    const resolveArtifactSnapshot = async (
      kind: TemplateArtifactKind
    ): Promise<Result<TemplateArtifactSnapshot, FxError>> => {
      resolveArtifactSnapshotCalls.push(kind);
      return await okArtifactSnapshot(artifactSnapshot.snapshot);
    };
    const resolveByTemplateId = resolveByTemplateIdRecorder({
      templateId: "da/mcp-server",
      engine: "v4",
      answers: {},
    });
    const runInputs = inputsRecorder({});

    const res = await createProjectFrontDoor(
      presetInputs("da/mcp-server"),
      deps({
        resolveArtifactSnapshot,
        resolveByTemplateId: resolveByTemplateId.fn,
        runInputs: runInputs.fn,
        collectCreateFloor: okFloor,
        scaffoldV4: okScaffold,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(resolveArtifactSnapshotCalls, ["templates"]);
    assert.strictEqual(resolveByTemplateId.calls[0][0].toString(), "templates-zip");
    assert.deepEqual(artifactSnapshot.calls, ["templates", "metadata", "templates"]);
  });

  it("returns preset staged artifact resolver and template-byte errors before resolving by template id", async () => {
    const resolverError = new SystemError({
      source: "Test",
      name: "PresetArtifactResolveFailed",
      message: "artifact failed",
    });
    const templatesError = new SystemError({
      source: "Test",
      name: "PresetTemplatesBytesFailed",
      message: "templates failed",
    });
    const snapshot = artifactSnapshotRecorder({
      "create-selector": Buffer.from("selector-json"),
      "modify-selector": Buffer.from("modify-selector-json"),
      metadata: Buffer.from("metadata-zip"),
      templates: Buffer.from("templates-zip"),
    });
    snapshot.snapshot.bytes = (kind: TemplateArtifactKind) =>
      Promise.resolve(kind === "templates" ? err(templatesError) : ok(Buffer.from(kind)));

    const resolverResult = await createProjectFrontDoor(
      presetInputs("da/mcp-server"),
      deps({ resolveArtifactSnapshot: () => Promise.resolve(err(resolverError)) })
    );
    const templatesResult = await createProjectFrontDoor(
      presetInputs("da/mcp-server"),
      deps({ artifactSnapshot: snapshot.snapshot })
    );

    assert.strictEqual(resolverResult._unsafeUnwrapErr(), resolverError);
    assert.strictEqual(templatesResult._unsafeUnwrapErr(), templatesError);
  });

  it("DCE-13: a non-interactive walk (no preset template-name) threads interactive:false into runSelector", async () => {
    const runSelector = selectorRecorder(SURFACE_ACTION_TARGET);
    const inputs: Inputs = { platform: Platform.CLI, nonInteractive: true };

    const res = await createProjectFrontDoor(inputs, deps({ runSelector: runSelector.fn }));

    assert.isTrue(res.isOk());
    assert.equal(runSelector.calls.length, 1);
    assert.equal(runSelector.calls[0][3]?.interactive, false);
  });

  it("DCE-16: neutral CLI Q1 keys are threaded as selector prefill when template-name is absent", async () => {
    const runSelector = selectorRecorder(V4_TARGET);
    const inputs: Inputs = {
      platform: Platform.CLI,
      nonInteractive: true,
      projectType: "copilot-agent-type",
      daTemplate: "add-action",
      actionSource: "mcp",
      mcpServerUrl: "https://api.example/mcp",
    };

    const res = await createProjectFrontDoor(
      inputs,
      deps({
        runSelector: runSelector.fn,
        runInputs: inputsRecorder({}).fn,
        collectCreateFloor: okFloor,
        scaffoldV4: okScaffold,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(runSelector.calls[0][3]?.prefilled, {
      projectType: "copilot-agent-type",
      daTemplate: "add-action",
      actionSource: "mcp",
      mcpServerUrl: "https://api.example/mcp",
    });
  });

  it("DCE-17: neutral CLI Q2 keys are passed to the v4 input walk as entry params", async () => {
    const runInputs = inputsRecorder({});
    const inputs: Inputs = {
      platform: Platform.CLI,
      nonInteractive: true,
      mcpServerUrl: "https://api.example/mcp",
      authType: "none",
    };

    const res = await createProjectFrontDoor(
      inputs,
      deps({
        runSelector: selectorRecorder(V4_TARGET).fn,
        runInputs: runInputs.fn,
        collectCreateFloor: okFloor,
        scaffoldV4: okScaffold,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(runInputs.calls[0][2], {
      projectType: "copilot-agent-type",
      daTemplate: "add-action",
      actionSource: "mcp",
      mcpServerUrl: "https://api.example/mcp",
      authType: "none",
    });
  });

  it("passes neutral array inputs and office manifest aliases to the v4 input walk", async () => {
    const runInputs = inputsRecorder({});
    const inputs: Inputs = {
      platform: Platform.CLI,
      nonInteractive: true,
      apiPermissions: ["User.Read", "Calendars.Read"],
      [QuestionNames.OfficeAddinManifest]: "manifest.json",
    };

    const res = await createProjectFrontDoor(
      inputs,
      deps({
        runSelector: selectorRecorder(V4_TARGET).fn,
        runInputs: runInputs.fn,
        collectCreateFloor: okFloor,
        scaffoldV4: okScaffold,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(runInputs.calls[0][2].apiPermissions, ["User.Read", "Calendars.Read"]);
    assert.equal(runInputs.calls[0][2].officeAddinManifest, "manifest.json");
  });

  it("DCE-18: CLI static MCP neutral params are passed through to Q2", async () => {
    const runInputs = inputsRecorder({});
    const toolsJson = JSON.stringify({
      tools: [{ name: "searchFlights", description: "Search available flights" }],
    });
    const inputs: Inputs = {
      platform: Platform.CLI,
      nonInteractive: true,
      mcpServerUrl: "https://api.example/mcp",
      authType: "none",
      mcpToolsFilePath: "C:/tools/mcp-tools.json",
      mcpToolsJson: toolsJson,
      selectedMcpTools: ["searchFlights"],
    };

    const res = await createProjectFrontDoor(
      inputs,
      deps({
        runSelector: selectorRecorder(STATIC_MCP_TARGET).fn,
        runInputs: runInputs.fn,
        collectCreateFloor: okFloor,
        scaffoldV4: okScaffold,
      })
    );

    assert.isTrue(res.isOk());
    assert.equal(runInputs.calls[0][2].mcpServerUrl, "https://api.example/mcp");
    assert.equal(runInputs.calls[0][2].authType, "none");
    assert.equal(runInputs.calls[0][2].mcpToolsFilePath, "C:/tools/mcp-tools.json");
    assert.equal(runInputs.calls[0][2].mcpToolsJson, toolsJson);
    assert.deepEqual(runInputs.calls[0][2].selectedMcpTools, ["searchFlights"]);
  });

  it("DCE-17b: Office Add-in folder input is passed to the v4 input walk under its neutral key", async () => {
    const target: BuildTarget = {
      templateId: "declarative-agent-meta-os-upgrade-project",
      engine: "v4",
      answers: {
        projectType: "office-meta-os-type",
        officeAddinCapability: "office-da-meta-os",
        daMetaOsCapability: "declarative-agent-meta-os-upgrade-project",
      },
    };
    const runInputs = inputsRecorder({});
    const inputs: Inputs = {
      platform: Platform.CLI,
      [QuestionNames.OfficeAddinFolder]: "C:/src/addin",
    };

    const res = await createProjectFrontDoor(
      inputs,
      deps({
        runSelector: selectorRecorder(target).fn,
        runInputs: runInputs.fn,
        collectCreateFloor: okFloor,
        scaffoldV4: okScaffold,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(runInputs.calls[0][2], {
      projectType: "office-meta-os-type",
      officeAddinCapability: "office-da-meta-os",
      daMetaOsCapability: "declarative-agent-meta-os-upgrade-project",
      officeAddinFolder: "C:/src/addin",
    });
  });

  it("DCE-14: engine v4 collects Q2+Q3 in one input walk before scaffoldV4", async () => {
    const order: string[] = [];
    const q2AndFloor: Answers = {
      authType: "none",
      [QuestionNames.Folder]: "C:/src",
      [QuestionNames.AppName]: "MyAgent",
    };
    const runInputs = recorder(
      (
        _floor: Buffer,
        _locator: DeclarativeLocator,
        _entry: Answers,
        _ui: UserInteraction,
        _deps?: { flagReader?: (name: string) => boolean; inputs?: Inputs }
      ): Promise<Result<Answers, FxError>> => {
        order.push("q2+q3");
        return okAnswers(q2AndFloor);
      }
    );
    const scaffoldV4 = recorder(
      (_i: Inputs, _t: BuildTarget, _a: Answers, _flagReader: (name: string) => boolean) => {
        order.push("scaffold");
        return okResult("/v4");
      }
    );

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({
        scaffoldV4: scaffoldV4.fn,
        runSelector: () => okTarget(V4_TARGET),
        runInputs: runInputs.fn,
      })
    );

    assert.isTrue(res.isOk());
    assert.deepEqual(order, ["q2+q3", "scaffold"]);
    assert.strictEqual(runInputs.calls[0][4]?.inputs, scaffoldV4.calls[0][0]);
    assert.equal(scaffoldV4.calls[0][0][QuestionNames.Folder], "C:/src");
    assert.equal(scaffoldV4.calls[0][0][QuestionNames.AppName], "MyAgent");
    assert.deepEqual(scaffoldV4.calls[0][2], q2AndFloor);
    assert.equal(scaffoldV4.calls[0][0]["template-name"], "declarative-agent-with-action-from-mcp");
  });

  it("DCE-15: a Q2+Q3 input cancellation propagates and does not scaffold", async () => {
    const cancel = new UserError({ source: "Test", name: "UserCancelError", message: "cancel" });
    const scaffoldV4 = recorder(
      (_i: Inputs, _t: BuildTarget, _a: Answers, _flagReader: (name: string) => boolean) =>
        okResult("/v4")
    );

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({
        scaffoldV4: scaffoldV4.fn,
        runSelector: () => okTarget(V4_TARGET),
        runInputs: () => Promise.resolve(err(cancel)),
      })
    );

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "UserCancelError");
    }
    assert.equal(scaffoldV4.calls.length, 0);
  });

  it("maps the host platform onto the selector surface (cli, vs)", async () => {
    const cli = selectorRecorder(SURFACE_ACTION_TARGET);
    await createProjectFrontDoor(baseInputs(Platform.CLI), deps({ runSelector: cli.fn }));
    assert.equal(cli.calls[0][2], "cli");

    const vs = selectorRecorder(SURFACE_ACTION_TARGET);
    await createProjectFrontDoor(baseInputs(Platform.VS), deps({ runSelector: vs.fn }));
    assert.equal(vs.calls[0][2], "vs");
  });

  it("defaults the flag reader to featureFlagManager (V4 on ⇒ selector)", async () => {
    const saved = process.env[FeatureFlags.V4Enabled.name];
    delete process.env[FeatureFlags.V4Enabled.name];
    try {
      const createV3 = recorder((_inputs: Inputs) => okResult("/v3"));
      const runSelector = selectorRecorder(SURFACE_ACTION_TARGET);

      const res = await createProjectFrontDoor(
        baseInputs(),
        // no flagReader override → the real featureFlagManager default reads V4 on.
        deps({ createV3: createV3.fn, flagReader: undefined, runSelector: runSelector.fn })
      );

      assert.isTrue(res.isOk());
      assert.equal(runSelector.calls.length, 1);
      assert.equal(createV3.calls.length, 0);
    } finally {
      if (saved === undefined) {
        delete process.env[FeatureFlags.V4Enabled.name];
      } else {
        process.env[FeatureFlags.V4Enabled.name] = saved;
      }
    }
  });

  it("DCE-19: a v4 target maps its template id to the v3 telemetry template before Q2", async () => {
    const q2Failed = new UserError({ source: "Test", name: "Q2Failed", message: "bad inputs" });
    const expectedMappings: ReadonlyArray<readonly [string, string]> = [
      ["basic-custom-engine-agent", TemplateNames.BasicCustomEngineAgent],
      ["weather-agent", TemplateNames.WeatherAgent],
      ["graph-connector", TemplateNames.GraphConnector],
      ["custom-copilot-basic", TemplateNames.CustomCopilotBasic],
      ["custom-copilot-rag-customize", TemplateNames.CustomCopilotRagCustomize],
      ["custom-copilot-rag-azure-ai-search", TemplateNames.CustomCopilotRagAzureAISearch],
      ["custom-copilot-rag-custom-api", TemplateNames.CustomCopilotRagCustomApi],
      ["teams-collaborator-agent", TemplateNames.TeamsCollaboratorAgent],
      ["non-sso-tab", TemplateNames.Tab],
      ["default-message-extension", TemplateNames.DefaultMessageExtension],
      ["default-bot", TemplateNames.DefaultBot],
      ["office-addin-wxpo-taskpane", TemplateNames.WXPTaskpane],
      ["office-addin-excel-cfshortcut", TemplateNames.ExcelCFShortcut],
      ["declarative-agent-meta-os-upgrade-project", "declarative-agent-meta-os-upgrade-project"],
      ["office-addin-config", TemplateNames.OfficeAddinCommon],
      ["da/no-action", TemplateNames.DeclarativeAgentBasic],
      ["da/graph-connector", TemplateNames.DeclarativeAgentWithGraphConnector],
      ["da/typespec", TemplateNames.DeclarativeAgentWithTypeSpec],
      ["da/skill", TemplateNames.DeclarativeAgentWithSkill],
      ["da/api-plugin-from-scratch", TemplateNames.DeclarativeAgentWithActionFromScratch],
      [
        "da/api-plugin-from-scratch-bearer",
        TemplateNames.DeclarativeAgentWithActionFromScratchBearer,
      ],
      [
        "da/api-plugin-from-scratch-oauth",
        TemplateNames.DeclarativeAgentWithActionFromScratchOAuth,
      ],
      [
        "da/api-plugin-from-existing-api",
        TemplateNames.DeclarativeAgentWithActionFromExistingApiSpec,
      ],
      ["da/mcp-server-static", TemplateNames.DeclarativeAgentWithActionFromMCP],
      ["da/mcp-server", TemplateNames.DeclarativeAgentWithActionFromMCP],
    ];

    for (const [templateId, expectedTemplateName] of expectedMappings) {
      const scaffoldV4 = recorder((_i: Inputs, _t: BuildTarget, _a: Answers) => okResult("/v4"));
      const inputs = baseInputs();

      const res = await createProjectFrontDoor(
        inputs,
        deps({
          scaffoldV4: scaffoldV4.fn,
          runSelector: () => okTarget({ templateId, engine: "v4", answers: {} }),
          runInputs: () => Promise.resolve(err(q2Failed)),
        })
      );

      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.name, "Q2Failed");
      }
      assert.equal(scaffoldV4.calls.length, 0);
      assert.equal(inputs["template-name"], expectedTemplateName, templateId);
    }
  });

  it("DCE-20: an unmapped v4 telemetry template id falls back to itself", async () => {
    const q2Failed = new UserError({ source: "Test", name: "Q2Failed", message: "bad inputs" });
    const target: BuildTarget = { templateId: "future/v4-template", engine: "v4", answers: {} };
    const inputs = baseInputs();

    const res = await createProjectFrontDoor(
      inputs,
      deps({
        runSelector: () => okTarget(target),
        runInputs: () => Promise.resolve(err(q2Failed)),
      })
    );

    assert.isTrue(res.isErr());
    assert.equal(inputs["template-name"], "future/v4-template");
  });

  it("fails loudly on an unsupported create engine (v3-core-method)", async () => {
    const target: BuildTarget = { templateId: "some-core-method", engine: "v3-core-method" };

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({ runSelector: () => okTarget(target) })
    );

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "UnsupportedCreateEngine");
    }
  });

  it("fails loudly on an unhandled surface action", async () => {
    const target: BuildTarget = { templateId: "some-other-action", engine: "surface-action" };

    const res = await createProjectFrontDoor(
      baseInputs(),
      deps({ runSelector: () => okTarget(target) })
    );

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "UnsupportedCreateAction");
    }
  });
});
