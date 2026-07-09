// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { err, ok, UserError } from "@microsoft/teamsfx-api";
import { assert, chai, vi } from "vitest";
import * as tools from "../../../../src/common/utils";
import { NpmBuildDriver } from "../../../../src/component/driver/script/npmBuildDriver";
import * as utils from "../../../../src/component/driver/script/scriptDriver";
import { MockedAzureAccountProvider, MockUserInteraction } from "../../../core/utils";
import { TestLogProvider } from "../../util/logProviderMock";

describe("NPM Build Driver test", () => {
  beforeEach(() => {
    vi.spyOn(tools, "waitSeconds").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("NPM build happy path", async () => {
    const driver = new NpmBuildDriver();
    const args = {
      workingDirectory: "./",
      args: "build",
    };
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: new MockUserInteraction(),
      projectPath: "./",
    } as any;
    vi.spyOn(utils, "executeCommand").mockResolvedValue(ok(["", {}]));
    const res = await driver.execute(args, context);
    chai.assert.equal(res.result.isOk(), true);

    chai.assert.equal((await driver.execute(args, context)).result.isOk(), true);
  });

  it("Dotnet build error", async () => {
    const driver = new NpmBuildDriver();
    const args = {
      workingDirectory: "./",
      args: "build",
      env: { a: "HELLO" },
    };
    const ui = new MockUserInteraction();
    vi.spyOn(ui, "runCommand").mockResolvedValue(err(new UserError({})));
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui,
      projectPath: "./",
    } as any;
    const res = await driver.execute(args, context);
    assert.equal(res.result.isErr(), true);
  });
});
