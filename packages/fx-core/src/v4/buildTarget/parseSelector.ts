// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, UserError } from "@microsoft/teamsfx-api";
import { Result, err, ok } from "neverthrow";
import { ConditionNode, isExpressionNode } from "../expression/evaluateExpression";
import { DispatchEngine, RouteQuestion, SelectorRoute, SelectorSpec } from "./resolveBuildTarget";

/** Parse raw selector JSON into routing and presentation projections. See resolve-build-target spec. */

const SOURCE = "Scaffold";

/** `UserError` name for malformed selector JSON. */
export const BUILD_TARGET_MALFORMED_SELECTOR = "BuildTargetMalformedSelector";

function userError(message: string): UserError {
  return new UserError({ source: SOURCE, name: BUILD_TARGET_MALFORMED_SELECTOR, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Read a record field as a string, or `undefined` when absent / non-string. */
function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

/** A `string[]` view of an `unknown`, or `undefined` when it is not an all-string array. */
function stringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value) && value.every((item): item is string => typeof item === "string")) {
    return value;
  }
  return undefined;
}

/** Membership test for the closed dispatch-engine set. */
function isDispatchEngine(value: unknown): value is DispatchEngine {
  return value === "v4" || value === "surface-action";
}

/** Project one raw question onto `{ name, condition? }`. */
function parseQuestion(raw: unknown, index: number): Result<RouteQuestion, FxError> {
  if (!isRecord(raw)) {
    return err(userError(`selector question at index ${index} must be an object`));
  }
  const name = stringField(raw, "name");
  if (name === undefined) {
    return err(userError(`selector question at index ${index} must have a string 'name'`));
  }
  const condition = raw.condition;
  if (condition === undefined) {
    return ok({ name });
  }
  if (!isExpressionNode(condition)) {
    return err(userError(`selector question at index ${index} has a malformed 'condition'`));
  }
  return ok({ name, condition });
}

/** Project one raw route onto `{ when, engine, +engine-key? }`. */
function parseRoute(raw: unknown, index: number): Result<SelectorRoute, FxError> {
  if (!isRecord(raw)) {
    return err(userError(`selector route at index ${index} must be an object`));
  }
  const when = stringField(raw, "when");
  if (when === undefined) {
    return err(userError(`selector route at index ${index} must have a string 'when'`));
  }
  const engine = raw.engine;
  if (!isDispatchEngine(engine)) {
    return err(userError(`selector route at index ${index} has an invalid 'engine'`));
  }
  const route: SelectorRoute = { when, engine };
  for (const key of ["templateId", "action"] as const) {
    if (key in raw && typeof raw[key] !== "string") {
      return err(userError(`selector route at index ${index} has a non-string '${key}'`));
    }
  }
  if (
    "surfaces" in raw &&
    (!Array.isArray(raw.surfaces) ||
      !raw.surfaces.every((surface): surface is string => typeof surface === "string"))
  ) {
    return err(userError(`selector route at index ${index} has invalid 'surfaces'`));
  }
  const templateId = stringField(raw, "templateId");
  if (templateId !== undefined) {
    route.templateId = templateId;
  }
  const action = stringField(raw, "action");
  if (action !== undefined) {
    route.action = action;
  }
  const surfaces = stringArray(raw.surfaces);
  if (surfaces !== undefined) {
    route.surfaces = surfaces;
  }
  return ok(route);
}

/** Parse raw `selector.json` into a routing-only `SelectorSpec`. */
export function parseSelectorSpec(raw: unknown): Result<SelectorSpec, FxError> {
  if (!isRecord(raw)) {
    return err(userError("selector.json must be a JSON object"));
  }
  if (!Array.isArray(raw.questions)) {
    return err(userError("selector.json 'questions' must be an array"));
  }
  if (!Array.isArray(raw.routes)) {
    return err(userError("selector.json 'routes' must be an array"));
  }
  const questions: RouteQuestion[] = [];
  for (let index = 0; index < raw.questions.length; index++) {
    const parsed = parseQuestion(raw.questions[index], index);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    questions.push(parsed.value);
  }
  const routes: SelectorRoute[] = [];
  for (let index = 0; index < raw.routes.length; index++) {
    const parsed = parseRoute(raw.routes[index], index);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    routes.push(parsed.value);
  }
  return ok({ questions, routes });
}

/** Presentation projection of `selector.json` for the live Q1 prompt face. */

/** One selectable option's presentation. */
export interface PresentationOption {
  id: string;
  label: string;
  detail?: string;
  groupName?: string;
  iconPath?: string;
  keyPrefix?: string;
  condition?: ConditionNode;
}

