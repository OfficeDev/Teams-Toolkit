// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  DeclarativeAgentManifestConverter,
  FxError,
  Result,
  SystemError,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import * as commentJson from "comment-json";
import { randomUUID } from "crypto";
import fs from "fs-extra";
import path from "path";
import semver from "semver";
import { getLocalizedString } from "../common/localizeUtils";
import { expandEnvironmentVariable } from "../component/utils/common";
import { UserCancelError } from "../error";

const source = "WorkerAgents";
const rootManifestRelativePath = path.join("appPackage", "declarativeAgent.json");
const minimumWorkerAgentVersion = "1.6.0";
const minimumLocalWorkerAgentVersion = "1.7.0";

export type WorkerReferenceInput = { type: "id"; id: string } | { type: "file"; file: string };

export interface WorkerOperationOptions {
  projectPath: string;
  reference: WorkerReferenceInput;
}

export interface WorkerProjectOptions {
  projectPath: string;
}

export interface WorkerOperationContext {
  signal?: AbortSignal;
}

export interface WorkerMutationResult {
  changed: boolean;
}

export type WorkerInspectionItem =
  { type: "id"; id: string } | { type: "file"; file: string; exists: boolean };

export interface WorkerInspectionResult {
  items: WorkerInspectionItem[];
}

export type WorkerDiagnosticSeverity = "error" | "warning" | "info";

export interface WorkerDiagnostic {
  severity: WorkerDiagnosticSeverity;
  code: string;
  message: string;
  file?: string;
  path?: string;
}

export interface WorkerValidationResult {
  valid: boolean;
  diagnostics: WorkerDiagnostic[];
}

export interface WorkerLocalManifest {
  absolutePath: string;
  lexicalPath: string;
  packagePath: string;
  content: string;
  document: Record<string, unknown>;
}

export interface WorkerGraphResult extends WorkerValidationResult {
  localManifests: WorkerLocalManifest[];
}

export const workerAgentAtomicIo = {
  writeFile: (filePath: string, content: string): Promise<void> =>
    fs.writeFile(filePath, content, "utf8"),
  rename: (sourcePath: string, targetPath: string): Promise<void> =>
    fs.rename(sourcePath, targetPath),
  remove: (filePath: string): Promise<void> => fs.remove(filePath),
};

interface GraphOptions {
  projectPath: string;
  packageRootPath?: string;
  rootManifestPath?: string;
  rootDocument?: unknown;
  allowMissingRoot?: boolean;
  validateOnlyIfWorkerAgentsConfigured?: boolean;
  loadManifest?: (
    manifestPath: string
  ) => Promise<Result<{ content: string; document: Record<string, unknown> }, FxError>>;
  resolveAgentFile?: (
    authoredFile: string,
    manifestPath: string
  ) => Promise<Result<string, FxError>>;
}

interface FileReference {
  authored: string;
  key: string;
  lexicalTarget: string;
}

interface GraphState {
  appPackagePath: string;
  packageRootPath: string;
  canonicalAppPackagePath: string;
  diagnostics: WorkerDiagnostic[];
  localManifests: WorkerLocalManifest[];
  visited: Set<string>;
  stack: string[];
  referencedTargets: Set<string>;
  loadManifest?: GraphOptions["loadManifest"];
  loadError?: FxError;
}

interface DiscoveredRoot {
  path?: string;
  allowMissing: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === "string" ? error.code : undefined;
}

function nestedErrorCode(error: unknown): string | undefined {
  const direct = errorCode(error);
  if (direct) return direct;
  if (!isRecord(error)) return undefined;
  return nestedErrorCode(error.innerError ?? error.error ?? error.cause);
}

function systemError(name: string, error: unknown): FxError {
  const normalized = error instanceof Error ? error : new Error(String(error));
  return new SystemError({
    source,
    name,
    message: getLocalizedString("error.workerAgents.operation", name),
    error: normalized,
  });
}

function userError(name: string): FxError {
  return new UserError({
    source,
    name,
    message: getLocalizedString("error.workerAgents.operation", name),
  });
}

function diagnostic(
  code: string,
  file: string | undefined,
  jsonPath: string | undefined,
  severity: WorkerDiagnosticSeverity = "error"
): WorkerDiagnostic {
  return {
    severity,
    code,
    message: getLocalizedString("error.workerAgents.diagnostic", code),
    file,
    path: jsonPath,
  };
}

