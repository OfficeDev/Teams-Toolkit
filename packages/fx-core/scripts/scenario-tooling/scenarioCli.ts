// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import path from "path";
import { pathToFileURL } from "url";
import { inspectScaffoldCatalog, ScaffoldCatalog } from "../../src/v4/inspection/scaffoldCatalog";
import { authoredDirectoryMetadataSource } from "../../src/v4/inspection/scaffoldMetadataSource";
import {
  acceptScenarioArtifact,
  checkScenarioArtifacts,
  initializeScenario,
  renderScenarioArtifacts,
  ScenarioCommandResult,
  ScenarioRenderResult,
} from "./scenarioCommands";
import { scanScenarioDocuments } from "./scenarioCatalog";
import { launchScenarioArtifacts } from "./scenarioReview";

type ScaffoldKind = "create" | "modify";

export type ScenarioCliArguments =
  | { command: "catalog"; kind: ScaffoldKind }
  | { command: "render" }
  | { command: "review" }
  | { command: "check" }
  | { command: "accept"; scenarioFile: string }
  | {
      command: "init";
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
    };

interface ScenarioCliOutput {
  stdout(message: string): void;
  stderr(message: string): void;
}

interface ScenarioToolingPaths {
  scenarioRoot: string;
  indexPath: string;
  templateRoot: string;
}

interface ScenarioCliDependencies {
  launchArtifacts(artifactPaths: string[]): Promise<void>;
}

const scaffoldKinds: readonly ScaffoldKind[] = ["create", "modify"];

const DEFAULT_OUTPUT: ScenarioCliOutput = {
  stdout: (message) => console.log(message),
  stderr: (message) => console.error(message),
};

const DEFAULT_DEPENDENCIES: ScenarioCliDependencies = {
  launchArtifacts: launchScenarioArtifacts,
};

