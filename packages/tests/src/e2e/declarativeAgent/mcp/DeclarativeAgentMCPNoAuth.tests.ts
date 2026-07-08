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
  expectDynamicMCPProject,
  expectNoOAuthRegister,
  expectStaticMCPProject,
  learnMCPServerUrl,
  mcpDynamicFlowEnv,
  mcpStaticFlowEnv,
} from "./mcpTestUtils";

// Case 1: atk new — MCP with no-auth server URL (auto-fetch tools)
class DeclarativeAgentMCPNoAuthNew extends CaseFactory {
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

// Case 6: atk new — MCP static flow with tools loaded from file (no auth)
class DeclarativeAgentMCPNoAuthFile extends CaseFactory {
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

  public override async onAfterCreate(projectPath: string): Promise<void> {
    await expectStaticMCPProject(projectPath);
  }
}

// Case 1: No-auth server URL — auto-fetch
const noAuthUrlRecord: Record<string, string> = {};
noAuthUrlRecord["with-plugin"] = "yes";
noAuthUrlRecord["api-plugin-type"] = "mcp";
noAuthUrlRecord["mcp-da-server-url"] = learnMCPServerUrl;

new DeclarativeAgentMCPNoAuthNew(
  Capability.DeclarativeAgent,
  37357419,
  "zhiyou@microsoft.com",
  [],
  ProgrammingLanguage.None,
  {
    skipProvision: true,
  },
  noAuthUrlRecord,
).test();

// Case 6: No-auth with tools from file
const noAuthFileRecord: Record<string, string> = {};
noAuthFileRecord["with-plugin"] = "yes";
noAuthFileRecord["api-plugin-type"] = "mcp";
noAuthFileRecord["mcp-da-server-url"] = learnMCPServerUrl;
noAuthFileRecord["mcp-tools-file-path"] = mcpToolsFilePath;

new DeclarativeAgentMCPNoAuthFile(
  Capability.DeclarativeAgent,
  37357445,
  "zhiyou@microsoft.com",
  [],
  ProgrammingLanguage.None,
  {
    skipProvision: true,
  },
  noAuthFileRecord,
).test();
