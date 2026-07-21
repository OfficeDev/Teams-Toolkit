// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Zhiyu You <zhiyou@microsoft.com>
 * @scenario SCN-DA-CREATE-WITH-MCP-SERVER
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
  expectDcrRegisterWithoutStaticCredentials,
  expectDynamicMCPProject,
  expectNoOAuthRegister,
  learnMCPServerUrl,
  mcpDynamicFlowEnv,
} from "./mcpTestUtils";

// Case 2 & 5: explicit no-auth creates a dynamic MCP project without auth wiring.
class DeclarativeAgentMCPExplicitNoAuth extends CaseFactory {
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

// Case 7: DCR requires no static client ID or secret.
class DeclarativeAgentMCPDynamicOAuth extends CaseFactory {
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
    await expectDynamicMCPProject(projectPath, "oauth-dynamic");
    expectDcrRegisterWithoutStaticCredentials(projectPath);
  }
}

// Case 10: missing server URL fails input validation.
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

        let scaffoldError: unknown;
        try {
          console.log(`[Start] "${command}" in ${testFolder}.`);
          await execAsync(command, {
            cwd: testFolder,
            env: { ...process.env, ...mcpDynamicFlowEnv },
          });
        } catch (error) {
          scaffoldError = error;
        }

        if (scaffoldError === undefined) {
          expect.fail("Expected MCP scaffold without mcpServerUrl to fail.");
        }

        const message =
          scaffoldError instanceof Error
            ? scaffoldError.message
            : String(scaffoldError);
        console.log(
          `[Failed] "${command}" in ${testFolder} with error: ${message}`,
        );
        expect(message).to.include("Scaffold.InputValidationFailed");
        expect(message).to.include("mcpServerUrl");
      });
    });
  }
}

// Case 2: explicit no-auth
const serverUrlOnlyRecord: Record<string, string> = {};
serverUrlOnlyRecord["with-plugin"] = "yes";
serverUrlOnlyRecord["api-plugin-type"] = "mcp";
serverUrlOnlyRecord["mcp-da-server-url"] = learnMCPServerUrl;
serverUrlOnlyRecord["mcp-da-auth-type"] = "none";

new DeclarativeAgentMCPExplicitNoAuth(
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

// Case 7: dynamic OAuth without static credentials
const dynamicOAuthRecord: Record<string, string> = {};
dynamicOAuthRecord["with-plugin"] = "yes";
dynamicOAuthRecord["api-plugin-type"] = "mcp";
dynamicOAuthRecord["mcp-da-server-url"] = learnMCPServerUrl;
dynamicOAuthRecord["mcp-da-auth-type"] = "oauth-dynamic";

new DeclarativeAgentMCPDynamicOAuth(
  Capability.DeclarativeAgent,
  37357429,
  "zhiyou@microsoft.com",
  [],
  ProgrammingLanguage.None,
  {
    skipProvision: true,
  },
  dynamicOAuthRecord,
).test();

// Case 10: missing server URL
const missingUrlRecord: Record<string, string> = {};
missingUrlRecord["with-plugin"] = "yes";
missingUrlRecord["api-plugin-type"] = "mcp";
missingUrlRecord["mcp-da-auth-type"] = "none";

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
