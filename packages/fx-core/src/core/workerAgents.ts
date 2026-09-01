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

export type WorkerReferenceType = "id" | "file";

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
  type: WorkerReferenceType;
  reference: string;
  manifestPath: string;
}

export type WorkerInspectionItem =
  { type: "id"; id: string } | { type: "file"; file: string; exists: boolean };

export interface WorkerInspectionResult {
  items: WorkerInspectionItem[];
  diagnostics: WorkerDiagnostic[];
}

export type WorkerDiagnosticSeverity = "error" | "warning" | "info";

export type WorkerDiagnosticCode =
  | "WORKER_ENTRIES_INVALID"
  | "WORKER_SCHEMA_UNSUPPORTED"
  | "WORKER_REFERENCE_INVALID"
  | "WORKER_REFERENCE_UNSUPPORTED_PROPERTY"
  | "WORKER_REFERENCE_CONFLICTING"
  | "WORKER_REFERENCE_EMPTY"
  | "WORKER_FILE_ABSOLUTE"
  | "WORKER_FILE_OUTSIDE_PACKAGE"
  | "WORKER_FILE_MISSING"
  | "WORKER_FILE_NOT_REGULAR"
  | "WORKER_FILE_STAT_FAILED"
  | "WORKER_FILE_CANONICAL_OUTSIDE_PACKAGE"
  | "WORKER_FILE_READ_FAILED"
  | "WORKER_FILE_INVALID_JSON"
  | "WORKER_FILE_NOT_DECLARATIVE_AGENT"
  | "WORKER_DUPLICATE_REFERENCE"
  | "WORKER_SELF_REFERENCE"
  | "WORKER_CYCLE"
  | "WORKER_DEPTH_RECOMMENDED";

export interface WorkerDiagnostic {
  severity: WorkerDiagnosticSeverity;
  code: WorkerDiagnosticCode;
  message: string;
  manifestPath?: string;
  path?: string;
  reference?: string;
  relatedManifestPath?: string;
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
  signal?: AbortSignal;
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
  activeStack: string[];
  manifestPaths: Map<string, string>;
  loadManifest?: GraphOptions["loadManifest"];
  loadError?: FxError;
  cancellationError?: FxError;
  signal?: AbortSignal;
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
  code: WorkerDiagnosticCode,
  manifestPath: string | undefined,
  jsonPath: string | undefined,
  severity: WorkerDiagnosticSeverity = "error",
  reference?: string,
  relatedManifestPath?: string
): WorkerDiagnostic {
  return {
    severity,
    code,
    message: getLocalizedString("error.workerAgents.diagnostic", code),
    manifestPath,
    path: jsonPath,
    reference,
    relatedManifestPath,
  };
}

