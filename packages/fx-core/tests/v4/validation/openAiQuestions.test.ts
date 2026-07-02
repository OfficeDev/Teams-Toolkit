// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as fs from "fs";
import * as path from "path";
import { assert } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../../../..");
const CREATE_TEMPLATES_ROOT = path.join(REPO_ROOT, "templates/v4/create");
const OPENAI_RENDER_VARS = new Set([
  "openAIKey",
  "azureOpenAIKey",
  "azureOpenAIEndpoint",
  "azureOpenAIDeploymentName",
]);
const OPENAI_OPTION_NAMES = new Set([...OPENAI_RENDER_VARS, "llmService"]);
const OPENAI_REPLACE_MAP_VARS = new Set([
  ...OPENAI_RENDER_VARS,
  "originalOpenAIKey",
  "originalAzureOpenAIKey",
  "useOpenAI",
  "useAzureOpenAI",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(filePath: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error(`${filePath} must contain a JSON object`);
  }
  return parsed;
}

function listFiles(root: string, matches: (name: string) => boolean): string[] {
  const result: string[] = [];
  const walk = (dir: string): void => {
    for (const name of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, name);
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (matches(name)) {
        result.push(fullPath);
      }
    }
  };
  walk(root);
  return result.sort();
}

function questionNames(templateDir: string): Set<string> {
  const questions = readJsonObject(path.join(templateDir, "questions.json"))["questions"];
  const names = new Set<string>();
  if (!Array.isArray(questions)) {
    return names;
  }
  for (const question of questions) {
    if (isRecord(question) && typeof question.name === "string") {
      names.add(question.name);
    }
  }
  return names;
}

function optionPropertyNames(templateDir: string): Set<string> {
  const descriptor = readJsonObject(path.join(templateDir, "descriptor.json"));
  const optionsSchema = descriptor.optionsSchema;
  if (!isRecord(optionsSchema) || !isRecord(optionsSchema.properties)) {
    return new Set<string>();
  }
  return new Set(Object.keys(optionsSchema.properties));
}

function replaceMapEntries(templateDir: string): Map<string, Record<string, unknown>> {
  const descriptor = readJsonObject(path.join(templateDir, "descriptor.json"));
  const replaceMap = descriptor.replaceMap;
  const entries = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(replaceMap)) {
    return entries;
  }
  for (const entry of replaceMap) {
    if (isRecord(entry) && typeof entry.var === "string") {
      entries.set(entry.var, entry);
    }
  }
  return entries;
}

function openAiEnvPlaceholders(templateDir: string): Set<string> {
  const vars = new Set<string>();
  const contentDir = path.join(templateDir, "content");
  if (!fs.existsSync(contentDir)) {
    return vars;
  }
  const envFiles = listFiles(
    contentDir,
    (name) => name.startsWith(".env.") && name.endsWith(".tpl")
  );
  for (const envFile of envFiles) {
    const text = fs.readFileSync(envFile, "utf8");
    for (const match of text.matchAll(/\{\{\{([A-Za-z][A-Za-z0-9]*)\}\}\}/g)) {
      const varName = match[1];
      if (OPENAI_RENDER_VARS.has(varName)) {
        vars.add(varName);
      }
    }
  }
  return vars;
}

function hasOpenAiContent(templateDir: string): boolean {
  const contentDir = path.join(templateDir, "content");
  if (!fs.existsSync(contentDir)) {
    return false;
  }
  for (const contentFile of listFiles(contentDir, () => true)) {
    const relative = path.relative(contentDir, contentFile).replace(/\\/g, "/");
    if (relative.includes("/env/.env.")) {
      continue;
    }
    const text = fs.readFileSync(contentFile, "utf8");
    if (
      /useOpenAI|useAzureOpenAI|openAIKey|azureOpenAIKey|azureOpenAIEndpoint|azureOpenAIDeploymentName|AZURE_OPENAI|OPENAI_API|@microsoft\/teams\.openai|OpenAI/.test(
        text
      )
    ) {
      return true;
    }
  }
  return false;
}

