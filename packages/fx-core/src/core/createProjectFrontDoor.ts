// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  CreateProjectResult,
  FxError,
  Inputs,
  Platform,
  SystemError,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import path from "path";
import { Result, err, ok } from "neverthrow";
import {
  Answers,
  BuildTarget,
  CreateSelectorDeps,
  DeclarativeLocator,
  TemplateArtifactKind,
  TemplateArtifactSnapshot,
  WalkHistoryEntry,
  bundledFloorDir,
  resolveCreateTargetByTemplateId,
  runCreateInputsWalk,
  runCreateSelector,
  templateSourceFromArtifactSnapshot,
} from "../v4";
import { FeatureFlags, readBooleanFeatureFlag } from "../common/featureFlags";
import { TOOLS } from "../common/globalVars";
import { TemplateNames } from "../component/generator/templates/templateNames";
import type { ResolvedV4ChannelPackage } from "../component/generator/v4TemplateBridge";
import { QuestionNames } from "../question/questionNames";

/**
 * Operation `dispatch-create-by-engine` — the create front door.
 *
 * Spec: docs/03-specs/operations/scaffolding/dispatch-create-by-engine.md
 * Decision: docs/02-architecture/adr/ADR-0014-dispatcher-buildtarget-resolution.md
 *
 * The single entry the create surfaces call in place of `FxCore.createProject`.
 * Behind `TEAMSFX_V4_ENABLED`, the v4 create selector is the live Q1 front door
 * and the resolved `BuildTarget` is dispatched by its `engine` (INV-3):
 *   - `v4`             → run the template's own Q2 (`runCreateInputs`) over the
 *                        same floor, with the create floor appended to the same
 *                        walk, then `scaffoldV4` the authored package;
 *   - `surface-action` → return the action's surface signal (no scaffold).
 * `{ v4, surface-action }` is the whole closed engine set (ADR-0014 Amendment 5):
 * no selector engine hands off to v3.
 * Flag off is a pure pass-through to the unmodified `createV3` (INV-1): the
 * selector is never walked, so v3 behavior is byte-identical.
 *
 * This orchestrator is a seam outside the v4 world (INV-4): it touches the v3
 * `Inputs` and calls `createV3`, which v4 may not. Every effectful step is an
 * injected dependency, so the dispatch is verifiable without I/O; the floor read
 * is injectable too (INV-6).
 */

const SOURCE = "Scaffold";

/** The only shipped create `surface-action`: open GitHub Copilot Chat (the v3 `startWithGithubCopilot` shape). */
const OPEN_GITHUB_COPILOT_CHAT = "open-github-copilot-chat";
const V4_TO_V3_TEMPLATE_ID: Readonly<Record<string, string>> = {
  "basic-custom-engine-agent": TemplateNames.BasicCustomEngineAgent,
  "weather-agent": TemplateNames.WeatherAgent,
  "graph-connector": TemplateNames.GraphConnector,
  "custom-copilot-basic": TemplateNames.CustomCopilotBasic,
  "custom-copilot-rag-customize": TemplateNames.CustomCopilotRagCustomize,
  "custom-copilot-rag-azure-ai-search": TemplateNames.CustomCopilotRagAzureAISearch,
  "custom-copilot-rag-custom-api": TemplateNames.CustomCopilotRagCustomApi,
  "teams-collaborator-agent": TemplateNames.TeamsCollaboratorAgent,
  "non-sso-tab": TemplateNames.Tab,
  "default-message-extension": TemplateNames.DefaultMessageExtension,
  "default-bot": TemplateNames.DefaultBot,
  "office-addin-wxpo-taskpane": TemplateNames.WXPTaskpane,
  "office-addin-excel-cfshortcut": TemplateNames.ExcelCFShortcut,
  "office-addin-excel-customfunctions": TemplateNames.ExcelCustomFunctions,
  "office-addin-sso-naa": TemplateNames.OfficeAddinSsoNaa,
  "declarative-agent-meta-os-upgrade-project": "declarative-agent-meta-os-upgrade-project",
  "office-addin-config": TemplateNames.OfficeAddinCommon,
  "da/no-action": TemplateNames.DeclarativeAgentBasic,
  "da/graph-connector": TemplateNames.DeclarativeAgentWithGraphConnector,
  "da/typespec": TemplateNames.DeclarativeAgentWithTypeSpec,
  "da/skill": TemplateNames.DeclarativeAgentWithSkill,
  "da/api-plugin-from-scratch": TemplateNames.DeclarativeAgentWithActionFromScratch,
  "da/api-plugin-from-scratch-bearer": TemplateNames.DeclarativeAgentWithActionFromScratchBearer,
  "da/api-plugin-from-scratch-oauth": TemplateNames.DeclarativeAgentWithActionFromScratchOAuth,
  "da/api-plugin-from-existing-api": TemplateNames.DeclarativeAgentWithActionFromExistingApiSpec,
  "da/mcp-server-static": TemplateNames.DeclarativeAgentWithActionFromMCP,
  "da/mcp-server": TemplateNames.DeclarativeAgentWithActionFromMCP,
};
const NON_V4_INPUT_KEYS: ReadonlySet<string> = new Set([
  "capabilities",
  "folder",
  "isM365",
  "nonInteractive",
  "platform",
  "projectId",
  "runtime",
  QuestionNames.TemplateName,
]);