/** One Q1 question's presentation. */
export interface PresentationQuestion {
  name: string;
  title?: string;
  placeholder?: string;
  keyPrefix?: string;
  condition?: ConditionNode;
  staticOptions: PresentationOption[];
}

/** The presentation projection of the whole create selector. */
export interface SelectorPresentation {
  questions: PresentationQuestion[];
}

/** Project one raw option onto its presentation shape. */
function parsePresentationOption(
  raw: unknown,
  questionIndex: number,
  optionIndex: number
): Result<PresentationOption, FxError> {
  if (!isRecord(raw)) {
    return err(
      userError(
        `selector question at index ${questionIndex} option at index ${optionIndex} must be an object`
      )
    );
  }
  const id = stringField(raw, "id");
  if (id === undefined) {
    return err(
      userError(
        `selector question at index ${questionIndex} option at index ${optionIndex} must have a string 'id'`
      )
    );
  }
  const label = stringField(raw, "label");
  if (label === undefined) {
    return err(
      userError(
        `selector question at index ${questionIndex} option at index ${optionIndex} must have a string 'label'`
      )
    );
  }
  const option: PresentationOption = { id, label };
  const detail = stringField(raw, "detail");
  if (detail !== undefined) {
    option.detail = detail;
  }
  const groupName = stringField(raw, "groupName");
  if (groupName !== undefined) {
    option.groupName = groupName;
  }
  const iconPath = stringField(raw, "iconPath");
  if (iconPath !== undefined) {
    option.iconPath = iconPath;
  }
  const keyPrefix = stringField(raw, "keyPrefix");
  if (keyPrefix !== undefined) {
    option.keyPrefix = keyPrefix;
  }
  const condition = raw.condition;
  if (condition !== undefined) {
    if (!isExpressionNode(condition)) {
      return err(
        userError(
          `selector question at index ${questionIndex} option at index ${optionIndex} has a malformed 'condition'`
        )
      );
    }
    option.condition = condition;
  }
  return ok(option);
}

/** Project one raw question onto its presentation shape. */
function parsePresentationQuestion(
  raw: unknown,
  questionIndex: number
): Result<PresentationQuestion, FxError> {
  if (!isRecord(raw)) {
    return err(userError(`selector question at index ${questionIndex} must be an object`));
  }
  const name = stringField(raw, "name");
  if (name === undefined) {
    return err(userError(`selector question at index ${questionIndex} must have a string 'name'`));
  }
  const question: PresentationQuestion = { name, staticOptions: [] };
  const title = stringField(raw, "title");
  if (title !== undefined) {
    question.title = title;
  }
  const placeholder = stringField(raw, "placeholder");
  if (placeholder !== undefined) {
    question.placeholder = placeholder;
  }
  const keyPrefix = stringField(raw, "keyPrefix");
  if (keyPrefix !== undefined) {
    question.keyPrefix = keyPrefix;
  }
  const condition = raw.condition;
  if (condition !== undefined) {
    if (!isExpressionNode(condition)) {
      return err(
        userError(`selector question at index ${questionIndex} has a malformed 'condition'`)
      );
    }
    question.condition = condition;
  }
  if (raw.staticOptions !== undefined) {
    if (!Array.isArray(raw.staticOptions)) {
      return err(
        userError(`selector question at index ${questionIndex} has a non-array 'staticOptions'`)
      );
    }
    for (let optionIndex = 0; optionIndex < raw.staticOptions.length; optionIndex++) {
      const parsed = parsePresentationOption(
        raw.staticOptions[optionIndex],
        questionIndex,
        optionIndex
      );
      if (parsed.isErr()) {
        return err(parsed.error);
      }
      question.staticOptions.push(parsed.value);
    }
  }
  return ok(question);
}

/** Project raw `selector.json` onto its `SelectorPresentation`. */
export function parseSelectorPresentation(raw: unknown): Result<SelectorPresentation, FxError> {
  if (!isRecord(raw)) {
    return err(userError("selector.json must be a JSON object"));
  }
  if (!Array.isArray(raw.questions)) {
    return err(userError("selector.json 'questions' must be an array"));
  }
  const questions: PresentationQuestion[] = [];
  for (let questionIndex = 0; questionIndex < raw.questions.length; questionIndex++) {
    const parsed = parsePresentationQuestion(raw.questions[questionIndex], questionIndex);
    if (parsed.isErr()) {
      return err(parsed.error);
    }
    questions.push(parsed.value);
  }
  return ok({ questions });
}
