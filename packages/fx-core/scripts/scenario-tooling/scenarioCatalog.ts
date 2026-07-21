// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { createHash } from "crypto";
import * as fs from "fs-extra";
import path from "path";
import { parse } from "yaml";
import { PresentationQuestion } from "../../src/v4/buildTarget/parseSelector";
import { OptionItem, QuestionSpec } from "../../src/v4/collectInputs/collectInputs";
import { ScaffoldCatalogTemplate } from "../../src/v4/inspection/scaffoldCatalog";

export type ScenarioStatus =
  "draft" | "review" | "approved" | "implemented" | "archived" | "superseded" | "legacy-current";

export interface ScenarioDiagnostic {
  severity: "error" | "warning";
  code: string;
  relativePath: string;
  message: string;
}

export interface ScenarioScaffoldingBinding {
  kind: "create" | "modify";
  templateIds: string[];
  reviewContexts: ScenarioReviewContext[];
  reviewedFingerprints: {
    semantic: string;
    presentation: string;
  };
}

export type ScenarioReviewAnswer = string | string[] | { state: "empty" | "non-empty" };

export interface ScenarioReviewContext {
  id: string;
  surface: string;
  environmentProfile: string;
  featureFlags: Record<string, boolean>;
  answers: Record<string, ScenarioReviewAnswer>;
}

export interface ScenarioBindingSource {
  yamlStart: number;
  yamlEnd: number;
}

export type ScenarioBindingParseResult =
  | { state: "absent" }
  | { state: "invalid" }
  | {
      state: "valid";
      binding: ScenarioScaffoldingBinding;
      source: ScenarioBindingSource;
    };

export interface ScenarioDocument {
  relativePath: string;
  title: string;
  status: ScenarioStatus;
  scenarioId: string;
  scenarioGroup: string;
  visualStateReference: string;
  proposalKey?: string;
  supersedes?: string;
  redesignTrigger?: string;
  binding?: ScenarioScaffoldingBinding;
  bindingSource?: ScenarioBindingSource;
}

export interface ScenarioCatalog {
  documents: ScenarioDocument[];
  current: ScenarioDocument[];
  inReview: ScenarioDocument[];
  hidden: ScenarioDocument[];
  diagnostics: ScenarioDiagnostic[];
}

export interface ScaffoldFingerprints {
  semantic: string;
  presentation: string;
}

const LEGACY_PROPOSAL_PATHS = new Set([
  "da/draft/add-mcp-action-to-da.md",
  "da/draft/create-da-with-mcp-server.md",
]);

const REQUIRED_METADATA_FIELDS = [
  "Created",
  "Last updated",
  "PM owner",
  "Engineer owner",
  "Scenario group",
  "Scenario ID",
  "Primary goal",
  "Start state",
  "Success state",
  "Lifecycle phases",
  "Visual/state reference",
];

const REQUIRED_SECTIONS = [
  "Scenario",
  "Surfaces",
  "States",
  "User-visible outputs",
  "Flow",
  "Validation notes",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function isScenarioStatus(value: unknown): value is ScenarioStatus {
  return (
    value === "draft" ||
    value === "review" ||
    value === "approved" ||
    value === "implemented" ||
    value === "archived" ||
    value === "superseded"
  );
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function comparePaths(left: ScenarioDocument, right: ScenarioDocument): number {
  return left.relativePath.localeCompare(right.relativePath, "en");
}

function compareDiagnostics(left: ScenarioDiagnostic, right: ScenarioDiagnostic): number {
  const byPath = left.relativePath.localeCompare(right.relativePath, "en");
  return byPath === 0 ? left.code.localeCompare(right.code, "en") : byPath;
}

async function collectMarkdownFiles(root: string, current: string = root): Promise<string[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(root, entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
      files.push(entryPath);
    }
  }
  return files;
}

function extractSection(markdown: string, heading: string): string | undefined {
  const section = extractSectionSource(markdown, heading);
  return section?.content.trim();
}

function extractSectionSource(
  markdown: string,
  heading: string
): { content: string; contentStart: number } | undefined {
  const headingMatch = new RegExp(`^## ${heading}\\s*$`, "m").exec(markdown);
  if (headingMatch === null || headingMatch.index === undefined) {
    return undefined;
  }
  const headingEnd = headingMatch.index + headingMatch[0].length;
  const newlineEnd = markdown.indexOf("\n", headingEnd);
  const contentStart = newlineEnd < 0 ? markdown.length : newlineEnd + 1;
  const remainder = markdown.slice(contentStart);
  const nextHeading = /^##\s+/m.exec(remainder);
  const contentEnd =
    nextHeading?.index === undefined ? markdown.length : contentStart + nextHeading.index;
  return { content: markdown.slice(contentStart, contentEnd), contentStart };
}

function sectionHeadingCount(markdown: string, heading: string): number {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...markdown.matchAll(new RegExp(`^## ${escaped}\\s*$`, "gm"))].length;
}