function relativePath(filePath: string): string {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, "/");
}

describe("v4 OpenAI template questions", () => {
  it("OpenAI inputs are asked only when non-env content uses OpenAI or Azure OpenAI", () => {
    const failures: string[] = [];

    for (const descriptorPath of listFiles(
      CREATE_TEMPLATES_ROOT,
      (name) => name === "descriptor.json"
    )) {
      const templateDir = path.dirname(descriptorPath);
      const hasAiContent = hasOpenAiContent(templateDir);
      const placeholders = openAiEnvPlaceholders(templateDir);
      const questions = questionNames(templateDir);
      const optionProperties = optionPropertyNames(templateDir);
      const replaceMap = replaceMapEntries(templateDir);

      if (!hasAiContent) {
        for (const question of [...OPENAI_OPTION_NAMES].sort()) {
          if (questions.has(question)) {
            failures.push(
              `${relativePath(templateDir)}/questions.json must not ask '${question}' without OpenAI content`
            );
          }
          if (optionProperties.has(question)) {
            failures.push(
              `${relativePath(templateDir)}/descriptor.json optionsSchema must not allow '${question}' without OpenAI content`
            );
          }
        }
        for (const entry of [...OPENAI_REPLACE_MAP_VARS].sort()) {
          if (replaceMap.has(entry)) {
            failures.push(
              `${relativePath(templateDir)}/descriptor.json replaceMap must not define '${entry}' without OpenAI content`
            );
          }
        }
        for (const placeholder of [...placeholders].sort()) {
          failures.push(
            `${relativePath(templateDir)}/content env files must not contain '${placeholder}' without OpenAI content`
          );
        }
        continue;
      }

      if (placeholders.size === 0) {
        failures.push(
          `${relativePath(templateDir)}/content env files must contain OpenAI inputs used by OpenAI content`
        );
        continue;
      }

      for (const placeholder of [...placeholders].sort()) {
        if (!questions.has(placeholder)) {
          failures.push(`${relativePath(templateDir)}/questions.json must ask '${placeholder}'`);
        }
        if (!optionProperties.has(placeholder)) {
          failures.push(
            `${relativePath(templateDir)}/descriptor.json optionsSchema must allow '${placeholder}'`
          );
        }
        if (replaceMap.get(placeholder)?.from !== placeholder) {
          failures.push(
            `${relativePath(templateDir)}/descriptor.json replaceMap '${placeholder}' must be sourced from '${placeholder}'`
          );
        }
      }

      if (placeholders.has("openAIKey") && placeholders.has("azureOpenAIKey")) {
        if (!questions.has("llmService")) {
          failures.push(
            `${relativePath(templateDir)}/questions.json must ask 'llmService' to choose OpenAI vs Azure OpenAI`
          );
        }
        if (!optionProperties.has("llmService")) {
          failures.push(
            `${relativePath(templateDir)}/descriptor.json optionsSchema must allow 'llmService'`
          );
        }
        const useOpenAI = replaceMap.get("useOpenAI");
        if (
          useOpenAI?.when !== "llmService == 'llm-service-openai'" ||
          useOpenAI.value !== "true"
        ) {
          failures.push(
            `${relativePath(templateDir)}/descriptor.json replaceMap 'useOpenAI' must be conditional on llmService`
          );
        }
        const useAzureOpenAI = replaceMap.get("useAzureOpenAI");
        if (
          useAzureOpenAI?.when !== "llmService != 'llm-service-openai'" ||
          useAzureOpenAI.value !== "true"
        ) {
          failures.push(
            `${relativePath(templateDir)}/descriptor.json replaceMap 'useAzureOpenAI' must be conditional on llmService`
          );
        }
      }
    }

    assert.deepStrictEqual(failures, []);
  });
});
