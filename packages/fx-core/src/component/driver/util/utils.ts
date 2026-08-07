// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Inputs } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import path from "path";
import semver from "semver";
import { parseDocument } from "yaml";
import { TOOLS } from "../../../common/globalVars";
import { YamlFileNames } from "../../../common/versionMetadata";
import { DriverContext } from "../interface/commonArgs";

// Needs to validate the parameters outside of the function
export function loadStateFromEnv(
  outputEnvVarNames: Map<string, string>
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  for (const [propertyName, envVarName] of outputEnvVarNames) {
    result[propertyName] = process.env[envVarName];
  }
  return result;
}

// Needs to validate the parameters outside of the function
export function mapStateToEnv(
  state: Record<string, string>,
  outputEnvVarNames: Map<string, string>,
  excludedProperties?: string[]
): Map<string, string> {
  const result = new Map<string, string>();
  for (const [outputName, envVarName] of outputEnvVarNames) {
    if (!excludedProperties?.includes(outputName)) {
      result.set(envVarName, state[outputName]);
    }
  }
  return result;
}

export function createDriverContext(inputs: Inputs): DriverContext {
  const driverContext: DriverContext = {
    azureAccountProvider: TOOLS.tokenProvider.azureAccountProvider,
    m365TokenProvider: TOOLS.tokenProvider.m365TokenProvider,
    signal: inputs.abortSignal as AbortSignal | undefined,
    ui: TOOLS.ui,
    progressBar: undefined,
    logProvider: TOOLS.logProvider,
    telemetryReporter: TOOLS.telemetryReporter,
    projectPath: inputs.projectPath!,
    platform: inputs.platform,
  };
  return driverContext;
}

export async function updateVersionForTeamsAppYamlFile(projectPath: string): Promise<void> {
  for (const yamlFileName of YamlFileNames) {
    const ymlPath = path.join(projectPath, yamlFileName);
    if (await fs.pathExists(ymlPath)) {
      const ymlContent = await fs.readFile(ymlPath, "utf-8");
      const document = parseDocument(ymlContent);
      const version = (document.get("version") as string).slice(1);
      const validVersion = semver.coerce(version);
      if (validVersion && semver.lte(validVersion, "1.7.0")) {
        if (semver.lte(validVersion, "1.6.0")) {
          convertOutputJsonPathToOutputFolder(document);
        }

        if (semver.eq(validVersion, "1.3.0")) {
          renameClientSecret(document);
        }

        document.set("version", "v1.8");
        const docContent = document.toString();
        // yaml-language-server can be like https://aka.ms/teams-toolkit/1.0.0/yaml.schema.json and https://aka.ms/teams-toolkit/v1.2/yaml.schema.json
        const updatedContent = docContent.replace(
          /(yaml-language-server:\s*\$schema=https:\/\/aka\.ms\/teams-toolkit\/)(v?\d+\.\d+(?:\.\d+)?)(\/yaml\.schema\.json)/,
          "$1v1.8$3"
        );
        await fs.writeFile(ymlPath, updatedContent, "utf8");
      }
    }
  }
}

function processSectionsByUse(
  document: any,
  targetUseValue: string,
  processor: (withNode: any) => void
): void {
  const sections = ["provision", "publish"];
  sections.forEach((sectionKey) => {
    const section = document.get(sectionKey, true);
    if (section && Array.isArray(section.items)) {
      section.items.forEach((item: any) => {
        if (item && item.get("uses", true)?.value === targetUseValue) {
          const withNode = item.get("with", true);
          if (withNode) {
            processor(withNode);
          }
        }
      });
    }
  });
}

function convertOutputJsonPathToOutputFolder(document: any): void {
  processSectionsByUse(document, "teamsApp/zipAppPackage", (withNode) => {
    const outputJsonPath = withNode.get("outputJsonPath", true)?.value;
    if (typeof outputJsonPath === "string") {
      withNode.set("outputFolder", path.dirname(outputJsonPath));
      withNode.delete("outputJsonPath");
    }
  });
}

function renameClientSecret(document: any): void {
  processSectionsByUse(document, "apiKey/register", (withNode) => {
    const secretValue = withNode.get("clientSecret", true)?.value;
    if (typeof secretValue === "string") {
      withNode.set("primaryClientSecret", secretValue);
      withNode.delete("clientSecret");
    }
  });
}