function normalizeIdentity(target: string): string {
  const normalized = path.normalize(target);
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

function isContained(root: string, target: string): boolean {
  const normalizedRoot = normalizeIdentity(root);
  const normalizedTarget = normalizeIdentity(target);
  const relative = path.relative(normalizedRoot, normalizedTarget);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

function isAbsoluteOnAnyPlatform(value: string): boolean {
  return path.isAbsolute(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}

function createFileReference(
  authored: string,
  containingManifestPath: string,
  appPackagePath: string
): Result<FileReference, FxError> {
  if (authored.trim().length === 0) return err(userError("WORKER_REFERENCE_EMPTY"));
  if (isAbsoluteOnAnyPlatform(authored)) return err(userError("WORKER_FILE_ABSOLUTE"));
  const key = path.posix.normalize(authored.replace(/\\/g, "/"));
  const lexicalTarget = path.resolve(path.dirname(containingManifestPath), ...key.split("/"));
  if (!isContained(appPackagePath, lexicalTarget)) {
    return err(userError("WORKER_FILE_OUTSIDE_PACKAGE"));
  }
  return ok({ authored, key, lexicalTarget });
}

function parseReferenceInput(reference: unknown): Result<WorkerReferenceInput, FxError> {
  if (!isRecord(reference) || (reference.type !== "id" && reference.type !== "file")) {
    return err(userError("WORKER_REFERENCE_INVALID"));
  }
  if (Object.keys(reference).some((key) => key !== "type" && key !== reference.type)) {
    return err(userError("WORKER_REFERENCE_INVALID"));
  }
  if (reference.type === "id") {
    if (typeof reference.id !== "string" || reference.id.trim().length === 0) {
      return err(userError("WORKER_REFERENCE_EMPTY"));
    }
    return ok({ type: "id", id: reference.id.trim() });
  }
  if (typeof reference.file !== "string" || reference.file.trim().length === 0) {
    return err(userError("WORKER_REFERENCE_EMPTY"));
  }
  return ok({ type: "file", file: reference.file });
}

async function readDocument(filePath: string): Promise<Result<Record<string, unknown>, FxError>> {
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    return err(systemError("WORKER_MANIFEST_READ_FAILED", error));
  }
  return parseDocument(content);
}

function parseDocument(content: string): Result<Record<string, unknown>, FxError> {
  try {
    DeclarativeAgentManifestConverter.jsonToManifest(content);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return err(userError("WORKER_MANIFEST_INVALID_JSON"));
    }
  }
  let parsed: unknown;
  try {
    parsed = commentJson.parse(content);
  } catch {
    return err(userError("WORKER_MANIFEST_INVALID_JSON"));
  }
  if (!isRecord(parsed)) return err(userError("WORKER_MANIFEST_INVALID"));
  const baseDocument = { ...parsed };
  delete baseDocument.worker_agents;
  try {
    DeclarativeAgentManifestConverter.jsonToManifest(JSON.stringify(baseDocument));
  } catch {
    return err(userError("WORKER_MANIFEST_INVALID"));
  }
  return ok(parsed);
}

function firstDeclaredAgentFile(manifest: unknown): string | undefined {
  if (!isRecord(manifest)) return undefined;
  const containers = [
    [manifest.copilotAgents, "declarativeAgents"],
    [manifest.copilotExtensions, "declarativeCopilots"],
  ] as const;
  for (const [container, property] of containers) {
    if (!isRecord(container)) continue;
    const agents = container[property];
    if (!Array.isArray(agents)) continue;
    const first = agents[0];
    if (isRecord(first) && typeof first.file === "string" && first.file.trim()) {
      return first.file;
    }
  }
  return undefined;
}

async function discoverProjectRoot(
  projectPath: string,
  resolveAgentFile?: GraphOptions["resolveAgentFile"]
): Promise<Result<DiscoveredRoot, FxError>> {
  const defaultPath = path.resolve(projectPath, rootManifestRelativePath);
  const appPackagePath = path.resolve(projectPath, "appPackage");
  const teamsManifestPath = path.join(appPackagePath, "manifest.json");
  let content: string;
  try {
    content = await fs.readFile(teamsManifestPath, "utf8");
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? ok({ path: defaultPath, allowMissing: true })
      : err(systemError("WORKER_MANIFEST_READ_FAILED", error));
  }
  let manifest: unknown;
  try {
    manifest = commentJson.parse(content);
  } catch {
    return err(userError("WORKER_MANIFEST_INVALID"));
  }
  let declaredFile = firstDeclaredAgentFile(manifest);
  if (!declaredFile) return ok({ allowMissing: true });
  if (resolveAgentFile) {
    const resolved = await resolveAgentFile(declaredFile, teamsManifestPath);
    if (resolved.isErr()) return err(resolved.error);
    declaredFile = resolved.value;
  } else {
    declaredFile = expandEnvironmentVariable(declaredFile);
  }
  const reference = createFileReference(declaredFile, teamsManifestPath, appPackagePath);
  return reference.isErr()
    ? err(reference.error)
    : ok({ path: reference.value.lexicalTarget, allowMissing: false });
}

function isDeclarativeAgent(document: Record<string, unknown>): boolean {
  return (
    typeof document.version === "string" &&
    typeof document.name === "string" &&
    typeof document.description === "string" &&
    typeof document.instructions === "string"
  );
}

function supportsWorkerAgents(version: unknown): boolean {
  if (typeof version !== "string") return false;
  const parsedVersion = semver.coerce(version);
  return parsedVersion !== null && semver.gte(parsedVersion, minimumWorkerAgentVersion);
}

function supportsLocalWorkerAgents(version: unknown): boolean {
  if (typeof version !== "string") return false;
  const parsedVersion = semver.coerce(version);
  return parsedVersion !== null && semver.gte(parsedVersion, minimumLocalWorkerAgentVersion);
}

function hasConfiguredWorkerAgents(document: unknown): boolean {
  if (!isRecord(document)) return false;
  const entries = document.worker_agents;
  return entries !== undefined && (!Array.isArray(entries) || entries.length > 0);
}

async function shouldValidateWorkerAgents(rootManifestPath: string): Promise<boolean> {
  try {
    const content = await fs.readFile(rootManifestPath, "utf8");
    return hasConfiguredWorkerAgents(commentJson.parse(content));
  } catch {
    return true;
  }
}

function projectRelative(projectPath: string, filePath: string): string {
  return path.relative(projectPath, filePath).replace(/\\/g, "/");
}

function workerEntries(
  document: Record<string, unknown>,
  manifestFile: string,
  state: GraphState
): unknown[] {
  if (document.worker_agents === undefined) return [];
  if (!Array.isArray(document.worker_agents)) {
    state.diagnostics.push(diagnostic("WORKER_ENTRIES_INVALID", manifestFile, "$.worker_agents"));
    return [];
  }
  if (!supportsWorkerAgents(document.version)) {
    state.diagnostics.push(
      diagnostic("WORKER_SCHEMA_UNSUPPORTED", manifestFile, "$.worker_agents")
    );
  }
  return document.worker_agents;
}

function validateEntryShape(
  entry: unknown,
  manifestFile: string,
  jsonPath: string,
  state: GraphState
): entry is Record<string, unknown> {
  const errors = entryShapeErrors(entry);
  for (const code of errors) state.diagnostics.push(diagnostic(code, manifestFile, jsonPath));
  return isRecord(entry) && !errors.includes("WORKER_REFERENCE_CONFLICTING");
}

function entryShapeErrors(entry: unknown): string[] {
  if (!isRecord(entry)) return ["WORKER_REFERENCE_INVALID"];
  const errors: string[] = [];
  if (Object.keys(entry).some((key) => key !== "id" && key !== "file")) {
    errors.push("WORKER_REFERENCE_UNSUPPORTED_PROPERTY");
  }
  const hasId = Object.prototype.hasOwnProperty.call(entry, "id");
  const hasFile = Object.prototype.hasOwnProperty.call(entry, "file");
  if (hasId === hasFile) errors.push("WORKER_REFERENCE_CONFLICTING");
  return errors;
}

async function canonicalRegularFile(
  reference: FileReference,
  manifestFile: string,
  jsonPath: string,
  state: GraphState
): Promise<string | undefined> {
  let stats;
  try {
    stats = await fs.stat(reference.lexicalTarget);
  } catch (error) {
    state.diagnostics.push(
      diagnostic(
        errorCode(error) === "ENOENT" ? "WORKER_FILE_MISSING" : "WORKER_FILE_STAT_FAILED",
        manifestFile,
        jsonPath
      )
    );
    return undefined;
  }
  if (!stats.isFile()) {
    state.diagnostics.push(diagnostic("WORKER_FILE_NOT_REGULAR", manifestFile, jsonPath));
    return undefined;
  }
  let canonicalTarget: string;
  try {
    canonicalTarget = await fs.realpath(reference.lexicalTarget);
  } catch {
    state.diagnostics.push(diagnostic("WORKER_FILE_STAT_FAILED", manifestFile, jsonPath));
    return undefined;
  }
  if (!isContained(state.canonicalAppPackagePath, canonicalTarget)) {
    state.diagnostics.push(
      diagnostic("WORKER_FILE_CANONICAL_OUTSIDE_PACKAGE", manifestFile, jsonPath)
    );
    return undefined;
  }
  return canonicalTarget;
}

async function parseNestedManifest(
  target: string,
  manifestFile: string,
  jsonPath: string,
  state: GraphState
): Promise<{ content: string; document: Record<string, unknown> } | undefined> {
  if (state.loadManifest) {
    const loaded = await state.loadManifest(target);
    if (loaded.isErr()) {
      if (!state.loadError) state.loadError = loaded.error;
      return undefined;
    }
    if (!isDeclarativeAgent(loaded.value.document)) {
      state.diagnostics.push(
        diagnostic("WORKER_FILE_NOT_DECLARATIVE_AGENT", manifestFile, jsonPath)
      );
      return undefined;
    }
    return loaded.value;
  }
  let content: string;
  try {
    content = await fs.readFile(target, "utf8");
  } catch {
    state.diagnostics.push(diagnostic("WORKER_FILE_READ_FAILED", manifestFile, jsonPath));
    return undefined;
  }
  const parsed = parseDocument(content);
  if (parsed.isErr()) {
    state.diagnostics.push(
      diagnostic(
        parsed.error.name === "WORKER_MANIFEST_INVALID_JSON"
          ? "WORKER_FILE_INVALID_JSON"
          : "WORKER_FILE_NOT_DECLARATIVE_AGENT",
        manifestFile,
        jsonPath
      )
    );
    return undefined;
  }
  if (!isDeclarativeAgent(parsed.value)) {
    state.diagnostics.push(diagnostic("WORKER_FILE_NOT_DECLARATIVE_AGENT", manifestFile, jsonPath));
    return undefined;
  }
  return { content, document: parsed.value };
}

async function walkManifest(
  document: Record<string, unknown>,
  manifestPath: string,
  manifestIdentity: string,
  depth: number,
  state: GraphState
): Promise<void> {
  const manifestFile = projectRelative(path.dirname(state.appPackagePath), manifestPath);
  const entries = workerEntries(document, manifestFile, state);
  const ids = new Set<string>();
  const keys = new Set<string>();
  const targets = new Set<string>();

  for (const [index, entry] of entries.entries()) {
    const jsonPath = `$.worker_agents[${index}]`;
    if (!validateEntryShape(entry, manifestFile, jsonPath, state)) continue;
    if (Object.prototype.hasOwnProperty.call(entry, "id")) {
      if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
        state.diagnostics.push(diagnostic("WORKER_REFERENCE_EMPTY", manifestFile, jsonPath));
        continue;
      }
      const id = entry.id.trim();
      if (ids.has(id)) {
        state.diagnostics.push(diagnostic("WORKER_DUPLICATE_REFERENCE", manifestFile, jsonPath));
      }
      ids.add(id);
      continue;
    }
    if (typeof entry.file !== "string" || entry.file.trim().length === 0) {
      state.diagnostics.push(diagnostic("WORKER_REFERENCE_EMPTY", manifestFile, jsonPath));
      continue;
    }
    if (!supportsLocalWorkerAgents(document.version)) {
      state.diagnostics.push(diagnostic("WORKER_SCHEMA_UNSUPPORTED", manifestFile, jsonPath));
      continue;
    }
    const referenceResult = createFileReference(entry.file, manifestPath, state.appPackagePath);
    if (referenceResult.isErr()) {
      state.diagnostics.push(diagnostic(referenceResult.error.name, manifestFile, jsonPath));
      continue;
    }
    const reference = referenceResult.value;
    if (!isContained(state.packageRootPath, reference.lexicalTarget)) {
      state.diagnostics.push(diagnostic("WORKER_FILE_OUTSIDE_PACKAGE", manifestFile, jsonPath));
      continue;
    }
    if (keys.has(reference.key)) {
      state.diagnostics.push(diagnostic("WORKER_DUPLICATE_REFERENCE", manifestFile, jsonPath));
      continue;
    }
    keys.add(reference.key);
    const canonicalTarget = await canonicalRegularFile(reference, manifestFile, jsonPath, state);
    if (!canonicalTarget) continue;
    const identity = normalizeIdentity(canonicalTarget);
    if (targets.has(identity)) {
      state.diagnostics.push(diagnostic("WORKER_DUPLICATE_REFERENCE", manifestFile, jsonPath));
      continue;
    }
    targets.add(identity);
    if (identity === manifestIdentity) {
      state.diagnostics.push(diagnostic("WORKER_SELF_REFERENCE", manifestFile, jsonPath));
      continue;
    }
    if (state.stack.includes(identity)) {
      state.diagnostics.push(diagnostic("WORKER_CYCLE", manifestFile, jsonPath));
      continue;
    }
    if (state.referencedTargets.has(identity)) {
      state.diagnostics.push(diagnostic("WORKER_DUPLICATE_REFERENCE", manifestFile, jsonPath));
      continue;
    }
    state.referencedTargets.add(identity);
    if (depth + 1 > 2) {
      state.diagnostics.push(
        diagnostic("WORKER_DEPTH_RECOMMENDED", manifestFile, jsonPath, "warning")
      );
    }
    const snapshot = await parseNestedManifest(canonicalTarget, manifestFile, jsonPath, state);
    if (!snapshot) continue;
    if (!state.visited.has(identity)) {
      state.visited.add(identity);
      state.localManifests.push({
        absolutePath: canonicalTarget,
        lexicalPath: reference.lexicalTarget,
        packagePath: projectRelative(state.packageRootPath, reference.lexicalTarget),
        content: snapshot.content,
        document: snapshot.document,
      });
      state.stack.push(identity);
      await walkManifest(snapshot.document, reference.lexicalTarget, identity, depth + 1, state);
      state.stack.pop();
    }
  }
}

