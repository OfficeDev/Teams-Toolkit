// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform, SystemError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import { err, ok } from "neverthrow";
import os from "os";
import path from "path";
import { assert, expect, vi } from "vitest";
import { TelemetryProperty } from "../../../src/common/telemetry";
import { GeneratorContext } from "../../../src/component/generator/generatorAction";
import {
  renderTemplateFileData,
  renderTemplateFileName,
} from "../../../src/component/generator/utils";
import {
  renderTemplateEntries,
  scaffoldDeclarativeFromV4Channel,
  scaffoldFromV4Channel,
  v4TemplateBridgeDeps,
} from "../../../src/component/generator/v4TemplateBridge";
import { TemplateFileEntry, TemplateSource } from "../../../src/v4";

// Build a GeneratorContext whose rename/data/filter functions mirror exactly
// what DefaultTemplateGenerator.scaffolding constructs, so the render contract
// is validated against the real v3 rendering functions.
function makeContext(
  folderName: string,
  destination: string,
  replaceMap: { [key: string]: string },
  extraFilter?: (fileName: string) => boolean
): GeneratorContext {
  return {
    name: folderName,
    language: "common",
    destination,
    logProvider: {
      debug: () => {},
      info: () => {},
      warning: () => {},
      error: () => {},
    } as any,
    platform: Platform.VSCode,
    fileNameReplaceFn: (fileName, fileData) =>
      renderTemplateFileName(fileName, fileData, replaceMap)
        .replace(/\\/g, "/")
        .replace(`${folderName}/`, ""),
    fileDataReplaceFn: (fileName, fileData) =>
      renderTemplateFileData(fileName, fileData, replaceMap),
    filterFn: (fileName) =>
      fileName.replace(/\\/g, "/").startsWith(`${folderName}/`) &&
      (extraFilter ? extraFilter(fileName) : true),
    onActionError: () => Promise.resolve(),
  };
}

