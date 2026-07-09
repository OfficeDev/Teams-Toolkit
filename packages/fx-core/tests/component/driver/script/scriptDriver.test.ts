// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, IProgressHandler, ok } from "@microsoft/teamsfx-api";
import child_process from "child_process";
import fs from "fs-extra";
import os from "os";
import { assert, vi } from "vitest";
import * as tools from "../../../../src/common/utils";
import {
  convertScriptErrorToFxError,
  defaultShell,
  executeCommand,
  getStderrHandler,
  parseSetOutputCommand,
  scriptDriver,
} from "../../../../src/component/driver/script/scriptDriver";
import * as charsetUtils from "../../../../src/component/utils/charsetUtils";
import { UserCancelError } from "../../../../src/error";
import { ScriptExecutionError, ScriptTimeoutError } from "../../../../src/error/script";
import {
  MockedAzureAccountProvider,
  MockLogProvider,
  MockUserInteraction,
} from "../../../core/utils";
import { TestLogProvider } from "../../util/logProviderMock";

describe("Script Driver test", () => {
  const ui = new MockUserInteraction();
  beforeEach(() => {
    vi.spyOn(tools, "waitSeconds").mockResolvedValue();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
  });
  it("ui not provided - execute success: set-output and append to file", async () => {
    const appendFileSyncStub = vi.spyOn(fs, "appendFileSync");
    const args = {
      workingDirectory: "./",
      run: `echo '::set-output MY_KEY=MY_VALUE'`,
      redirectTo: "./log",
    };
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: ui,
      progressBar: {
        start: async (detail?: string): Promise<void> => {},
        next: async (detail?: string): Promise<void> => {},
        end: async (): Promise<void> => {},
      } as IProgressHandler,
      projectPath: "./",
    } as any;
    vi.spyOn(ui, "runCommand").mockResolvedValue(ok("::set-output MY_KEY=MY_VALUE"));
    const res = await scriptDriver.execute(args, context);
    assert.isTrue(res.result.isOk());
    if (res.result.isOk()) {
      const output = res.result.value;
      assert.equal(output.get("MY_KEY"), "MY_VALUE");
    }
    assert.equal(appendFileSyncStub.mock.calls.length, 0);
  });
  it("ui not provided - execute success: set-output and not append to file", async () => {
    const appendFileSyncStub = vi.spyOn(fs, "appendFileSync");
    const args = {
      workingDirectory: "./",
      run: `echo '::set-output MY_KEY=MY_VALUE'`,
    };
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: ui,
      progressBar: {
        start: async (detail?: string): Promise<void> => {},
        next: async (detail?: string): Promise<void> => {},
        end: async (): Promise<void> => {},
      } as IProgressHandler,
      projectPath: "./",
    } as any;
    (ui as any).runCommand = undefined;
    const res = await scriptDriver.execute(args, context);
    delete (ui as any).runCommand;
    assert.isTrue(res.result.isOk());
    if (res.result.isOk()) {
      const output = res.result.value;
      assert.equal(output.get("MY_KEY"), "MY_VALUE");
    }
    assert.equal(appendFileSyncStub.mock.calls.length, 0);
  });
  it("ui not provided - execute failed: child_process.exec return error", async () => {
    const error = new Error("test error");
    vi.spyOn(charsetUtils, "getSystemEncoding").mockResolvedValue("utf-8");
    vi.spyOn(child_process, "exec").mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(error);
      return {} as any;
    });
    const args = {
      workingDirectory: "./",
      run: "echo '::set-output MY_KEY=MY_VALUE'",
    };
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: ui,
      projectPath: "./",
    } as any;
    (ui as any).runCommand = undefined;
    const res = await scriptDriver.execute(args, context);
    delete (ui as any).runCommand;
    assert.isTrue(res.result.isErr());
  });
  it("ui provided - execute - success", async () => {
    const args = {
      workingDirectory: "./",
      run: `echo '::set-output MY_KEY=MY_VALUE'`,
    };
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: ui,
      progressBar: {
        start: async (detail?: string): Promise<void> => {},
        next: async (detail?: string): Promise<void> => {},
        end: async (): Promise<void> => {},
      } as IProgressHandler,
      projectPath: "./",
    } as any;
    vi.spyOn(ui, "runCommand").mockResolvedValue(ok("::set-output MY_KEY=MY_VALUE"));
    const res = await scriptDriver.execute(args, context);
    assert.isTrue(res.result.isOk());
    if (res.result.isOk()) {
      const output = res.result.value;
      assert.equal(output.get("MY_KEY"), "MY_VALUE");
    }
  });
  it("ui provided - execute - success no env output", async () => {
    const args = {
      workingDirectory: "./",
      run: `echo 'abc'`,
    };
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: ui,
      progressBar: {
        start: async (detail?: string): Promise<void> => {},
        next: async (detail?: string): Promise<void> => {},
        end: async (): Promise<void> => {},
      } as IProgressHandler,
      projectPath: "./",
    } as any;
    vi.spyOn(ui, "runCommand").mockResolvedValue(ok(""));
    const res = await scriptDriver.execute(args, context);
    assert.isTrue(res.result.isOk());
    if (res.result.isOk()) {
      const output = res.result.value;
      assert.deepEqual(output, new Map());
    }
  });
  it("ui provided - execute - runCommand Error", async () => {
    const args = {
      workingDirectory: "./",
      run: `echo '::set-output MY_KEY=MY_VALUE'`,
    };
    const context = {
      azureAccountProvider: new MockedAzureAccountProvider(),
      logProvider: new TestLogProvider(),
      ui: ui,
      progressBar: {
        start: async (detail?: string): Promise<void> => {},
        next: async (detail?: string): Promise<void> => {},
        end: async (): Promise<void> => {},
      } as IProgressHandler,
      projectPath: "./",
    } as any;
    vi.spyOn(ui, "runCommand").mockResolvedValue(err(new UserCancelError()));
    const res = await scriptDriver.execute(args, context);
    assert.isTrue(res.result.isErr());
  });
  it("convertScriptErrorToFxError ScriptTimeoutError", async () => {
    const error = { killed: true } as child_process.ExecException;
    const res = convertScriptErrorToFxError(error, "test");
    assert.isTrue(res instanceof ScriptTimeoutError);
  });
  it("convertScriptErrorToFxError ScriptExecutionError", async () => {
    const error = { killed: false, message: "command failed" } as child_process.ExecException;
    const res = convertScriptErrorToFxError(error, "test");
    assert.isTrue(res instanceof ScriptExecutionError);
  });
});
describe("executeCommand", () => {
  const ui = new MockUserInteraction();
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("dotnet command", async () => {
    vi.spyOn(charsetUtils, "getSystemEncoding").mockResolvedValue("utf-8");
    const stub = vi.spyOn(child_process, "exec").mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(null);
      return {} as any;
    });
    await executeCommand(
      "dotnet test && echo '::set-output MY_KEY=MY_VALUE'",
      "./",
      new TestLogProvider(),
      undefined
    );
    assert.isTrue(stub.mock.calls.length === 1);
  });
  // it("call ui.runCommand", async () => {
  //   const ui = new MockUserInteraction();
  //   const spyRunCommand = vi.spyOn(ui, "runCommand");
  //   const stub = vi.spyOn(child_process, "exec").mockReturnValue({} as any);
  //   await executeCommand("abc", "./", new TestLogProvider(), ui);
  //   assert.isTrue(spyRunCommand.mock.calls.length === 1);
  //   assert.isFalse(stub.mock.calls.length === 1);
  // });
  it("call ui.runCommand error", async () => {
    vi.spyOn(ui, "runCommand").mockResolvedValue(err(new UserCancelError()));
    vi.spyOn(child_process, "exec").mockReturnValue({} as any);
    const res = await executeCommand("abc", "./", new TestLogProvider(), ui);
    assert.isTrue(res.isErr());
  });
  it("call ui.runCommand with output", async () => {
    vi.spyOn(ui, "runCommand").mockResolvedValue(ok("::set-teamsfx-env MY_KEY=MY_VALUE"));
    vi.spyOn(child_process, "exec").mockReturnValue({} as any);
    const res = await executeCommand(
      "echo '::set-teamsfx-env MY_KEY=MY_VALUE'",
      "./",
      new TestLogProvider(),
      ui
    );
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.deepEqual(res.value[1], { MY_KEY: "MY_VALUE" });
    }
  });
});
describe("getSystemEncoding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("should return a string", async () => {
    const result = await charsetUtils.getSystemEncoding();
    assert.isTrue(typeof result === "string");
  });
  it("should return default encoding on other platform", async () => {
    vi.spyOn(os, "platform").mockReturnValue("netbsd");
    const result = await charsetUtils.getSystemEncoding();
    assert.equal(result, "utf-8");
  });

  it("should return gb2312 on win32 platform", async () => {
    vi.spyOn(os, "platform").mockReturnValue("win32");
    vi.spyOn(child_process, "exec").mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(null, "Active code page: 936");
      return {} as any;
    });
    const result = await charsetUtils.getSystemEncoding();
    assert.equal(result, "gb2312");
  });

  it("should return utf-8 on linux platform", async () => {
    vi.spyOn(os, "platform").mockReturnValue("linux");
    vi.spyOn(child_process, "exec").mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(null, "UTF-8");
      return {} as any;
    });
    const result = await charsetUtils.getSystemEncoding();
    assert.equal(result, "utf-8");
  });

  it("should return utf-8 on darwin platform", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    vi.spyOn(child_process, "exec").mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(null, "zh_CN.UTF-8");
      return {} as any;
    });
    const result = await charsetUtils.getSystemEncoding();
    assert.equal(result, "utf-8");
  });

  it("should return default encoding when Error happens on win32 platform", async () => {
    vi.spyOn(os, "platform").mockReturnValue("win32");
    const error = new Error("test error");
    vi.spyOn(child_process, "exec").mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(error, "");
      return {} as any;
    });
    const result = await charsetUtils.getSystemEncoding();
    assert.equal(result, charsetUtils.DefaultEncoding);
  });

  it("should return default encoding when Error happens on linux platform", async () => {
    vi.spyOn(os, "platform").mockReturnValue("linux");
    const error = new Error("test error");
    vi.spyOn(child_process, "exec").mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(error, "");
      return {} as any;
    });
    const result = await charsetUtils.getSystemEncoding();
    assert.equal(result, charsetUtils.DefaultEncoding);
  });

  it("should return default encoding when Error happens on darwin platform", async () => {
    vi.spyOn(os, "platform").mockReturnValue("darwin");
    const error = new Error("test error");
    vi.spyOn(child_process, "exec").mockImplementation((...args: any[]) => {
      const callback = args[2];
      callback(error, "");
      return {} as any;
    });
    const result = await charsetUtils.getSystemEncoding();
    assert.equal(result, charsetUtils.DefaultEncoding);
  });
  it("should return utf8 for azure cli", async () => {
    const result = await charsetUtils.getSystemEncoding("@azure/static-web-apps-cli");
    assert.equal(result, "utf8");
  });
});