function sortDiagnostics(diagnostics: WorkerDiagnostic[]): WorkerDiagnostic[] {
  const severityOrder: Record<WorkerDiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };
  return diagnostics.sort(
    (left, right) =>
      compareOrdinal(left.file ?? "", right.file ?? "") ||
      compareOrdinal(left.path ?? "", right.path ?? "") ||
      severityOrder[left.severity] - severityOrder[right.severity] ||
      compareOrdinal(left.code, right.code)
  );
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function validateWorkerAgentGraph(
  options: GraphOptions
): Promise<Result<WorkerGraphResult, FxError>> {
  if (
    options.rootDocument !== undefined &&
    isRecord(options.rootDocument) &&
    !hasConfiguredWorkerAgents(options.rootDocument)
  ) {
    return ok({ valid: true, diagnostics: [], localManifests: [] });
  }
  const appPackagePath = path.resolve(options.projectPath, "appPackage");
  let allowMissingRoot = options.allowMissingRoot ?? false;
  let rootManifestPath: string;
  if (options.rootManifestPath === undefined) {
    const discoveredRoot = await discoverProjectRoot(options.projectPath, options.resolveAgentFile);
    if (discoveredRoot.isErr()) return err(discoveredRoot.error);
    if (!discoveredRoot.value.path) {
      if (allowMissingRoot) {
        return ok({ valid: true, diagnostics: [], localManifests: [] });
      }
      rootManifestPath = path.resolve(options.projectPath, rootManifestRelativePath);
    } else {
      rootManifestPath = discoveredRoot.value.path;
      allowMissingRoot = allowMissingRoot && discoveredRoot.value.allowMissing;
    }
  } else {
    rootManifestPath = path.resolve(options.rootManifestPath);
  }
  if (
    options.validateOnlyIfWorkerAgentsConfigured &&
    !(await shouldValidateWorkerAgents(rootManifestPath))
  ) {
    return ok({ valid: true, diagnostics: [], localManifests: [] });
  }
  let canonicalAppPackagePath: string;
  try {
    canonicalAppPackagePath = await fs.realpath(appPackagePath);
  } catch (error) {
    if (allowMissingRoot && errorCode(error) === "ENOENT") {
      return ok({ valid: true, diagnostics: [], localManifests: [] });
    }
    return err(systemError("WORKER_APP_PACKAGE_READ_FAILED", error));
  }
  let rootDocument: Record<string, unknown> | undefined;
  if (options.rootDocument !== undefined) {
    if (!isRecord(options.rootDocument)) {
      return ok({
        valid: false,
        diagnostics: [
          diagnostic(
            "WORKER_FILE_NOT_DECLARATIVE_AGENT",
            projectRelative(options.projectPath, rootManifestPath),
            "$"
          ),
        ],
        localManifests: [],
      });
    }
    rootDocument = options.rootDocument;
  } else {
    const readResult = await readDocument(rootManifestPath);
    if (readResult.isErr()) {
      if (allowMissingRoot && nestedErrorCode(readResult.error) === "ENOENT") {
        return ok({ valid: true, diagnostics: [], localManifests: [] });
      }
      if (readResult.error.name === "WORKER_MANIFEST_INVALID_JSON") {
        return ok({
          valid: false,
          diagnostics: [
            diagnostic(
              "WORKER_FILE_INVALID_JSON",
              projectRelative(options.projectPath, rootManifestPath),
              "$"
            ),
          ],
          localManifests: [],
        });
      }
      return err(readResult.error);
    }
    rootDocument = readResult.value;
  }
  if (!rootDocument) {
    return err(userError("WORKER_MANIFEST_INVALID"));
  }
  if (!isDeclarativeAgent(rootDocument)) {
    const result = {
      valid: false,
      diagnostics: [
        diagnostic(
          "WORKER_FILE_NOT_DECLARATIVE_AGENT",
          projectRelative(options.projectPath, rootManifestPath),
          "$"
        ),
      ],
      localManifests: [],
    };
    return ok(result);
  }
  let canonicalRootManifestPath: string;
  try {
    canonicalRootManifestPath = await fs.realpath(rootManifestPath);
  } catch (error) {
    return err(systemError("WORKER_MANIFEST_READ_FAILED", error));
  }
  if (!isContained(canonicalAppPackagePath, canonicalRootManifestPath)) {
    return ok({
      valid: false,
      diagnostics: [
        diagnostic(
          "WORKER_FILE_CANONICAL_OUTSIDE_PACKAGE",
          projectRelative(options.projectPath, rootManifestPath),
          "$"
        ),
      ],
      localManifests: [],
    });
  }
  const rootIdentity = normalizeIdentity(canonicalRootManifestPath);
  const state: GraphState = {
    appPackagePath,
    packageRootPath: path.resolve(options.packageRootPath ?? appPackagePath),
    canonicalAppPackagePath,
    diagnostics: [],
    localManifests: [],
    visited: new Set([rootIdentity]),
    stack: [rootIdentity],
    referencedTargets: new Set(),
    loadManifest: options.loadManifest,
  };
  await walkManifest(rootDocument, rootManifestPath, rootIdentity, 0, state);
  if (state.loadError) return err(state.loadError);
  const diagnostics = sortDiagnostics(state.diagnostics);
  return ok({
    valid: !diagnostics.some((item) => item.severity === "error"),
    diagnostics,
    localManifests: state.localManifests,
  });
}

