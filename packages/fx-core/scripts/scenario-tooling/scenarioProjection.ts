// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createHash } from "crypto";
import path from "path";
import { Platform } from "@microsoft/teamsfx-api";
import { QuestionNames } from "../../src/question";
import { PresentationQuestion } from "../../src/v4/buildTarget/parseSelector";
import { QuestionSpec } from "../../src/v4/collectInputs/collectInputs";
import {
  ConditionNode,
  NULL_VALUE,
  Scope,
  collectFeatureFlagReferences,
  evaluateExpression,
} from "../../src/v4/expression/evaluateExpression";
import { ScaffoldCatalog } from "../../src/v4/inspection/scaffoldCatalog";
import { createFloorTail } from "../../src/v4/surface/createFloorTail";
import { gateLanguagesBySurface } from "../../src/v4/surface/createInputs";
import {
  ScaffoldFingerprints,
  ScenarioCatalog,
  ScenarioDiagnostic,
  ScenarioDocument,
  ScenarioReviewAnswer,
  ScenarioReviewContext,
  fingerprintScaffoldTemplate,
} from "./scenarioCatalog";
import { ResolvedScenarioEnvironment, resolveScenarioEnvironment } from "./scenarioEnvironment";

export const INDEX_DATA_START = "<!-- scenario-index-data:start -->";
export const INDEX_DATA_END = "<!-- scenario-index-data:end -->";
export const GENERATED_SCENARIO_MARKER =
  "<!-- Generated from scenario Markdown and v4 declarations. Do not edit. -->";

export interface ScenarioProjection {
  document: ScenarioDocument;
  htmlRelativePath: string;
  html: string;
  fingerprints?: ScaffoldFingerprints;
}

interface ResolvedReviewContext {
  context: ScenarioReviewContext;
  contextIndex: number;
  environment: ResolvedScenarioEnvironment;
  reportedInvalidConditions: Set<ConditionNode>;
  reportedUnknownFlags: Set<string>;
}

