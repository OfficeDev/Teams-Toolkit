// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Zhiyu You <zhiyou@microsoft.com>
 */

import { ProgrammingLanguage } from "@microsoft/teamsfx-core";
import { it } from "@microsoft/extra-shot-mocha";
import { expect } from "chai";
import * as fs from "fs-extra";
import * as path from "path";
import { execAsync } from "../../../utils/commonUtils";
import { Capability } from "../../../utils/constants";
import { CaseFactory } from "../../caseFactory";
import { getTestFolder, getUniqueAppName } from "../../commonUtils";

// Case 2 & 5: With learn.microsoft.com/api/mcp (a public no-auth server that
// returns tools), these cases verify the server-URL-only flow produces a valid
// scaffold with tools and no auth block — even when no --mcp-da-auth-type is given.
class DeclarativeAgentMCPServerUrlOnly extends CaseFactory {
  public override async onAfter(projectPath: string): Promise<void> {
    await fs.remove(projectPath);
  }

  public override async onAfterCreate(projectPath: string): Promise<void> {
    const appPackage = path.join(projectPath, "appPackage");

    // ai-plugin.json should have functions and runtime from auto-fetch
    const aiPlugin = await fs.readJSON(path.join(appPackage, "ai-plugin.json"));
    expect(aiPlugin.functions).to.be.an("array").that.is.not.empty;
    expect(aiPlugin.runtimes).to.be.an("array").that.is.not.empty;
    expect(aiPlugin.runtimes[0].type).to.equal("RemoteMCPServer");
    // No auth block since server doesn't require auth
    expect(aiPlugin.runtimes[0].auth).to.be.undefined;

    // mcp-tools-1.json should exist with fetched tools
    const mcpToolsPath = path.join(appPackage, "mcp-tools-1.json");
    expect(fs.pathExistsSync(mcpToolsPath)).to.be.true;
    const mcpTools = await fs.readJSON(mcpToolsPath);
    expect(mcpTools.tools).to.be.an("array").that.is.not.empty;

    // No oauth/register in yml
    const ymlPath = path.join(projectPath, "m365agents.yml");
    if (fs.pathExistsSync(ymlPath)) {
      const ymlContent = fs.readFileSync(ymlPath, "utf8");
      expect(ymlContent).to.not.include("oauth/register");
    }
  }
}

// Case 7: --mcp-da-auth-type omitted with a no-auth server — project should
// succeed because auth probe detects no auth requirement.
class DeclarativeAgentMCPNoAuthTypeNeeded extends CaseFactory {
  public override async onAfter(projectPath: string): Promise<void> {
    await fs.remove(projectPath);
  }

  public override async onAfterCreate(projectPath: string): Promise<void> {
    // Project should be created successfully with no auth blocks
    const appPackage = path.join(projectPath, "appPackage");
    const aiPluginPath = path.join(appPackage, "ai-plugin.json");
    expect(fs.pathExistsSync(aiPluginPath)).to.be.true;
    const aiPlugin = await fs.readJSON(aiPluginPath);
    expect(aiPlugin.functions).to.be.an("array").that.is.not.empty;
    expect(aiPlugin.runtimes).to.be.an("array").that.is.not.empty;
    // No auth — server doesn't require it
    expect(aiPlugin.runtimes[0].auth).to.be.undefined;
  }
}

// Case 10: Missing server URL — should fail or skip MCP generation
class DeclarativeAgentMCPMissingServerUrl extends CaseFactory {
  public override test() {
    const {
      capability,
      testPlanCaseId,
      author,
      programmingLanguage,
      custimized,
    } = this;
    describe(`template Test: ${capability} - ${programmingLanguage}`, function () {
      const testFolder = getTestFolder();
      const appName = getUniqueAppName();
      const projectPath = path.resolve(testFolder, appName);

      after(async function () {
        await fs.remove(projectPath);
      });

      it(capability, { testPlanCaseId, author }, async function () {
        const languageParam =
          programmingLanguage !== undefined &&
          programmingLanguage !== ProgrammingLanguage.None
            ? `--programming-language ${programmingLanguage}`
            : "";
        const customParams = Object.entries(custimized ?? {})
          .map(([key, value]) => `--${key} ${value}`)
          .join(" ");
        const command =
          `atk new --interactive false --debug --app-name ${appName} ` +
          `--capability ${capability} ${languageParam} ${customParams}`;

        try {
          console.log(`[Start] "${command}" in ${testFolder}.`);
          await execAsync(command, { cwd: testFolder, env: process.env });
          expect.fail("Expected MCP scaffold without mcpServerUrl to fail.");
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.log(
            `[Failed] "${command}" in ${testFolder} with error: ${message}`,
          );
          expect(message).to.include("Scaffold.InputValidationFailed");
          expect(message).to.include("mcpServerUrl");
        }
      });
    });
  }
}

// Case 2: Server URL only, no auth-type — auto-fetch succeeds on no-auth server
const serverUrlOnlyRecord: Record<string, string> = {};
serverUrlOnlyRecord["with-plugin"] = "yes";
serverUrlOnlyRecord["api-plugin-type"] = "mcp";
serverUrlOnlyRecord["mcp-da-server-url"] =
  "https://learn.microsoft.com/api/mcp";

new DeclarativeAgentMCPServerUrlOnly(
  Capability.DeclarativeAgent,
  37357430,
  "zhiyou@microsoft.com",
  [],
  ProgrammingLanguage.None,
  {
    skipProvision: true,
  },
  serverUrlOnlyRecord,
).test();

// Case 7: --mcp-da-auth-type omitted — succeeds with no-auth server
const noAuthTypeRecord: Record<string, string> = {};
noAuthTypeRecord["with-plugin"] = "yes";
noAuthTypeRecord["api-plugin-type"] = "mcp";
noAuthTypeRecord["mcp-da-server-url"] = "https://learn.microsoft.com/api/mcp";
// Intentionally omit mcp-da-auth-type

new DeclarativeAgentMCPNoAuthTypeNeeded(
  Capability.DeclarativeAgent,
  37357429,
  "zhiyou@microsoft.com",
  [],
  ProgrammingLanguage.None,
  {
    skipProvision: true,
  },
  noAuthTypeRecord,
).test();

// Case 10: Missing server URL
const missingUrlRecord: Record<string, string> = {};
missingUrlRecord["with-plugin"] = "yes";
missingUrlRecord["api-plugin-type"] = "mcp";
// Intentionally omit mcp-da-server-url

new DeclarativeAgentMCPMissingServerUrl(
  Capability.DeclarativeAgent,
  37357425,
  "zhiyou@microsoft.com",
  [],
  ProgrammingLanguage.None,
  {
    skipProvision: true,
  },
  missingUrlRecord,
).test();
