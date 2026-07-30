// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Platform, SystemError, UserError } from "@microsoft/teamsfx-api";
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
import {
  TemplateFileEntry,
  TemplateSource,
  openDeclarativePackage,
  validateMinEngineVersion,
} from "../../../src/v4";
import { mcpAuthScaffoldDeps } from "../../../src/v4/mcp/mcpAuthScaffold";
import { createStepRegistry } from "../../../src/v4/runtime/runtimeRegistry";

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

describe("v4TemplateBridge engine compatibility", () => {
  it("uses an engine capability version that admits the current in-tree descriptors", async () => {
    const descriptor = await fs.readJson(
      path.resolve(__dirname, "../../../../../templates/v4/create/da/mcp-server/descriptor.json")
    );

    const result = validateMinEngineVersion(
      "create",
      "da/mcp-server",
      descriptor,
      v4TemplateBridgeDeps.engineVersion(),
      (name, message) => new UserError({ source: "Scaffold", name, message })
    );

    assert.isTrue(result.isOk(), result.isErr() ? result.error.message : "expected compatible");
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
  const V4_DIR = path.resolve(__dirname, "../../../../../templates/v4");
  let fullChannelBytesCache: Buffer | undefined;

  function channelBytes(): Buffer {
    const zip = new AdmZip();
    zip.addLocalFolder(PKG_DIR, "v4/create/da/mcp-server");
    return zip.toBuffer();
  }

  function fullChannelBytes(): Buffer {
    if (fullChannelBytesCache === undefined) {
      const zip = new AdmZip();
      zip.addLocalFolder(V4_DIR, "v4");
      fullChannelBytesCache = zip.toBuffer();
    }
    return fullChannelBytesCache;
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "v4decl-"));
    vi.spyOn(v4TemplateBridgeDeps, "createTemplateSourcePort").mockReturnValue({} as any);
    vi.spyOn(v4TemplateBridgeDeps, "loadBundledFloor").mockReturnValue({} as any);
    vi.spyOn(v4TemplateBridgeDeps, "engineVersion").mockReturnValue("6.11.0");
    vi.spyOn(v4TemplateBridgeDeps, "validateDeclarativePackageArchive").mockImplementation(
      (bytes, packageLocator) => openDeclarativePackage(bytes, packageLocator)
    );
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

  it("forwards a bound step registry into the on-disk runtime", async () => {
    const ctx = makeContext("da-mcp", tmpDir, {});
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(channelBytes()));
    let resolveCalls = 0;

    await scaffoldDeclarativeFromV4Channel(
      ctx,
      locator,
      { mcpServerType: "remote", mcpServerUrl: "https://api.github.com/mcp", authType: "none" },
      { appName: "MyMcpAgent", language: "common" },
      {},
      (name) => name === "TEAMSFX_SENSITIVITY_LABEL",
      undefined,
      createStepRegistry({
        resolveId: async (): Promise<string> => {
          resolveCalls += 1;
          return "general-label-id";
        },
      })
    );

    const manifest = JSON.parse(
      await fs.readFile(path.join(tmpDir, "appPackage", "declarativeAgent.json"), "utf8")
    );
    assert.strictEqual(resolveCalls, 1);
    assert.strictEqual(manifest.sensitivity_label.id, "general-label-id");
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

  it("rejects a package that requires a newer engine before writing files", async () => {
    const ctx = makeContext("da-mcp", tmpDir, {});
    vi.mocked(v4TemplateBridgeDeps.engineVersion).mockReturnValue("6.10.2");
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(fullChannelBytes()));
    vi.mocked(v4TemplateBridgeDeps.validateDeclarativePackageArchive).mockRestore();

    await expect(
      scaffoldDeclarativeFromV4Channel(
        ctx,
        locator,
        { mcpServerType: "remote", mcpServerUrl: "https://api.github.com/mcp", authType: "none" },
        { appName: "MyMcpAgent", language: "common" },
        {}
      )
    ).rejects.toMatchObject({ name: "TemplatePackageEngineTooOld" });

    assert.deepEqual(await fs.readdir(tmpDir), []);
    assert.isUndefined(ctx.outputs);
  });

  it("AC-20: rejects malformed package metadata before writing files", async () => {
    const ctx = makeContext("da-mcp", tmpDir, {});
    const zip = new AdmZip(fullChannelBytes());
    const questions = zip.getEntry("v4/create/da/mcp-server/questions.json");
    assert.isNotNull(questions);
    questions!.setData(Buffer.from(JSON.stringify({ questions: "not-an-array" })));
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(zip.toBuffer()));
    vi.mocked(v4TemplateBridgeDeps.validateDeclarativePackageArchive).mockRestore();

    const scaffoldResult = scaffoldDeclarativeFromV4Channel(
      ctx,
      locator,
      { mcpServerType: "remote", mcpServerUrl: "https://api.github.com/mcp", authType: "none" },
      { appName: "MyMcpAgent", language: "common" },
      {}
    );

    await expect(scaffoldResult).rejects.toBeInstanceOf(UserError);
    await expect(scaffoldResult).rejects.toMatchObject({
      name: "TemplatePackageSchema",
      source: "Scaffold",
    });

    assert.deepEqual(await fs.readdir(tmpDir), []);
    assert.isUndefined(ctx.outputs);
  });

  it("rejects unsafe archive paths as runtime SystemErrors before writing files", async () => {
    const ctx = makeContext("da-mcp", tmpDir, {});
    const zip = new AdmZip(fullChannelBytes());
    zip.addFile("v4/create/da/mcp-server/content/z:/payload.txt", Buffer.from("unsafe"));
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(zip.toBuffer()));
    vi.mocked(v4TemplateBridgeDeps.validateDeclarativePackageArchive).mockRestore();

    const scaffoldResult = scaffoldDeclarativeFromV4Channel(
      ctx,
      locator,
      { mcpServerType: "remote", mcpServerUrl: "https://api.github.com/mcp", authType: "none" },
      { appName: "MyMcpAgent", language: "common" },
      {}
    );

    await expect(scaffoldResult).rejects.toBeInstanceOf(SystemError);
    await expect(scaffoldResult).rejects.toMatchObject({
      name: "TemplatePackageUnsafePath",
      source: "Scaffold",
    });

    assert.deepEqual(await fs.readdir(tmpDir), []);
    assert.isUndefined(ctx.outputs);
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
      },
      { appName: "MyMcpAgent", language: "common" },
      {}
    );

    const body = (await fs.readFile(path.join(tmpDir, "appPackage", "ai-plugin.json"))).toString();
    assert.include(body, '"type": "OAuthPluginVault"');
    assert.notInclude(body, '"type": "None"');
  });

  it("runs the entra-sso pipeline steps onto disk (yml register action + registration placeholder)", async () => {
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
      },
      { appName: "MyMcpAgent", language: "common" },
      {}
    );

    // the plugin manifest carries the vault auth block with the url-derived ref
    const body = (await fs.readFile(path.join(tmpDir, "appPackage", "ai-plugin.json"))).toString();
    assert.include(body, '"type": "OAuthPluginVault"');
    assert.include(body, "MCP_DA_AUTH_ID_APIGITHUBC");
    // the inject-yml-action step welded the oauth/register (Entra) action into the yml
    const yml = (await fs.readFile(path.join(tmpDir, "m365agents.yml"))).toString();
    assert.include(yml, "oauth/register");
    assert.include(yml, "identityProvider: MicrosoftEntra");
    assert.include(yml, "MCP_DA_AUTH_ID_APIGITHUBC");
    // the persist-credential-env step seeded the registration-result placeholder into the env file
    const env = (await fs.readFile(path.join(tmpDir, "env", ".env.dev"))).toString();
    assert.include(env, "MCP_DA_AUTH_ID_APIGITHUBC");
  });

  it("logs a warning when MCP auth metadata discovery fails without failing scaffold", async () => {
    const ctx = makeContext("da-mcp", tmpDir, {});
    const warning = vi.spyOn(ctx.logProvider, "warning");
    vi.spyOn(mcpAuthScaffoldDeps, "probeMCPServerAuth").mockRejectedValue(
      new Error("metadata unavailable")
    );
    vi.spyOn(v4TemplateBridgeDeps, "resolveLocalTemplateSource").mockReturnValue(source);
    vi.spyOn(v4TemplateBridgeDeps, "loadResolvedPackage").mockReturnValue(ok(channelBytes()));

    await scaffoldDeclarativeFromV4Channel(
      ctx,
      locator,
      {
        mcpServerType: "remote",
        mcpServerUrl: "https://api.github.com/mcp",
        authType: "oauth",
      },
      { appName: "MyMcpAgent", language: "common" },
      {}
    );

    assert.equal(warning.mock.calls.length, 2);
    assert.include(warning.mock.calls[0][0], "metadata unavailable");
    // the action is still injected, with placeholders the developer must replace
    assert.include(warning.mock.calls[1][0], "authorizationUrl");
    assert.include(warning.mock.calls[1][0], "tokenUrl");
    // and the typed warnings come back on the context so the caller can put them on the result
    assert.deepEqual(
      (ctx.warnings ?? []).map((entry) => entry.type),
      ["mcpAuthMetadataError", "mcpAuthOAuthUrlPlaceholder"]
    );
    assert.include(
      (await fs.readFile(path.join(tmpDir, "m365agents.yml"))).toString(),
      "oauth/register"
    );
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
