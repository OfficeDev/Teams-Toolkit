// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ConfigFolderName, err, ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import os from "os";
import path from "path";
import stream, { Readable } from "stream";
import { getLocalizedString } from "../../../../src/common/localizeUtils";
import { NodeChecker } from "../../../../src/component/deps-checker/internal/nodeChecker";
import * as httpClientDeps from "../../../../src/component/driver/devTool/httpClient";
import { httpClient } from "../../../../src/component/driver/devTool/httpClient";
import {
  NodeDownloadMirror,
  nodejsInstaller,
  NodejsMirrors,
} from "../../../../src/component/driver/devTool/nodeInstaller";
import { UserCancelError } from "../../../../src/error";
import { InstallNodeJSError } from "../../../../src/error/depCheck";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";
import { assert, vi } from "vitest";

describe("NodeJS Installer", () => {
  const sandbox = vi;

  function createMockResponse(
    body: Readable | undefined,
    status = 200,
    headers?: Record<string, string>
  ) {
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: {
        get: (name: string) => headers?.[name.toLowerCase()] ?? headers?.[name] ?? null,
      },
      body,
    } as any;
  }

  describe("HttpClient", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe("get", () => {
      it("fetch return 500", async () => {
        vi.spyOn(httpClientDeps.httpClientDeps, "fetch").mockResolvedValue({
          ok: false,
          status: 500,
        } as any);
        try {
          await httpClient.get("https://test.com");
        } catch (e: any) {
          assert.equal(e.message, "Request failed with status 500");
        }
      });

      it("happy", async () => {
        const buffer = Buffer.from("chunk1");
        const fakeResponse = createMockResponse(Readable.from(buffer), 200, {
          "content-type": "application/json",
        });
        vi.spyOn(httpClientDeps.httpClientDeps, "fetch").mockResolvedValue(fakeResponse);
        const result = await httpClient.get("https://test.com", { progress: () => {} });
        assert.equal(result.toString(), "chunk1");
      });

      it("should pass AbortSignal to fetch", async () => {
        const buffer = Buffer.from("data");
        const fakeResponse = createMockResponse(Readable.from(buffer), 200);
        const stub = vi
          .spyOn(httpClientDeps.httpClientDeps, "fetch")
          .mockResolvedValue(fakeResponse);
        await httpClient.get("https://test.com", { timeout: 5000 });
        assert.isTrue(stub.mock.calls.length === 1);
        const init = stub.mock.calls[0][1] as any;
        assert.isDefined(init.signal, "signal should be passed to fetch");
        assert.instanceOf(init.signal, AbortSignal);
      });

      it("should abort on timeout", async () => {
        const stub = vi
          .spyOn(httpClientDeps.httpClientDeps, "fetch")
          .mockImplementation(async (_url, init) => {
            // Wait longer than the timeout
            await new Promise((resolve, reject) => {
              (init as any).signal.addEventListener("abort", () =>
                reject(new Error("The operation was aborted"))
              );
              setTimeout(resolve, 5000);
            });
            return createMockResponse(undefined, 200);
          });
        try {
          await httpClient.get("https://test.com", { timeout: 50 });
          assert.fail("Expected abort error");
        } catch (e: any) {
          assert.include(e.message, "aborted");
        }
      });
    });

    it("getText", async () => {
      vi.spyOn(httpClient, "get").mockResolvedValue(Buffer.from("chunk1chunk2"));
      const result = await httpClient.getText("https://test.com");
      assert.equal(result, "chunk1chunk2");
    });

    describe("headTime", () => {
      it("fetch return 500", async () => {
        vi.spyOn(httpClientDeps.httpClientDeps, "fetch").mockResolvedValue({
          ok: false,
          status: 500,
        } as any);
        try {
          await httpClient.headTime("https://test.com");
        } catch (e: any) {
          assert.equal(e.message, "Request failed with status 500");
        }
      });

      it("happy", async () => {
        const fakeResponse = createMockResponse(undefined, 200, {
          "content-type": "application/json",
        });
        vi.spyOn(httpClientDeps.httpClientDeps, "fetch").mockResolvedValue(fakeResponse);
        const result = await httpClient.headTime("https://test.com");
        assert.isDefined(result);
      });

      it("should pass AbortSignal to fetch for HEAD requests", async () => {
        const fakeResponse = createMockResponse(undefined, 200);
        const stub = vi
          .spyOn(httpClientDeps.httpClientDeps, "fetch")
          .mockResolvedValue(fakeResponse);
        await httpClient.headTime("https://test.com", { timeout: 5000 });
        assert.isTrue(stub.mock.calls.length === 1);
        const init = stub.mock.calls[0][1] as any;
        assert.isDefined(init.signal, "signal should be passed to fetch");
        assert.instanceOf(init.signal, AbortSignal);
        assert.equal(init.method, "HEAD");
      });
    });
  });

  describe("NodejsInstaller", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe("getNameAndExt", () => {
      it("darwin-arm64", async () => {
        vi.spyOn(os, "platform").mockReturnValue("darwin");
        vi.spyOn(os, "arch").mockReturnValue("arm64");
        const { name, ext } = nodejsInstaller.getNameAndExt();
        assert.equal(name, "darwin-arm64");
        assert.equal(ext, ".tar.xz");
      });
      it("linux-x64", async () => {
        vi.spyOn(os, "platform").mockReturnValue("linux");
        vi.spyOn(os, "arch").mockReturnValue("x64");
        const { name, ext } = nodejsInstaller.getNameAndExt();
        assert.equal(name, "linux-x64");
        assert.equal(ext, ".tar.xz");
      });
      it("win-x64", async () => {
        vi.spyOn(os, "platform").mockReturnValue("win32");
        vi.spyOn(os, "arch").mockReturnValue("x64");
        const { name, ext } = nodejsInstaller.getNameAndExt();
        assert.equal(name, "win-x64");
        assert.equal(ext, ".zip");
      });
      it("aix-x64", async () => {
        vi.spyOn(os, "platform").mockReturnValue("aix");
        vi.spyOn(os, "arch").mockReturnValue("x64");
        const { name, ext } = nodejsInstaller.getNameAndExt();
        assert.equal(name, "aix-x64");
        assert.equal(ext, ".tar.gz");
      });
    });
  });

  describe("getLatestLTSVersion", () => {
    it("happy", async () => {
      const mirror: NodeDownloadMirror = {
        url: "https://nodejs.org/dist",
        name: "test mirror",
        indexJsonUrl: "https://nodejs.org/dist/index.json",
        packageUrlTpl: NodejsMirrors[0].packageUrlTpl,
        indexJson: [
          {
            version: "v23.0.0",
            lts: false,
          },
          {
            version: "v22.0.0",
            lts: "Argon",
          },
        ],
      };
      const version = nodejsInstaller.getLatestLTSVersion(mirror);
      assert.equal(version, "v22.0.0");
    });

    it("LTS not found", async () => {
      const mirror: NodeDownloadMirror = {
        url: "https://nodejs.org/dist",
        name: "test mirror",
        indexJsonUrl: "https://nodejs.org/dist/index.json",
        packageUrlTpl: NodejsMirrors[0].packageUrlTpl,
        indexJson: [
          {
            version: "v23.0.0",
            lts: false,
          },
          {
            version: "v22.0.0",
            lts: false,
          },
        ],
      };
      const version = nodejsInstaller.getLatestLTSVersion(mirror);
      assert.isUndefined(version);
    });
  });

  describe("fetchJSON", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("happy", async () => {
      vi.spyOn(httpClient, "getText").mockResolvedValue(JSON.stringify({ version: "v22.0.0" }));
      const jsonRes = await nodejsInstaller.fetchJSON("test url");
      assert.isTrue(jsonRes.isOk());
      if (jsonRes.isOk()) {
        assert.deepEqual(jsonRes.value, { version: "v22.0.0" });
      }
    });

    it("error", async () => {
      vi.spyOn(httpClient, "getText").mockRejectedValue(new Error("test error"));
      const jsonRes = await nodejsInstaller.fetchJSON("test url");
      assert.isTrue(jsonRes.isErr());
      if (jsonRes.isErr()) {
        assert.isTrue(jsonRes.error instanceof InstallNodeJSError);
      }
    });
  });

  describe("fetchString", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("happy", async () => {
      vi.spyOn(httpClient, "getText").mockResolvedValue("abcd");
      const textRes = await nodejsInstaller.fetchString("test url");
      assert.isTrue(textRes.isOk());
      if (textRes.isOk()) {
        assert.deepEqual(textRes.value, "abcd");
      }
    });

    it("error", async () => {
      vi.spyOn(httpClient, "getText").mockRejectedValue(new Error("test error"));
      const textRes = await nodejsInstaller.fetchString("test url");
      assert.isTrue(textRes.isErr());
      if (textRes.isErr()) {
        assert.isTrue(textRes.error instanceof InstallNodeJSError);
      }
    });
  });

  describe("fetchBinary", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("happy", async () => {
      vi.spyOn(httpClient, "get").mockResolvedValue(Buffer.from("abcd"));
      const binRes = await nodejsInstaller.fetchBinary("test url");
      assert.isTrue(binRes.isOk());
      if (binRes.isOk()) {
        assert.deepEqual(binRes.value.toString(), "abcd");
      }
    });

    it("happy with progress", async () => {
      const buffer = Buffer.from("chunk1");
      const fakeResponse = createMockResponse(Readable.from(buffer), 200, {
        "content-type": "application/json",
        "content-length": `${buffer.length}`,
      });
      vi.spyOn(httpClientDeps.httpClientDeps, "fetch").mockResolvedValue(fakeResponse);
      const binRes = await nodejsInstaller.fetchBinary("test url", 1000, (process: string) => {});
      assert.isTrue(binRes.isOk());
      if (binRes.isOk()) {
        assert.deepEqual(binRes.value.toString(), "chunk1");
      }
    });

    it("error", async () => {
      vi.spyOn(httpClient, "get").mockRejectedValue(new Error("test error"));
      const binRes = await nodejsInstaller.fetchBinary("test url");
      assert.isTrue(binRes.isErr());
      if (binRes.isErr()) {
        assert.isTrue(binRes.error instanceof InstallNodeJSError);
      }
    });
  });

  describe("resolveUrl", () => {
    it("absolute url", async () => {
      const url = nodejsInstaller.resolveUrl(
        "https://registry.npmmirror.com/-/binary/node/",
        "https://registry.npmmirror.com/-/binary/node/index.json"
      );
      assert.equal(url, "https://registry.npmmirror.com/-/binary/node/index.json");
    });
    it("relative to base url, target is folder", async () => {
      const url = nodejsInstaller.resolveUrl("https://nodejs.org/dist/", "v0.11.7/");
      assert.equal(url, "https://nodejs.org/dist/v0.11.7/");
    });
    it("relative to base url, target is a file", async () => {
      const url = nodejsInstaller.resolveUrl("https://example.com/path/to/page.html", "image.jpg");
      assert.equal(url, "https://example.com/path/to/image.jpg");
    });
    it("relative to domain", async () => {
      const url = nodejsInstaller.resolveUrl(
        "https://nodejs.org/dist/v22.14.0/",
        "/dist/latest-v22.x/node-v22.14.0-linux-armv7l.tar.gz"
      );
      assert.equal(url, "https://nodejs.org/dist/latest-v22.x/node-v22.14.0-linux-armv7l.tar.gz");
    });
  });

  describe("testMirrorSpeed", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("error", async () => {
      vi.spyOn(httpClient, "getText").mockRejectedValue(new Error("test error"));
      const mirror: NodeDownloadMirror = {
        url: "https://nodejs.org/dist",
        name: "test mirror",
        indexJsonUrl: "https://nodejs.org/dist/index.json",
        packageUrlTpl: NodejsMirrors[0].packageUrlTpl,
      };
      const res = await nodejsInstaller.testMirrorSpeed(mirror, "win-x64", ".zip", 1000);
      assert.isUndefined(res.indexJson);
    });
    it("no lts version", async () => {
      vi.spyOn(httpClient, "getText").mockResolvedValue("[]");
      const mirror: NodeDownloadMirror = {
        url: "https://nodejs.org/dist",
        name: "test mirror",
        indexJsonUrl: "https://nodejs.org/dist/index.json",
        packageUrlTpl: NodejsMirrors[0].packageUrlTpl,
      };
      const res = await nodejsInstaller.testMirrorSpeed(mirror, "win-x64", ".zip", 1000);
      assert.deepEqual(res.indexJson, []);
      assert.isUndefined(res.version);
    });
    // it("get download url fail", async () => {
    //   vi.spyOn(httpClient, "headTime").mockResolvedValue(1000);
    //   vi.spyOn(httpClient, "getText").mockResolvedValue("[]");
    //   vi.spyOn(nodejsInstaller, "getLatestLTSVersion").mockReturnValue("v22.14.0");
    //   sandbox
    //     .stub(nodejsInstaller, "getDownloadUrl")
    //     .mockResolvedValue(err(new InstallNodeJSError("test error")));
    //   const mirror: NodeDownloadMirror = {
    //     url: "https://nodejs.org/dist",
    //     name: "test mirror",
    //     indexJsonUrl: "https://nodejs.org/dist/index.json",
    //     packageUrlTpl: FirstPriorityMirror.packageUrlTpl,
    //   };
    //   const res = await nodejsInstaller.testMirrorSpeed(mirror, "win-x64", ".zip", 1000);
    //   assert.deepEqual(res.indexJson, []);
    //   assert.isDefined(res.version);
    //   assert.isUndefined(res.packageUrl);
    // });

    it("success", async () => {
      vi.spyOn(httpClient, "headTime").mockResolvedValue(1000);
      vi.spyOn(httpClient, "getText").mockResolvedValue("[]");
      vi.spyOn(nodejsInstaller, "getLatestLTSVersion").mockReturnValue("v22.14.0");
      // sandbox
      //   .stub(nodejsInstaller, "getDownloadUrl")
      //   .mockResolvedValue(ok("https://node-v22.14.0-win-x64.zip"));
      const res = await nodejsInstaller.testMirrorSpeed(NodejsMirrors[0], "win-x64", ".zip", 1000);
      assert.deepEqual(res.indexJson, []);
      assert.equal(res.version, "v22.14.0");
      assert.equal(
        res.packageUrl,
        "https://cdn.npmmirror.com/binaries/node/v22.14.0/node-v22.14.0-win-x64.zip"
      );
    });
  });

  describe("getBestMirror", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    // it("FirstPriorityMirror success", async () => {
    //   const mirror: NodeDownloadMirror = {
    //     url: "https://nodejs.org/dist",
    //     name: "test mirror",
    //     indexJsonUrl: "https://nodejs.org/dist/index.json",
    //     packageUrlTpl: FirstPriorityMirror.packageUrlTpl,
    //     packageUrl: "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip",
    //   };
    //   vi.spyOn(nodejsInstaller, "testMirrorSpeed").mockResolvedValue(mirror);
    //   const resultMirror = await nodejsInstaller.getBestMirror("win-x64", ".zip");
    //   assert.equal(resultMirror, mirror);
    // });

    it("happy", async () => {
      const successMirror: NodeDownloadMirror = {
        url: "https://nodejs.org/dist",
        name: "test mirror",
        indexJsonUrl: "https://nodejs.org/dist/index.json",
        packageUrl: "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip",
        packageUrlTpl: NodejsMirrors[0].packageUrlTpl,
      };
      vi.spyOn(nodejsInstaller, "testMirrorSpeed").mockResolvedValue(successMirror);
      const resultMirror = await nodejsInstaller.getBestMirror("win-x64", ".zip");
      assert.equal(resultMirror, successMirror);
    });

    it("all fail", async () => {
      const failMirror: NodeDownloadMirror = {
        url: "https://nodejs.org/dist",
        name: "test mirror",
        indexJsonUrl: "https://nodejs.org/dist/index.json",
        packageUrlTpl: NodejsMirrors[0].packageUrlTpl,
      };
      vi.spyOn(nodejsInstaller, "testMirrorSpeed").mockResolvedValue(failMirror);
      const resultMirror = await nodejsInstaller.getBestMirror("win-x64", ".zip");
      assert.isUndefined(resultMirror);
    });
  });

  describe("parseHtmlToGetUrl", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("found", async () => {
      const packageUrl = nodejsInstaller.parseHtmlToGetUrl(
        "https://nodejs.org/dist/v22.14.0/",
        '<a href="/dist/v22.14.0/node-v22.14.0-win-x64.zip">node-v22.14.0-win-x64.zip</a>',
        "v22.14.0-win-x64.zip"
      );
      assert.equal(packageUrl, "https://nodejs.org/dist/v22.14.0/node-v22.14.0-win-x64.zip");
    });
    it("not found", async () => {
      const packageUrl = nodejsInstaller.parseHtmlToGetUrl(
        "https://nodejs.org/dist/v22.14.0/",
        '<a href="/dist/v22.14.0/node-v22.14.0-win-x64.zip">node-v22.14.0-win-x64.zip</a>',
        "v22.14.0-linux-x64.zip"
      );
      assert.isUndefined(packageUrl);
    });
  });

  describe("extractPackage", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("extractZip", async () => {
      vi.spyOn(nodejsInstaller, "getAdmZip").mockReturnValue({
        extractAllTo: () => {},
      } as any);
      nodejsInstaller.extractZip(Buffer.from(""), "/path/to/dest");
    });
    it("extractTar", async () => {
      vi.spyOn(stream.PassThrough.prototype, "end").mockReturnValue({} as any);
      vi.spyOn(stream.PassThrough.prototype, "pipe").mockReturnValue({} as any);
      nodejsInstaller.extractTar(Buffer.from(""), "test.tar.gz", "/path/to/dest");
      nodejsInstaller.extractTar(Buffer.from(""), "test.tar.xz", "/path/to/dest");
    });
    it("extractPackage", async () => {
      vi.spyOn(nodejsInstaller, "extractZip").mockReturnValue();
      vi.spyOn(nodejsInstaller, "extractTar").mockReturnValue();
      nodejsInstaller.extractPackage(Buffer.from(""), "test.tar.gz", "/path/to/dest");
      nodejsInstaller.extractPackage(Buffer.from(""), "test.tar.xz", "/path/to/dest");
      nodejsInstaller.extractPackage(Buffer.from(""), "test.zip", "/path/to/dest");
    });
  });

  describe("getDownloadUrl", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("happy", async () => {
      const downloadUrl = await nodejsInstaller.getDownloadUrl(
        NodejsMirrors[0],
        "v22.14.0",
        "win-x64",
        ".zip"
      );
      assert.equal(
        downloadUrl,
        "https://cdn.npmmirror.com/binaries/node/v22.14.0/node-v22.14.0-win-x64.zip"
      );
    });
  });

  describe("ensureNodeJS", () => {
    const context: any = {
      logProvider: new MockedLogProvider(),
      ui: new MockedUserInteraction(),
    };
    beforeEach(() => {
      vi.spyOn(fs, "ensureDir").mockResolvedValue();
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("system installed", async () => {
      vi.spyOn(NodeChecker, "getInstalledNodeVersion").mockResolvedValue({
        version: "v22.14.0",
      } as any);
      const res = await nodejsInstaller.ensureNodeJS(context, true, true);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.deepEqual(res.value, { status: "ignore" });
      }
    });
    it("system not installed, user folder installed", async () => {
      vi.spyOn(NodeChecker, "getInstalledNodeVersion").mockResolvedValue(null);
      vi.spyOn(nodejsInstaller, "getNameAndExt").mockReturnValue({ name: "win-x64", ext: ".zip" });
      vi.spyOn(fs, "readdir").mockResolvedValue(["node-v22.14.0-win-x64"] as any);
      const downloadDir = path.join(os.homedir(), `.${ConfigFolderName}`, "bin", "nodejs");
      const targetDir = path.join(downloadDir, "node-v22.14.0-win-x64");
      const res = await nodejsInstaller.ensureNodeJS(context, true, true);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.deepEqual(res.value, { status: "ignore", installPath: targetDir });
      }
    });

    it("getBestMirror fail", async () => {
      vi.spyOn(NodeChecker, "getInstalledNodeVersion").mockResolvedValue(null);
      vi.spyOn(nodejsInstaller, "getNameAndExt").mockReturnValue({ name: "win-x64", ext: ".zip" });
      vi.spyOn(fs, "readdir").mockResolvedValue([""] as any);
      vi.spyOn(nodejsInstaller, "getBestMirror").mockResolvedValue(undefined);
      const res = await nodejsInstaller.ensureNodeJS(context, true, true);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.include(
          res.error.message,
          getLocalizedString("action.devTool.nodeInstaller.NoMirror")
        );
      }
    });

    it("Confirm cancel", async () => {
      const NpmMirror: NodeDownloadMirror = {
        name: "NPM",
        url: "https://registry.npmmirror.com/-/binary/node/",
        indexJsonUrl: "https://cdn.npmmirror.com/binaries/node/index.json",
        packageUrl: "https://cdn.npmmirror.com/binaries/node/v22.14.0/v22.14.0-win-x64.zip",
        version: "v22.14.0",
        packageUrlTpl: NodejsMirrors[0].packageUrlTpl,
      };
      vi.spyOn(NodeChecker, "getInstalledNodeVersion").mockResolvedValue(null);
      vi.spyOn(nodejsInstaller, "getNameAndExt").mockReturnValue({ name: "win-x64", ext: ".zip" });
      vi.spyOn(fs, "readdir").mockResolvedValue([""] as any);
      vi.spyOn(nodejsInstaller, "getBestMirror").mockResolvedValue(NpmMirror);
      vi.spyOn(context.ui, "confirm").mockResolvedValue(err(new UserCancelError()));
      const res = await nodejsInstaller.ensureNodeJS(context, true, true);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.isTrue(res.error instanceof UserCancelError);
      }
    });

    it("fetchBinary fail", async () => {
      const NpmMirror: NodeDownloadMirror = {
        name: "NPM",
        url: "https://registry.npmmirror.com/-/binary/node/",
        indexJsonUrl: "https://cdn.npmmirror.com/binaries/node/index.json",
        packageUrl: "https://cdn.npmmirror.com/binaries/node/v22.14.0/v22.14.0-win-x64.zip",
        version: "v22.14.0",
        packageUrlTpl: NodejsMirrors[0].packageUrlTpl,
      };
      vi.spyOn(NodeChecker, "getInstalledNodeVersion").mockResolvedValue(null);
      vi.spyOn(nodejsInstaller, "getNameAndExt").mockReturnValue({ name: "win-x64", ext: ".zip" });
      vi.spyOn(fs, "readdir").mockResolvedValue([""] as any);
      vi.spyOn(nodejsInstaller, "getBestMirror").mockResolvedValue(NpmMirror);
      vi.spyOn(context.ui, "confirm").mockResolvedValue(ok({ type: "success", result: true }));
      vi.spyOn(nodejsInstaller, "fetchBinary").mockResolvedValue(
        err(new InstallNodeJSError("test error"))
      );
      const res = await nodejsInstaller.ensureNodeJS(context, true, true);
      assert.isTrue(res.isErr());
    });

    it("success", async () => {
      const NpmMirror: NodeDownloadMirror = {
        name: "NPM",
        url: "https://registry.npmmirror.com/-/binary/node/",
        indexJsonUrl: "https://cdn.npmmirror.com/binaries/node/index.json",
        packageUrl: "https://cdn.npmmirror.com/binaries/node/v22.14.0/v22.14.0-win-x64.zip",
        packageUrlTpl: NodejsMirrors[0].packageUrlTpl,
        version: "v22.14.0",
      };
      vi.spyOn(NodeChecker, "getInstalledNodeVersion").mockResolvedValue(null);
      vi.spyOn(nodejsInstaller, "getNameAndExt").mockReturnValue({ name: "win-x64", ext: ".zip" });
      vi.spyOn(fs, "readdir").mockResolvedValue([""] as any);
      vi.spyOn(nodejsInstaller, "getBestMirror").mockResolvedValue(NpmMirror);
      vi.spyOn(context.ui, "confirm").mockResolvedValue(ok({ type: "success", result: true }));
      vi.spyOn(nodejsInstaller, "fetchBinary").mockResolvedValue(ok(Buffer.from("test buffer")));
      vi.spyOn(nodejsInstaller, "extractPackage").mockReturnValue();
      const downloadDir = path.join(os.homedir(), `.${ConfigFolderName}`, "bin", "nodejs");
      const targetDir = path.join(downloadDir, "node-v22.14.0-win-x64");
      const res = await nodejsInstaller.ensureNodeJS(context, true, true);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value.status, "installed");
        assert.equal(res.value.installPath, targetDir);
      }
    });

    it("success", async () => {
      const NpmMirror: NodeDownloadMirror = {
        name: "NPM",
        url: "https://registry.npmmirror.com/-/binary/node/",
        indexJsonUrl: "https://cdn.npmmirror.com/binaries/node/index.json",
        packageUrl: "https://cdn.npmmirror.com/binaries/node/v22.14.0/v22.14.0-win-x64.zip",
        packageUrlTpl: NodejsMirrors[0].packageUrlTpl,
        version: "v22.14.0",
      };
      vi.spyOn(NodeChecker, "getInstalledNodeVersion").mockResolvedValue(null);
      vi.spyOn(nodejsInstaller, "getNameAndExt").mockReturnValue({ name: "win-x64", ext: ".zip" });
      vi.spyOn(fs, "readdir").mockResolvedValue([""] as any);
      vi.spyOn(nodejsInstaller, "getBestMirror").mockResolvedValue(NpmMirror);
      vi.spyOn(context.ui, "confirm").mockResolvedValue(ok({ type: "success", result: true }));
      vi.spyOn(nodejsInstaller, "fetchBinary").mockResolvedValue(ok(Buffer.from("test buffer")));
      vi.spyOn(nodejsInstaller, "extractPackage").mockReturnValue();
      const downloadDir = path.join(os.homedir(), `.${ConfigFolderName}`, "bin", "nodejs");
      const targetDir = path.join(downloadDir, "node-v22.14.0-win-x64");
      const res = await nodejsInstaller.ensureNodeJS(context, true, true);
      await nodejsInstaller.ensureNodeJS({} as any, true, true);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value.status, "installed");
        assert.equal(res.value.installPath, targetDir);
      }
    });
  });
  it("getAdmZip", async () => {
    const zipBuffer = Buffer.from("UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==", "base64");
    nodejsInstaller.getAdmZip(zipBuffer);
  });
});
