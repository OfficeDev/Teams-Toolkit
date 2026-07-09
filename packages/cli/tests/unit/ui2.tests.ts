// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  InputTextConfig,
  MultiSelectConfig,
  SingleSelectConfig,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import { SelectSubscriptionError, UnhandledError } from "@microsoft/teamsfx-core";
import child_process from "child_process";
import { logger } from "../../src/commonlib/logger";
import UI from "../../src/userInteraction";
import { assert, vi } from "vitest";

describe("UserInteraction(CLI) 2", () => {
  const sandbox = vi;

  beforeEach(() => {
    vi.spyOn(UI, "createProgressBar").mockReturnValue({
      start: async (s) => {},
      next: async (s) => {},
      end: async (s) => {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("loadSelectDynamicData", async () => {
    it("happy path", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: async () => ["a", "b", "c"],
        default: async () => "a",
      };
      const result = await UI.loadSelectDynamicData(config);
      assert.isTrue(result.isOk());
      assert.deepEqual(config.options, ["a", "b", "c"]);
      assert.equal(config.default, "a");
    });
    it("throw error", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: async () => {
          throw new Error("test");
        },
      };
      const result = await UI.loadSelectDynamicData(config);
      assert.isTrue(result.isErr());
    });
    it("no need to call function", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: ["a", "b", "c"],
      };
      const result = await UI.loadSelectDynamicData(config);
      assert.isTrue(result.isOk());
      assert.deepEqual(config.options, ["a", "b", "c"]);
    });
  });

  describe("loadDefaultValue", async () => {
    it("happy path", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: ["a", "b", "c"],
        default: async () => "a",
      };
      const result = await UI.loadDefaultValue(config);
      assert.isTrue(result.isOk());
      assert.equal(config.default, "a");
    });
    it("throw error", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: ["a", "b", "c"],
        default: async () => {
          throw new Error("test");
        },
      };
      const result = await UI.loadDefaultValue(config);
      assert.isTrue(result.isErr());
    });
    it("no need to call function", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: ["a", "b", "c"],
        default: "a",
      };
      const result = await UI.loadDefaultValue(config);
      assert.isTrue(result.isOk());
    });
  });

  describe("selectOptions", () => {
    it("loadSelectDynamicData throw error", async () => {
      vi.spyOn(UI, "loadSelectDynamicData").mockResolvedValue(err(new UserError({})));
      const config: MultiSelectConfig = {
        name: "test",
        title: "test",
        options: async () => {
          throw new Error("test");
        },
      };
      const result = await UI.selectOptions(config);
      assert.isTrue(result.isErr());
    });
    it("success with default=all", async () => {
      vi.spyOn(UI, "multiSelect").mockResolvedValue(ok(["a", "b", "c"]));
      const config: MultiSelectConfig = {
        name: "test",
        title: "test",
        options: async () => {
          return ["a", "b", "c"];
        },
        default: "all",
      };
      const result = await UI.selectOptions(config);
      assert.isTrue(result.isOk());
    });
    it("success with default=all", async () => {
      vi.spyOn(UI, "multiSelect").mockResolvedValue(ok(["a", "b"]));
      const config: MultiSelectConfig = {
        name: "test",
        title: "test",
        options: async () => {
          return [
            { id: "a", label: "a" },
            { id: "b", label: "b" },
          ];
        },
        default: "all",
      };
      const result = await UI.selectOptions(config);
      assert.isTrue(result.isOk());
    });
    it("success with default=none", async () => {
      vi.spyOn(UI, "multiSelect").mockResolvedValue(ok([]));
      const config: MultiSelectConfig = {
        name: "test",
        title: "test",
        options: async () => {
          return ["a", "b", "c"];
        },
        default: "none",
      };
      const result = await UI.selectOptions(config);
      assert.isTrue(result.isOk());
    });
  });

  describe("selectOption", () => {
    it("loadSelectDynamicData throw error", async () => {
      vi.spyOn(UI, "loadSelectDynamicData").mockResolvedValue(err(new UserError({})));
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: async () => {
          throw new Error("test");
        },
      };
      const result = await UI.selectOption(config);
      assert.isTrue(result.isErr());
    });
    it("SelectSubscriptionError", async () => {
      const config: SingleSelectConfig = {
        name: "subscription",
        title: "select subscription",
        options: [],
      };
      const result = await UI.selectOption(config);
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.isTrue(result.error instanceof SelectSubscriptionError);
      }
    });
    it("happy return options", async () => {
      const config: SingleSelectConfig = {
        name: "test",
        title: "test",
        options: ["a", "b"],
      };
      vi.spyOn(UI, "singleSelect").mockResolvedValue(ok("a"));
      const result = await UI.selectOption(config);
      assert.isTrue(result.isOk());
      if (result.isOk()) {
        assert.deepEqual(result.value.options, ["a", "b"]);
      }
    });
  });

  describe("inputText", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("load default value error", async () => {
      const res = await UI.inputText({
        title: "test",
        name: "test",
        default: async () => {
          throw new Error();
        },
      });
      assert.isTrue(res.isErr());
    });
    it("UnhandledError", async () => {
      vi.spyOn(UI, "input").mockResolvedValue(err(new UnhandledError(new Error("test"))));
      const config: InputTextConfig = {
        name: "testInput",
        title: "input text",
      };
      const result = await UI.inputText(config);
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.isTrue(result.error instanceof UnhandledError);
      }
    });
  });

  describe("selectFile", () => {
    it("load default value error", async () => {
      const res = await UI.selectFile({
        title: "test",
        name: "test",
        default: async () => {
          throw new Error();
        },
      });
      assert.isTrue(res.isErr());
    });
  });

  describe("selectFiles", () => {
    it("load default value error", async () => {
      const res = await UI.selectFiles({
        title: "test",
        name: "test",
        default: async () => {
          throw new Error();
        },
      });
      assert.isTrue(res.isErr());
    });
  });

  describe("selectFolder", () => {
    it("load default value error", async () => {
      const res = await UI.selectFolder({
        title: "test",
        name: "test",
        default: async () => {
          throw new Error();
        },
      });
      assert.isTrue(res.isErr());
    });
  });

  describe("selectFileOrInput", () => {
    it("happy path", async () => {
      vi.spyOn(UI, "input").mockResolvedValue(ok("somevalue"));
      const res = await UI.selectFileOrInput({
        name: "test",
        title: "test",
        inputBoxConfig: {
          title: "test",
          name: "test",
          validation: (input: string) => {
            return undefined;
          },
        },
        inputOptionItem: {
          id: "test",
          label: "test",
        },
      });
      assert.isTrue(res.isOk());
    });

    it("load default value error", async () => {
      const res = await UI.selectFileOrInput({
        name: "test",
        title: "test",
        inputBoxConfig: {
          title: "test",
          name: "test",
          default: async () => {
            throw new Error();
          },
        },
        inputOptionItem: {
          id: "test",
          label: "test",
        },
      });
      assert.isTrue(res.isErr());
    });
  });
});