function parseOptions(arguments_: string[], allowed: Set<string>): Map<string, string> {
  const options = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    if (!name.startsWith("--") || !allowed.has(name)) {
      throw new Error(`Unknown option '${name}'.`);
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for option '${name}'.`);
    }
    if (options.has(name)) {
      throw new Error(`Option '${name}' may be provided only once.`);
    }
    options.set(name, value);
  }
  return options;
}

function requiredOption(options: Map<string, string>, name: string): string {
  const value = options.get(name);
  if (value === undefined) {
    throw new Error(`Missing required option '${name}'.`);
  }
  return value;
}

function parseKind(options: Map<string, string>): ScaffoldKind {
  const value = options.get("--kind") ?? "create";
  if (value !== "create" && value !== "modify") {
    throw new Error("Expected --kind to be create or modify.");
  }
  return value;
}

export function parseScenarioCliArguments(arguments_: string[]): ScenarioCliArguments {
  const command = arguments_[0];
  if (command === undefined) {
    throw new Error("Expected one scenario command.");
  }
  if (command === "catalog") {
    const options = parseOptions(arguments_.slice(1), new Set(["--kind"]));
    return { command, kind: parseKind(options) };
  }
  if (command === "render" || command === "review" || command === "check") {
    parseOptions(arguments_.slice(1), new Set());
    return { command };
  }
  if (command === "accept") {
    const options = parseOptions(arguments_.slice(1), new Set(["--file"]));
    return {
      command,
      scenarioFile: requiredOption(options, "--file"),
    };
  }
  if (command === "init") {
    const options = parseOptions(
      arguments_.slice(1),
      new Set([
        "--group",
        "--slug",
        "--title",
        "--scenario-id",
        "--pm-owner",
        "--engineer-owner",
        "--template-id",
        "--timestamp",
        "--proposal",
        "--redesign-trigger",
      ])
    );
    const result: ScenarioCliArguments = {
      command,
      group: requiredOption(options, "--group"),
      slug: requiredOption(options, "--slug"),
      title: requiredOption(options, "--title"),
      scenarioId: requiredOption(options, "--scenario-id"),
      pmOwner: requiredOption(options, "--pm-owner"),
      engineerOwner: requiredOption(options, "--engineer-owner"),
      templateId: requiredOption(options, "--template-id"),
      timestamp: requiredOption(options, "--timestamp"),
    };
    const proposalKey = options.get("--proposal");
    if (proposalKey !== undefined) {
      result.proposalKey = proposalKey;
    }
    const redesignTrigger = options.get("--redesign-trigger");
    if (redesignTrigger !== undefined) {
      result.redesignTrigger = redesignTrigger;
    }
    return result;
  }
  throw new Error(`Unknown scenario command '${command}'.`);
}

function defaultPaths(): ScenarioToolingPaths {
  const repositoryRoot = path.resolve(__dirname, "../../../..");
  const scenarioRoot = path.join(repositoryRoot, "docs", "01-product", "scenarios");
  return {
    scenarioRoot,
    indexPath: path.join(scenarioRoot, "index.html"),
    templateRoot: path.join(repositoryRoot, "templates", "v4"),
  };
}

function loadCatalog(paths: ScenarioToolingPaths, kind: ScaffoldKind): ScaffoldCatalog {
  const source = authoredDirectoryMetadataSource(paths.templateRoot);
  const inspected = inspectScaffoldCatalog(source, kind);
  if (inspected.isErr()) {
    throw inspected.error;
  }
  return inspected.value;
}

function loadCatalogs(
  paths: ScenarioToolingPaths,
  kinds: readonly ScaffoldKind[]
): ScaffoldCatalog[] {
  return kinds.map((kind) => loadCatalog(paths, kind));
}

async function loadBoundCatalogs(paths: ScenarioToolingPaths): Promise<ScaffoldCatalog[]> {
  const scenarioCatalog = await scanScenarioDocuments(paths.scenarioRoot);
  const kinds = new Set<ScaffoldKind>();
  for (const document of scenarioCatalog.documents) {
    if (document.binding !== undefined) {
      kinds.add(document.binding.kind);
    }
  }
  return loadCatalogs(
    paths,
    scaffoldKinds.filter((kind) => kinds.has(kind))
  );
}

function printResult(result: ScenarioCommandResult, output: ScenarioCliOutput): number {
  for (const item of result.diagnostics) {
    const location = item.relativePath.length === 0 ? "" : ` ${item.relativePath}`;
    const line = `${item.severity.toUpperCase()} ${item.code}${location}: ${item.message}`;
    if (item.severity === "error") {
      output.stderr(line);
    } else {
      output.stdout(line);
    }
  }
  return result.diagnostics.some((item) => item.severity === "error") ? 1 : 0;
}

function printArtifactChanges(result: ScenarioRenderResult, output: ScenarioCliOutput): void {
  for (const artifact of result.updatedArtifacts) {
    output.stdout(`UPDATED ${artifact}`);
  }
  for (const artifact of result.removedArtifacts) {
    output.stdout(`REMOVED ${artifact}`);
  }
  if (result.updatedArtifacts.length === 0 && result.removedArtifacts.length === 0) {
    output.stdout("No generated scenario artifacts changed.");
  }
}

function reviewArtifacts(result: ScenarioRenderResult, paths: ScenarioToolingPaths): string[] {
  const indexRelativePath = path
    .relative(paths.scenarioRoot, paths.indexPath)
    .split(path.sep)
    .join("/");
  const updatedScenarioHtml = result.updatedArtifacts.filter(
    (artifact) => artifact.endsWith(".html") && artifact !== indexRelativePath
  );
  const artifacts = updatedScenarioHtml.length > 0 ? updatedScenarioHtml : [indexRelativePath];
  return artifacts.map((artifact) => path.resolve(paths.scenarioRoot, artifact));
}

export async function runScenarioCli(
  arguments_: string[],
  output: ScenarioCliOutput = DEFAULT_OUTPUT,
  paths: ScenarioToolingPaths = defaultPaths(),
  dependencies: ScenarioCliDependencies = DEFAULT_DEPENDENCIES
): Promise<number> {
  const parsed = parseScenarioCliArguments(arguments_);
  if (parsed.command === "init") {
    return printResult(
      await initializeScenario({
        scenarioRoot: paths.scenarioRoot,
        group: parsed.group,
        slug: parsed.slug,
        title: parsed.title,
        scenarioId: parsed.scenarioId,
        pmOwner: parsed.pmOwner,
        engineerOwner: parsed.engineerOwner,
        templateId: parsed.templateId,
        timestamp: parsed.timestamp,
        proposalKey: parsed.proposalKey,
        redesignTrigger: parsed.redesignTrigger,
      }),
      output
    );
  }
  if (parsed.command === "catalog") {
    const scaffoldCatalog = loadCatalog(paths, parsed.kind);
    output.stdout(JSON.stringify(scaffoldCatalog, undefined, 2));
    return 0;
  }
  const scaffoldCatalogs =
    parsed.command === "check"
      ? loadCatalogs(paths, ["create", "modify"])
      : await loadBoundCatalogs(paths);
  const commandOptions = {
    scenarioRoot: paths.scenarioRoot,
    indexPath: paths.indexPath,
    scaffoldCatalogs,
  };
  if (parsed.command === "render" || parsed.command === "review") {
    const result = await renderScenarioArtifacts(commandOptions);
    const exitCode = printResult(result, output);
    if (parsed.command === "render" || exitCode !== 0) {
      return exitCode;
    }
    printArtifactChanges(result, output);
    const artifacts = reviewArtifacts(result, paths);
    if (artifacts.length === 0) {
      return 0;
    }
    try {
      await dependencies.launchArtifacts(artifacts);
      return 0;
    } catch {
      const reviewUrls = artifacts.map((artifact) => pathToFileURL(artifact).href);
      output.stderr(
        `ERROR ScenarioReviewOpenFailed: Generated artifacts were written but could not be opened. Review manually: ${reviewUrls.join(", ")}`
      );
      return 1;
    }
  }
  if (parsed.command === "check") {
    return printResult(await checkScenarioArtifacts(commandOptions), output);
  }
  return printResult(
    await acceptScenarioArtifact({
      ...commandOptions,
      scenarioFile: path.resolve(paths.scenarioRoot, parsed.scenarioFile),
    }),
    output
  );
}

if (require.main === module) {
  runScenarioCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Scenario command failed.";
      DEFAULT_OUTPUT.stderr(message);
      process.exitCode = 1;
    });
}