function cancellationError(signal?: AbortSignal): FxError | undefined {
  return signal?.aborted ? new UserCancelError(source) : undefined;
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

function normalizeReferenceKey(authored: string): string {
  return path.posix.normalize(authored.replace(/\\/g, "/"));
}

function createFileReference(
  authored: string,
  containingManifestPath: string,
  appPackagePath: string
): Result<FileReference, FxError> {
  if (authored.trim().length === 0) return err(userError("WORKER_REFERENCE_EMPTY"));
  if (isAbsoluteOnAnyPlatform(authored)) return err(userError("WORKER_FILE_ABSOLUTE"));
  const key = normalizeReferenceKey(authored);
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

async function readDocument(
  filePath: string,
  signal?: AbortSignal
): Promise<Result<Record<string, unknown>, FxError>> {
  const beforeRead = cancellationError(signal);
  if (beforeRead) return err(beforeRead);
  let content: string;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    return err(systemError("WORKER_MANIFEST_READ_FAILED", error));
  }
  const afterRead = cancellationError(signal);
  if (afterRead) return err(afterRead);
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
  resolveAgentFile?: GraphOptions["resolveAgentFile"],
  signal?: AbortSignal
): Promise<Result<DiscoveredRoot, FxError>> {
  const defaultPath = path.resolve(projectPath, rootManifestRelativePath);
  const appPackagePath = path.resolve(projectPath, "appPackage");
  const teamsManifestPath = path.join(appPackagePath, "manifest.json");
  const beforeRead = cancellationError(signal);
  if (beforeRead) return err(beforeRead);
  let content: string;
  try {
    content = await fs.readFile(teamsManifestPath, "utf8");
  } catch (error) {
    return errorCode(error) === "ENOENT"
      ? ok({ path: defaultPath, allowMissing: true })
      : err(systemError("WORKER_MANIFEST_READ_FAILED", error));
  }
  const afterRead = cancellationError(signal);
  if (afterRead) return err(afterRead);
  let manifest: unknown;
  try {
    manifest = commentJson.parse(content);
  } catch {
    return err(userError("WORKER_MANIFEST_INVALID"));
  }
  let declaredFile = firstDeclaredAgentFile(manifest);
  if (!declaredFile) return ok({ allowMissing: true });
  if (resolveAgentFile) {
    const beforeResolve = cancellationError(signal);
    if (beforeResolve) return err(beforeResolve);
    const resolved = await resolveAgentFile(declaredFile, teamsManifestPath);
    const afterResolve = cancellationError(signal);
    if (afterResolve) return err(afterResolve);
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

function workerCapabilities(version: unknown): { id: boolean; file: boolean } {
  const parsedVersion = typeof version === "string" ? semver.coerce(version) : null;
  return {
    id: parsedVersion !== null && semver.gte(parsedVersion, minimumWorkerAgentVersion),
    file: parsedVersion !== null && semver.gte(parsedVersion, minimumLocalWorkerAgentVersion),
  };
}

function hasConfiguredWorkerAgents(document: unknown): boolean {
  if (!isRecord(document)) return false;
  const entries = document.worker_agents;
  return entries !== undefined && (!Array.isArray(entries) || entries.length > 0);
}

async function shouldValidateWorkerAgents(
  rootManifestPath: string,
  signal?: AbortSignal
): Promise<Result<boolean, FxError>> {
  const beforeRead = cancellationError(signal);
  if (beforeRead) return err(beforeRead);
  try {
    const content = await fs.readFile(rootManifestPath, "utf8");
    const afterRead = cancellationError(signal);
    return afterRead ? err(afterRead) : ok(hasConfiguredWorkerAgents(commentJson.parse(content)));
  } catch {
    return ok(true);
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
  if (!workerCapabilities(document.version).id) {
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

function entryShapeErrors(entry: unknown): WorkerDiagnosticCode[] {
  if (!isRecord(entry)) return ["WORKER_REFERENCE_INVALID"];
  const errors: WorkerDiagnosticCode[] = [];
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
  if (state.signal?.aborted) {
    state.cancellationError = new UserCancelError(source);
    return undefined;
  }
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
  if (state.signal?.aborted) {
    state.cancellationError = new UserCancelError(source);
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
  if (state.signal?.aborted) {
    state.cancellationError = new UserCancelError(source);
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
  if (state.signal?.aborted) {
    state.cancellationError = new UserCancelError(source);
    return undefined;
  }
  if (state.loadManifest) {
    const loaded = await state.loadManifest(target);
    if (state.signal?.aborted) {
      state.cancellationError = new UserCancelError(source);
      return undefined;
    }
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
  if (state.signal?.aborted) {
    state.cancellationError = new UserCancelError(source);
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
  if (state.signal?.aborted) {
    state.cancellationError = new UserCancelError(source);
    return;
  }
  const manifestFile = projectRelative(path.dirname(state.appPackagePath), manifestPath);
  const entries = workerEntries(document, manifestFile, state);
  const ids = new Set<string>();
  const keys = new Set<string>();
  const targets = new Set<string>();

  for (const [index, entry] of entries.entries()) {
    if (state.signal?.aborted) {
      state.cancellationError = new UserCancelError(source);
      return;
    }
    const jsonPath = `$.worker_agents[${index}]`;
    if (!validateEntryShape(entry, manifestFile, jsonPath, state)) continue;
    if (Object.prototype.hasOwnProperty.call(entry, "id")) {
      if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
        state.diagnostics.push(
          diagnostic("WORKER_REFERENCE_EMPTY", manifestFile, jsonPath, "error", String(entry.id))
        );
        continue;
      }
      const id = entry.id.trim();
      if (ids.has(id)) {
        state.diagnostics.push(
          diagnostic("WORKER_DUPLICATE_REFERENCE", manifestFile, jsonPath, "error", id)
        );
      }
      ids.add(id);
      continue;
    }
    if (typeof entry.file !== "string" || entry.file.trim().length === 0) {
      state.diagnostics.push(diagnostic("WORKER_REFERENCE_EMPTY", manifestFile, jsonPath));
      continue;
    }
    if (!workerCapabilities(document.version).file) {
      state.diagnostics.push(
        diagnostic("WORKER_SCHEMA_UNSUPPORTED", manifestFile, jsonPath, "error", entry.file)
      );
      continue;
    }
    const referenceResult = createFileReference(entry.file, manifestPath, state.appPackagePath);
    if (referenceResult.isErr()) {
      const code: WorkerDiagnosticCode =
        referenceResult.error.name === "WORKER_REFERENCE_EMPTY" ||
        referenceResult.error.name === "WORKER_FILE_ABSOLUTE" ||
        referenceResult.error.name === "WORKER_FILE_OUTSIDE_PACKAGE"
          ? referenceResult.error.name
          : "WORKER_REFERENCE_INVALID";
      state.diagnostics.push(diagnostic(code, manifestFile, jsonPath, "error", entry.file));
      continue;
    }
    const reference = referenceResult.value;
    if (!isContained(state.packageRootPath, reference.lexicalTarget)) {
      state.diagnostics.push(
        diagnostic("WORKER_FILE_OUTSIDE_PACKAGE", manifestFile, jsonPath, "error", entry.file)
      );
      continue;
    }
    if (keys.has(reference.key)) {
      state.diagnostics.push(
        diagnostic("WORKER_DUPLICATE_REFERENCE", manifestFile, jsonPath, "error", entry.file)
      );
      continue;
    }
    keys.add(reference.key);
    const canonicalTarget = await canonicalRegularFile(reference, manifestFile, jsonPath, state);
    if (state.cancellationError) return;
    if (!canonicalTarget) continue;
    const identity = normalizeIdentity(canonicalTarget);
    if (targets.has(identity)) {
      state.diagnostics.push(
        diagnostic("WORKER_DUPLICATE_REFERENCE", manifestFile, jsonPath, "error", entry.file)
      );
      continue;
    }
    targets.add(identity);
    if (identity === manifestIdentity) {
      state.diagnostics.push(
        diagnostic(
          "WORKER_SELF_REFERENCE",
          manifestFile,
          jsonPath,
          "error",
          entry.file,
          manifestFile
        )
      );
      continue;
    }
    if (state.activeStack.includes(identity)) {
      state.diagnostics.push(
        diagnostic(
          "WORKER_CYCLE",
          manifestFile,
          jsonPath,
          "error",
          entry.file,
          state.manifestPaths.get(identity)
        )
      );
      continue;
    }
    if (depth + 1 > 2) {
      state.diagnostics.push(
        diagnostic("WORKER_DEPTH_RECOMMENDED", manifestFile, jsonPath, "warning", entry.file)
      );
    }
    if (state.visited.has(identity)) continue;
    const snapshot = await parseNestedManifest(canonicalTarget, manifestFile, jsonPath, state);
    if (state.cancellationError) return;
    if (!snapshot) continue;
    state.visited.add(identity);
    state.manifestPaths.set(
      identity,
      projectRelative(path.dirname(state.appPackagePath), reference.lexicalTarget)
    );
    state.localManifests.push({
      absolutePath: canonicalTarget,
      lexicalPath: reference.lexicalTarget,
      packagePath: projectRelative(state.packageRootPath, reference.lexicalTarget),
      content: snapshot.content,
      document: snapshot.document,
    });
    state.activeStack.push(identity);
    if (state.signal?.aborted) {
      state.cancellationError = new UserCancelError(source);
      state.activeStack.pop();
      return;
    }
    await walkManifest(snapshot.document, reference.lexicalTarget, identity, depth + 1, state);
    state.activeStack.pop();
    if (state.cancellationError) return;
  }
}

function sortDiagnostics(diagnostics: WorkerDiagnostic[]): WorkerDiagnostic[] {
  const severityOrder: Record<WorkerDiagnosticSeverity, number> = { error: 0, warning: 1, info: 2 };
  return diagnostics.sort(
    (left, right) =>
      compareOrdinal(left.manifestPath ?? "", right.manifestPath ?? "") ||
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
  const initialCancellation = cancellationError(options.signal);
  if (initialCancellation) return err(initialCancellation);
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
    const discoveredRoot = await discoverProjectRoot(
      options.projectPath,
      options.resolveAgentFile,
      options.signal
    );
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
  if (options.validateOnlyIfWorkerAgentsConfigured) {
    const shouldValidate = await shouldValidateWorkerAgents(rootManifestPath, options.signal);
    if (shouldValidate.isErr()) return err(shouldValidate.error);
    if (!shouldValidate.value) return ok({ valid: true, diagnostics: [], localManifests: [] });
  }
  const beforeAppPackage = cancellationError(options.signal);
  if (beforeAppPackage) return err(beforeAppPackage);
  let canonicalAppPackagePath: string;
  try {
    canonicalAppPackagePath = await fs.realpath(appPackagePath);
  } catch (error) {
    if (allowMissingRoot && errorCode(error) === "ENOENT") {
      return ok({ valid: true, diagnostics: [], localManifests: [] });
    }
    return err(systemError("WORKER_APP_PACKAGE_READ_FAILED", error));
  }
  const afterAppPackage = cancellationError(options.signal);
  if (afterAppPackage) return err(afterAppPackage);
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
    const readResult = await readDocument(rootManifestPath, options.signal);
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
  const beforeRoot = cancellationError(options.signal);
  if (beforeRoot) return err(beforeRoot);
  try {
    canonicalRootManifestPath = await fs.realpath(rootManifestPath);
  } catch (error) {
    return err(systemError("WORKER_MANIFEST_READ_FAILED", error));
  }
  const afterRoot = cancellationError(options.signal);
  if (afterRoot) return err(afterRoot);
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
    activeStack: [rootIdentity],
    manifestPaths: new Map([
      [rootIdentity, projectRelative(path.dirname(appPackagePath), rootManifestPath)],
    ]),
    loadManifest: options.loadManifest,
    signal: options.signal,
  };
  await walkManifest(rootDocument, rootManifestPath, rootIdentity, 0, state);
  if (state.cancellationError) return err(state.cancellationError);
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

async function readRootManifest(
  projectPath: string,
  signal?: AbortSignal
): Promise<Result<{ path: string; document: Record<string, unknown> }, FxError>> {
  const discoveredRoot = await discoverProjectRoot(projectPath, undefined, signal);
  if (discoveredRoot.isErr()) return err(discoveredRoot.error);
  const rootPath = discoveredRoot.value.path ?? path.resolve(projectPath, rootManifestRelativePath);
  const readResult = await readDocument(rootPath, signal);
  if (readResult.isErr()) return err(readResult.error);
  if (!isDeclarativeAgent(readResult.value)) {
    return err(userError("WORKER_MANIFEST_INVALID"));
  }
  return ok({ path: rootPath, document: readResult.value });
}

function mutationResult(
  changed: boolean,
  reference: WorkerReferenceInput,
  projectPath: string,
  manifestPath: string
): WorkerMutationResult {
  return {
    changed,
    type: reference.type,
    reference: reference.type === "id" ? reference.id : normalizeReferenceKey(reference.file),
    manifestPath: projectRelative(projectPath, manifestPath),
  };
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
  const rootResult = await readRootManifest(options.projectPath, context?.signal);
  if (rootResult.isErr()) return err(rootResult.error);
  const { document, path: rootPath } = rootResult.value;
  const entries = document.worker_agents === undefined ? [] : document.worker_agents;
  if (!Array.isArray(entries)) return err(userError("WORKER_ENTRIES_INVALID"));
  const reference = referenceResult.value;
  const capabilities = workerCapabilities(document.version);
  if (reference.type === "id" ? !capabilities.id : !capabilities.file) {
    return err(userError("WORKER_SCHEMA_UNSUPPORTED"));
  }
  const appPackagePath = path.resolve(options.projectPath, "appPackage");
  let newEntry: Record<string, unknown>;
  if (reference.type === "id") {
    if (
      entries.some(
        (entry) =>
          isRecord(entry) && typeof entry.id === "string" && entry.id.trim() === reference.id
      )
    ) {
      return ok(mutationResult(false, reference, options.projectPath, rootPath));
    }
    newEntry = { id: reference.id };
  } else {
    const fileResult = createFileReference(reference.file, rootPath, appPackagePath);
    if (fileResult.isErr()) return err(fileResult.error);
    const target = await canonicalTargetIfPresent(fileResult.value);
    const cancelledAfterTarget = cancellationError(context?.signal);
    if (cancelledAfterTarget) return err(cancelledAfterTarget);
    if (!target) return err(userError("WORKER_FILE_MISSING_OR_NOT_REGULAR"));
    for (const entry of entries) {
      const equivalent = await equivalentFileEntry(
        entry,
        fileResult.value,
        rootPath,
        appPackagePath,
        target
      );
      const cancelledAfterIdentity = cancellationError(context?.signal);
      if (cancelledAfterIdentity) return err(cancelledAfterIdentity);
      if (equivalent) {
        return ok(mutationResult(false, reference, options.projectPath, rootPath));
      }
    }
    newEntry = { file: fileResult.value.key };
  }
  const candidate: Record<string, unknown> = { ...document, worker_agents: [...entries, newEntry] };
  const validationResult = await validateWorkerAgentGraph({
    projectPath: options.projectPath,
    rootManifestPath: rootPath,
    rootDocument: candidate,
    signal: context?.signal,
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
  return writeResult.isErr()
    ? err(writeResult.error)
    : ok(mutationResult(true, reference, options.projectPath, rootPath));
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
  const rootResult = await readRootManifest(options.projectPath, context?.signal);
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
    const cancelledAfterTarget = cancellationError(context?.signal);
    if (cancelledAfterTarget) return err(cancelledAfterTarget);
  }
  if (document.worker_agents === undefined) {
    return ok(mutationResult(false, requested, options.projectPath, rootPath));
  }
  if (!Array.isArray(document.worker_agents)) return err(userError("WORKER_ENTRIES_INVALID"));
  const remaining: unknown[] = [];
  for (const entry of document.worker_agents) {
    let matches: boolean;
    if (requested.type === "id") {
      matches = isRecord(entry) && typeof entry.id === "string" && entry.id.trim() === requested.id;
    } else {
      matches =
        requestedFile !== undefined &&
        (await equivalentFileEntry(
          entry,
          requestedFile,
          rootPath,
          appPackagePath,
          requestedTarget
        ));
      const cancelledAfterIdentity = cancellationError(context?.signal);
      if (cancelledAfterIdentity) return err(cancelledAfterIdentity);
    }
    if (!matches) remaining.push(entry);
  }
  if (remaining.length === document.worker_agents.length) {
    return ok(mutationResult(false, requested, options.projectPath, rootPath));
  }
  const candidate: Record<string, unknown> = { ...document, worker_agents: remaining };
  const writeResult = await atomicWrite(
    rootPath,
    `${JSON.stringify(candidate, undefined, 2)}\n`,
    context?.signal
  );
  return writeResult.isErr()
    ? err(writeResult.error)
    : ok(mutationResult(true, requested, options.projectPath, rootPath));
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
  const rootResult = await readRootManifest(options.projectPath, context?.signal);
  if (rootResult.isErr()) return err(rootResult.error);
  const entries = rootResult.value.document.worker_agents;
  if (entries === undefined) return ok({ items: [], diagnostics: [] });
  const manifestPath = projectRelative(options.projectPath, rootResult.value.path);
  if (!Array.isArray(entries)) {
    return ok({
      items: [],
      diagnostics: [diagnostic("WORKER_ENTRIES_INVALID", manifestPath, "$.worker_agents")],
    });
  }
  const items: WorkerInspectionItem[] = [];
  const diagnostics: WorkerDiagnostic[] = [];
  for (const [index, entry] of entries.entries()) {
    const jsonPath = `$.worker_agents[${index}]`;
    const shapeErrors = entryShapeErrors(entry);
    if (shapeErrors.length > 0) {
      diagnostics.push(...shapeErrors.map((code) => diagnostic(code, manifestPath, jsonPath)));
      continue;
    }
    if (!isRecord(entry)) continue;
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
        const beforeStat = cancellationError(context?.signal);
        if (beforeStat) return err(beforeStat);
        try {
          exists = (await fs.stat(fileResult.value.lexicalTarget)).isFile();
        } catch {
          exists = false;
        }
        const afterStat = cancellationError(context?.signal);
        if (afterStat) return err(afterStat);
      }
      items.push({ type: "file", file: entry.file, exists });
    } else {
      diagnostics.push(diagnostic("WORKER_REFERENCE_INVALID", manifestPath, jsonPath));
    }
  }
  return ok({ items, diagnostics: sortDiagnostics(diagnostics) });
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
  const result = await validateWorkerAgentGraph({
    projectPath: options.projectPath,
    signal: context?.signal,
  });
  if (result.isErr()) return err(result.error);
  return ok({ valid: result.value.valid, diagnostics: result.value.diagnostics });
}

export function workerValidationError(result: WorkerValidationResult): FxError | undefined {
  const blocking = result.diagnostics.find((item) => item.severity === "error");
  return blocking ? userError(blocking.code) : undefined;
}