function parseMetadata(
  markdown: string
): { values: Record<string, unknown>; duplicateFields: string[] } | undefined {
  const section = extractSection(markdown, "Metadata");
  if (section === undefined) {
    return undefined;
  }
  const metadata: Record<string, unknown> = {};
  const duplicateFields = new Set<string>();
  for (const line of section.split(/\r?\n/).filter((value) => value.startsWith("- "))) {
    const separator = line.indexOf(":", 2);
    if (separator < 0) {
      continue;
    }
    const key = line.slice(2, separator).trim();
    if (key.length > 0) {
      if (key in metadata) {
        duplicateFields.add(key);
      }
      metadata[key] = line.slice(separator + 1).trim();
    }
  }
  return {
    values: metadata,
    duplicateFields: [...duplicateFields].sort((left, right) => left.localeCompare(right, "en")),
  };
}

function stringArrayField(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key];
  return Array.isArray(value) && value.every((item): item is string => typeof item === "string")
    ? value
    : undefined;
}

function hasOnlyKeys(record: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
  const allowed = new Set(allowedKeys);
  return Object.keys(record).every((key) => allowed.has(key));
}

function hasUniqueNonEmptyStrings(values: string[]): boolean {
  return values.every((value) => value.trim().length > 0) && new Set(values).size === values.length;
}

function parseFingerprints(
  value: unknown
): ScenarioScaffoldingBinding["reviewedFingerprints"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (!hasOnlyKeys(value, ["semantic", "presentation"])) {
    return undefined;
  }
  const semantic = stringField(value, "semantic");
  const presentation = stringField(value, "presentation");
  const validFingerprint = (fingerprint: string | undefined): fingerprint is string =>
    fingerprint === "pending" || (fingerprint !== undefined && /^[a-f0-9]{64}$/.test(fingerprint));
  return !validFingerprint(semantic) || !validFingerprint(presentation)
    ? undefined
    : { semantic, presentation };
}

function isReviewAnswer(value: unknown): boolean {
  if (typeof value === "string") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "string");
  }
  return (
    isRecord(value) &&
    Object.keys(value).length === 1 &&
    (value.state === "empty" || value.state === "non-empty")
  );
}

function isReviewContext(value: unknown): value is ScenarioReviewContext {
  if (!isRecord(value)) {
    return false;
  }
  return (
    hasOnlyKeys(value, ["id", "surface", "environmentProfile", "featureFlags", "answers"]) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.surface === "string" &&
    value.surface.trim().length > 0 &&
    typeof value.environmentProfile === "string" &&
    value.environmentProfile.trim().length > 0 &&
    isRecord(value.featureFlags) &&
    Object.keys(value.featureFlags).every((name) => name.trim().length > 0) &&
    Object.values(value.featureFlags).every((flag) => typeof flag === "boolean") &&
    isRecord(value.answers) &&
    Object.keys(value.answers).every((key) => key.trim().length > 0) &&
    Object.values(value.answers).every(isReviewAnswer)
  );
}

