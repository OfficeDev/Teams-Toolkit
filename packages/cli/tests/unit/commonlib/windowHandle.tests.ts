// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as os from "os";
import * as path from "path";
import { afterEach, assert, beforeEach, describe, it, vi } from "vitest";

const execFileSyncMock = vi.fn();
const appendFileSyncMock = vi.fn();
const debugMock = vi.fn();

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return {
    ...actual,
    execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
  };
});

vi.mock("fs-extra", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs-extra")>();
  const mocked = {
    ...actual,
    appendFileSync: (...args: unknown[]) => appendFileSyncMock(...args),
  };
  return { ...mocked, default: mocked };
});

vi.mock("../../../src/commonlib/logger", () => ({
  logger: { debug: (...args: unknown[]) => debugMock(...args) },
}));

async function importModule() {
  return await import("../../../src/commonlib/windowHandle");
}

describe("windowHandle", () => {
  const originalPlatform = process.platform;
  const originalArch = process.arch;
  const originalEnv = { ...process.env };

  function setReadOnly(key: "platform" | "arch", value: string) {
    Object.defineProperty(process, key, { value, configurable: true });
  }

  beforeEach(() => {
    vi.resetModules();
    execFileSyncMock.mockReset();
    appendFileSyncMock.mockReset();
    debugMock.mockReset();
    setReadOnly("platform", "win32");
    setReadOnly("arch", "x64");
    delete process.env.ATK_WAM_PARENT_WINDOW;
  });

  afterEach(() => {
    setReadOnly("platform", originalPlatform);
    setReadOnly("arch", originalArch);
    process.env = { ...originalEnv };
  });

  it("returns undefined on non-Windows platforms without spawning PowerShell", async () => {
    setReadOnly("platform", "darwin");
    const { getParentWindowHandle } = await importModule();

    assert.isUndefined(getParentWindowHandle());
    assert.equal(execFileSyncMock.mock.calls.length, 0);
  });

  it("returns undefined when ATK_WAM_PARENT_WINDOW is off", async () => {
    process.env.ATK_WAM_PARENT_WINDOW = " OFF ";
    const { getParentWindowHandle } = await importModule();

    assert.isUndefined(getParentWindowHandle());
    assert.equal(execFileSyncMock.mock.calls.length, 0);
  });

  it("encodes the resolved handle as 8 pointer bytes on 64-bit", async () => {
    execFileSyncMock.mockReturnValue("66048;node(1) <- Code(2)\n");
    const { getParentWindowHandle } = await importModule();

    const handle = getParentWindowHandle();

    assert.isDefined(handle);
    assert.equal(handle!.length, 8);
    assert.equal(handle!.readBigUInt64LE(), BigInt(66048));
    const [command, args] = execFileSyncMock.mock.calls[0];
    assert.isTrue((command as string).endsWith(path.join("v1.0", "powershell.exe")));
    assert.include(args as string[], "-EncodedCommand");
  });

  it("encodes the resolved handle as 4 pointer bytes on 32-bit", async () => {
    setReadOnly("arch", "ia32");
    execFileSyncMock.mockReturnValue("4096;node(1)");
    const { getParentWindowHandle } = await importModule();

    const handle = getParentWindowHandle();

    assert.isDefined(handle);
    assert.equal(handle!.length, 4);
    assert.equal(handle!.readUInt32LE(), 4096);
  });

  it("resolves only once and reuses the cached handle", async () => {
    execFileSyncMock.mockReturnValue("4096;node(1)");
    const { getParentWindowHandle } = await importModule();

    const first = getParentWindowHandle();
    const second = getParentWindowHandle();

    assert.strictEqual(first, second);
    assert.equal(execFileSyncMock.mock.calls.length, 1);
  });

  it("returns undefined when no ancestor window is found and caches that result", async () => {
    execFileSyncMock.mockReturnValue("0;node(1) <- sh(2)");
    const { getParentWindowHandle } = await importModule();

    assert.isUndefined(getParentWindowHandle());
    assert.isUndefined(getParentWindowHandle());
    assert.equal(execFileSyncMock.mock.calls.length, 1);
  });

  it("returns undefined when the output is not a number and has no walk trail", async () => {
    execFileSyncMock.mockReturnValue("not-a-handle");
    const { getParentWindowHandle } = await importModule();

    assert.isUndefined(getParentWindowHandle());
  });

  it("resolves the handle when the output has no walk trail", async () => {
    execFileSyncMock.mockReturnValue("4096");
    const { getParentWindowHandle } = await importModule();

    assert.isDefined(getParentWindowHandle());
  });

  it("falls back to C:\\Windows when SystemRoot is not set", async () => {
    delete process.env.SystemRoot;
    execFileSyncMock.mockReturnValue("4096;node(1)");
    const { getParentWindowHandle } = await importModule();

    assert.isDefined(getParentWindowHandle());
    assert.equal(
      execFileSyncMock.mock.calls[0][0],
      path.join("C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    );
  });

  it("returns undefined when PowerShell fails", async () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("spawn failed");
    });
    const { getParentWindowHandle } = await importModule();

    assert.isUndefined(getParentWindowHandle());
    assert.include(debugMock.mock.calls[0][0] as string, "spawn failed");
  });

  it("appends the trace to a temp file in debug mode", async () => {
    process.env.ATK_WAM_PARENT_WINDOW = "Debug";
    execFileSyncMock.mockReturnValue("4096;node(1)");
    const { getParentWindowHandle } = await importModule();

    assert.isDefined(getParentWindowHandle());
    assert.equal(appendFileSyncMock.mock.calls.length, 1);
    assert.equal(appendFileSyncMock.mock.calls[0][0], path.join(os.tmpdir(), "atk-wam-parent.log"));
  });

  it("ignores failures of the debug file trace", async () => {
    process.env.ATK_WAM_PARENT_WINDOW = "debug";
    appendFileSyncMock.mockImplementation(() => {
      throw new Error("disk full");
    });
    execFileSyncMock.mockReturnValue("4096;node(1)");
    const { getParentWindowHandle } = await importModule();

    assert.isDefined(getParentWindowHandle());
  });
});
