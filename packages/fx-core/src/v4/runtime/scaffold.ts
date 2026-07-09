// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError } from "@microsoft/teamsfx-api";
import { Result, err } from "neverthrow";
import { Answers, CallerFloor, TemplateFileEntry } from "../model/dataModel";
import { ExpressionRuntimePort } from "../expression/evaluateExpression";
import { buildRenderContext } from "../renderContext/buildRenderContext";
import {
  PipelineRuntimePort,
  ScaffoldOutcome,
  TargetDir,
  runScaffoldPipeline,
} from "../pipeline/runScaffoldPipeline";
import { parseDeclaredKeys, parsePipeline, parseReplaceMap } from "./packageParse";
import { COMMON_LANGUAGE, selectLanguageContent } from "./selectLanguageContent";

/** v4 scaffold composition over an injected runtime. See create-mcp-server spec. */

/** The two ports `scaffold` composes. */
export interface ScaffoldRuntime {
  /** The pure expression port (whitelist + flags) for `{expr}` render-var derivation. */
  exprPort: ExpressionRuntimePort;
  /** The two-phase pipeline executor's port (render surface + step registry + file sink). */
  port: PipelineRuntimePort;
}

/** One scaffold invocation's inputs. */
export interface ScaffoldRequest {
  /** The package's parsed `descriptor.json` (its `replaceMap` is the render-var source). */
  descriptor: unknown;
  /** The package's parsed `pipeline.json`. */
  pipeline: unknown;
  /** The opened `content/**` entries (raw bytes, `.tpl` suffix intact). */
  content: TemplateFileEntry[];
  /** The resolved answer object (`collect-inputs` output). */
  answers: Answers;
  /** The caller-injected identifier floor (`appName`, the `language` axis, …). */
  callerFloor: CallerFloor;
  /** The output directory + the files it already contains (the create-empty contract). */
  targetDir: TargetDir;
}

/** Scaffold one template package against an injected runtime. */
export async function scaffold(
  request: ScaffoldRequest,
  runtime: ScaffoldRuntime
): Promise<Result<ScaffoldOutcome, FxError>> {
  const replaceMap = parseReplaceMap(request.descriptor);
  if (replaceMap.isErr()) {
    return err(replaceMap.error);
  }
  const pipeline = parsePipeline(request.pipeline);
  if (pipeline.isErr()) {
    return err(pipeline.error);
  }

  // Declared option ids let skipped answers render as empty instead of undeclared.
  const declaredKeys = parseDeclaredKeys(request.descriptor);
  const baseVars = buildRenderContext(
    replaceMap.value,
    request.answers,
    request.callerFloor,
    runtime.exprPort,
    declaredKeys
  );
  if (baseVars.isErr()) {
    return err(baseVars.error);
  }
  // Overlay caller floor last so render can resolve floor tokens such as `{{appName}}`.
  const renderVars = { ...baseVars.value, ...request.callerFloor };

  // Select the active language subtree before render.
  const language = request.callerFloor.language || COMMON_LANGUAGE;
  const content = selectLanguageContent(request.descriptor, request.content, language);

  return runScaffoldPipeline(pipeline.value, content, renderVars, request.targetDir, runtime.port);
}
