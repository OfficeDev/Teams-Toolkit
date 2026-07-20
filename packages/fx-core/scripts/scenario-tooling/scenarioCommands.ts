// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs-extra";
import { randomUUID } from "crypto";
import { constants as fsConstants } from "fs";
import path from "path";
import { ScaffoldCatalog } from "../../src/v4/inspection/scaffoldCatalog";
import {
  ScenarioCatalog,
  ScenarioDiagnostic,
  ScenarioDocument,
  parseScenarioBinding,
  scanScenarioDocuments,
  validateScenarioMarkdown,
} from "./scenarioCatalog";
import {
  GENERATED_SCENARIO_MARKER,
  ScenarioProjection,
  buildScenarioProjections,
  replaceScenarioIndexData,
  resolveScenarioFingerprints,
} from "./scenarioProjection";

const scenarioUpdateQueues = new Map<string, Promise<void>>();

function fileSystemErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

async function linkWithoutOverwrite(source: string, destination: string): Promise<boolean> {
  try {
    await fs.link(source, destination);
    return true;
  } catch (error) {
    if (fileSystemErrorCode(error) === "EEXIST") {
      return false;
    }
    throw error;
  }
}

async function restoreScenarioBackup(backup: string, destination: string): Promise<void> {
  try {
    await linkWithoutOverwrite(backup, destination);
  } catch (error) {
    if (fileSystemErrorCode(error) === "ENOENT") {
      return;
    }
    try {
      await fs.copyFile(backup, destination, fsConstants.COPYFILE_EXCL);
    } catch (copyError) {
      if (fileSystemErrorCode(copyError) !== "EEXIST") {
        throw copyError;
      }
    }
  }
  await fs.remove(backup);
}