describe("parseSetOutputCommand", () => {
  it("parse one key value pair", async () => {
    const res = parseSetOutputCommand('echo "::set-teamsfx-env TAB_DOMAIN=localhost:53000"');
    assert.deepEqual(res, { TAB_DOMAIN: "localhost:53000" });
  });
  it("parse two key value pairs", async () => {
    const res = parseSetOutputCommand(
      'echo "::set-teamsfx-env TAB_DOMAIN=localhost:53000"; echo "::set-teamsfx-env TAB_ENDPOINT=https://localhost:53000";'
    );
    assert.deepEqual(res, {
      TAB_DOMAIN: "localhost:53000",
      TAB_ENDPOINT: "https://localhost:53000",
    });
  });
  it("parse value that contains space", async () => {
    const res = parseSetOutputCommand(
      `Write-Host ::set-teamsfx-env Test0="multi word variable"
        Write-Host ::set-teamsfx-env Test1=' multi word variable'
        Write-Host ::set-teamsfx-env Test2=multi+word+variable`
    );
    assert.deepEqual(res, {
      Test0: "multi word variable",
      Test1: " multi word variable",
      Test2: "multi+word+variable",
    });
  });
});

describe("getStderrHandler", () => {
  beforeEach(() => {});
  afterEach(async () => {
    vi.restoreAllMocks();
  });
  it("happy path", async () => {
    const logProvider = new MockLogProvider();
    const systemEncoding = "utf-8";
    const stderrStrings: string[] = [];
    const handler = getStderrHandler(
      logProvider,
      systemEncoding,
      stderrStrings,
      async (data: string) => {}
    );
    await handler(Buffer.from("test"));
    assert.deepEqual(stderrStrings, ["test"]);
  });
});

