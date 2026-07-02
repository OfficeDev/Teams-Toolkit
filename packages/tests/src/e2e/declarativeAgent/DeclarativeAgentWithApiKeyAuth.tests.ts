// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author Yimin Jin <yiminjin@microsoft.com>
 */

import { ProgrammingLanguage } from "@microsoft/teamsfx-core";
import * as fs from "fs-extra";
import path from "path";
import { Capability } from "../../utils/constants";
import { CaseFactory } from "../caseFactory";

class DeclarativeAgentWithApiKeyAuth extends CaseFactory {
  public override async onAfterCreate(projectPath: string): Promise<void> {
    const userFile = path.resolve(projectPath, "env", `.env.dev.user`);
    let fileContent = fs.readFileSync(userFile, `utf8`);
    const SECRET_API_KEY = "SECRET_API_KEY='fakeApiKey'";
    fileContent = fileContent.replace(/SECRET_API_KEY=.*/, SECRET_API_KEY);
    fs.writeFileSync(userFile, fileContent, `utf8`);
    console.log(`add key ${SECRET_API_KEY} to .env.dev.user file`);
  }
}

const myRecord: Record<string, string> = {};
myRecord["with-plugin"] = "yes";
myRecord["api-plugin-type"] = "new-api";
myRecord["api-auth"] = "api-key";

new DeclarativeAgentWithApiKeyAuth(
  Capability.DeclarativeAgentWithActionFromScratchBearer,
  30310079,
  "yiminjin@microsoft.com",
  ["function"],
  ProgrammingLanguage.JS,
  {},
  myRecord,
).test();

new DeclarativeAgentWithApiKeyAuth(
  Capability.DeclarativeAgentWithActionFromScratchBearer,
  30309977,
  "yiminjin@microsoft.com",
  ["function"],
  ProgrammingLanguage.TS,
  {},
  myRecord,
).test();