export function parseScenarioBinding(markdown: string): ScenarioBindingParseResult {
  const headingCount = sectionHeadingCount(markdown, "Implementation binding");
  if (headingCount === 0) {
    return { state: "absent" };
  }
  if (headingCount > 1) {
    return { state: "invalid" };
  }
  const section = extractSectionSource(markdown, "Implementation binding");
  if (section === undefined) {
    return { state: "absent" };
  }
  const matches = [...section.content.matchAll(/```ya?ml[^\S\r\n]*\r?\n([\s\S]*?)\r?\n```/g)];
  if (matches.length !== 1) {
    return { state: "invalid" };
  }
  const match = matches[0];
  if (match.index === undefined || match[0].trim() !== section.content.trim()) {
    return { state: "invalid" };
  }
  let parsed: unknown;
  try {
    parsed = parse(match[1]);
  } catch {
    return { state: "invalid" };
  }
  if (
    !isRecord(parsed) ||
    !hasOnlyKeys(parsed, ["version", "scaffolding"]) ||
    parsed.version !== 1 ||
    !isRecord(parsed.scaffolding) ||
    !hasOnlyKeys(parsed.scaffolding, [
      "kind",
      "templateIds",
      "reviewContexts",
      "reviewedFingerprints",
    ])
  ) {
    return { state: "invalid" };
  }
  const scaffolding = parsed.scaffolding;
  const kind = scaffolding.kind;
  const templateIds = stringArrayField(scaffolding, "templateIds");
  const reviewContexts = scaffolding.reviewContexts;
  const reviewedFingerprints = parseFingerprints(scaffolding.reviewedFingerprints);
  if (
    (kind !== "create" && kind !== "modify") ||
    templateIds === undefined ||
    templateIds.length === 0 ||
    !hasUniqueNonEmptyStrings(templateIds) ||
    !Array.isArray(reviewContexts) ||
    !reviewContexts.every(isReviewContext) ||
    new Set(reviewContexts.map((context) => context.id)).size !== reviewContexts.length ||
    reviewedFingerprints === undefined
  ) {
    return { state: "invalid" };
  }
  const yamlOffset = match[0].indexOf(match[1]);
  return {
    state: "valid",
    binding: {
      kind,
      templateIds,
      reviewContexts,
      reviewedFingerprints,
    },
    source: {
      yamlStart: section.contentStart + match.index + yamlOffset,
      yamlEnd: section.contentStart + match.index + yamlOffset + match[1].length,
    },
  };
}

function titleFromMarkdown(markdown: string): string {
  const title = markdown.split(/\r?\n/).find((line) => line.startsWith("# "));
  return title?.slice(2).trim() ?? "Untitled scenario";
}

function diagnostic(
  severity: ScenarioDiagnostic["severity"],
  code: string,
  relativePath: string,
  message: string
): ScenarioDiagnostic {
  return { severity, code, relativePath, message };
}

