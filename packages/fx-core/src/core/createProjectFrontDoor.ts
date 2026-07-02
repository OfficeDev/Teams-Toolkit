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
  DeclarativeLocator,
  TemplateArtifactKind,
  TemplateArtifactSnapshot,
  bundledFloorDir,
  resolveCreateTargetByTemplateId,
  runCreateInputs,
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
 *   - `v3`             → translate the Q1 picks onto the v3 `QuestionNames.*`
 *                        (`applyV3PreFill`, INV-5) and hand off to `createV3`,
 *                        whose `QuestionMW` then skips Q1 and asks only Q2;
 *   - `surface-action` → return the action's surface signal (no scaffold).
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
 * The create front door's injected seams. `createV3` is required — it is both the
 * flag-off pass-through and the engine=v3 hand-off, and injecting it (rather than
 * importing `FxCore`) keeps this seam free of an import cycle. `scaffoldV4`,
 * `runInputs`, and `applyV3PreFill` are the flag-on hand-offs the
 * composition root (`FxCore`) supplies. The remaining members default to the real
 * wiring, so a production caller passes only the four handlers.
 */
export interface CreateFrontDoorDeps {
  /** The flag-off pass-through + the engine=v3 hand-off: the unmodified `FxCore.createProject`. */
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
  /** The engine=v3 adapter: translate the Q1 dimension picks onto the v3 `QuestionNames.*` (INV-5). */
  applyV3PreFill: (inputs: Inputs, target: BuildTarget) => void;
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
  /** The Q2 inputs walk (default: the real `runCreateInputs`). */
  runInputs?: typeof runCreateInputs;
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

/**
 * Run the create front door for `inputs`, dispatching the resolved engine.
 *
 * @param inputs the v3 create inputs (carries `platform`; mutated in place by the
 *               engine=v3 pre-fill before the hand-off to `createV3`)
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

  // A surface that already resolved the leaf template — the CLI in non-interactive
  // mode presets `template-name` from its `-c` capability — pins the BuildTarget by
  // id: the Q1 selector is a *router*, so re-walking it would re-prompt, or (non-
  // interactive) fail on a missing dimension, for a target already chosen. Resolve
  // the engine from the template's route and reuse the v3 `traverse` short-circuit
  // on `template-name` for the v3 hand-off. Otherwise walk Q1 (INV-2), threading
  // `interactive` so a non-interactive surface never silently prompts.
  const presetTemplateId = inputs[QuestionNames.TemplateName];
  let target: Result<BuildTarget, FxError>;
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
    target = resolveByTemplateId(floorBytes, presetTemplateId);
  } else {
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
    const runSelector = deps.runSelector ?? runCreateSelector;
    const selectorDeps = {
      flagReader,
      interactive,
      prefilled: selectorPrefillFromInputs(inputs),
    };
    target =
      snapshot === undefined
        ? await runSelector(selectorBytes, ui, surface, selectorDeps)
        : await runSelector(selectorBytes, ui, surface, {
            ...selectorDeps,
            selectorBytesKind: "json",
            v4Registry: deps.v4Registry,
          });
  }
  if (target.isErr()) {
    return err(target.error);
  }

  // INV-3: exactly one resolved BuildTarget, dispatched by its engine.
  switch (target.value.engine) {
    case "surface-action":
      return dispatchSurfaceAction(target.value);
    case "v3":
      // INV-5: translate the Q1 picks onto the v3 inputs (a translation, not a
      // re-ask), then hand off to createProject — its QuestionMW skips Q1. A preset
      // `template-name` carries no Q1 picks and already short-circuits the v3
      // traverse, so the pre-fill is skipped.
      if (!presetTemplateId) {
        deps.applyV3PreFill(inputs, target.value);
      }
      return deps.createV3(inputs);
    case "v4": {
      inputs[QuestionNames.TemplateName] = templateNameForV4(target.value);
      const runInputs = deps.runInputs ?? runCreateInputs;
      const locator: DeclarativeLocator = { kind: "create", templateId: target.value.templateId };
      // Q2: the template's own inputs, over the same floor.
      const entryParams: Answers = {
        ...(target.value.answers ?? {}),
        ...neutralAnswersFromInputs(inputs),
      };
      let inputBytes: Buffer;
      if (snapshot === undefined) {
        if (floorBytes === undefined) {
          floorBytes = (deps.readFloorBytes ?? readBundledFloorBytes)();
        }
        inputBytes = floorBytes;
      } else {
        const metadataBytes = await readSnapshotBytes(snapshot, "metadata");
        if (metadataBytes.isErr()) {
          return err(metadataBytes.error);
        }
        inputBytes = metadataBytes.value;
      }
      const answers = await runInputs(inputBytes, locator, entryParams, ui, {
        flagReader,
        surface,
        inputs,
      });
      if (answers.isErr()) {
        return err(answers.error);
      }
      applyV4CreateFloorAnswers(inputs, answers.value);
      if (snapshot !== undefined) {
        const fullBytes = await readSnapshotBytes(snapshot, "templates");
        if (fullBytes.isErr()) {
          return err(fullBytes.error);
        }
        return deps.scaffoldV4(inputs, target.value, answers.value, flagReader, {
          source: templateSourceFromArtifactSnapshot(snapshot),
          bytes: fullBytes.value,
        });
      }
      return deps.scaffoldV4(inputs, target.value, answers.value, flagReader);
    }
    case "v3-core-method":
      // The shipped create selector carries no v3-core-method route; fail loudly
      // (no silent fallback) rather than mis-route through createProject.
      return err(
        new SystemError({
          source: SOURCE,
          name: "UnsupportedCreateEngine",
          message: `The create front door does not dispatch the '${target.value.engine}' engine.`,
        })
      );
  }
}
