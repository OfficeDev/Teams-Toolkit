// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { err, IProgressHandler, ok, UserError } from "@microsoft/teamsfx-api";
import { assert, chai, vi } from "vitest";
import * as tools from "../../../../src/common/utils";
import { DotnetBuildDriver } from "../../../../src/component/driver/script/dotnetBuildDriver";
import * as utils from "../../../../src/component/driver/script/scriptDriver";
import { MockedAzureAccountProvider, MockUserInteraction } from "../../../core/utils";
import { TestLogProvider } from "../../util/logProviderMock";

describe("Dotnet Build Driver test", () => {
  beforeEach(() => {
    vi.spyOn(tools, "waitSeconds").mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("Dotnet build happy path", async () => {
    const driver = new DotnetBuildDriver();
    const progressHandler: IProgressHandler = {
      start: async (detail?: string): Promise<void> => {},
      next: async (detail?: string): Promise<void> => {},
      end: async (): Promise<void> => {},
    };
    const progressNextCaller = vi.spyOn(progressHandler, "next").mockResolvedValue();
    const args = {
      workingDirectory: "./",
      args: "build",
      execPath: "/usr/local/bin",
    };
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
      projectPath: "./",
      progressBar: progressHandler,
    } as any;
    vi.spyOn(utils, "executeCommand").mockResolvedValue(ok(["", {}]));
    const res = await driver.execute(args, context);
    chai.expect(res.result.unwrapOr(new Map([["a", "b"]])).size).to.equal(0);
    assert.equal(progressNextCaller.mock.calls.length, 1);
  });

  it("Dotnet build with summary happy path", async () => {
    const driver = new DotnetBuildDriver();
    const args = {
      workingDirectory: "./",
      args: "build",
    };
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      ui: new MockUserInteraction(),
      logProvider: new TestLogProvider(),
      projectPath: "./",
    } as any;
    vi.spyOn(utils, "executeCommand").mockResolvedValue(ok(["", {}]));
    const res = await driver.execute(args, context);
    chai.expect(res.result.unwrapOr(new Map([["a", "b"]])).size).to.equal(0);
    // console.log(res.summaries);
  });

  it("Dotnet build error", async () => {
    const driver = new DotnetBuildDriver();
    const args = {
      workingDirectory: "./",
      args: "build",
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