function parseScenario(
  relativePath: string,
  markdown: string,
  diagnostics: ScenarioDiagnostic[]
): ScenarioDocument | undefined {
  const metadataHeadingCount = sectionHeadingCount(markdown, "Metadata");
  if (metadataHeadingCount > 1) {
    diagnostics.push(
      diagnostic(
        "error",
        "DuplicateMetadataSection",
        relativePath,
        "Scenario contains more than one Metadata section."
      )
    );
    return undefined;
  }
  if (
    metadataHeadingCount === 1 &&
    extractSectionSource(markdown, "Metadata")?.content.trim().length === 0
  ) {
    diagnostics.push(
      diagnostic(
        "error",
        "EmptyMetadataSection",
        relativePath,
        "Scenario Metadata section must not be empty."
      )
    );
    return undefined;
  }
  const parsedMetadata = parseMetadata(markdown);
  if (parsedMetadata === undefined) {
    diagnostics.push(
      diagnostic(
        "error",
        "MissingMetadata",
        relativePath,
        "Scenario has no valid Metadata section."
      )
    );
    return undefined;
  }
  const metadata = parsedMetadata.values;
  if (parsedMetadata.duplicateFields.length > 0) {
    diagnostics.push(
      diagnostic(
        "error",
        "DuplicateMetadataField",
        relativePath,
        `Scenario metadata fields must be unique: ${parsedMetadata.duplicateFields.join(", ")}.`
      )
    );
    return undefined;
  }
  const rawStatus = metadata.Status;
  if (rawStatus !== undefined && !isScenarioStatus(rawStatus)) {
    diagnostics.push(
      diagnostic("error", "InvalidStatus", relativePath, "Scenario has an invalid Status value.")
    );
    return undefined;
  }
  const status: ScenarioStatus = rawStatus ?? "legacy-current";
  if (rawStatus === undefined) {
    diagnostics.push(
      diagnostic(
        "warning",
        "LegacyMissingStatus",
        relativePath,
        "Scenario has no Status and is treated as legacy current."
      )
    );
  }
  const missingMetadata = REQUIRED_METADATA_FIELDS.filter(
    (field) => stringField(metadata, field)?.trim().length === 0 || metadata[field] === undefined
  );
  if (missingMetadata.length > 0) {
    diagnostics.push(
      diagnostic(
        "error",
        "IncompleteMetadata",
        relativePath,
        `Scenario is missing required metadata: ${missingMetadata.join(", ")}.`
      )
    );
    return undefined;
  }
  if (relativePath.split("/").includes("draft")) {
    diagnostics.push(
      diagnostic(
        "warning",
        "LegacyLifecycleDirectory",
        relativePath,
        "Scenario lifecycle comes from metadata; migrate this file out of draft/."
      )
    );
  }
  const scenarioId = stringField(metadata, "Scenario ID");
  const scenarioGroup = stringField(metadata, "Scenario group");
  const visualStateReference = stringField(metadata, "Visual/state reference");
  if (
    scenarioId === undefined ||
    scenarioGroup === undefined ||
    visualStateReference === undefined
  ) {
    diagnostics.push(
      diagnostic(
        "error",
        "IncompleteMetadata",
        relativePath,
        "Scenario ID, Scenario group, and Visual/state reference are required."
      )
    );
    return undefined;
  }
  if (!/^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(scenarioId)) {
    diagnostics.push(
      diagnostic(
        "error",
        "InvalidScenarioId",
        relativePath,
        "Scenario ID must use the stable SCN-* format."
      )
    );
  }
  const expectedGroup = relativePath.split("/")[0];
  if (scenarioGroup !== expectedGroup) {
    diagnostics.push(
      diagnostic(
        "error",
        "ScenarioGroupMismatch",
        relativePath,
        `Scenario group must match parent directory '${expectedGroup}'.`
      )
    );
  }
  for (const section of REQUIRED_SECTIONS) {
    const headingCount = sectionHeadingCount(markdown, section);
    if (headingCount === 0) {
      diagnostics.push(
        diagnostic(
          "error",
          "MissingRequiredSection",
          relativePath,
          `Scenario is missing the required '${section}' section.`
        )
      );
    } else if (headingCount > 1) {
      diagnostics.push(
        diagnostic(
          "error",
          "DuplicateRequiredSection",
          relativePath,
          `Scenario contains more than one '${section}' section.`
        )
      );
    } else if (extractSectionSource(markdown, section)?.content.trim().length === 0) {
      diagnostics.push(
        diagnostic(
          "error",
          "EmptyRequiredSection",
          relativePath,
          `Scenario required section '${section}' must not be empty.`
        )
      );
    }
  }
  const binding = parseScenarioBinding(markdown);
  if (binding.state === "invalid") {
    diagnostics.push(
      diagnostic(
        "error",
        "InvalidImplementationBinding",
        relativePath,
        "Scenario has an invalid Implementation binding section."
      )
    );
  }
  const document: ScenarioDocument = {
    relativePath,
    title: titleFromMarkdown(markdown),
    status,
    scenarioId,
    scenarioGroup,
    visualStateReference,
  };
  if (binding.state === "valid") {
    document.binding = binding.binding;
    document.bindingSource = binding.source;
  }
  const proposalKey = stringField(metadata, "Proposal key");
  if (proposalKey !== undefined) {
    document.proposalKey = proposalKey;
  }
  const supersedes = stringField(metadata, "Supersedes");
  if (supersedes !== undefined) {
    document.supersedes = supersedes;
  }
  const redesignTrigger = stringField(metadata, "Redesign trigger");
  if (redesignTrigger !== undefined) {
    document.redesignTrigger = redesignTrigger;
  }
  return document;
}