/**
 * The create front door's injected seams. `createV3` is required for the
 * flag-off pass-through, and injecting it (rather than importing `FxCore`) keeps
 * this seam free of an import cycle. `scaffoldV4`, `runInputs`, and the legacy
 * `collectCreateFloor` seam are the flag-on hand-offs the
 * composition root (`FxCore`) supplies. The remaining members default to the real
 * wiring, so a production caller passes only the four handlers.
 */
export interface CreateFrontDoorDeps {
  /** The flag-off pass-through: the unmodified `FxCore.createProject`. */
  createV3: (inputs: Inputs) => Promise<Result<CreateProjectResult, FxError>>;
  /** The engine=v4 hand-off: build the scaffold context + run the authored declarative package. */
  scaffoldV4: (
    inputs: Inputs,
    target: BuildTarget,
    answers: Answers,
    flagReader: (name: string) => boolean,
    resolvedPackage?: ResolvedV4ChannelPackage
  ) => Promise<Result<CreateProjectResult, FxError>>;
  /** Legacy create-floor seam retained for existing composition wiring; v4 now appends floor questions inside `runInputs`. */
  collectCreateFloor: (inputs: Inputs, ui: UserInteraction) => Promise<Result<undefined, FxError>>;
  /** The feature-flag reader (default: `featureFlagManager`-backed, so VS Code-settings flags apply). */
  flagReader?: (name: string) => boolean;
  /** The bundled-floor channel-zip reader (default: the shipped `templates.zip`; injectable for tests, INV-6). */
  readFloorBytes?: () => Buffer;
  /** Per-invocation staged artifact snapshot. When supplied, Q1/Q2/full staging read from this snapshot. */
  artifactSnapshot?: TemplateArtifactSnapshot;
  /** Resolves a per-invocation staged artifact snapshot after the v4 flag is known to be on. */
  resolveArtifactSnapshot?: (
    requiredKind: TemplateArtifactKind
  ) => Promise<Result<TemplateArtifactSnapshot, FxError>>;
  /** Membership test supplied with selector-only artifacts. */
  v4Registry?: (templateId: string) => boolean;
  /** The host surface (default: `TOOLS.ui`). */
  ui?: UserInteraction;
  /** The Q1 selector walk (default: the real `runCreateSelector`). */
  runSelector?: typeof runCreateSelector;
  /** Resolve a target directly from a preset `template-name`, bypassing Q1 (default: the real `resolveCreateTargetByTemplateId`). */
  resolveByTemplateId?: typeof resolveCreateTargetByTemplateId;
  /** The Q2 inputs walk (default: the real `runCreateInputsWalk`, returning a resumable outcome). */
  runInputs?: typeof runCreateInputsWalk;
}

