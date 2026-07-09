import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const fsMock = {
    pathExists: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    closeSync: vi.fn(),
    openSync: vi.fn(),
    open: vi.fn(),
    fstat: vi.fn(),
    read: vi.fn(),
    close: vi.fn(),
  };

  const deserializeMock = vi.fn();

  const platformMock = vi.fn();
  const typeMock = vi.fn();
  const execMock = vi.fn();
  const killMock = vi.fn();

  const globMock = vi.fn();

  const joinMock = vi.fn();
  const resolveMock = vi.fn();
  const dirnameMock = vi.fn();
  const basenameMock = vi.fn();

  return {
    fsMock,
    deserializeMock,
    platformMock,
    typeMock,
    execMock,
    killMock,
    globMock,
    joinMock,
    resolveMock,
    dirnameMock,
    basenameMock,
  };
});

vi.mock("fs-extra", () => ({
  default: mocks.fsMock,
}));

vi.mock("@microsoft/teamsfx-core/build/component/utils/envUtil", () => ({
  dotenvUtil: {
    deserialize: mocks.deserializeMock,
  },
}));

vi.mock("child_process", () => ({
  exec: mocks.execMock,
}));

vi.mock("os", () => ({
  platform: mocks.platformMock,
  type: mocks.typeMock,
}));

vi.mock("tree-kill", () => ({
  default: mocks.killMock,
}));

vi.mock("glob", () => ({
  glob: mocks.globMock,
}));

vi.mock("path", () => ({
  default: {
    join: mocks.joinMock,
    resolve: mocks.resolveMock,
    dirname: mocks.dirnameMock,
    basename: mocks.basenameMock,
  },
  join: mocks.joinMock,
  resolve: mocks.resolveMock,
  dirname: mocks.dirnameMock,
  basename: mocks.basenameMock,
}));

import {
  envParseAdapter,
  fsAdapter,
  globAdapter,
  pathAdapter,
  processAdapter,
} from "../../../src/common/npmPackageDeps";

afterEach(() => {
  vi.clearAllMocks();
});

