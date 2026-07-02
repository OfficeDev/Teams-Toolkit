// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  Inputs,
  Platform,
  SystemError,
  UserInteraction,
  err,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import path from "path";
import { Result } from "neverthrow";
import { featureFlagManager } from "../common/featureFlags";
import { TOOLS } from "../common/globalVars";
import {
  Answers,
  BuildTarget,
  DeclarativeLocator,
  TemplateArtifactKind,
  TemplateArtifactSnapshot,
  bundledFloorDir,
  runCreateInputs,
  templateSourceFromArtifactSnapshot,
} from "../v4";
import { runModifySelector } from "../v4/surface/modifySelectorWalk";
import type { ResolvedV4ChannelPackage } from "../component/generator/v4TemplateBridge";

const SOURCE = "Scaffold";

export interface ModifyFrontDoorDeps {
  scaffoldV4: (
    inputs: Inputs,
    target: BuildTarget,
    answers: Answers,
    resolvedPackage?: ResolvedV4ChannelPackage
  ) => Promise<Result<undefined, FxError>>;
  callCoreMethod: (inputs: Inputs, target: BuildTarget) => Promise<Result<undefined, FxError>>;
  flagReader?: (name: string) => boolean;
  readFloorBytes?: () => Buffer;
  artifactSnapshot?: TemplateArtifactSnapshot;
  resolveArtifactSnapshot?: (
    requiredKind: TemplateArtifactKind
  ) => Promise<Result<TemplateArtifactSnapshot, FxError>>;
  v4Registry?: (templateId: string) => boolean;
  ui?: UserInteraction;
  runSelector?: typeof runModifySelector;
  runInputs?: typeof runCreateInputs;
}

function defaultFlagReader(name: string): boolean {
  return featureFlagManager.getBooleanValue({ name, defaultValue: "false" });
}

function readBundledFloorBytes(): Buffer {
  return fs.readFileSync(path.join(bundledFloorDir(), "templates.zip"));
}

async function readSnapshotBytes(
  snapshot: TemplateArtifactSnapshot,
  kind: TemplateArtifactKind
): Promise<Result<Buffer, FxError>> {
  return snapshot.bytes(kind);
}

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

function unsupportedModifyTarget(target: BuildTarget): SystemError {
  return new SystemError({
    source: SOURCE,
    name: "UnsupportedModifyEngine",
    message: `The modify front door does not dispatch the '${target.engine}' engine.`,
  });
}

function floorReadError(error: unknown): SystemError {
  if (error instanceof SystemError) {
    return error;
  }
  return new SystemError({
    source: SOURCE,
    name: "ModifyTemplatePackageReadFailed",
    message: "Failed to read the bundled modify template package.",
  });
}

export async function modifyProjectFrontDoor(
  inputs: Inputs,
  selectorPrefill: Record<string, string>,
  entryParams: Answers,
  deps: ModifyFrontDoorDeps
): Promise<Result<undefined, FxError>> {
  const flagReader = deps.flagReader ?? defaultFlagReader;
  const ui = deps.ui ?? TOOLS.ui;
  let snapshot = deps.artifactSnapshot;
  let floorBytes: Buffer | undefined;
  let selectorBytes: Buffer;
  if (snapshot === undefined && deps.resolveArtifactSnapshot !== undefined) {
    const resolved = await deps.resolveArtifactSnapshot("modify-selector");
    if (resolved.isErr()) {
      return err(resolved.error);
    }
    snapshot = resolved.value;
  }
  if (snapshot === undefined) {
    try {
      floorBytes = (deps.readFloorBytes ?? readBundledFloorBytes)();
    } catch (error) {
      return err(floorReadError(error));
    }
    selectorBytes = floorBytes;
  } else {
    const selector = await readSnapshotBytes(snapshot, "modify-selector");
    if (selector.isErr()) {
      return err(selector.error);
    }
    selectorBytes = selector.value;
  }
  const surface = surfaceOf(inputs.platform);
  const runSelector = deps.runSelector ?? runModifySelector;
  const selectorDeps = {
    flagReader,
    interactive: !inputs.nonInteractive,
    prefilled: selectorPrefill,
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

  switch (target.value.engine) {
    case "v4": {
      const runInputs = deps.runInputs ?? runCreateInputs;
      const locator: DeclarativeLocator = { kind: "modify", templateId: target.value.templateId };
      let inputBytes: Buffer;
      if (snapshot === undefined) {
        if (floorBytes === undefined) {
          try {
            floorBytes = (deps.readFloorBytes ?? readBundledFloorBytes)();
          } catch (error) {
            return err(floorReadError(error));
          }
        }
        inputBytes = floorBytes;
      } else {
        const metadataBytes = await readSnapshotBytes(snapshot, "metadata");
        if (metadataBytes.isErr()) {
          return err(metadataBytes.error);
        }
        inputBytes = metadataBytes.value;
      }
      const answers = await runInputs(
        inputBytes,
        locator,
        { ...(target.value.answers ?? {}), ...entryParams },
        ui,
        { flagReader, surface }
      );
      if (answers.isErr()) {
        return err(answers.error);
      }
      if (snapshot !== undefined) {
        const fullBytes = await readSnapshotBytes(snapshot, "templates");
        if (fullBytes.isErr()) {
          return err(fullBytes.error);
        }
        return deps.scaffoldV4(inputs, target.value, answers.value, {
          source: templateSourceFromArtifactSnapshot(snapshot),
          bytes: fullBytes.value,
        });
      }
      return deps.scaffoldV4(inputs, target.value, answers.value);
    }
    case "v3-core-method":
      return deps.callCoreMethod(inputs, target.value);
    case "v3":
    case "surface-action":
      return err(unsupportedModifyTarget(target.value));
  }
}

export const modifyProjectFrontDoorDefaults = {
  flagReader: defaultFlagReader,
  readFloorBytes: readBundledFloorBytes,
  runSelector: runModifySelector,
  runInputs: runCreateInputs,
};