export function validateScenarioMarkdown(
  relativePath: string,
  markdown: string
): ScenarioDiagnostic[] {
  const diagnostics: ScenarioDiagnostic[] = [];
  parseScenario(toPosixPath(relativePath), markdown, diagnostics);
  return diagnostics.sort(compareDiagnostics);
}

function isCurrent(document: ScenarioDocument): boolean {
  return (
    document.status === "approved" ||
    document.status === "implemented" ||
    document.status === "legacy-current"
  );
}

function isInReview(document: ScenarioDocument): boolean {
  return document.status === "draft" || document.status === "review";
}

function validateProposals(documents: ScenarioDocument[], diagnostics: ScenarioDiagnostic[]): void {
  const documentsByPath = new Map(documents.map((document) => [document.relativePath, document]));
  const proposalsByIdentity = new Map<string, ScenarioDocument[]>();
  for (const document of documents) {
    const stem = path.posix.basename(document.relativePath, ".md");
    const separator = stem.indexOf("--");
    const siblingProposal = separator >= 0;
    const isProposal = siblingProposal || document.proposalKey !== undefined;
    const filenameProposalKey = siblingProposal ? stem.slice(separator + 2) : undefined;
    if (siblingProposal && (document.proposalKey?.trim().length ?? 0) === 0) {
      diagnostics.push(
        diagnostic(
          "error",
          "ProposalMissingKey",
          document.relativePath,
          "A sibling proposal requires Proposal key metadata."
        )
      );
    }
    if (
      document.proposalKey !== undefined &&
      !LEGACY_PROPOSAL_PATHS.has(document.relativePath) &&
      (filenameProposalKey === undefined || filenameProposalKey !== document.proposalKey)
    ) {
      diagnostics.push(
        diagnostic(
          "error",
          "ProposalFilenameMismatch",
          document.relativePath,
          "Proposal key must match the suffix after '--' in the Markdown filename."
        )
      );
    }
    if (isProposal && (document.supersedes?.trim().length ?? 0) === 0) {
      diagnostics.push(
        diagnostic(
          "error",
          "ProposalMissingSupersedes",
          document.relativePath,
          "A sibling proposal requires Supersedes metadata."
        )
      );
    }
    if (isProposal && (document.redesignTrigger?.trim().length ?? 0) === 0) {
      diagnostics.push(
        diagnostic(
          "error",
          "ProposalMissingRedesignTrigger",
          document.relativePath,
          "A sibling proposal requires Redesign trigger metadata."
        )
      );
    }
    if (
      (document.status === "archived" || document.status === "superseded") &&
      (document.supersedes?.trim().length ?? 0) === 0
    ) {
      diagnostics.push(
        diagnostic(
          "error",
          "HistoricalMissingSupersedes",
          document.relativePath,
          "An archived or superseded contract requires Supersedes metadata."
        )
      );
    }
    if (document.proposalKey !== undefined && !isInReview(document)) {
      diagnostics.push(
        diagnostic(
          "error",
          "ProposalHasCurrentStatus",
          document.relativePath,
          "A sibling proposal must have draft or review status."
        )
      );
    }
    if (document.proposalKey !== undefined) {
      const identity = `${document.scenarioId}\0${document.proposalKey}`;
      const proposals = proposalsByIdentity.get(identity) ?? [];
      proposals.push(document);
      proposalsByIdentity.set(identity, proposals);
    }
    if (isProposal && (document.supersedes?.trim().length ?? 0) > 0) {
      const baselinePath = path.posix.normalize(
        path.posix.join(path.posix.dirname(document.relativePath), document.supersedes ?? "")
      );
      const baseline = documentsByPath.get(baselinePath);
      if (
        baseline === undefined ||
        !isCurrent(baseline) ||
        baseline.scenarioId !== document.scenarioId ||
        baseline.proposalKey !== undefined ||
        path.posix.basename(baseline.relativePath, ".md").includes("--")
      ) {
        diagnostics.push(
          diagnostic(
            "error",
            "ProposalBaselineMismatch",
            document.relativePath,
            "Supersedes must reference the canonical current contract with the same Scenario ID."
          )
        );
      }
    }
    if (
      (document.status === "archived" || document.status === "superseded") &&
      (document.supersedes?.trim().length ?? 0) > 0
    ) {
      const successorPath = path.posix.normalize(
        path.posix.join(path.posix.dirname(document.relativePath), document.supersedes ?? "")
      );
      const successor = documentsByPath.get(successorPath);
      if (
        successor === undefined ||
        !isCurrent(successor) ||
        successor.scenarioId !== document.scenarioId ||
        successor.proposalKey !== undefined ||
        path.posix.basename(successor.relativePath, ".md").includes("--")
      ) {
        diagnostics.push(
          diagnostic(
            "error",
            "HistoricalSuccessorMismatch",
            document.relativePath,
            "Supersedes must identify the canonical current successor with the same Scenario ID."
          )
        );
      }
    }
  }
  for (const proposals of proposalsByIdentity.values()) {
    if (proposals.length > 1) {
      for (const proposal of proposals) {
        diagnostics.push(
          diagnostic(
            "error",
            "DuplicateProposalKey",
            proposal.relativePath,
            "Proposal key must be unique for a Scenario ID."
          )
        );
      }
    }
  }
}