function pathIdentity(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

async function withScenarioUpdateLock<T>(filePath: string, update: () => Promise<T>): Promise<T> {
  const key = pathIdentity(path.resolve(filePath));
  const previous = scenarioUpdateQueues.get(key) ?? Promise.resolve();
  let releaseCurrent: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  scenarioUpdateQueues.set(key, current);
  await previous;
  try {
    return await update();
  } finally {
    releaseCurrent();
    if (scenarioUpdateQueues.get(key) === current) {
      scenarioUpdateQueues.delete(key);
    }
  }
}

export interface ScenarioCommandOptions {
  scenarioRoot: string;
  indexPath: string;
  scaffoldCatalog?: ScaffoldCatalog;
  scaffoldCatalogs?: readonly ScaffoldCatalog[];
}

export interface ScenarioCommandResult {
  diagnostics: ScenarioDiagnostic[];
}

export interface ScenarioRenderResult extends ScenarioCommandResult {
  updatedArtifacts: string[];
  removedArtifacts: string[];
}

export interface InitializeScenarioOptions {
  scenarioRoot: string;
  group: string;
  slug: string;
  title: string;
  scenarioId: string;
  pmOwner: string;
  engineerOwner: string;
  templateId: string;
  timestamp: string;
  proposalKey?: string;
  redesignTrigger?: string;
}

export interface AcceptScenarioOptions extends ScenarioCommandOptions {
  scenarioFile: string;
}

function diagnostic(
  severity: ScenarioDiagnostic["severity"],
  code: string,
  relativePath: string,
  message: string
): ScenarioDiagnostic {
  return { severity, code, relativePath, message };
}

function sortDiagnostics(diagnostics: ScenarioDiagnostic[]): ScenarioDiagnostic[] {
  return diagnostics.sort((left, right) => {
    const byPath = left.relativePath.localeCompare(right.relativePath, "en");
    return byPath === 0 ? left.code.localeCompare(right.code, "en") : byPath;
  });
}

function errors(diagnostics: ScenarioDiagnostic[]): ScenarioDiagnostic[] {
  return diagnostics.filter((item) => item.severity === "error");
}

function isCurrent(document: ScenarioDocument): boolean {
  return (
    document.status === "approved" ||
    document.status === "implemented" ||
    document.status === "legacy-current"
  );
}

function catalogsFromOptions(options: ScenarioCommandOptions): readonly ScaffoldCatalog[] {
  if (options.scaffoldCatalogs !== undefined) {
    return options.scaffoldCatalogs;
  }
  return options.scaffoldCatalog === undefined ? [] : [options.scaffoldCatalog];
}

async function expectedArtifacts(options: ScenarioCommandOptions): Promise<{
  scenarioCatalog: ScenarioCatalog;
  projections: ScenarioProjection[];
  indexHtml?: string;
  diagnostics: ScenarioDiagnostic[];
}> {
  const scenarioCatalog = await scanScenarioDocuments(options.scenarioRoot);
  const built = await buildScenarioProjections(scenarioCatalog, catalogsFromOptions(options));
  const diagnostics = [...scenarioCatalog.diagnostics, ...built.diagnostics];
  const sourceIndex = await fs.readFile(options.indexPath, "utf8");
  const indexHtml = replaceScenarioIndexData(sourceIndex, scenarioCatalog);
  if (indexHtml === undefined) {
    diagnostics.push(
      diagnostic(
        "error",
        "MissingGeneratedIndexBlock",
        path.relative(options.scenarioRoot, options.indexPath),
        "Scenario index is missing its generated data block."
      )
    );
  }
  return {
    scenarioCatalog,
    projections: built.projections,
    indexHtml,
    diagnostics: sortDiagnostics(diagnostics),
  };
}

async function collectGeneratedScenarioHtml(
  root: string,
  current: string = root
): Promise<string[]> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const generated: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      generated.push(...(await collectGeneratedScenarioHtml(root, entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      const source = await fs.readFile(entryPath, "utf8");
      if (source.includes(GENERATED_SCENARIO_MARKER)) {
        generated.push(entryPath);
      }
    }
  }
  return generated;
}

async function orphanedGeneratedScenarioHtml(
  scenarioRoot: string,
  projections: ScenarioProjection[]
): Promise<string[]> {
  const expected = new Set(
    projections.map((projection) => path.resolve(scenarioRoot, projection.htmlRelativePath))
  );
  return (await collectGeneratedScenarioHtml(scenarioRoot))
    .filter((filePath) => !expected.has(path.resolve(filePath)))
    .sort((left, right) => left.localeCompare(right, "en"));
}

export async function renderScenarioArtifacts(
  options: ScenarioCommandOptions
): Promise<ScenarioRenderResult> {
  const expected = await expectedArtifacts(options);
  if (errors(expected.diagnostics).length > 0 || expected.indexHtml === undefined) {
    return { diagnostics: expected.diagnostics, updatedArtifacts: [], removedArtifacts: [] };
  }
  const orphans = await orphanedGeneratedScenarioHtml(options.scenarioRoot, expected.projections);
  const updatedArtifacts: string[] = [];
  for (const projection of expected.projections) {
    const destination = path.resolve(options.scenarioRoot, projection.htmlRelativePath);
    try {
      if ((await fs.readFile(destination, "utf8")) !== projection.html) {
        updatedArtifacts.push(projection.htmlRelativePath);
      }
    } catch {
      updatedArtifacts.push(projection.htmlRelativePath);
    }
  }
  try {
    if ((await fs.readFile(options.indexPath, "utf8")) !== expected.indexHtml) {
      updatedArtifacts.push(path.relative(options.scenarioRoot, options.indexPath));
    }
  } catch {
    updatedArtifacts.push(path.relative(options.scenarioRoot, options.indexPath));
  }
  const removedArtifacts = orphans.map((orphan) => path.relative(options.scenarioRoot, orphan));
  for (const orphan of orphans) {
    await fs.remove(orphan);
  }
  for (const projection of expected.projections) {
    const destination = path.resolve(options.scenarioRoot, projection.htmlRelativePath);
    await fs.outputFile(destination, projection.html, "utf8");
  }
  await fs.writeFile(options.indexPath, expected.indexHtml, "utf8");
  return {
    diagnostics: expected.diagnostics,
    updatedArtifacts: updatedArtifacts
      .map((artifact) => artifact.split(path.sep).join("/"))
      .sort((left, right) => left.localeCompare(right, "en")),
    removedArtifacts: removedArtifacts
      .map((artifact) => artifact.split(path.sep).join("/"))
      .sort((left, right) => left.localeCompare(right, "en")),
  };
}

async function compareProjection(
  scenarioRoot: string,
  projection: ScenarioProjection
): Promise<ScenarioDiagnostic | undefined> {
  try {
    const actual = await fs.readFile(
      path.resolve(scenarioRoot, projection.htmlRelativePath),
      "utf8"
    );
    return actual === projection.html
      ? undefined
      : diagnostic(
          "error",
          "StaleGeneratedHtml",
          projection.htmlRelativePath,
          "Generated scenario HTML is stale or manually modified."
        );
  } catch {
    return diagnostic(
      "error",
      "StaleGeneratedHtml",
      projection.htmlRelativePath,
      "Generated scenario HTML is missing."
    );
  }
}

function fingerprintDiagnostics(projections: ScenarioProjection[]): ScenarioDiagnostic[] {
  const diagnostics: ScenarioDiagnostic[] = [];
  for (const projection of projections) {
    const binding = projection.document.binding;
    const current = projection.fingerprints;
    if (binding === undefined || current === undefined) {
      continue;
    }
    const reviewed = binding.reviewedFingerprints;
    const appendDrift = (
      kind: "semantic" | "presentation",
      code: "ReviewedSemanticFingerprintDrift" | "ReviewedPresentationFingerprintDrift"
    ): void => {
      if (reviewed[kind] === current[kind]) {
        return;
      }
      diagnostics.push(
        diagnostic(
          isCurrent(projection.document) ? "error" : "warning",
          code,
          projection.document.relativePath,
          `${kind === "semantic" ? "Semantic" : "Presentation"} implementation fingerprint drifted from reviewed '${reviewed[kind]}' to current '${current[kind]}'.`
        )
      );
    };
    appendDrift("semantic", "ReviewedSemanticFingerprintDrift");
    appendDrift("presentation", "ReviewedPresentationFingerprintDrift");
  }
  return diagnostics;
}

function isReviewedFingerprintDrift(diagnostic: ScenarioDiagnostic): boolean {
  return (
    diagnostic.code === "ReviewedSemanticFingerprintDrift" ||
    diagnostic.code === "ReviewedPresentationFingerprintDrift"
  );
}

function scaffoldCoverageDiagnostics(
  scenarioCatalog: ScenarioCatalog,
  scaffoldCatalogs: readonly ScaffoldCatalog[]
): ScenarioDiagnostic[] {
  const bound = new Set(
    scenarioCatalog.documents.flatMap(
      (document) =>
        document.binding?.templateIds.map(
          (templateId) => `${document.binding?.kind}\0${templateId}`
        ) ?? []
    )
  );
  return scaffoldCatalogs.flatMap((catalog) => {
    const boundTemplateIds = new Set(
      catalog.templates
        .filter((template) => bound.has(`${catalog.kind}\0${template.templateId}`))
        .map((template) => template.templateId)
    );
    const boundRoutePredicates = new Set(
      catalog.templates
        .filter((template) => boundTemplateIds.has(template.templateId))
        .flatMap((template) => template.routes.map((route) => route.when))
    );
    const templateDiagnostics = catalog.templates
      .filter((template) => !bound.has(`${catalog.kind}\0${template.templateId}`))
      .map((template) =>
        diagnostic(
          "warning",
          "UnboundScaffoldTemplate",
          "",
          `Scaffold ${catalog.kind} template '${template.templateId}' has no product scenario binding.`
        )
      );
    const externalRouteDiagnostics = catalog.externalRoutes
      .filter((route) => !boundRoutePredicates.has(route.when))
      .map((route) =>
        diagnostic(
          "warning",
          "UnboundExternalRoute",
          "",
          `Scaffold ${catalog.kind} external ${route.engine} route '${route.when}' has no matching route on a scenario-bound template.`
        )
      );
    return [...templateDiagnostics, ...externalRouteDiagnostics];
  });
}

export async function checkScenarioArtifacts(
  options: ScenarioCommandOptions
): Promise<ScenarioCommandResult> {
  const expected = await expectedArtifacts(options);
  const diagnostics = [...expected.diagnostics];
  for (const orphan of await orphanedGeneratedScenarioHtml(
    options.scenarioRoot,
    expected.projections
  )) {
    diagnostics.push(
      diagnostic(
        "error",
        "OrphanedGeneratedHtml",
        path.relative(options.scenarioRoot, orphan).split(path.sep).join("/"),
        "Generated scenario HTML has no Markdown owner."
      )
    );
  }
  for (const projection of expected.projections) {
    const mismatch = await compareProjection(options.scenarioRoot, projection);
    if (mismatch !== undefined) {
      diagnostics.push(mismatch);
    }
  }
  if (expected.indexHtml !== undefined) {
    const actualIndex = await fs.readFile(options.indexPath, "utf8");
    if (actualIndex !== expected.indexHtml) {
      diagnostics.push(
        diagnostic(
          "error",
          "StaleGeneratedIndex",
          path.relative(options.scenarioRoot, options.indexPath),
          "Generated scenario index data is stale or manually modified."
        )
      );
    }
  }
  diagnostics.push(...fingerprintDiagnostics(expected.projections));
  diagnostics.push(
    ...scaffoldCoverageDiagnostics(expected.scenarioCatalog, catalogsFromOptions(options))
  );
  return { diagnostics: sortDiagnostics(diagnostics) };
}

function validPathSegment(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function initMarkdown(options: InitializeScenarioOptions): string {
  const proposalSuffix = options.proposalKey === undefined ? "" : `--${options.proposalKey}`;
  const visualReference = `${options.slug}${proposalSuffix}.html`;
  const proposalMetadata =
    options.proposalKey === undefined
      ? ""
      : `- Proposal key: ${options.proposalKey}\n- Supersedes: ${options.slug}.md\n- Redesign trigger: ${
          options.redesignTrigger ?? "Unspecified redesign"
        }\n`;
  return `# ${options.title}

## Metadata

- Created: ${options.timestamp}
- Last updated: ${options.timestamp}
- Status: draft
- PM owner: ${options.pmOwner}
- Engineer owner: ${options.engineerOwner}
- Scenario group: ${options.group}
- Scenario ID: ${options.scenarioId}
- Primary goal: create
- Start state: To be defined before review.
- Success state: To be defined before review.
- Lifecycle phases: [create]
- Visual/state reference: ${visualReference}
${proposalMetadata}
## Scenario

To be defined before review.

## Surfaces

- To be defined before review.

## States

- To be defined before review.

## User-visible outputs

- To be defined before review.

## Flow

\`\`\`mermaid
flowchart TD
  Start([Start state]) --> Complete([Success state])
\`\`\`

## Validation notes

- To be defined before review.

## Implementation binding

\`\`\`yaml
version: 1
scaffolding:
  kind: create
  templateIds:
    - ${options.templateId}
  reviewContexts: []
  reviewedFingerprints:
    semantic: pending
    presentation: pending
\`\`\`
`;
}

export async function initializeScenario(
  options: InitializeScenarioOptions
): Promise<ScenarioCommandResult> {
  const relativePath = `${options.group}/${options.slug}${
    options.proposalKey === undefined ? "" : `--${options.proposalKey}`
  }.md`;
  if (
    !validPathSegment(options.group) ||
    !validPathSegment(options.slug) ||
    options.slug.includes("--") ||
    (options.proposalKey !== undefined && !validPathSegment(options.proposalKey))
  ) {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "InvalidScenarioPath",
          relativePath,
          "Group, slug, and proposal key must be lowercase path segments."
        ),
      ],
    };
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(options.timestamp) ||
    !Number.isFinite(Date.parse(options.timestamp))
  ) {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "InvalidScenarioTimestamp",
          relativePath,
          "Timestamp must be an explicit ISO 8601 UTC value."
        ),
      ],
    };
  }
  if (!/^SCN-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(options.scenarioId)) {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "InvalidScenarioId",
          relativePath,
          "Scenario ID must use the stable SCN-* format."
        ),
      ],
    };
  }
  if (
    options.title.trim().length === 0 ||
    options.pmOwner.trim().length === 0 ||
    options.engineerOwner.trim().length === 0
  ) {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "IncompleteMetadata",
          relativePath,
          "Title, PM owner, and engineer owner must not be empty."
        ),
      ],
    };
  }
  if (options.templateId.trim().length === 0) {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "InvalidImplementationBinding",
          relativePath,
          "Template ID must not be empty."
        ),
      ],
    };
  }
  if (options.proposalKey !== undefined && options.redesignTrigger?.trim().length === 0) {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "ProposalMissingRedesignTrigger",
          relativePath,
          "A sibling proposal requires a non-empty redesign trigger."
        ),
      ],
    };
  }
  const source = initMarkdown(options);
  const generatedDiagnostics = validateScenarioMarkdown(relativePath, source).filter(
    (item) => item.severity === "error"
  );
  if (generatedDiagnostics.length > 0) {
    return { diagnostics: generatedDiagnostics };
  }
  const existing = await scanScenarioDocuments(options.scenarioRoot);
  const sameIdentity = existing.documents.filter(
    (document) => document.scenarioId === options.scenarioId
  );
  if (options.proposalKey === undefined && sameIdentity.length > 0) {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "ScenarioAlreadyExists",
          relativePath,
          "A scenario with this identity already exists."
        ),
      ],
    };
  }
  const canonicalRelativePath = `${options.group}/${options.slug}.md`;
  const canonicalBaseline = sameIdentity.find(
    (document) => document.relativePath === canonicalRelativePath && isCurrent(document)
  );
  if (options.proposalKey !== undefined && canonicalBaseline === undefined) {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "ProposalBaselineMissing",
          relativePath,
          "A sibling proposal requires an existing canonical current scenario."
        ),
      ],
    };
  }
  const destination = path.resolve(options.scenarioRoot, relativePath);
  await fs.ensureDir(path.dirname(destination));
  try {
    await fs.writeFile(destination, source, { encoding: "utf8", flag: "wx" });
    return { diagnostics: [] };
  } catch {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "ScenarioAlreadyExists",
          relativePath,
          "Scenario initialization never overwrites an existing Markdown file."
        ),
      ],
    };
  }
}

function insideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
  );
}

interface SourceLine {
  content: string;
  start: number;
  end: number;
}

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  const pattern = /([^\r\n]*)(?:\r\n|\n|$)/g;
  for (const match of source.matchAll(pattern)) {
    if (match.index === undefined || match[0].length === 0) {
      continue;
    }
    lines.push({
      content: match[1],
      start: match.index,
      end: match.index + match[1].length,
    });
  }
  return lines;
}

function replaceReviewedFingerprints(
  yaml: string,
  semantic: string,
  presentation: string
): string | undefined {
  const lines = sourceLines(yaml);
  const blockIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^ {2}reviewedFingerprints:\s*$/.test(line.content));
  if (blockIndexes.length !== 1) {
    return undefined;
  }
  const blockStart = blockIndexes[0].index + 1;
  let blockEnd = lines.length;
  for (let index = blockStart; index < lines.length; index++) {
    if (/^ {0,2}\S/.test(lines[index].content)) {
      blockEnd = index;
      break;
    }
  }
  const semanticLines = lines
    .slice(blockStart, blockEnd)
    .filter((line) => /^ {4}semantic:\s*/.test(line.content));
  const presentationLines = lines
    .slice(blockStart, blockEnd)
    .filter((line) => /^ {4}presentation:\s*/.test(line.content));
  if (semanticLines.length !== 1 || presentationLines.length !== 1) {
    return undefined;
  }
  const replaceScalar = (line: SourceLine, key: string, value: string): string | undefined => {
    const match = new RegExp(`^( {4}${key}:\\s*)(?:"[^"]*"|'[^']*'|[^\\s#]+)(\\s*(?:#.*)?)$`).exec(
      line.content
    );
    return match === null ? undefined : `${match[1]}${value}${match[2]}`;
  };
  const semanticLine = replaceScalar(semanticLines[0], "semantic", semantic);
  const presentationLine = replaceScalar(presentationLines[0], "presentation", presentation);
  if (semanticLine === undefined || presentationLine === undefined) {
    return undefined;
  }
  const replacements = [
    { line: semanticLines[0], value: semanticLine },
    { line: presentationLines[0], value: presentationLine },
  ].sort((left, right) => right.line.start - left.line.start);
  let updated = yaml;
  for (const replacement of replacements) {
    updated = `${updated.slice(0, replacement.line.start)}${replacement.value}${updated.slice(
      replacement.line.end
    )}`;
  }
  return updated;
}

