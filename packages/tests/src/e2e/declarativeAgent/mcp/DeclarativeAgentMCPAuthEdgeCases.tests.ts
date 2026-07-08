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
import {
  createMCPProjectWithEnv,
  expectDynamicMCPProject,
  expectNoOAuthRegister,
  learnMCPServerUrl,
  mcpDynamicFlowEnv,
} from "./mcpTestUtils";

// Case 2 & 5: With learn.microsoft.com/api/mcp (a public no-auth server that
// returns tools), these cases verify the server-URL-only flow produces a valid
// scaffold with tools and no auth block — even when no --mcp-da-auth-type is given.
class DeclarativeAgentMCPServerUrlOnly extends CaseFactory {
  public override async onCreate(
    appName: string,
    testFolder: string,
    capability: Capability,
    programmingLanguage?: ProgrammingLanguage,
    custimized?: Record<string, string>,
  ): Promise<void> {
    await createMCPProjectWithEnv(
      testFolder,
      appName,
      capability,
      programmingLanguage,
      custimized,
      mcpDynamicFlowEnv,
    );
  }

  public override async onAfter(projectPath: string): Promise<void> {
    await fs.remove(projectPath);
  }

  public override async onAfterCreate(projectPath: string): Promise<void> {
    await expectDynamicMCPProject(projectPath);
    expectNoOAuthRegister(projectPath);
  }
}

// Case 7: --mcp-da-auth-type omitted with a no-auth server — project should
// succeed because auth probe detects no auth requirement.
class DeclarativeAgentMCPNoAuthTypeNeeded extends CaseFactory {
  public override async onCreate(
    appName: string,
    testFolder: string,
    capability: Capability,
    programmingLanguage?: ProgrammingLanguage,
    custimized?: Record<string, string>,
  ): Promise<void> {
    await createMCPProjectWithEnv(
      testFolder,
      appName,
      capability,
      programmingLanguage,
      custimized,
      mcpDynamicFlowEnv,
    );
  }

  public override async onAfter(projectPath: string): Promise<void> {
    await fs.remove(projectPath);
  }

  public override async onAfterCreate(projectPath: string): Promise<void> {
    await expectDynamicMCPProject(projectPath);
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
          await execAsync(command, {
            cwd: testFolder,
            env: { ...process.env, ...mcpDynamicFlowEnv },
          });
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
serverUrlOnlyRecord["mcp-da-server-url"] = learnMCPServerUrl;

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
noAuthTypeRecord["mcp-da-server-url"] = learnMCPServerUrl;
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