function validateCurrentIdentities(
  documents: ScenarioDocument[],
  diagnostics: ScenarioDiagnostic[]
): void {
  const byScenarioId = new Map<string, ScenarioDocument[]>();
  const byTemplateId = new Map<string, ScenarioDocument[]>();
  for (const document of documents.filter(isCurrent)) {
    const identities = byScenarioId.get(document.scenarioId) ?? [];
    identities.push(document);
    byScenarioId.set(document.scenarioId, identities);
    for (const templateId of document.binding?.templateIds ?? []) {
      const templateIdentity = `${document.binding?.kind}\0${templateId}`;
      const owners = byTemplateId.get(templateIdentity) ?? [];
      owners.push(document);
      byTemplateId.set(templateIdentity, owners);
    }
  }
  for (const [scenarioId, owners] of byScenarioId) {
    if (owners.length > 1) {
      for (const owner of owners) {
        diagnostics.push(
          diagnostic(
            "error",
            "DuplicateCurrentScenarioId",
            owner.relativePath,
            `Scenario ID '${scenarioId}' has more than one current contract.`
          )
        );
      }
    }
  }
  for (const [templateIdentity, owners] of byTemplateId) {
    if (owners.length > 1) {
      const separator = templateIdentity.indexOf("\0");
      const kind = templateIdentity.slice(0, separator);
      const templateId = templateIdentity.slice(separator + 1);
      for (const owner of owners) {
        diagnostics.push(
          diagnostic(
            "error",
            "DuplicateCurrentTemplateOwner",
            owner.relativePath,
            `${kind} template '${templateId}' has more than one current scenario owner.`
          )
        );
      }
    }
  }
}

export async function scanScenarioDocuments(root: string): Promise<ScenarioCatalog> {
  const diagnostics: ScenarioDiagnostic[] = [];
  const documents: ScenarioDocument[] = [];
  for (const filePath of await collectMarkdownFiles(root)) {
    const markdown = await fs.readFile(filePath, "utf8");
    const relativePath = toPosixPath(path.relative(root, filePath));
    const document = parseScenario(relativePath, markdown, diagnostics);
    if (document !== undefined) {
      documents.push(document);
    }
  }
  documents.sort(comparePaths);
  validateProposals(documents, diagnostics);
  validateCurrentIdentities(documents, diagnostics);
  diagnostics.sort(compareDiagnostics);
  return {
    documents,
    current: documents.filter(isCurrent),
    inReview: documents.filter(isInReview),
    hidden: documents.filter((document) => !isCurrent(document) && !isInReview(document)),
    diagnostics,
  };
}