/** The default `featureFlagManager`-backed reader (a flag is on per its env var / VS Code setting). */
function defaultFlagReader(name: string): boolean {
  return readBooleanFeatureFlag(name);
}

/** Read the shipped bundled-floor channel zip (the default `readFloorBytes`). */
function readBundledFloorBytes(): Buffer {
  return fs.readFileSync(path.join(bundledFloorDir(), "templates.zip"));
}

function readSnapshotBytes(
  snapshot: TemplateArtifactSnapshot,
  kind: TemplateArtifactKind
): Promise<Result<Buffer, FxError>> {
  return snapshot.bytes(kind);
}

function isV4NeutralInput(key: string, value: unknown): value is string | string[] {
  return (
    !NON_V4_INPUT_KEYS.has(key) &&
    !key.includes("-") &&
    (typeof value === "string" ||
      (Array.isArray(value) && value.every((item): item is string => typeof item === "string")))
  );
}

function neutralAnswersFromInputs(inputs: Inputs): Answers {
  const answers: Answers = {};
  for (const [key, value] of Object.entries(inputs)) {
    if (isV4NeutralInput(key, value)) {
      answers[key] = value;
    }
  }
  const officeAddinFolder = inputs[QuestionNames.OfficeAddinFolder];
  if (typeof officeAddinFolder === "string" && answers.officeAddinFolder === undefined) {
    answers.officeAddinFolder = officeAddinFolder;
  }
  const officeAddinManifest = inputs[QuestionNames.OfficeAddinManifest];
  if (typeof officeAddinManifest === "string" && answers.officeAddinManifest === undefined) {
    answers.officeAddinManifest = officeAddinManifest;
  }
  return answers;
}

function selectorPrefillFromInputs(inputs: Inputs): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const [key, value] of Object.entries(neutralAnswersFromInputs(inputs))) {
    if (typeof value === "string") {
      answers[key] = value;
    }
  }
  return answers;
}

function templateNameForV4(target: BuildTarget): string {
  return V4_TO_V3_TEMPLATE_ID[target.templateId] ?? target.templateId;
}

function applyV4CreateFloorAnswers(inputs: Inputs, answers: Answers): void {
  const folder = answers[QuestionNames.Folder];
  if (typeof folder === "string") {
    inputs[QuestionNames.Folder] = folder;
  }
  const appName = answers[QuestionNames.AppName];
  if (typeof appName === "string") {
    inputs[QuestionNames.AppName] = appName;
  }
}

/** Map the host `Platform` onto the selector's `surface` axis (drives option `condition`s). */
function surfaceOf(platform: Platform | undefined): string {
  switch (platform) {
    case Platform.CLI:
    case Platform.CLI_HELP:
      return "cli";
    case Platform.VS:
      return "vs";
    default:
      return "vscode";
  }
}

/** Dispatch a resolved `surface-action` target onto its surface signal (no scaffold). */
function dispatchSurfaceAction(target: BuildTarget): Result<CreateProjectResult, FxError> {
  if (target.templateId === OPEN_GITHUB_COPILOT_CHAT) {
    return ok({ projectPath: "", shouldInvokeTeamsAgent: true });
  }
  return err(
    new SystemError({
      source: SOURCE,
      name: "UnsupportedCreateAction",
      message: `The create front door does not handle the '${target.templateId}' surface action.`,
    })
  );
}

function unexpectedPresetBack(target: BuildTarget): SystemError {
  return new SystemError({
    source: SOURCE,
    name: "UnexpectedCreateBack",
    message: `The preset-template create path for '${target.templateId}' is not backable, but Q2 signalled back.`,
  });
}

