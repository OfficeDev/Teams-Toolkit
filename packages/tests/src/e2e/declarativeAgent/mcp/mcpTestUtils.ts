// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ProgrammingLanguage } from "@microsoft/teamsfx-core";
import { expect } from "chai";
import * as fs from "fs-extra";
import * as path from "path";
import { Capability } from "../../../utils/constants";
import { Executor } from "../../../utils/executor";

export const learnMCPServerUrl = "https://learn.microsoft.com/api/mcp";

// The dynamic-discovery `ai-plugin.json` (empty functions and no
// mcp_tool_description) is produced only by the v4 create template, so this
// flow requires v4 on. When v4 is off, `atk new` falls back to the legacy
// generator which always emits a static (mcp_tool_description +
// mcp-tools-1.json) scaffold regardless of DT.
export const mcpDynamicFlowEnv: Record<string, string> = {
  TEAMSFX_V4_ENABLED: "true",
  TEAMSFX_MCP_FOR_DA_DT: "true",
};

// Static scaffold comes from the legacy generator (v4 off), independent of DT.
export const mcpStaticFlowEnv: Record<string, string> = {
  TEAMSFX_V4_ENABLED: "false",
  TEAMSFX_MCP_FOR_DA_DT: "false",
};

function programmingLanguageParam(language?: ProgrammingLanguage): string {
  if (language === ProgrammingLanguage.CSharp) {
    return "--runtime dotnet";
  }
  if (
    language !== undefined &&
    language !== ProgrammingLanguage.Common &&
    language !== ProgrammingLanguage.None
  ) {
    return `--programming-language ${language}`;
  }
  return "";
}

export async function createMCPProjectWithEnv(
  workspace: string,
  appName: string,
  capability: Capability,
  language: ProgrammingLanguage | undefined,
  customized: Record<string, string> = {},
  env: Record<string, string>,
): Promise<void> {
  const command =
    `atk new --interactive false --debug --app-name ${appName} --capability ${capability} ` +
    `${programmingLanguageParam(language)} ` +
    Object.entries(customized)
      .map(([key, value]) => `--${key} ${value}`)
      .join(" ");
  const result = await Executor.execute(command, workspace, {
    ...process.env,
    ...env,
  });
  expect(result.success || fs.pathExistsSync(path.resolve(workspace, appName)))
    .to.be.true;
}

export async function expectDynamicMCPProject(
  projectPath: string,
): Promise<void> {
  const appPackage = path.join(projectPath, "appPackage");
  const aiPlugin = await fs.readJSON(path.join(appPackage, "ai-plugin.json"));
  const runtime = aiPlugin.runtimes[0];

  expect(aiPlugin.functions).to.be.an("array").that.is.empty;
  expect(runtime.type).to.equal("RemoteMCPServer");
  expect(runtime.spec).to.deep.equal({ url: learnMCPServerUrl });
  expect(runtime.run_for_functions).to.deep.equal(["*"]);
  expect(runtime.auth.type).to.equal("None");

  expect(fs.pathExistsSync(path.join(appPackage, "mcp-tools-1.json"))).to.be
    .false;

  const daManifest = await fs.readJSON(
    path.join(appPackage, "declarativeAgent.json"),
  );
  expect(daManifest.actions).to.be.an("array").that.is.not.empty;
  expect(daManifest.actions[0].file).to.equal("ai-plugin.json");
}

export async function expectStaticMCPProject(
  projectPath: string,
): Promise<void> {
  const appPackage = path.join(projectPath, "appPackage");
  const aiPlugin = await fs.readJSON(path.join(appPackage, "ai-plugin.json"));
  const runtime = aiPlugin.runtimes[0];

  expect(aiPlugin.functions).to.be.an("array").that.is.not.empty;
  expect(runtime.type).to.equal("RemoteMCPServer");
  expect(runtime.spec.url).to.be.a("string").that.is.not.empty;
  expect(runtime.spec).to.not.have.property("enable_dynamic_discovery");
  expect(runtime.spec.mcp_tool_description.file).to.equal("mcp-tools-1.json");
  expect(runtime.auth).to.be.undefined;

  const mcpToolsPath = path.join(appPackage, "mcp-tools-1.json");
  expect(fs.pathExistsSync(mcpToolsPath)).to.be.true;
  const mcpTools = await fs.readJSON(mcpToolsPath);
  expect(mcpTools.tools).to.be.an("array").that.is.not.empty;
}

export function expectNoOAuthRegister(projectPath: string): void {
  const ymlPath = path.join(projectPath, "m365agents.yml");
  if (fs.pathExistsSync(ymlPath)) {
    const ymlContent = fs.readFileSync(ymlPath, "utf8");
    expect(ymlContent).to.not.include("oauth/register");
  }
}