function semanticOption(option: OptionItem): unknown {
  return {
    id: option.id,
    condition: option.condition,
  };
}

function presentationOption(option: OptionItem): unknown {
  return {
    id: option.id,
    label: option.label,
    description: option.description,
    detail: option.detail,
    groupName: option.groupName,
    keyPrefix: option.keyPrefix,
    iconPath: option.iconPath,
  };
}

function semanticQuestion(question: QuestionSpec): unknown {
  return {
    name: question.name,
    type: question.type,
    default: question.default,
    password: question.password,
    filters: question.filters,
    inputOptionItem:
      question.inputOptionItem === undefined ? undefined : semanticOption(question.inputOptionItem),
    inputBoxConfig:
      question.inputBoxConfig === undefined
        ? undefined
        : {
            name: question.inputBoxConfig.name,
            default: question.inputBoxConfig.default,
            step: question.inputBoxConfig.step,
            validation: question.inputBoxConfig.validation,
          },
    validation: question.validation,
    staticOptions: question.staticOptions?.map(semanticOption),
    optionsFrom: question.optionsFrom,
    optionsFromParams: question.optionsFromParams,
    skipSingleOption: question.skipSingleOption,
    optional: question.optional,
    condition: question.condition,
  };
}

function presentationQuestion(question: QuestionSpec): unknown {
  return {
    name: question.name,
    title: question.title,
    cliDescription: question.cliDescription,
    placeholder: question.placeholder,
    prompt: question.prompt,
    keyPrefix: question.keyPrefix,
    inputOptionItem:
      question.inputOptionItem === undefined
        ? undefined
        : presentationOption(question.inputOptionItem),
    inputBoxConfig:
      question.inputBoxConfig === undefined
        ? undefined
        : {
            title: question.inputBoxConfig.title,
            placeholder: question.inputBoxConfig.placeholder,
            prompt: question.inputBoxConfig.prompt,
            keyPrefix: question.inputBoxConfig.keyPrefix,
          },
    staticOptions: question.staticOptions?.map(presentationOption),
  };
}

function selectorSemantics(question: PresentationQuestion): unknown {
  return {
    name: question.name,
    condition: question.condition,
    staticOptions: question.staticOptions.map((option) => ({
      id: option.id,
      condition: option.condition,
    })),
  };
}

function selectorPresentation(question: PresentationQuestion): unknown {
  return {
    name: question.name,
    title: question.title,
    placeholder: question.placeholder,
    keyPrefix: question.keyPrefix,
    staticOptions: question.staticOptions.map((option) => ({
      id: option.id,
      label: option.label,
      detail: option.detail,
      groupName: option.groupName,
      keyPrefix: option.keyPrefix,
      iconPath: option.iconPath,
    })),
  };
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }
  if (!isRecord(value)) {
    return value;
  }
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right, "en"))) {
    if (key === "$schema" || value[key] === undefined) {
      continue;
    }
    normalized[key] = normalize(value[key]);
  }
  return normalized;
}

function fingerprint(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(normalize(value)))
    .digest("hex");
}

function semanticDescriptor(descriptor: unknown): unknown {
  if (!isRecord(descriptor)) {
    return descriptor;
  }
  return Object.fromEntries(
    Object.entries(descriptor).filter(([key]) => key !== "$schema" && key !== "spec")
  );
}

export function fingerprintScaffoldTemplate(
  template: ScaffoldCatalogTemplate,
  selectorQuestions: PresentationQuestion[]
): ScaffoldFingerprints {
  return {
    semantic: fingerprint({
      templateId: template.templateId,
      routes: template.routes,
      descriptor: semanticDescriptor(template.descriptor),
      selectorQuestions: selectorQuestions.map(selectorSemantics),
      questions: template.questions.map(semanticQuestion),
      pipeline: template.pipeline,
    }),
    presentation: fingerprint({
      selectorQuestions: selectorQuestions.map(selectorPresentation),
      questions: template.questions.map(presentationQuestion),
    }),
  };
}