/**
 * Run the create front door for `inputs`, dispatching the resolved engine.
 *
 * @param inputs the create inputs (carries `platform`; mutated in place by the
 *               v4 floor collection before the hand-off to `scaffoldV4`)
 * @param deps   the injected seams (see `CreateFrontDoorDeps`)
 * @returns the created project (drop-in for `FxCore.createProject`), or a
 *          `UserError` / `SystemError` (a surface cancellation or a route break)
 */
export async function createProjectFrontDoor(
  inputs: Inputs,
  deps: CreateFrontDoorDeps
): Promise<Result<CreateProjectResult, FxError>> {
  const flagReader = deps.flagReader ?? defaultFlagReader;

  // INV-1: flag off ⇒ a pure pass-through to the unmodified v3 createProject.
  if (!flagReader(FeatureFlags.V4Enabled.name)) {
    return deps.createV3(inputs);
  }

  const ui = deps.ui ?? TOOLS.ui;
  const surface = surfaceOf(inputs.platform);
  let snapshot = deps.artifactSnapshot;
  let floorBytes: Buffer | undefined;
  const interactive = !inputs.nonInteractive;

  // Dispatch one resolved BuildTarget by its engine (INV-3). Returns a scaffolded
  // result, or `{ kind: "back" }` when a backable Q2 was exited at its first prompt
  // (the caller re-enters Q1). `snapshot` / `floorBytes` are read lazily and shared.
  async function dispatchByEngine(
    target: BuildTarget,
    baseStep: number,
    backable: boolean
  ): Promise<Result<{ kind: "result"; result: CreateProjectResult } | { kind: "back" }, FxError>> {
    switch (target.engine) {
      case "surface-action": {
        const action = dispatchSurfaceAction(target);
        return action.isErr() ? err(action.error) : ok({ kind: "result", result: action.value });
      }
      case "v4": {
        inputs[QuestionNames.TemplateName] = templateNameForV4(target);
        const runInputs = deps.runInputs ?? runCreateInputsWalk;
        const locator: DeclarativeLocator = { kind: "create", templateId: target.templateId };
        // Q2 + common floor, over the same floor, continuing Q1's step numbering.
        const entryParams: Answers = {
          ...(target.answers ?? {}),
          ...neutralAnswersFromInputs(inputs),
        };
        let inputBytes: Buffer;
        if (snapshot === undefined) {
          inputBytes = floorBytes ?? (deps.readFloorBytes ?? readBundledFloorBytes)();
        } else {
          const metadataBytes = await readSnapshotBytes(snapshot, "metadata");
          if (metadataBytes.isErr()) {
            return err(metadataBytes.error);
          }
          inputBytes = metadataBytes.value;
        }
        const outcome = await runInputs(inputBytes, locator, entryParams, ui, {
          flagReader,
          surface,
          inputs,
          baseStep,
          backable,
        });
        if (outcome.isErr()) {
          return err(outcome.error);
        }
        if (outcome.value.kind === "back") {
          return ok({ kind: "back" });
        }
        const answers = outcome.value.answers;
        applyV4CreateFloorAnswers(inputs, answers);
        // The scaffold contract is a plain BuildTarget; do not leak Q1 walk metadata.
        const scaffoldTarget: BuildTarget = {
          templateId: target.templateId,
          engine: target.engine,
          answers: target.answers,
        };
        if (snapshot !== undefined) {
          const fullBytes = await readSnapshotBytes(snapshot, "templates");
          if (fullBytes.isErr()) {
            return err(fullBytes.error);
          }
          const scaffolded = await deps.scaffoldV4(inputs, scaffoldTarget, answers, flagReader, {
            source: templateSourceFromArtifactSnapshot(snapshot),
            bytes: fullBytes.value,
          });
          return scaffolded.isErr()
            ? err(scaffolded.error)
            : ok({ kind: "result", result: scaffolded.value });
        }
        const scaffolded = await deps.scaffoldV4(inputs, scaffoldTarget, answers, flagReader);
        return scaffolded.isErr()
          ? err(scaffolded.error)
          : ok({ kind: "result", result: scaffolded.value });
      }
    }
  }

  // A surface that already resolved the leaf template — the CLI in non-interactive
  // mode presets `template-name` from its `-c` capability — pins the BuildTarget by
  // id: the Q1 selector is a *router*, so re-walking it would re-prompt. Resolve the
  // engine from the template's route and dispatch once (no cross-phase back; INV-8).
  const presetTemplateId = inputs[QuestionNames.TemplateName];
  if (presetTemplateId) {
    if (snapshot === undefined && deps.resolveArtifactSnapshot !== undefined) {
      const resolved = await deps.resolveArtifactSnapshot("templates");
      if (resolved.isErr()) {
        return err(resolved.error);
      }
      snapshot = resolved.value;
    }
    if (snapshot === undefined) {
      floorBytes = (deps.readFloorBytes ?? readBundledFloorBytes)();
    } else {
      const fullBytes = await readSnapshotBytes(snapshot, "templates");
      if (fullBytes.isErr()) {
        return err(fullBytes.error);
      }
      floorBytes = fullBytes.value;
    }
    const resolveByTemplateId = deps.resolveByTemplateId ?? resolveCreateTargetByTemplateId;
    const target = resolveByTemplateId(floorBytes, presetTemplateId);
    if (target.isErr()) {
      return err(target.error);
    }
    const dispatched = await dispatchByEngine(target.value, 0, false);
    if (dispatched.isErr()) {
      return err(dispatched.error);
    }
    // The preset path is not backable (baseStep 0, backable false), so `done` is the live branch.
    return dispatched.value.kind === "back"
      ? err(unexpectedPresetBack(target.value))
      : ok(dispatched.value.result);
  }

  // Otherwise walk Q1 (INV-2). The selector bytes are stable across the cross-phase
  // back re-entry loop, so resolve them once; each iteration re-walks Q1 (retaining
  // its history for `resume`) and dispatches, re-entering Q1 on a Q2-first back so
  // Q1 and Q2 form one continuous back-navigable wizard (INV-10). The loop is scoped
  // below the preset check, so a prior iteration's `template-name` never short-circuits Q1.
  if (snapshot === undefined && deps.resolveArtifactSnapshot !== undefined) {
    const resolved = await deps.resolveArtifactSnapshot("create-selector");
    if (resolved.isErr()) {
      return err(resolved.error);
    }
    snapshot = resolved.value;
  }
  let selectorBytes: Buffer;
  if (snapshot === undefined) {
    floorBytes = (deps.readFloorBytes ?? readBundledFloorBytes)();
    selectorBytes = floorBytes;
  } else {
    const selector = await readSnapshotBytes(snapshot, "create-selector");
    if (selector.isErr()) {
      return err(selector.error);
    }
    selectorBytes = selector.value;
  }
  const runSelector: typeof runCreateSelector = deps.runSelector ?? runCreateSelector;
  let resumeHistory: WalkHistoryEntry[] | undefined = undefined;
  for (;;) {
    const selectorDeps: CreateSelectorDeps = {
      flagReader,
      interactive,
      prefilled: selectorPrefillFromInputs(inputs),
      resume: resumeHistory === undefined ? undefined : { history: resumeHistory },
    };
    const target =
      snapshot === undefined
        ? await runSelector(selectorBytes, ui, surface, selectorDeps)
        : await runSelector(selectorBytes, ui, surface, {
            ...selectorDeps,
            selectorBytesKind: "json",
            v4Registry: deps.v4Registry,
          });
    if (target.isErr()) {
      return err(target.error);
    }
    // Q2 continues Q1's step numbering (baseStep = promptCount) and is backable: a
    // back at its first prompt re-enters Q1 with the retained history (INV-10).
    const dispatched = await dispatchByEngine(target.value, target.value.promptCount, true);
    if (dispatched.isErr()) {
      return err(dispatched.error);
    }
    if (dispatched.value.kind === "back") {
      resumeHistory = target.value.history;
      continue;
    }
    return ok(dispatched.value.result);
  }
}