describe("v4TemplateBridge.renderTemplateEntries", () => {
  const sandbox = vi;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "v4bridge-"));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tmpDir);
  });

  it("writes entries with the locator prefix re-added then stripped, returns written paths", async () => {
    const folderName = "declarative-agent-basic";
    const ctx = makeContext(folderName, tmpDir, {});
    const entries: TemplateFileEntry[] = [
      { path: "manifest.json", data: Buffer.from('{"a":1}') },
      { path: "src/index.ts", data: Buffer.from("console.log(1);") },
    ];

    const outputs = await renderTemplateEntries(ctx, entries);

    assert.deepEqual(outputs.sort(), ["manifest.json", "src/index.ts"]);
    assert.strictEqual(
      (await fs.readFile(path.join(tmpDir, "manifest.json"))).toString(),
      '{"a":1}'
    );
    assert.strictEqual(
      (await fs.readFile(path.join(tmpDir, "src/index.ts"))).toString(),
      "console.log(1);"
    );
  });

  it("renders .tpl mustache data and strips the .tpl suffix from the name", async () => {
    const folderName = "bot";
    const ctx = makeContext(folderName, tmpDir, { appName: "MyApp" });
    const entries: TemplateFileEntry[] = [
      { path: "config.json.tpl", data: Buffer.from('{"name":"{{appName}}"}') },
    ];

    const outputs = await renderTemplateEntries(ctx, entries);

    assert.deepEqual(outputs, ["config.json"]);
    assert.strictEqual(
      (await fs.readFile(path.join(tmpDir, "config.json"))).toString(),
      '{"name":"MyApp"}'
    );
  });

  it("does not render data for non-.tpl files (binary preserved verbatim)", async () => {
    const folderName = "bot";
    const ctx = makeContext(folderName, tmpDir, { appName: "MyApp" });
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    const entries: TemplateFileEntry[] = [{ path: "assets/icon.png", data: binary }];

    await renderTemplateEntries(ctx, entries);

    const written = await fs.readFile(path.join(tmpDir, "assets/icon.png"));
    assert.isTrue(written.equals(binary));
  });

  it("excludes entries rejected by the context filterFn", async () => {
    const folderName = "bot";
    const ctx = makeContext(
      folderName,
      tmpDir,
      {},
      (fileName) => !fileName.endsWith(".env.sandbox")
    );
    const entries: TemplateFileEntry[] = [
      { path: "keep.txt", data: Buffer.from("keep") },
      { path: ".env.sandbox", data: Buffer.from("secret") },
    ];

    const outputs = await renderTemplateEntries(ctx, entries);

    assert.deepEqual(outputs, ["keep.txt"]);
    assert.isFalse(await fs.pathExists(path.join(tmpDir, ".env.sandbox")));
  });

  it("respects the trailing-slash locator boundary via the re-added prefix", async () => {
    // folderName "da" must not pick up a sibling whose name starts with "da-".
    // The bridge re-adds "${name}/" so filterFn's startsWith("da/") is exact.
    const folderName = "da";
    const ctx = makeContext(folderName, tmpDir, {});
    const entries: TemplateFileEntry[] = [{ path: "file.txt", data: Buffer.from("x") }];

    const outputs = await renderTemplateEntries(ctx, entries);

    assert.deepEqual(outputs, ["file.txt"]);
    // entryName seen by filterFn is "da/file.txt", which does NOT start with "da-".
    assert.isFalse("da/file.txt".startsWith("da-/"));
  });

  it("writes entries verbatim under the name prefix when no optional fns are set", async () => {
    const ctx: GeneratorContext = {
      name: "bot",
      language: "common",
      destination: tmpDir,
      logProvider: {
        debug: () => {},
        info: () => {},
        warning: () => {},
        error: () => {},
      } as any,
      platform: Platform.VSCode,
      onActionError: () => Promise.resolve(),
    };
    const entries: TemplateFileEntry[] = [{ path: "a.txt", data: Buffer.from("a") }];

    const outputs = await renderTemplateEntries(ctx, entries);

    assert.deepEqual(outputs, ["bot/a.txt"]);
    assert.strictEqual((await fs.readFile(path.join(tmpDir, "bot/a.txt"))).toString(), "a");
  });

  it("rejects an entry whose path escapes the destination (zip-slip)", async () => {
    const folderName = "bot";
    const ctx = makeContext(folderName, tmpDir, {});
    // entryName "bot/../evil.txt" passes the startsWith("bot/") filter but the
    // name-replace strips "bot/" leaving "../evil.txt", which escapes tmpDir.
    const entries: TemplateFileEntry[] = [{ path: "../evil.txt", data: Buffer.from("pwned") }];

    await expect(renderTemplateEntries(ctx, entries)).rejects.toThrow(
      /resolves outside the destination directory/
    );
    assert.isFalse(await fs.pathExists(path.join(path.dirname(tmpDir), "evil.txt")));
  });

  it("allows an in-root filename that starts with '..' (not a traversal segment)", async () => {
    const folderName = "bot";
    const ctx = makeContext(folderName, tmpDir, {});
    // "bot/..foo" name-replaces to "..foo": its relative path starts with ".."
    // but stays inside tmpDir, so it must NOT be rejected.
    const entries: TemplateFileEntry[] = [{ path: "..foo", data: Buffer.from("ok") }];

    const outputs = await renderTemplateEntries(ctx, entries);

    assert.deepEqual(outputs, ["..foo"]);
    assert.strictEqual((await fs.readFile(path.join(tmpDir, "..foo"))).toString(), "ok");
  });
});