describe("npmPackageDeps adapters", () => {
  describe("fsAdapter", () => {
    it("delegates pathExists", async () => {
      mocks.fsMock.pathExists.mockResolvedValue(true);

      const result = await fsAdapter.pathExists("a.txt");

      expect(result).toBe(true);
      expect(mocks.fsMock.pathExists).toHaveBeenCalledWith("a.txt");
    });

    it("delegates readFileSync", () => {
      mocks.fsMock.readFileSync.mockReturnValue("abc");

      const result = fsAdapter.readFileSync("a.txt", "utf-8");

      expect(result).toBe("abc");
      expect(mocks.fsMock.readFileSync).toHaveBeenCalledWith("a.txt", "utf-8");
    });

    it("delegates writeFileSync with explicit encoding", () => {
      fsAdapter.writeFileSync("a.txt", "content", "ascii");

      expect(mocks.fsMock.writeFileSync).toHaveBeenCalledWith("a.txt", "content", "ascii");
    });

    it("uses utf-8 when writeFileSync encoding is omitted", () => {
      fsAdapter.writeFileSync("a.txt", "content");

      expect(mocks.fsMock.writeFileSync).toHaveBeenCalledWith("a.txt", "content", "utf-8");
    });

    it("delegates existsSync", () => {
      mocks.fsMock.existsSync.mockReturnValue(true);

      const result = fsAdapter.existsSync("a.txt");

      expect(result).toBe(true);
      expect(mocks.fsMock.existsSync).toHaveBeenCalledWith("a.txt");
    });

    it("delegates mkdirSync", () => {
      const options = { recursive: true };
      fsAdapter.mkdirSync("folder", options);

      expect(mocks.fsMock.mkdirSync).toHaveBeenCalledWith("folder", options);
    });

    it("delegates closeSync", () => {
      fsAdapter.closeSync(3);

      expect(mocks.fsMock.closeSync).toHaveBeenCalledWith(3);
    });

    it("delegates openSync", () => {
      fsAdapter.openSync("a.txt", "r", 0o644);

      expect(mocks.fsMock.openSync).toHaveBeenCalledWith("a.txt", "r", 0o644);
    });

    it("delegates open", () => {
      fsAdapter.open("a.txt", "r");

      expect(mocks.fsMock.open).toHaveBeenCalledWith("a.txt", "r");
    });

    it("delegates fstat", () => {
      fsAdapter.fstat(3);

      expect(mocks.fsMock.fstat).toHaveBeenCalledWith(3);
    });

    it("delegates read", () => {
      const buffer = new Uint8Array(10);
      fsAdapter.read(3, buffer, 0, 10, 0);

      expect(mocks.fsMock.read).toHaveBeenCalledWith(3, buffer, 0, 10, 0);
    });

    it("delegates close", () => {
      fsAdapter.close(3);

      expect(mocks.fsMock.close).toHaveBeenCalledWith(3);
    });
  });

  describe("envParseAdapter", () => {
    it("delegates deserializeDotenv", () => {
      const parsed = { obj: { A: "B" } };
      mocks.deserializeMock.mockReturnValue(parsed);

      const result = envParseAdapter.deserializeDotenv("A=B");

      expect(result).toBe(parsed);
      expect(mocks.deserializeMock).toHaveBeenCalledWith("A=B");
    });

    it("returns the same result as teamsfx-core isTestToolEnabledProject", () => {
      const { isTestToolEnabledProject } = require("@microsoft/teamsfx-core");
      const result = envParseAdapter.isTestToolEnabledProject("c:/project");
      const expected = isTestToolEnabledProject("c:/project");

      expect(result).toBe(expected);
    });
  });

  describe("processAdapter", () => {
    it("delegates platform", () => {
      mocks.platformMock.mockReturnValue("win32");

      const result = processAdapter.platform();

      expect(result).toBe("win32");
      expect(mocks.platformMock).toHaveBeenCalled();
    });

    it("delegates type", () => {
      mocks.typeMock.mockReturnValue("Windows_NT");

      const result = processAdapter.type();

      expect(result).toBe("Windows_NT");
      expect(mocks.typeMock).toHaveBeenCalled();
    });

    it("delegates exec", () => {
      const callback = vi.fn();
      processAdapter.exec("echo hi", callback);

      expect(mocks.execMock).toHaveBeenCalledWith("echo hi", callback);
    });

    it("delegates execWithOptions", () => {
      const callback = vi.fn();
      const options = { cwd: "c:/work" };
      processAdapter.execWithOptions("echo hi", options, callback);

      expect(mocks.execMock).toHaveBeenCalledWith("echo hi", options, callback);
    });

    it("delegates killTree", () => {
      const callback = vi.fn();
      processAdapter.killTree(100, "SIGTERM", callback);

      expect(mocks.killMock).toHaveBeenCalledWith(100, "SIGTERM", callback);
    });
  });

  describe("pathAdapter", () => {
    it("delegates join", () => {
      mocks.joinMock.mockReturnValue("a/b");

      const result = pathAdapter.join("a", "b");

      expect(result).toBe("a/b");
      expect(mocks.joinMock).toHaveBeenCalledWith("a", "b");
    });

    it("delegates resolve", () => {
      mocks.resolveMock.mockReturnValue("/a/b");

      const result = pathAdapter.resolve("a", "b");

      expect(result).toBe("/a/b");
      expect(mocks.resolveMock).toHaveBeenCalledWith("a", "b");
    });

    it("delegates dirname", () => {
      mocks.dirnameMock.mockReturnValue("/a");

      const result = pathAdapter.dirname("/a/b.txt");

      expect(result).toBe("/a");
      expect(mocks.dirnameMock).toHaveBeenCalledWith("/a/b.txt");
    });

    it("delegates basename", () => {
      mocks.basenameMock.mockReturnValue("b");

      const result = pathAdapter.basename("/a/b.txt", ".txt");

      expect(result).toBe("b");
      expect(mocks.basenameMock).toHaveBeenCalledWith("/a/b.txt", ".txt");
    });
  });

  describe("globAdapter", () => {
    it("delegates glob", async () => {
      mocks.globMock.mockResolvedValue(["a.ts"]);

      const result = await globAdapter.glob("**/*.ts", { cwd: "c:/work" });

      expect(result).toEqual(["a.ts"]);
      expect(mocks.globMock).toHaveBeenCalledWith("**/*.ts", { cwd: "c:/work" });
    });
  });
});