interface ReviewContextProjection extends ResolvedReviewContext {
  catalog: ScaffoldCatalog;
  tailQuestions: QuestionSpec[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diagnostic(
  severity: ScenarioDiagnostic["severity"],
  code: string,
  relativePath: string,
  message: string
): ScenarioDiagnostic {
  return { severity, code, relativePath, message };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function localizationAttribute(keyPrefix: string | undefined): string {
  return keyPrefix === undefined ? "" : ` data-localization-key="${escapeHtml(keyPrefix)}"`;
}

function htmlRelativePath(document: ScenarioDocument): string {
  const directory = path.posix.dirname(document.relativePath);
  return path.posix.join(directory, document.visualStateReference);
}

function expectedVisualReference(document: ScenarioDocument): string {
  return `${path.posix.basename(document.relativePath, ".md")}.html`;
}

function findTemplate(catalog: ScaffoldCatalog, templateId: string) {
  return catalog.templates.find((template) => template.templateId === templateId);
}

function declaredQuestionNames(document: ScenarioDocument, catalog: ScaffoldCatalog): Set<string> {
  const declared = new Set(catalog.questions.map((question) => question.name));
  for (const templateId of document.binding?.templateIds ?? []) {
    for (const question of findTemplate(catalog, templateId)?.questions ?? []) {
      declared.add(question.name);
    }
  }
  if (catalog.kind === "create") {
    declared.add("language");
    declared.add(QuestionNames.Folder);
    declared.add(QuestionNames.AppName);
  }
  return declared;
}

function contextScope(context: ScenarioReviewContext, declared: Set<string>): Scope {
  const scope: Scope = { surface: context.surface };
  for (const name of declared) {
    scope[name] = NULL_VALUE;
  }
  for (const [name, answer] of Object.entries(context.answers)) {
    if (typeof answer === "string") {
      scope[name] = answer;
    } else if (!Array.isArray(answer)) {
      scope[name] = answer.state === "empty" ? "" : "__symbolic_non_empty_secret__";
    }
  }
  return scope;
}

function resolveReviewContexts(document: ScenarioDocument): {
  contexts: ResolvedReviewContext[];
  diagnostics: ScenarioDiagnostic[];
} {
  const contexts: ResolvedReviewContext[] = [];
  const diagnostics: ScenarioDiagnostic[] = [];
  for (
    let contextIndex = 0;
    contextIndex < (document.binding?.reviewContexts.length ?? 0);
    contextIndex++
  ) {
    const context = document.binding?.reviewContexts[contextIndex];
    if (context === undefined) {
      continue;
    }
    const resolved = resolveScenarioEnvironment(context, contextIndex, document.relativePath);
    diagnostics.push(...resolved.diagnostics);
    if (resolved.environment !== undefined) {
      contexts.push({
        context,
        contextIndex,
        environment: resolved.environment,
        reportedInvalidConditions: new Set<ConditionNode>(),
        reportedUnknownFlags: new Set<string>(),
      });
    }
  }
  return { contexts, diagnostics };
}

function featureFlagReader(
  resolved: ResolvedReviewContext,
  relativePath: string,
  diagnostics: ScenarioDiagnostic[]
): (name: string) => boolean {
  return (name) => {
    if (Object.prototype.hasOwnProperty.call(resolved.environment.featureFlags, name)) {
      return resolved.environment.featureFlags[name];
    }
    if (!resolved.reportedUnknownFlags.has(name)) {
      resolved.reportedUnknownFlags.add(name);
      diagnostics.push(
        diagnostic(
          "error",
          "UnknownFeatureFlag",
          relativePath,
          `Review context at index ${resolved.contextIndex} references an unregistered feature flag.`
        )
      );
    }
    return false;
  };
}

function validateConditions(
  document: ScenarioDocument,
  catalog: ScaffoldCatalog,
  contexts: readonly ResolvedReviewContext[]
): ScenarioDiagnostic[] {
  const diagnostics: ScenarioDiagnostic[] = [];
  const boundTemplateIds = new Set(document.binding?.templateIds ?? []);
  const declared = declaredQuestionNames(document, catalog);
  const conditions: { condition: ConditionNode; subject: string }[] = [];
  for (const question of catalog.questions) {
    if (question.condition !== undefined) {
      conditions.push({
        condition: question.condition,
        subject: `selector question '${question.name}'`,
      });
    }
    for (const option of question.staticOptions) {
      if (option.condition !== undefined) {
        conditions.push({
          condition: option.condition,
          subject: `selector option '${question.name}.${option.id}'`,
        });
      }
    }
  }
  for (const template of catalog.templates) {
    if (!boundTemplateIds.has(template.templateId)) {
      continue;
    }
    for (const question of template.questions) {
      if (question.condition !== undefined) {
        conditions.push({
          condition: question.condition,
          subject: `template question '${template.templateId}.${question.name}'`,
        });
      }
      for (const option of question.staticOptions ?? []) {
        if (option.condition !== undefined) {
          conditions.push({
            condition: option.condition,
            subject: `template option '${template.templateId}.${question.name}.${option.id}'`,
          });
        }
      }
    }
  }
  for (const { condition, subject } of conditions) {
    const references = collectFeatureFlagReferences(condition);
    if (references.isErr()) {
      for (const context of contexts) {
        if (context.reportedInvalidConditions.has(condition)) {
          continue;
        }
        context.reportedInvalidConditions.add(condition);
        diagnostics.push(
          diagnostic(
            "error",
            "ReviewContextConditionFailed",
            document.relativePath,
            `Review context at index ${context.contextIndex} cannot evaluate the condition for ${subject}.`
          )
        );
      }
      continue;
    }
    for (const context of contexts) {
      const readFlag = featureFlagReader(context, document.relativePath, diagnostics);
      for (const name of references.value) {
        readFlag(name);
      }
      const evaluated = evaluateExpression(condition, contextScope(context.context, declared), {
        functions: () => undefined,
        flags: readFlag,
      });
      if (
        (evaluated.isErr() || typeof evaluated.value !== "boolean") &&
        !context.reportedInvalidConditions.has(condition)
      ) {
        context.reportedInvalidConditions.add(condition);
        diagnostics.push(
          diagnostic(
            "error",
            "ReviewContextConditionFailed",
            document.relativePath,
            `Review context at index ${context.contextIndex} cannot evaluate the condition for ${subject}.`
          )
        );
      }
    }
  }
  return diagnostics;
}

interface ReviewQuestionShape {
  type: QuestionSpec["type"];
  password?: boolean;
  staticOptions?: { id: string }[];
}

function reviewQuestionShapes(
  document: ScenarioDocument,
  catalog: ScaffoldCatalog,
  resolved: ResolvedReviewContext,
  diagnostics: ScenarioDiagnostic[]
): Map<string, ReviewQuestionShape> {
  const { context } = resolved;
  const questions = new Map<string, ReviewQuestionShape>();
  for (const question of catalog.questions) {
    questions.set(question.name, {
      type: "singleSelect",
      staticOptions: question.staticOptions,
    });
  }
  for (const templateId of document.binding?.templateIds ?? []) {
    for (const question of findTemplate(catalog, templateId)?.questions ?? []) {
      questions.set(question.name, question);
    }
  }
  if (catalog.kind === "create") {
    const languages = Array.from(
      new Set(
        (document.binding?.templateIds ?? []).flatMap((templateId) =>
          descriptorLanguages(findTemplate(catalog, templateId)?.descriptor)
        )
      )
    );
    const gatedLanguages = gateLanguagesBySurface(
      languages.length > 0 ? languages : ["common"],
      context.surface,
      featureFlagReader(resolved, document.relativePath, diagnostics)
    );
    questions.set("language", {
      type: "singleSelect",
      staticOptions: gatedLanguages.map((language) => ({ id: language })),
    });
    questions.set(QuestionNames.Folder, { type: "folder" });
    questions.set(QuestionNames.AppName, { type: "text" });
  }
  return questions;
}

function isValidReviewAnswer(answer: ScenarioReviewAnswer, question: ReviewQuestionShape): boolean {
  if (question.password === true) {
    return isSymbolicSecret(answer);
  }
  if (isSymbolicSecret(answer)) {
    return false;
  }
  if (question.type === "multiSelect") {
    if (!Array.isArray(answer) || new Set(answer).size !== answer.length) {
      return false;
    }
    const optionIds = question.staticOptions?.map((option) => option.id);
    return optionIds === undefined || answer.every((value) => optionIds.includes(value));
  }
  if (typeof answer !== "string") {
    return false;
  }
  const optionIds =
    question.type === "confirm"
      ? ["true", "false"]
      : question.type === "singleSelect"
        ? question.staticOptions?.map((option) => option.id)
        : undefined;
  return optionIds === undefined || optionIds.includes(answer);
}

function validateReviewContexts(
  document: ScenarioDocument,
  catalog: ScaffoldCatalog,
  contexts: readonly ResolvedReviewContext[]
): ScenarioDiagnostic[] {
  const declared = declaredQuestionNames(document, catalog);
  const diagnostics: ScenarioDiagnostic[] = [];
  for (const resolved of contexts) {
    const { context, contextIndex } = resolved;
    const questions = reviewQuestionShapes(document, catalog, resolved, diagnostics);
    for (const [name, answer] of Object.entries(context.answers)) {
      if (!declared.has(name)) {
        diagnostics.push(
          diagnostic(
            "error",
            "UndeclaredReviewAnswer",
            document.relativePath,
            `Review context at index ${contextIndex} contains an answer for an undeclared question.`
          )
        );
      } else {
        const question = questions.get(name);
        if (question !== undefined && !isValidReviewAnswer(answer, question)) {
          diagnostics.push(
            diagnostic(
              "error",
              "InvalidReviewAnswer",
              document.relativePath,
              `Review context at index ${contextIndex} contains an answer incompatible with its declared question.`
            )
          );
        }
      }
    }
  }
  return diagnostics;
}

function visibleInReviewContext(
  condition: ConditionNode | undefined,
  resolved: ResolvedReviewContext,
  scope: Scope,
  relativePath: string,
  subject: string,
  diagnostics: ScenarioDiagnostic[]
): boolean {
  if (condition === undefined) {
    return true;
  }
  if (resolved.reportedInvalidConditions.has(condition)) {
    return false;
  }
  const evaluated = evaluateExpression(condition, scope, {
    functions: () => undefined,
    flags: featureFlagReader(resolved, relativePath, diagnostics),
  });
  if (evaluated.isErr() || typeof evaluated.value !== "boolean") {
    diagnostics.push(
      diagnostic(
        "error",
        "ReviewContextConditionFailed",
        relativePath,
        `Review context at index ${resolved.contextIndex} cannot evaluate the condition for ${subject}.`
      )
    );
    return false;
  }
  return evaluated.value;
}

function filterCatalogForReviewContexts(
  document: ScenarioDocument,
  catalog: ScaffoldCatalog,
  contexts: readonly ResolvedReviewContext[]
): { contexts: ReviewContextProjection[]; diagnostics: ScenarioDiagnostic[] } {
  const diagnostics: ScenarioDiagnostic[] = [];
  const declared = declaredQuestionNames(document, catalog);
  const boundTemplateIds = new Set(document.binding?.templateIds ?? []);
  const projectedContexts = contexts.map((resolved) => {
    const { context } = resolved;
    const scope = contextScope(context, declared);
    const questions = catalog.questions
      .filter((question) =>
        visibleInReviewContext(
          question.condition,
          resolved,
          scope,
          document.relativePath,
          `selector question '${question.name}'`,
          diagnostics
        )
      )
      .map((question) => ({
        ...question,
        staticOptions: question.staticOptions.filter((option) =>
          visibleInReviewContext(
            option.condition,
            resolved,
            scope,
            document.relativePath,
            `selector option '${question.name}.${option.id}'`,
            diagnostics
          )
        ),
      }));
    const templates = catalog.templates
      .filter((template) => boundTemplateIds.has(template.templateId))
      .map((template) => ({
        ...template,
        questions: template.questions
          .filter((question) =>
            visibleInReviewContext(
              question.condition,
              resolved,
              scope,
              document.relativePath,
              `template question '${template.templateId}.${question.name}'`,
              diagnostics
            )
          )
          .map((question) => ({
            ...question,
            staticOptions: question.staticOptions?.filter((option) =>
              visibleInReviewContext(
                option.condition,
                resolved,
                scope,
                document.relativePath,
                `template option '${template.templateId}.${question.name}.${option.id}'`,
                diagnostics
              )
            ),
          })),
      }));
    return {
      ...resolved,
      catalog: { ...catalog, questions, templates },
      tailQuestions: [],
    };
  });
  return { contexts: projectedContexts, diagnostics };
}

async function composeReviewContextTails(
  projections: ReviewContextProjection[],
  relativePath: string
): Promise<{ contexts: ReviewContextProjection[]; diagnostics: ScenarioDiagnostic[] }> {
  const diagnostics: ScenarioDiagnostic[] = [];
  const contexts = await Promise.all(
    projections.map(async (projection) => {
      if (projection.catalog.kind !== "create") {
        return projection;
      }
      const languages = Array.from(
        new Set(
          projection.catalog.templates.flatMap((template) =>
            descriptorLanguages(template.descriptor)
          )
        )
      );
      const gatedLanguages = gateLanguagesBySurface(
        languages.length > 0 ? languages : ["common"],
        projection.context.surface,
        featureFlagReader(projection, relativePath, diagnostics)
      );
      const platform =
        projection.context.surface === "cli"
          ? Platform.CLI
          : projection.context.surface === "vs"
            ? Platform.VS
            : Platform.VSCode;
      const floor = await createFloorTail({ nonInteractive: false, platform }, gatedLanguages);
      if (floor.isErr()) {
        diagnostics.push(
          diagnostic(
            "error",
            "ReviewContextFloorCompositionFailed",
            relativePath,
            "The create question floor could not be composed for a review context."
          )
        );
        return projection;
      }
      return { ...projection, tailQuestions: floor.value.questions };
    })
  );
  return { contexts, diagnostics };
}

function validateVisibleStaticAnswers(
  projections: readonly ReviewContextProjection[],
  relativePath: string
): ScenarioDiagnostic[] {
  const diagnostics: ScenarioDiagnostic[] = [];
  for (const projection of projections) {
    const questions = new Map<string, ReviewQuestionShape>();
    for (const question of projection.catalog.questions) {
      questions.set(question.name, { type: "singleSelect", staticOptions: question.staticOptions });
    }
    for (const template of projection.catalog.templates) {
      for (const question of template.questions) {
        questions.set(question.name, question);
      }
    }
    for (const question of projection.tailQuestions) {
      questions.set(question.name, question);
    }
    if (projection.catalog.kind === "create") {
      const languages = Array.from(
        new Set(
          projection.catalog.templates.flatMap((template) =>
            descriptorLanguages(template.descriptor)
          )
        )
      );
      const gatedLanguages = gateLanguagesBySurface(
        languages.length > 0 ? languages : ["common"],
        projection.context.surface,
        featureFlagReader(projection, relativePath, diagnostics)
      );
      questions.set("language", {
        type: "singleSelect",
        staticOptions: gatedLanguages.map((language) => ({ id: language })),
      });
    }
    for (const [name, answer] of Object.entries(projection.context.answers)) {
      const question = questions.get(name);
      if (question?.staticOptions !== undefined && !isValidReviewAnswer(answer, question)) {
        diagnostics.push(
          diagnostic(
            "error",
            "InvalidReviewAnswer",
            relativePath,
            `Review context at index ${projection.contextIndex} selects an option unavailable in that context.`
          )
        );
      }
    }
  }
  return diagnostics;
}

function combineFingerprints(fingerprints: [string, ScaffoldFingerprints][]): ScaffoldFingerprints {
  const hash = (kind: keyof ScaffoldFingerprints): string => {
    const input = fingerprints
      .map(([templateId, value]) => `${templateId}:${value[kind]}`)
      .join("\n");
    return createHash("sha256").update(input).digest("hex");
  };
  return { semantic: hash("semantic"), presentation: hash("presentation") };
}

export function resolveScenarioFingerprints(
  document: ScenarioDocument,
  catalog: ScaffoldCatalog
): { fingerprints?: ScaffoldFingerprints; diagnostics: ScenarioDiagnostic[] } {
  if (document.binding === undefined) {
    return { diagnostics: [] };
  }
  const diagnostics: ScenarioDiagnostic[] = [];
  if (document.binding.kind !== catalog.kind) {
    diagnostics.push(
      diagnostic(
        "error",
        "BindingKindMismatch",
        document.relativePath,
        `Binding kind '${document.binding.kind}' does not match catalog kind '${catalog.kind}'.`
      )
    );
    return { diagnostics };
  }
  const values: [string, ScaffoldFingerprints][] = [];
  for (const templateId of document.binding.templateIds) {
    const template = findTemplate(catalog, templateId);
    if (template === undefined) {
      diagnostics.push(
        diagnostic(
          "error",
          "UnknownBoundTemplate",
          document.relativePath,
          "A bound template is absent from the scaffold catalog."
        )
      );
      continue;
    }
    values.push([templateId, fingerprintScaffoldTemplate(template, catalog.questions)]);
  }
  if (diagnostics.length > 0 || values.length === 0) {
    return { diagnostics };
  }
  return { fingerprints: combineFingerprints(values), diagnostics };
}

function isSymbolicSecret(value: ScenarioReviewAnswer): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    (value.state === "empty" || value.state === "non-empty")
  );
}

function validateSecretAnswers(
  document: ScenarioDocument,
  catalog: ScaffoldCatalog
): ScenarioDiagnostic[] {
  if (document.binding === undefined) {
    return [];
  }
  const passwordNames = new Set<string>();
  for (const templateId of document.binding.templateIds) {
    const template = findTemplate(catalog, templateId);
    for (const question of template?.questions ?? []) {
      if (question.password === true) {
        passwordNames.add(question.name);
      }
    }
  }
  const diagnostics: ScenarioDiagnostic[] = [];
  for (const context of document.binding.reviewContexts) {
    for (const name of passwordNames) {
      if (name in context.answers && !isSymbolicSecret(context.answers[name])) {
        diagnostics.push(
          diagnostic(
            "error",
            "LiteralSecretReviewAnswer",
            document.relativePath,
            `Review answer '${name}' must use an empty or symbolic secret state.`
          )
        );
      }
    }
  }
  return diagnostics;
}

function descriptorLanguages(descriptor: unknown): string[] {
  if (!isRecord(descriptor) || !Array.isArray(descriptor.languages)) {
    return [];
  }
  return descriptor.languages.filter((value): value is string => typeof value === "string");
}

function selectedAttribute(optionId: string, answer: ScenarioReviewAnswer | undefined): string {
  if (typeof answer === "string") {
    return answer === optionId ? " selected" : "";
  }
  return Array.isArray(answer) && answer.includes(optionId) ? " selected" : "";
}

function questionStep(step: number, questionName: string, hint: string): string {
  return `        <h3>Step ${step}<span class="vscode-flow-card__hint">${escapeHtml(
    hint
  )} · ${escapeHtml(questionName)}</span></h3>`;
}

function selectorControl(
  question: PresentationQuestion,
  answer: ScenarioReviewAnswer | undefined,
  step: number
): string {
  const title = escapeHtml(question.title ?? question.name);
  const placeholder = escapeHtml(question.placeholder ?? "Search options");
  const options = question.staticOptions
    .map(
      (option) =>
        `          <vscode-option${localizationAttribute(option.keyPrefix)} label="${escapeHtml(
          option.label
        )}" description="${escapeHtml(
          option.detail ?? ""
        )}" meta="${escapeHtml(option.groupName ?? "")}"${
          option.iconPath ? ` icon="${escapeHtml(option.iconPath)}"` : ""
        }${selectedAttribute(option.id, answer)}></vscode-option>`
    )
    .join("\n");
  return `      <article class="vscode-flow-card" data-kind="action" data-question-name="${escapeHtml(
    question.name
  )}">
${questionStep(step, question.name, "Selector")}
        <vscode-single-select${localizationAttribute(
          question.keyPrefix
        )} title="${title}" placeholder="${placeholder}">
${options}
        </vscode-single-select>
      </article>`;
}

function staticOptions(question: QuestionSpec, answer: ScenarioReviewAnswer | undefined): string {
  return (question.staticOptions ?? [])
    .map(
      (option) =>
        `          <vscode-option${localizationAttribute(option.keyPrefix)} label="${escapeHtml(
          option.label ?? option.id
        )}" description="${escapeHtml(
          option.description ?? option.detail ?? ""
        )}"${selectedAttribute(option.id, answer)}></vscode-option>`
    )
    .join("\n");
}

function inputValue(question: QuestionSpec, answer: ScenarioReviewAnswer | undefined): string {
  if (question.password === true) {
    return isRecord(answer) && answer.state === "non-empty" ? "********" : "";
  }
  return typeof answer === "string" ? answer : "";
}

function fileOption(question: QuestionSpec, answer: ScenarioReviewAnswer | undefined): string {
  if (typeof answer !== "string" || answer.length === 0) {
    return "";
  }
  const segments = answer.split(/[\\/]/);
  const label = segments[segments.length - 1] || answer;
  const icon = question.type === "folder" ? "folder" : "file";
  return `          <vscode-option label="${escapeHtml(label)}" detail="${escapeHtml(
    answer
  )}" icon="${icon}" selected></vscode-option>`;
}

function isUrlAnswer(answer: ScenarioReviewAnswer | undefined): answer is string {
  return typeof answer === "string" && /^[a-z][a-z0-9+.-]*:\/\//i.test(answer);
}

function questionControl(
  question: QuestionSpec,
  answer: ScenarioReviewAnswer | undefined,
  step: number
): string {
  const title = escapeHtml(question.title ?? question.name);
  const placeholder = escapeHtml(question.placeholder ?? question.prompt ?? "");
  if (question.optionsFrom !== undefined) {
    const tag = question.type === "multiSelect" ? "vscode-multi-select" : "vscode-single-select";
    return `      <article class="vscode-flow-card" data-kind="action" data-question-name="${escapeHtml(
      question.name
    )}">
${questionStep(step, question.name, "Runtime options")}
        <${tag}${localizationAttribute(
          question.keyPrefix
        )} title="${title}" placeholder="${placeholder}" data-options-from="${escapeHtml(
          question.optionsFrom
        )}">
          <vscode-option label="Runtime-provided options" description="Provider ${escapeHtml(
            question.optionsFrom
          )} is not executed for artifact review." meta="Review placeholder"></vscode-option>
        </${tag}>
      </article>`;
  }
  if (question.type === "singleSelect" || question.type === "multiSelect") {
    const tag = question.type === "multiSelect" ? "vscode-multi-select" : "vscode-single-select";
    return `      <article class="vscode-flow-card" data-kind="action" data-question-name="${escapeHtml(
      question.name
    )}">
${questionStep(step, question.name, "Template question")}
        <${tag}${localizationAttribute(
          question.keyPrefix
        )} title="${title}" placeholder="${placeholder}">
${staticOptions(question, answer)}
        </${tag}>
      </article>`;
  }
  if (question.type === "confirm") {
    const confirmOptions: QuestionSpec = {
      ...question,
      staticOptions: [
        { id: "true", label: "Yes" },
        { id: "false", label: "No" },
      ],
    };
    return `      <article class="vscode-flow-card" data-kind="action" data-question-name="${escapeHtml(
      question.name
    )}">
${questionStep(step, question.name, "Confirmation")}
        <vscode-single-select${localizationAttribute(
          question.keyPrefix
        )} title="${title}" placeholder="${placeholder}">
${staticOptions(confirmOptions, answer)}
        </vscode-single-select>
      </article>`;
  }
  if (question.type === "singleFileOrText") {
    const usesTextInput = isUrlAnswer(answer);
    const inputOption = question.inputOptionItem;
    const pickerOptions = usesTextInput
      ? `          <vscode-option${localizationAttribute(
          inputOption?.keyPrefix
        )} label="${escapeHtml(inputOption?.label ?? inputOption?.id ?? "Enter a value")}" icon="file" selected></vscode-option>`
      : fileOption(question, answer);
    const nestedInput = usesTextInput
      ? `
        <vscode-input-box${localizationAttribute(
          question.inputBoxConfig?.keyPrefix
        )} title="${escapeHtml(
          question.inputBoxConfig?.title ?? question.title ?? question.name
        )}" placeholder="${escapeHtml(
          question.inputBoxConfig?.placeholder ?? question.inputBoxConfig?.prompt ?? ""
        )}" value="${escapeHtml(answer)}"></vscode-input-box>`
      : "";
    return `      <article class="vscode-flow-card" data-kind="action" data-question-name="${escapeHtml(
      question.name
    )}">
${questionStep(step, question.name, "File or text input")}
        <vscode-file-select${localizationAttribute(
          question.keyPrefix
        )} title="${title}" placeholder="${placeholder}">
${pickerOptions}
        </vscode-file-select>${nestedInput}
      </article>`;
  }
  if (question.type === "singleFile" || question.type === "folder") {
    return `      <article class="vscode-flow-card" data-kind="action" data-question-name="${escapeHtml(
      question.name
    )}">
${questionStep(step, question.name, "File picker")}
        <vscode-file-select${localizationAttribute(
          question.keyPrefix
        )} title="${title}" placeholder="${placeholder}">
${fileOption(question, answer)}
        </vscode-file-select>
      </article>`;
  }
  const inputTitle = escapeHtml(question.inputBoxConfig?.title ?? question.title ?? question.name);
  const inputPlaceholder = escapeHtml(
    question.inputBoxConfig?.placeholder ??
      question.inputBoxConfig?.prompt ??
      question.placeholder ??
      question.prompt ??
      ""
  );
  return `      <article class="vscode-flow-card" data-kind="action" data-question-name="${escapeHtml(
    question.name
  )}">
${questionStep(step, question.name, question.password === true ? "Secret input" : "Text input")}
        <vscode-input-box${localizationAttribute(
          question.inputBoxConfig?.keyPrefix ?? question.keyPrefix
        )} title="${inputTitle}" placeholder="${inputPlaceholder}" value="${escapeHtml(
          inputValue(question, answer)
        )}"></vscode-input-box>
      </article>`;
}

function assetsPrefix(document: ScenarioDocument): string {
  const directory = path.posix.dirname(htmlRelativePath(document));
  const depth = directory === "." ? 0 : directory.split("/").length;
  return `${"../".repeat(depth + 1)}_assets`;
}

function indexReference(document: ScenarioDocument): string {
  return path.posix.relative(path.posix.dirname(htmlRelativePath(document)), "index.html");
}

function implementationSections(
  document: ScenarioDocument,
  catalog: ScaffoldCatalog | undefined,
  fingerprints: ScaffoldFingerprints | undefined,
  reviewContexts: readonly ReviewContextProjection[]
): string {
  if (document.binding === undefined) {
    return `    <section class="scenario-flow" aria-labelledby="implementation-heading">
      <div class="section-head"><h2 id="implementation-heading">Implementation Binding</h2></div>
      <p>This scenario has no scaffolding implementation binding.</p>
    </section>`;
  }
  if (catalog === undefined) {
    return "";
  }
  const questionWalks = reviewContexts
    .map(({ context, environment, catalog: contextCatalog, tailQuestions }, contextIndex) => {
      let step = 1;
      const controls = contextCatalog.questions.map((question) =>
        selectorControl(question, context.answers[question.name], step++)
      );
      for (const templateId of document.binding?.templateIds ?? []) {
        const template = findTemplate(contextCatalog, templateId);
        for (const question of template?.questions ?? []) {
          controls.push(questionControl(question, context.answers[question.name], step++));
        }
      }
      for (const question of tailQuestions) {
        controls.push(questionControl(question, context.answers[question.name], step++));
      }
      const flags = Object.entries(context.featureFlags)
        .sort(([left], [right]) => left.localeCompare(right, "en"))
        .map(([name, value]) => `${name}=${String(value)}`)
        .join(", ");
      const languages = Array.from(
        new Set(
          contextCatalog.templates.flatMap((template) => descriptorLanguages(template.descriptor))
        )
      );
      const headingId = `question-walk-${contextIndex + 1}-heading`;
      return `    <section class="scenario-flow" aria-labelledby="${headingId}" data-review-context="${escapeHtml(
        context.id
      )}">
      <div class="section-head">
        <h2 id="${headingId}">${escapeHtml(context.surface)} Question Walk: ${escapeHtml(
          context.id
        )}</h2>
        <p>Surface: ${escapeHtml(context.surface)}; environment: ${escapeHtml(
          environment.profileId
        )}; languages: ${escapeHtml(
          languages.join(", ") || "common"
        )}${flags ? `; flags: ${escapeHtml(flags)}` : ""}.</p>
      </div>
      <div class="vscode-flow-grid">
${controls.join("\n")}
      </div>
    </section>`;
    })
    .join("\n");
  const contextSections =
    questionWalks ||
    `    <section class="scenario-flow" aria-labelledby="contexts-heading">
      <div class="section-head"><h2 id="contexts-heading">Question Walks</h2></div>
      <p>No review contexts declared.</p>
    </section>`;
  const fingerprintText =
    fingerprints === undefined
      ? "Unavailable"
      : `semantic ${fingerprints.semantic}; presentation ${fingerprints.presentation}`;
  return `${contextSections}
    <section class="scenario-flow" aria-labelledby="provenance-heading">
      <div class="section-head"><h2 id="provenance-heading">Provenance</h2></div>
      <p>Scenario contract: <code>${escapeHtml(document.relativePath)}</code>. Scaffold catalog kind: <code>${escapeHtml(
        catalog.kind
      )}</code>.</p>
      <p class="fingerprint">Current fingerprints: ${escapeHtml(fingerprintText)}</p>
    </section>`;
}

export function generateScenarioHtml(
  document: ScenarioDocument,
  catalog: ScaffoldCatalog | undefined,
  fingerprints: ScaffoldFingerprints | undefined,
  reviewContexts: readonly ReviewContextProjection[] = []
): string {
  const assets = assetsPrefix(document);
  const source = path.posix.basename(document.relativePath);
  return `<!doctype html>
${GENERATED_SCENARIO_MARKER}
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(document.title)} Scenario</title>
  <link rel="stylesheet" href="${assets}/product-review/product-review.css">
  <link rel="stylesheet" href="${assets}/scenario-components/scenario-components.css">
  <script type="module" src="${assets}/scenario-components/scenario-components.js"></script>
</head>
<body>
  <header>
    <p class="eyebrow">${escapeHtml(document.status.toUpperCase())} · ${escapeHtml(
      document.scenarioId
    )}</p>
    <h1>${escapeHtml(document.title)}</h1>
    <p class="intro">Behavior belongs in <a href="${escapeHtml(source)}">${escapeHtml(
      source
    )}</a>; this page is a generated review projection.</p>
    <div class="legend" aria-label="Review links"><a class="link" href="${escapeHtml(
      indexReference(document)
    )}">Back to product index</a></div>
  </header>
  <main>
    <section class="scenario-flow" aria-labelledby="scenario-heading">
      <div class="section-head"><h2 id="scenario-heading">Cross-surface Scenario Contract</h2></div>
      <scenario-markdown-section src="${escapeHtml(source)}" heading="Scenario" level="2" title="Scenario"></scenario-markdown-section>
      <scenario-markdown-section src="${escapeHtml(source)}" heading="States" level="2" title="States"></scenario-markdown-section>
      <scenario-markdown-section src="${escapeHtml(
        source
      )}" heading="User-visible outputs" level="2" title="User-visible outputs"></scenario-markdown-section>
      <scenario-markdown-section src="${escapeHtml(
        source
      )}" heading="Validation notes" level="2" title="Validation notes"></scenario-markdown-section>
    </section>
    <section class="scenario-flow" aria-labelledby="flow-heading">
      <div class="section-head"><h2 id="flow-heading">Flow</h2></div>
      <scenario-mermaid-flow src="${escapeHtml(source)}" title="${escapeHtml(
        document.scenarioId
      )}"></scenario-mermaid-flow>
    </section>
${implementationSections(document, catalog, fingerprints, reviewContexts)}
  </main>
  <footer>Generated review projection. Scenario behavior remains in <code>${escapeHtml(
    source
  )}</code>.</footer>
</body>
</html>
`;
}

export async function buildScenarioProjections(
  scenarioCatalog: ScenarioCatalog,
  scaffoldCatalogs: readonly ScaffoldCatalog[]
): Promise<{ projections: ScenarioProjection[]; diagnostics: ScenarioDiagnostic[] }> {
  const diagnostics: ScenarioDiagnostic[] = [];
  const projections: ScenarioProjection[] = [];
  for (const document of scenarioCatalog.documents) {
    if (document.visualStateReference !== expectedVisualReference(document)) {
      diagnostics.push(
        diagnostic(
          "error",
          "MismatchedVisualReference",
          document.relativePath,
          `Visual/state reference must be '${expectedVisualReference(document)}'.`
        )
      );
      continue;
    }
    if (document.binding === undefined) {
      projections.push({
        document,
        htmlRelativePath: htmlRelativePath(document),
        html: generateScenarioHtml(document, undefined, undefined),
      });
      continue;
    }
    const scaffoldCatalog = scaffoldCatalogs.find(
      (catalog) => catalog.kind === document.binding?.kind
    );
    if (scaffoldCatalog === undefined) {
      diagnostics.push(
        diagnostic(
          "error",
          "MissingScaffoldCatalog",
          document.relativePath,
          `No scaffold catalog is available for binding kind '${document.binding.kind}'.`
        )
      );
      continue;
    }
    const resolvedContexts = resolveReviewContexts(document);
    diagnostics.push(...resolvedContexts.diagnostics);
    diagnostics.push(...validateConditions(document, scaffoldCatalog, resolvedContexts.contexts));
    diagnostics.push(
      ...validateReviewContexts(document, scaffoldCatalog, resolvedContexts.contexts)
    );
    diagnostics.push(...validateSecretAnswers(document, scaffoldCatalog));
    const resolved = resolveScenarioFingerprints(document, scaffoldCatalog);
    diagnostics.push(...resolved.diagnostics);
    const filtered = filterCatalogForReviewContexts(
      document,
      scaffoldCatalog,
      resolvedContexts.contexts
    );
    diagnostics.push(...filtered.diagnostics);
    const composed = await composeReviewContextTails(filtered.contexts, document.relativePath);
    diagnostics.push(...composed.diagnostics);
    diagnostics.push(...validateVisibleStaticAnswers(composed.contexts, document.relativePath));
    projections.push({
      document,
      htmlRelativePath: htmlRelativePath(document),
      html: generateScenarioHtml(
        document,
        scaffoldCatalog,
        resolved.fingerprints,
        composed.contexts
      ),
      fingerprints: resolved.fingerprints,
    });
  }
  return { projections, diagnostics };
}

export function replaceScenarioIndexData(
  indexHtml: string,
  scenarioCatalog: ScenarioCatalog
): string | undefined {
  const start = indexHtml.indexOf(INDEX_DATA_START);
  const end = indexHtml.indexOf(INDEX_DATA_END);
  if (start < 0 || end < start) {
    return undefined;
  }
  const data = JSON.stringify(
    {
      current: scenarioCatalog.current.map(htmlRelativePath),
      inReview: scenarioCatalog.inReview.map(htmlRelativePath),
    },
    undefined,
    2
  )
    .replaceAll("<", "\\u003c")
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
  const block = `${INDEX_DATA_START}\n    <script id="scenario-index-data" type="application/json">\n${data}\n    </script>\n    ${INDEX_DATA_END}`;
  return `${indexHtml.slice(0, start)}${block}${indexHtml.slice(end + INDEX_DATA_END.length)}`;
}