describe("runCommand", () => {
  const sandbox = vi;
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("happy path win32", async () => {
    const mockChildProcess = {
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "close") {
          callback(0); // Simulate successful execution
        }
      }),
    };
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.spyOn(logger, "info").mockReturnValue();
    const spawnStub = vi.spyOn(child_process, "spawn").mockReturnValue(mockChildProcess as any);
    const res = await UI.runCommand({ cmd: 'echo "Hello"' });
    assert.isTrue(res.isOk());
    assert.isTrue(spawnStub.mock.calls.length === 1);
    assert.equal(spawnStub.mock.calls[0][0], "cmd.exe");
  });
  it("uses custom shell", async () => {
    const mockChildProcess = {
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "close") {
          callback(0);
        }
      }),
    };
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.spyOn(logger, "info").mockReturnValue();
    const spawnStub = vi.spyOn(child_process, "spawn").mockReturnValue(mockChildProcess as any);
    const res = await UI.runCommand({ cmd: "echo hello", shell: "powershell.exe" });
    assert.isTrue(res.isOk());
    assert.isTrue(spawnStub.mock.calls.length === 1);
    assert.equal(spawnStub.mock.calls[0][0], "powershell.exe");
  });
  it("error linux", async () => {
    const mockChildProcess = {
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "close") {
          callback(1); // Simulate successful execution
        }
      }),
    };
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(logger, "error").mockReturnValue();
    const spawnStub = vi.spyOn(child_process, "spawn").mockReturnValue(mockChildProcess as any);
    const res = await UI.runCommand({ cmd: 'echo "Hello"' });
    assert.isTrue(res.isErr());
    assert.isTrue(spawnStub.mock.calls.length === 1);
    assert.equal(spawnStub.mock.calls[0][0], "/bin/bash");
  });
  it("captures stdout data", async () => {
    const stdoutData = "Output from stdout";
    const mockChildProcess = {
      stdout: {
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === "data") {
            callback(Buffer.from(stdoutData));
          }
        }),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "close") {
          callback(0);
        }
      }),
    };
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.spyOn(child_process, "spawn").mockReturnValue(mockChildProcess as any);
    const res = await UI.runCommand({ cmd: 'echo "test"' });
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value, stdoutData);
    }
  });
  it("captures stderr data", async () => {
    const stderrData = "Error from stderr";
    const mockChildProcess = {
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === "data") {
            callback(Buffer.from(stderrData));
          }
        }),
      },
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "close") {
          callback(0);
        }
      }),
    };
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.spyOn(child_process, "spawn").mockReturnValue(mockChildProcess as any);
    const res = await UI.runCommand({ cmd: 'echo "test"' });
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value, stderrData);
    }
  });
  it("captures both stdout and stderr data", async () => {
    const stdoutData = "Output from stdout\n";
    const stderrData = "Error from stderr\n";
    const mockChildProcess = {
      stdout: {
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === "data") {
            callback(Buffer.from(stdoutData));
          }
        }),
      },
      stderr: {
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === "data") {
            callback(Buffer.from(stderrData));
          }
        }),
      },
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "close") {
          callback(0);
        }
      }),
    };
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.spyOn(child_process, "spawn").mockReturnValue(mockChildProcess as any);
    const res = await UI.runCommand({ cmd: 'echo "test"' });
    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value, stdoutData + stderrData);
    }
  });
  it("passes workingDirectory to spawn", async () => {
    const workingDir = "/path/to/working/dir";
    const mockChildProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "close") {
          callback(0);
        }
      }),
    };
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const spawnStub = vi.spyOn(child_process, "spawn").mockReturnValue(mockChildProcess as any);
    const res = await UI.runCommand({ cmd: "pwd", workingDirectory: workingDir });
    assert.isTrue(res.isOk());
    assert.isTrue(spawnStub.mock.calls.length === 1);
    const spawnOptions = spawnStub.mock.calls[0][2];
    assert.equal(spawnOptions.cwd, workingDir);
  });
  it("passes timeout to spawn", async () => {
    const timeout = 5000;
    const mockChildProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "close") {
          callback(0);
        }
      }),
    };
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const spawnStub = vi.spyOn(child_process, "spawn").mockReturnValue(mockChildProcess as any);
    const res = await UI.runCommand({ cmd: "sleep 1", timeout: timeout });
    assert.isTrue(res.isOk());
    assert.isTrue(spawnStub.mock.calls.length === 1);
    const spawnOptions = spawnStub.mock.calls[0][2];
    assert.equal(spawnOptions.timeout, timeout);
  });
  it("passes env variables to spawn", async () => {
    const envVars = { TEST_VAR: "test_value", ANOTHER_VAR: "another_value" };
    const mockChildProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "close") {
          callback(0);
        }
      }),
    };
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const spawnStub = vi.spyOn(child_process, "spawn").mockReturnValue(mockChildProcess as any);
    const res = await UI.runCommand({ cmd: "echo %TEST_VAR%", env: envVars });
    assert.isTrue(res.isOk());
    assert.isTrue(spawnStub.mock.calls.length === 1);
    const spawnOptions = spawnStub.mock.calls[0][2];
    assert.deepEqual(spawnOptions.env, envVars);
  });
  it("handles non-zero exit code with output", async () => {
    const errorOutput = "Command failed with error";
    const mockChildProcess = {
      stdout: {
        on: vi.fn().mockImplementation((event, callback) => {
          if (event === "data") {
            callback(Buffer.from(errorOutput));
          }
        }),
      },
      stderr: { on: vi.fn() },
      on: vi.fn().mockImplementation((event, callback) => {
        if (event === "close") {
          callback(2); // Non-zero exit code
        }
      }),
    };
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    vi.spyOn(logger, "info").mockReturnValue();
    vi.spyOn(logger, "error").mockReturnValue();
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.spyOn(child_process, "spawn").mockReturnValue(mockChildProcess as any);
    const res = await UI.runCommand({ cmd: "invalid-command" });
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.include(res.error.message, "Execute task failed with exit code:2");
    }
  });
});