describe("defaultShell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("SHELL", async () => {
    vi.spyOn(process, "env", "get").mockReturnValue({ SHELL: "/bin/bash" } as any);
    const result = await defaultShell();
    assert.equal(result, "/bin/bash");
  });
  it("darwin - /bin/zsh", async () => {
    vi.spyOn(process, "env", "get").mockReturnValue({} as any);
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    const result = await defaultShell();
    assert.equal(result, "/bin/zsh");
  });
  it("darwin - /bin/bash", async () => {
    vi.spyOn(process, "env", "get").mockReturnValue({} as any);
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    vi.spyOn(fs, "pathExists").mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const result = await defaultShell();
    assert.equal(result, "/bin/bash");
  });
  it("darwin - undefined", async () => {
    vi.spyOn(process, "env", "get").mockReturnValue({} as any);
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const result = await defaultShell();
    assert.isUndefined(result);
  });

  it("win32 - ComSpec", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    vi.spyOn(process, "env", "get").mockReturnValue({ ComSpec: "cmd.exe" } as any);
    const result = await defaultShell();
    assert.equal(result, "cmd.exe");
  });
  it("win32 - cmd.exe", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    vi.spyOn(process, "env", "get").mockReturnValue({} as any);
    const result = await defaultShell();
    assert.equal(result, "cmd.exe");
  });

  it("other OS - /bin/sh", async () => {
    vi.spyOn(process, "env", "get").mockReturnValue({} as any);
    vi.spyOn(process, "platform", "get").mockReturnValue("other");
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    const result = await defaultShell();
    assert.equal(result, "/bin/sh");
  });

  it("other OS - undefined", async () => {
    vi.spyOn(process, "env", "get").mockReturnValue({} as any);
    vi.spyOn(process, "platform", "get").mockReturnValue("other");
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const result = await defaultShell();
    assert.isUndefined(result);
  });
});
