// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import { TemplateFileEntry } from "../../../../src/v4/model/dataModel";
import { createInMemoryRuntime } from "../../../../src/v4/runtime/inMemoryRuntime";
import { ScaffoldRequest, scaffold } from "../../../../src/v4/runtime/scaffold";
import { assert } from "vitest";

export type V4TemplateKind = "create" | "modify";

export interface LoadedV4Package {
  packageDir: string;
  descriptor: unknown;
  questions: unknown;
  pipeline: unknown;
  content: TemplateFileEntry[];
}

export interface RunV4PackageOptions {
  answers?: ScaffoldRequest["answers"];
  callerFloor?: ScaffoldRequest["callerFloor"];
  existing?: string[];
  seedFiles?: Record<string, string | Buffer>;
  targetPath?: string;
}

export type V4ScenarioOutcome = Awaited<ReturnType<typeof unwrapOutcome>>;

const REPO_ROOT = path.resolve(__dirname, "../../../../../..");

export function loadV4Package(kind: V4TemplateKind, templateId: string): LoadedV4Package {
  const packageDir = path.join(REPO_ROOT, "templates/v4", kind, ...templateId.split("/"));
  return {
    packageDir,
    descriptor: readJsonFile(path.join(packageDir, "descriptor.json")),
    questions: readOptionalJsonFile(path.join(packageDir, "questions.json")),
    pipeline: readJsonFile(path.join(packageDir, "pipeline.json")),
    content: loadContent(packageDir),
  };
}

export async function runV4Package(
  templatePackage: LoadedV4Package,
  options: RunV4PackageOptions = {}
): Promise<{ files: Map<string, Buffer>; outcome: V4ScenarioOutcome }> {
  const runtime = createInMemoryRuntime();
  for (const [filePath, body] of Object.entries(options.seedFiles ?? {})) {
    runtime.files.set(filePath, typeof body === "string" ? Buffer.from(body, "utf8") : body);
  }

  const request: ScaffoldRequest = {
    descriptor: templatePackage.descriptor,
    pipeline: templatePackage.pipeline,
    content: templatePackage.content,
    answers: options.answers ?? {},
    callerFloor: options.callerFloor ?? { appName: "TestApp", language: "common" },
    targetDir: { path: options.targetPath ?? "/out", existing: options.existing ?? [] },
  };
  const result = await scaffold(request, runtime);
  return { files: runtime.files, outcome: unwrapOutcome(result) };
}

export function text(files: Map<string, Buffer>, filePath: string): string {
  const buf = files.get(filePath);
  assert.isDefined(buf, `expected '${filePath}' to exist`);
  return (buf ?? Buffer.from("", "utf8")).toString("utf8");
}

export function readJsonObject(
  files: Map<string, Buffer>,
  filePath: string
): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text(files, filePath));
  assert.isTrue(isRecord(parsed));
  return parsed;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

export function recordProperty(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown> {
  const property = value[key];
  assert.isTrue(isRecord(property));
  return property;
}

export function recordArrayProperty(
  value: Record<string, unknown>,
  key: string
): Record<string, unknown>[] {
  const property = value[key];
  assert.isTrue(isRecordArray(property));
  return property;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readOptionalJsonFile(filePath: string): unknown {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  return readJsonFile(filePath);
}

function loadContent(packageDir: string): TemplateFileEntry[] {
  const root = path.join(packageDir, "content");
  const entries: TemplateFileEntry[] = [];
  if (!fs.existsSync(root)) {
    return entries;
  }
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) {
        walk(full);
      } else {
        const relativePath = path.relative(root, full).replace(/\\/g, "/");
        if (isLocalUserEnvFile(relativePath)) {
          continue;
        }
        entries.push({
          path: relativePath,
          data: fs.readFileSync(full),
        });
      }
    }
  };
  walk(root);
  return entries;
}

function isLocalUserEnvFile(filePath: string): boolean {
  return /^(.+\/)?env\/\.env\..+\.user$/.test(filePath);
}

function unwrapOutcome(result: Awaited<ReturnType<typeof scaffold>>) {
  assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected ok");
  return result._unsafeUnwrap();
}