describe("v4TemplateBridge.scaffoldFromV4Channel", () => {
  const sandbox = vi;
  let tmpDir: string;
  const locator = { language: "common", scenario: "declarative-agent-basic" };
  const source: TemplateSource = {
    origin: "bundled",
    version: "6.10.1",
    digest: "sha256:abc",
    location: "/floor/templates.zip",
  };

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "v4bridge-"));
    vi.spyOn(v4TemplateBridgeDeps, "createTemplateSourcePort").mockReturnValue({} as any);
    vi.spyOn(v4TemplateBridgeDeps, "loadBundledFloor").mockReturnValue({} as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tmpDir);
  });

  it("resolves, reads, renders and records source telemetry on the happy path", async () => {
    const ctx = makeContext("declarative-agent-basic", tmpDir, {});
    const entries: TemplateFileEntry[] = [{ path: "manifest.json", data: Buffer.from('{"a":1}') }];
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(
      ok(Buffer.from("zip-bytes"))
    );
    vi.spyOn(v4TemplateBridgeDeps, "openTemplatePackage").mockReturnValue(ok(entries));
    const telemetryProps: Record<string, string> = {};

    const result = await scaffoldFromV4Channel(ctx, locator, telemetryProps);

    assert.deepEqual(result, source);
    assert.deepEqual(ctx.outputs, ["manifest.json"]);
    assert.strictEqual(
      (await fs.readFile(path.join(tmpDir, "manifest.json"))).toString(),
      '{"a":1}'
    );
    assert.strictEqual(telemetryProps[TelemetryProperty.TemplatePackageSource], "bundled");
    assert.strictEqual(telemetryProps[TelemetryProperty.TemplatePackageVersion], "6.10.1");
    assert.strictEqual(telemetryProps[TelemetryProperty.TemplatePackageDigest], "sha256:abc");
  });

  it("resolves content through the synchronous local resolver, never the online channel (ADR-0006 INV-T2)", async () => {
    const ctx = makeContext("declarative-agent-basic", tmpDir, {});
    const entries: TemplateFileEntry[] = [{ path: "manifest.json", data: Buffer.from("{}") }];
    const resolveLocal = vi
      .spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource")
      .mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(Buffer.from("zip")));
    vi.spyOn(v4TemplateBridgeDeps, "openTemplatePackage").mockReturnValue(ok(entries));

    await scaffoldFromV4Channel(ctx, locator, {});

    // The create path resolves LOCAL-only: one synchronous call asking for just
    // `{ range, port }` — it never passes `bundled` and never reaches the online
    // resolver, so the scaffold stays off the network.
    assert.isTrue(resolveLocal.mock.calls.length === 1);
    assert.deepEqual(Object.keys(resolveLocal.mock.calls[0][0]).sort(), ["port", "range"]);
  });

  it("throws but still records source telemetry when reading the package fails", async () => {
    const ctx = makeContext("declarative-agent-basic", tmpDir, {});
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(
      err(new SystemError("v4", "DigestMismatch", "bad digest"))
    );
    const telemetryProps: Record<string, string> = {};

    await expect(scaffoldFromV4Channel(ctx, locator, telemetryProps)).rejects.toThrow("bad digest");
    assert.strictEqual(telemetryProps[TelemetryProperty.TemplatePackageVersion], "6.10.1");
    assert.isUndefined(ctx.outputs);
  });

  it("throws when the package cannot be opened", async () => {
    const ctx = makeContext("declarative-agent-basic", tmpDir, {});
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(Buffer.from("zip")));
    vi.spyOn(v4TemplateBridgeDeps, "openTemplatePackage").mockReturnValue(
      err(new SystemError("v4", "OpenFailed", "corrupt zip"))
    );

    await expect(scaffoldFromV4Channel(ctx, locator, {})).rejects.toThrow("corrupt zip");
  });
});