async function atomicWrite(
  targetPath: string,
  content: string,
  signal?: AbortSignal
): Promise<Result<void, FxError>> {
  const temporaryPath = path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${randomUUID()}.tmp`
  );
  try {
    if (signal?.aborted) return err(new UserCancelError(source));
    await workerAgentAtomicIo.writeFile(temporaryPath, content);
    if (signal?.aborted) {
      await workerAgentAtomicIo.remove(temporaryPath);
      return err(new UserCancelError(source));
    }
    await workerAgentAtomicIo.rename(temporaryPath, targetPath);
    return ok(undefined);
  } catch (error) {
    try {
      await workerAgentAtomicIo.remove(temporaryPath);
    } catch {
      // Preserve the primary write error.
    }
    return err(systemError("WORKER_MANIFEST_WRITE_FAILED", error));
  }
}

async function readRootForMutation(
  projectPath: string
): Promise<Result<{ path: string; document: Record<string, unknown> }, FxError>> {
  const discoveredRoot = await discoverProjectRoot(projectPath);
  if (discoveredRoot.isErr()) return err(discoveredRoot.error);
  const rootPath = discoveredRoot.value.path ?? path.resolve(projectPath, rootManifestRelativePath);
  const readResult = await readDocument(rootPath);
  if (readResult.isErr()) return err(readResult.error);
  if (!supportsWorkerAgents(readResult.value.version)) {
    return err(userError("WORKER_SCHEMA_UNSUPPORTED"));
  }
  if (!isDeclarativeAgent(readResult.value)) {
    return err(userError("WORKER_MANIFEST_INVALID"));
  }
  return ok({ path: rootPath, document: readResult.value });
}

async function canonicalTargetIfPresent(reference: FileReference): Promise<string | undefined> {
  try {
    const stats = await fs.stat(reference.lexicalTarget);
    return stats.isFile() ? await fs.realpath(reference.lexicalTarget) : undefined;
  } catch {
    return undefined;
  }
}

async function equivalentFileEntry(
  entry: unknown,
  requested: FileReference,
  rootPath: string,
  appPackagePath: string,
  requestedTarget: string | undefined
): Promise<boolean> {
  if (!isRecord(entry) || typeof entry.file !== "string") return false;
  const existingResult = createFileReference(entry.file, rootPath, appPackagePath);
  if (existingResult.isErr()) return false;
  if (existingResult.value.key === requested.key) return true;
  if (!requestedTarget) return false;
  const existingTarget = await canonicalTargetIfPresent(existingResult.value);
  return (
    existingTarget !== undefined &&
    normalizeIdentity(existingTarget) === normalizeIdentity(requestedTarget)
  );
}

export async function addWorkerAgent(
  options: WorkerOperationOptions,
  context?: WorkerOperationContext
): Promise<Result<WorkerMutationResult, FxError>> {
  if (context?.signal?.aborted) return err(new UserCancelError(source));
  if (
    !isRecord(options) ||
    typeof options.projectPath !== "string" ||
    !options.projectPath.trim()
  ) {
    return err(userError("WORKER_OPTIONS_INVALID"));
  }
  const referenceResult = parseReferenceInput(options.reference);
  if (referenceResult.isErr()) return err(referenceResult.error);
  const rootResult = await readRootForMutation(options.projectPath);
  if (rootResult.isErr()) return err(rootResult.error);
  const { document, path: rootPath } = rootResult.value;
  const entries = document.worker_agents === undefined ? [] : document.worker_agents;
  if (!Array.isArray(entries)) return err(userError("WORKER_ENTRIES_INVALID"));
  const reference = referenceResult.value;
  const appPackagePath = path.resolve(options.projectPath, "appPackage");
  let newEntry: Record<string, unknown>;
  if (reference.type === "id") {
    if (
      entries.some(
        (entry) =>
          isRecord(entry) && typeof entry.id === "string" && entry.id.trim() === reference.id
      )
    ) {
      return ok({ changed: false });
    }
    newEntry = { id: reference.id };
  } else {
    const fileResult = createFileReference(reference.file, rootPath, appPackagePath);
    if (fileResult.isErr()) return err(fileResult.error);
    const target = await canonicalTargetIfPresent(fileResult.value);
    if (!target) return err(userError("WORKER_FILE_MISSING_OR_NOT_REGULAR"));
    for (const entry of entries) {
      if (await equivalentFileEntry(entry, fileResult.value, rootPath, appPackagePath, target)) {
        return ok({ changed: false });
      }
    }
    newEntry = { file: reference.file };
  }
  const candidate: Record<string, unknown> = { ...document, worker_agents: [...entries, newEntry] };
  const validationResult = await validateWorkerAgentGraph({
    projectPath: options.projectPath,
    rootManifestPath: rootPath,
    rootDocument: candidate,
  });
  if (validationResult.isErr()) return err(validationResult.error);
  const blocking = validationResult.value.diagnostics.find(
    (item: WorkerDiagnostic) => item.severity === "error"
  );
  if (blocking) return err(userError(blocking.code));
  const writeResult = await atomicWrite(
    rootPath,
    `${JSON.stringify(candidate, undefined, 2)}\n`,
    context?.signal
  );
  return writeResult.isErr() ? err(writeResult.error) : ok({ changed: true });
}

export async function removeWorkerAgent(
  options: WorkerOperationOptions,
  context?: WorkerOperationContext
): Promise<Result<WorkerMutationResult, FxError>> {
  if (context?.signal?.aborted) return err(new UserCancelError(source));
  if (
    !isRecord(options) ||
    typeof options.projectPath !== "string" ||
    !options.projectPath.trim()
  ) {
    return err(userError("WORKER_OPTIONS_INVALID"));
  }
  const referenceResult = parseReferenceInput(options.reference);
  if (referenceResult.isErr()) return err(referenceResult.error);
  const rootResult = await readRootForMutation(options.projectPath);
  if (rootResult.isErr()) return err(rootResult.error);
  const { document, path: rootPath } = rootResult.value;
  const appPackagePath = path.resolve(options.projectPath, "appPackage");
  const requested = referenceResult.value;
  let requestedFile: FileReference | undefined;
  let requestedTarget: string | undefined;
  if (requested.type === "file") {
    const fileResult = createFileReference(requested.file, rootPath, appPackagePath);
    if (fileResult.isErr()) return err(fileResult.error);
    requestedFile = fileResult.value;
    requestedTarget = await canonicalTargetIfPresent(fileResult.value);
  }
  if (document.worker_agents === undefined) return ok({ changed: false });
  if (!Array.isArray(document.worker_agents)) return err(userError("WORKER_ENTRIES_INVALID"));
  const remaining: unknown[] = [];
  for (const entry of document.worker_agents) {
    const matches =
      requested.type === "id"
        ? isRecord(entry) && typeof entry.id === "string" && entry.id.trim() === requested.id
        : requestedFile !== undefined &&
          (await equivalentFileEntry(
            entry,
            requestedFile,
            rootPath,
            appPackagePath,
            requestedTarget
          ));
    if (!matches) remaining.push(entry);
  }
  if (remaining.length === document.worker_agents.length) return ok({ changed: false });
  const candidate: Record<string, unknown> = { ...document, worker_agents: remaining };
  const writeResult = await atomicWrite(
    rootPath,
    `${JSON.stringify(candidate, undefined, 2)}\n`,
    context?.signal
  );
  return writeResult.isErr() ? err(writeResult.error) : ok({ changed: true });
}

export async function inspectWorkerAgents(
  options: WorkerProjectOptions,
  context?: WorkerOperationContext
): Promise<Result<WorkerInspectionResult, FxError>> {
  if (context?.signal?.aborted) return err(new UserCancelError(source));
  if (
    !isRecord(options) ||
    typeof options.projectPath !== "string" ||
    !options.projectPath.trim()
  ) {
    return err(userError("WORKER_OPTIONS_INVALID"));
  }
  const rootResult = await readRootForMutation(options.projectPath);
  if (rootResult.isErr()) return err(rootResult.error);
  const entries = rootResult.value.document.worker_agents;
  if (entries === undefined) return ok({ items: [] });
  if (!Array.isArray(entries)) return err(userError("WORKER_ENTRIES_INVALID"));
  const items: WorkerInspectionItem[] = [];
  for (const entry of entries) {
    const shapeErrors = entryShapeErrors(entry);
    if (shapeErrors.length > 0) return err(userError(shapeErrors[0]));
    if (!isRecord(entry)) return err(userError("WORKER_REFERENCE_INVALID"));
    if (typeof entry.id === "string") {
      items.push({ type: "id", id: entry.id });
    } else if (typeof entry.file === "string") {
      const fileResult = createFileReference(
        entry.file,
        rootResult.value.path,
        path.resolve(options.projectPath, "appPackage")
      );
      let exists = false;
      if (fileResult.isOk()) {
        try {
          exists = (await fs.stat(fileResult.value.lexicalTarget)).isFile();
        } catch {
          exists = false;
        }
      }
      items.push({ type: "file", file: entry.file, exists });
    } else {
      return err(userError("WORKER_REFERENCE_INVALID"));
    }
  }
  return ok({ items });
}

export async function validateWorkerAgents(
  options: WorkerProjectOptions,
  context?: WorkerOperationContext
): Promise<Result<WorkerValidationResult, FxError>> {
  if (context?.signal?.aborted) return err(new UserCancelError(source));
  if (
    !isRecord(options) ||
    typeof options.projectPath !== "string" ||
    !options.projectPath.trim()
  ) {
    return err(userError("WORKER_OPTIONS_INVALID"));
  }
  const result = await validateWorkerAgentGraph({ projectPath: options.projectPath });
  if (result.isErr()) return err(result.error);
  return ok({ valid: result.value.valid, diagnostics: result.value.diagnostics });
}

export function workerValidationError(result: WorkerValidationResult): FxError | undefined {
  const blocking = result.diagnostics.find((item) => item.severity === "error");
  return blocking ? userError(blocking.code) : undefined;
}
