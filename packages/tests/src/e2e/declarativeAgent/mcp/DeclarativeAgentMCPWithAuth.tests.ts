// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Zhiyu You <zhiyou@microsoft.com>
 */

import { ProgrammingLanguage } from "@microsoft/teamsfx-core";
import * as fs from "fs-extra";
import { Capability } from "../../../utils/constants";
import { CaseFactory } from "../../caseFactory";
import {
  mcpToolsFilePath,
  writeMCPToolsFixture,
  removeMCPToolsFixture,
} from "./mcpToolsFixture";
import {
  createMCPProjectWithEnv,
  expectNoOAuthRegister,
  expectStaticMCPProject,
  learnMCPServerUrl,
  mcpStaticFlowEnv,
} from "./mcpTestUtils";

// Verification for MCP projects when --mcp-da-auth-type is specified.
// Note: learn.microsoft.com/api/mcp is a public no-auth server, so even when
// --mcp-da-auth-type is passed, the server probe detects no auth requirement
// and the project is scaffolded without auth blocks. This is correct behavior —
// auth is driven by server probe, not solely by the CLI flag.
// To test actual auth injection, an auth-required MCP server is needed.
class DeclarativeAgentMCPWithAuth extends CaseFactory {
  private authType: "oauth" | "entra-sso";

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
      mcpStaticFlowEnv,
    );
  }

  public override async onBefore(): Promise<void> {
    await writeMCPToolsFixture();
  }

  public override async onAfter(projectPath: string): Promise<void> {
    await fs.remove(projectPath);
    await removeMCPToolsFixture();
  }

  public constructor(
    authType: "oauth" | "entra-sso",
    testPlanCaseId: number,
    author: string,
    custimized: Record<string, string>,
  ) {
    super(
      Capability.DeclarativeAgent,
      testPlanCaseId,
      author,
      [],
      ProgrammingLanguage.None,
      { skipProvision: true },
      custimized,
    );
    this.authType = authType;
  }

  public override async onAfterCreate(projectPath: string): Promise<void> {
    await expectStaticMCPProject(projectPath);
    expectNoOAuthRegister(projectPath);
  }
}

// Case 3: atk new — MCP with OAuth auth (server URL, auth detected)
const oauthRecord: Record<string, string> = {};
oauthRecord["with-plugin"] = "yes";
oauthRecord["api-plugin-type"] = "mcp";
oauthRecord["mcp-da-server-url"] = learnMCPServerUrl;
oauthRecord["mcp-da-auth-type"] = "oauth";

new DeclarativeAgentMCPWithAuth(
  "oauth",
  37357426,
  "zhiyou@microsoft.com",
  oauthRecord,
).test();

// Case 4: atk new — MCP with EntraSSO auth
const entraRecord: Record<string, string> = {};
entraRecord["with-plugin"] = "yes";
entraRecord["api-plugin-type"] = "mcp";
entraRecord["mcp-da-server-url"] = learnMCPServerUrl;
entraRecord["mcp-da-auth-type"] = "entra-sso";

new DeclarativeAgentMCPWithAuth(
  "entra-sso",
  37357431,
  "zhiyou@microsoft.com",
  entraRecord,
).test();

// Case 8: atk new — MCP with OAuth auth + tools from file
const oauthFileRecord: Record<string, string> = {};
oauthFileRecord["with-plugin"] = "yes";
oauthFileRecord["api-plugin-type"] = "mcp";
oauthFileRecord["mcp-da-server-url"] = learnMCPServerUrl;
oauthFileRecord["mcp-da-auth-type"] = "oauth";
oauthFileRecord["mcp-tools-file-path"] = mcpToolsFilePath;

new DeclarativeAgentMCPWithAuth(
  "oauth",
  37357426,
  "zhiyou@microsoft.com",
  oauthFileRecord,
).test();

// Case 9: atk new — MCP with EntraSSO auth + tools from file
const entraFileRecord: Record<string, string> = {};
entraFileRecord["with-plugin"] = "yes";
entraFileRecord["api-plugin-type"] = "mcp";
entraFileRecord["mcp-da-server-url"] = learnMCPServerUrl;
entraFileRecord["mcp-da-auth-type"] = "entra-sso";
entraFileRecord["mcp-tools-file-path"] = mcpToolsFilePath;

new DeclarativeAgentMCPWithAuth(
  "entra-sso",
  37357431,
  "zhiyou@microsoft.com",
  entraFileRecord,
).test();