describe("v4TemplateBridge.scaffoldDeclarativeFromV4Channel", () => {
  const sandbox = vi;
  let tmpDir: string;
  const locator = { kind: "create", templateId: "da/mcp-server" };
  const source: TemplateSource = {
    origin: "bundled",
    version: "6.10.1",
    digest: "sha256:abc",
    location: "/floor/templates.zip",
  };
  // The real authored declarative package, zipped under the channel's v4 subtree
  // exactly as `generateV4Zip.js` bundles it, so the bridge exercises the
  // production distribution → declarative-engine path against the live template.
  const PKG_DIR = path.resolve(__dirname, "../../../../../templates/v4/create/da/mcp-server");

  function channelBytes(): Buffer {
    const zip = new AdmZip();
    zip.addLocalFolder(PKG_DIR, "v4/create/da/mcp-server");
    return zip.toBuffer();
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "v4decl-"));
    vi.spyOn(v4TemplateBridgeDeps, "createTemplateSourcePort").mockReturnValue({} as any);
    vi.spyOn(v4TemplateBridgeDeps, "loadBundledFloor").mockReturnValue({} as any);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.remove(tmpDir);
  });

  it("resolves through the channel and runs the declarative engine onto disk (no auth)", async () => {
    const ctx = makeContext("da-mcp", tmpDir, {});
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(channelBytes()));
    const telemetryProps: Record<string, string> = {};

    const result = await scaffoldDeclarativeFromV4Channel(
      ctx,
      locator,
      { mcpServerType: "remote", mcpServerUrl: "https://api.github.com/mcp", authType: "none" },
      { appName: "MyMcpAgent", language: "common" },
      telemetryProps
    );

    assert.deepEqual(result, source);
    // the engine (not the v3 render path) writes the package: the `.tpl` suffix
    // is stripped, the namespace expr is evaluated, and the caller floor's
    // `appName` flows into the body.
    const body = (await fs.readFile(path.join(tmpDir, "appPackage", "ai-plugin.json"))).toString();
    assert.include(body, '"namespace": "apigithubc"');
    assert.include(body, '"name_for_human": "MyMcpAgent"');
    assert.include(body, '"type": "None"');
    assert.include(ctx.outputs ?? [], "appPackage/ai-plugin.json");
    assert.strictEqual(telemetryProps[TelemetryProperty.TemplatePackageSource], "bundled");
    assert.strictEqual(telemetryProps[TelemetryProperty.TemplatePackageVersion], "6.10.1");
  });

  it("uses supplied staged package bytes without resolving the local channel", async () => {
    const ctx = makeContext("da-mcp", tmpDir, {});
    const stagedSource: TemplateSource = {
      origin: "online",
      version: "6.11.0",
      digest: "sha256:staged",
      location: "templates.zip",
    };
    const resolveLocal = vi
      .spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource")
      .mockImplementation(() => {
        throw new Error("local resolver must not run");
      });
    const loadResolved = vi
      .spyOn(v4TemplateBridgeDeps, "loadResolvedPackage")
      .mockImplementation(() => {
        throw new Error("local package loader must not run");
      });
    const telemetryProps: Record<string, string> = {};

    const result = await scaffoldDeclarativeFromV4Channel(
      ctx,
      locator,
      { mcpServerType: "remote", mcpServerUrl: "https://api.github.com/mcp", authType: "none" },
      { appName: "MyMcpAgent", language: "common" },
      telemetryProps,
      undefined,
      { source: stagedSource, bytes: channelBytes() }
    );

    assert.deepEqual(result, stagedSource);
    assert.equal(resolveLocal.mock.calls.length, 0);
    assert.equal(loadResolved.mock.calls.length, 0);
    assert.strictEqual(telemetryProps[TelemetryProperty.TemplatePackageSource], "online");
    assert.strictEqual(telemetryProps[TelemetryProperty.TemplatePackageVersion], "6.11.0");
    assert.strictEqual(telemetryProps[TelemetryProperty.TemplatePackageDigest], "sha256:staged");
    assert.include(ctx.outputs ?? [], "appPackage/ai-plugin.json");
  });

  it("threads the answers into the engine (oauth selects the vault auth block)", async () => {
    const ctx = makeContext("da-mcp", tmpDir, {});
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(channelBytes()));

    await scaffoldDeclarativeFromV4Channel(
      ctx,
      locator,
      {
        mcpServerType: "remote",
        mcpServerUrl: "https://api.github.com/mcp",
        authType: "oauth",
        oauthClientId: "cid",
        oauthClientSecret: "secret",
      },
      { appName: "MyMcpAgent", language: "common" },
      {}
    );

    const body = (await fs.readFile(path.join(tmpDir, "appPackage", "ai-plugin.json"))).toString();
    assert.include(body, '"type": "OAuthPluginVault"');
    assert.notInclude(body, '"type": "None"');
  });

  it("runs the entra-sso pipeline steps onto disk (yml register action + env credential ref)", async () => {
    const ctx = makeContext("da-mcp", tmpDir, {});
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(channelBytes()));

    await scaffoldDeclarativeFromV4Channel(
      ctx,
      locator,
      {
        mcpServerType: "remote",
        mcpServerUrl: "https://api.github.com/mcp",
        authType: "entra-sso",
        entraClientId: "eid",
      },
      { appName: "MyMcpAgent", language: "common" },
      {}
    );

    // the plugin manifest carries the vault auth block with the url-derived ref
    const body = (await fs.readFile(path.join(tmpDir, "appPackage", "ai-plugin.json"))).toString();
    assert.include(body, '"type": "OAuthPluginVault"');
    assert.include(body, "MCP_DA_AUTH_ID_APIGITHUBC");
    // the inject-yml-action step welded the Entra register action into the yml
    const yml = (await fs.readFile(path.join(tmpDir, "m365agents.yml"))).toString();
    assert.include(yml, "microsoftEntra/register");
    assert.include(yml, "MCP_DA_AUTH_ID_APIGITHUBC");
    // the persist-credential-env step seeded the credential ref into the env file
    const env = (await fs.readFile(path.join(tmpDir, "env", ".env.dev"))).toString();
    assert.include(env, "MCP_DA_AUTH_ID_APIGITHUBC");
  });

  it("throws but still records source telemetry when the template id is absent", async () => {
    const ctx = makeContext("da-mcp", tmpDir, {});
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(channelBytes()));
    const telemetryProps: Record<string, string> = {};

    await expect(
      scaffoldDeclarativeFromV4Channel(
        ctx,
        { kind: "create", templateId: "da/does-not-exist" },
        { mcpServerType: "remote", mcpServerUrl: "https://api.github.com/mcp", authType: "none" },
        { appName: "MyMcpAgent", language: "common" },
        telemetryProps
      )
    ).rejects.toThrow();
    assert.strictEqual(telemetryProps[TelemetryProperty.TemplatePackageVersion], "6.10.1");
    assert.isUndefined(ctx.outputs);
  });
});