export async function acceptScenarioArtifact(
  options: AcceptScenarioOptions
): Promise<ScenarioCommandResult> {
  let canonicalRoot: string;
  let canonicalScenarioFile: string;
  try {
    [canonicalRoot, canonicalScenarioFile] = await Promise.all([
      fs.realpath(options.scenarioRoot),
      fs.realpath(options.scenarioFile),
    ]);
  } catch {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "ScenarioPathInvalid",
          "",
          "The accepted scenario path could not be resolved."
        ),
      ],
    };
  }
  if (!insideRoot(canonicalRoot, canonicalScenarioFile)) {
    return {
      diagnostics: [
        diagnostic(
          "error",
          "ScenarioPathEscapesRoot",
          "",
          "The accepted scenario file must be inside the scenario root."
        ),
      ],
    };
  }
  const candidateRelativePath = path
    .relative(canonicalRoot, canonicalScenarioFile)
    .split(path.sep)
    .join("/");
  return withScenarioUpdateLock(canonicalScenarioFile, async () => {
    const source = await fs.readFile(canonicalScenarioFile, "utf8");
    const sourceChanged = (): ScenarioCommandResult => ({
      diagnostics: [
        diagnostic(
          "error",
          "ScenarioSourceChanged",
          candidateRelativePath,
          "The scenario changed during acceptance; regenerate and review it before retrying."
        ),
      ],
    });
    const checked = await checkScenarioArtifacts(options);
    if ((await fs.readFile(canonicalScenarioFile, "utf8")) !== source) {
      return sourceChanged();
    }
    const blocking = errors(checked.diagnostics).filter(
      (item) => !isReviewedFingerprintDrift(item)
    );
    if (blocking.length > 0) {
      return { diagnostics: blocking };
    }
    const catalog = await scanScenarioDocuments(options.scenarioRoot);
    if ((await fs.readFile(canonicalScenarioFile, "utf8")) !== source) {
      return sourceChanged();
    }
    const document = catalog.documents.find(
      (item) => pathIdentity(item.relativePath) === pathIdentity(candidateRelativePath)
    );
    const relativePath = document?.relativePath ?? candidateRelativePath;
    if (document === undefined || document.binding === undefined) {
      return {
        diagnostics: [
          diagnostic(
            "error",
            "ScenarioBindingMissing",
            relativePath,
            "Only a scenario with a valid implementation binding can be accepted."
          ),
        ],
      };
    }
    const publicationFile = path.resolve(canonicalRoot, document.relativePath);
    const scaffoldCatalog = catalogsFromOptions(options).find(
      (catalog) => catalog.kind === document.binding?.kind
    );
    if (scaffoldCatalog === undefined) {
      return {
        diagnostics: [
          diagnostic(
            "error",
            "MissingScaffoldCatalog",
            relativePath,
            `No scaffold catalog is available for binding kind '${document.binding.kind}'.`
          ),
        ],
      };
    }
    const resolved = resolveScenarioFingerprints(document, scaffoldCatalog);
    if (resolved.fingerprints === undefined || resolved.diagnostics.length > 0) {
      return { diagnostics: resolved.diagnostics };
    }
    const fingerprints = resolved.fingerprints;
    const parsedBinding = parseScenarioBinding(source);
    if (parsedBinding.state !== "valid") {
      return {
        diagnostics: [
          diagnostic(
            "error",
            "ReviewedFingerprintsMissing",
            relativePath,
            "The implementation binding must declare both reviewed fingerprints."
          ),
        ],
      };
    }
    const yaml = source.slice(parsedBinding.source.yamlStart, parsedBinding.source.yamlEnd);
    const updatedYaml = replaceReviewedFingerprints(
      yaml,
      fingerprints.semantic,
      fingerprints.presentation
    );
    if (updatedYaml === undefined) {
      return {
        diagnostics: [
          diagnostic(
            "error",
            "ReviewedFingerprintsMissing",
            relativePath,
            "The implementation binding must declare both reviewed fingerprints."
          ),
        ],
      };
    }
    const updated = `${source.slice(0, parsedBinding.source.yamlStart)}${updatedYaml}${source.slice(
      parsedBinding.source.yamlEnd
    )}`;
    const reparsed = parseScenarioBinding(updated);
    if (
      reparsed.state !== "valid" ||
      reparsed.binding.reviewedFingerprints.semantic !== fingerprints.semantic ||
      reparsed.binding.reviewedFingerprints.presentation !== fingerprints.presentation
    ) {
      return {
        diagnostics: [
          diagnostic(
            "error",
            "ReviewedFingerprintsUpdateFailed",
            relativePath,
            "The reviewed fingerprints could not be updated safely."
          ),
        ],
      };
    }
    const temporary = `${publicationFile}.${process.pid}.${randomUUID()}.tmp`;
    const backup = `${publicationFile}.${process.pid}.${randomUUID()}.bak`;
    try {
      if ((await fs.readFile(publicationFile, "utf8")) !== source) {
        return sourceChanged();
      }
      await fs.writeFile(temporary, updated, { encoding: "utf8", flag: "wx" });
      await fs.rename(publicationFile, backup);
      if ((await fs.readFile(backup, "utf8")) !== source) {
        await restoreScenarioBackup(backup, publicationFile);
        await fs.remove(temporary);
        return sourceChanged();
      }
      if (!(await linkWithoutOverwrite(temporary, publicationFile))) {
        await fs.remove(backup);
        await fs.remove(temporary);
        return sourceChanged();
      }
      await fs.remove(backup);
      await fs.remove(temporary);
    } catch (error) {
      try {
        await restoreScenarioBackup(backup, publicationFile);
      } finally {
        await fs.remove(temporary);
      }
      throw error;
    }
    return { diagnostics: [] };
  });
}
