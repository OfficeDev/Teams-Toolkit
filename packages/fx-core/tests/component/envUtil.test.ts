import { hooks } from "@feathersjs/hooks/lib";
import {
  err,
  FxError,
  Inputs,
  ok,
  Platform,
  Result,
  Settings,
  UserError,
} from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import * as path from "path";
import { featureFlagManager } from "../../src/common/featureFlags";
import { globalVars, setTools, TOOLS } from "../../src/common/globalVars";
import * as projectTypeChecker from "../../src/common/projectTypeChecker";
import { MetadataV3, MetadataV4 } from "../../src/common/versionMetadata";
import { parseSetOutputCommand } from "../../src/component/driver/script/scriptDriver";
import { manifestUtils } from "../../src/component/driver/teamsApp/utils/ManifestUtils";
import { EnvLoaderMW, EnvWriterMW } from "../../src/component/middleware/envMW";
import { DotenvOutput, dotenvUtil, envUtil } from "../../src/component/utils/envUtil";
import { pathUtils } from "../../src/component/utils/pathUtils";
import { settingsUtil } from "../../src/component/utils/settingsUtil";
import { LocalCrypto } from "../../src/core/crypto";
import { environmentManager } from "../../src/core/environment";
import { FxCore } from "../../src/core/FxCore";
import { ContextInjectorMW } from "../../src/core/middleware/contextInjector";
import { CoreHookContext } from "../../src/core/types";
import {
  FileNotFoundError,
  MissingEnvironmentVariablesError,
  MissingRequiredFileError,
  NoEnvFilesError,
  UserCancelError,
} from "../../src/error/common";
import { MockTools } from "../core/utils";
import { assert, vi } from "vitest";

describe("envUtils", () => {
  const tools = new MockTools();
  setTools(tools);
  const sandbox = vi;
  const cryptoProvider = new LocalCrypto("mockProjectId");
  const decrypted = "123";
  const mockSettings: Settings = {
    trackingId: "mockProjectId",
    version: "1",
  };
  let mockedEnvRestore: RestoreFn = () => {};
  afterEach(() => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });

  describe("pathUtils.getYmlFilePath", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      mockedEnvRestore();
    });
    it("defined in env var of TEAMSFX_CONFIG_FILE_PATH", async () => {
      mockedEnvRestore = mockedEnv({ TEAMSFX_CONFIG_FILE_PATH: "abc.yml" });
      const res1 = pathUtils.getYmlFilePath(".");
      assert.equal(res1, path.join(".", "abc.yml"));
    });
    it("happy path v4 dev by TEAMSFX_ENV", async () => {
      mockedEnvRestore = mockedEnv({ TEAMSFX_ENV: "dev" });
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      const res1 = pathUtils.getYmlFilePath(".");
      assert.equal(res1, path.join(".", MetadataV4.configFile));
    });
    it("happy path v4 dev default", async () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      const res1 = pathUtils.getYmlFilePath(".");
      assert.equal(res1, path.join(".", MetadataV4.configFile));
    });
    it("happy path v4 local", async () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      const res1 = pathUtils.getYmlFilePath(".", "local");
      assert.equal(res1, path.join(".", MetadataV4.localConfigFile));
    });
    it("happy path v4 testtool", async () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      const res1 = pathUtils.getYmlFilePath(".", "playground");
      assert.equal(res1, path.join(".", MetadataV4.testToolConfigFile));
    });
    it("happy path v4 sandbox", async () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(true);
      const res1 = pathUtils.getYmlFilePath(".", "sandbox");
      assert.equal(res1, path.join(".", MetadataV4.sandboxConfigFile));
    });
    it("happy path v3 local", async () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
      const res1 = pathUtils.getYmlFilePath(".", "local");
      assert.equal(res1, path.join(".", MetadataV3.localConfigFile));
    });
    it("happy path v3 testtool", async () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
      const res1 = pathUtils.getYmlFilePath(".", "testtool");
      assert.equal(res1, path.join(".", MetadataV3.testToolConfigFile));
    });
    it("happy path v3 sandbox", async () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValueOnce(false).mockReturnValueOnce(true);
      const res1 = pathUtils.getYmlFilePath(".", "sandbox");
      assert.equal(res1, path.join(".", MetadataV3.sandboxConfigFile));
    });
    it("throw MissingRequiredFileError with env=dev", async () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
      process.env.TEAMSFX_ENV = "dev";
      try {
        pathUtils.getYmlFilePath(".", "dev");
        assert.fail("show not reach here");
      } catch (e) {
        assert.isTrue(e instanceof MissingRequiredFileError);
      }
    });
    it("throw MissingRequiredFileError with env=local", async () => {
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
      process.env.TEAMSFX_ENV = "local";
      try {
        await pathUtils.getYmlFilePath(".", "local");
        assert.fail("show not reach here");
      } catch (e) {
        assert.isTrue(e instanceof MissingRequiredFileError);
      }
    });
    it("happy path for customized yaml path", async () => {
      mockedEnvRestore = mockedEnv({ TEAMSFX_CONFIG_FILE_PATH: "./customized.yml" });
      const res1 = pathUtils.getYmlFilePath(".", "dev");
      assert.equal(res1, "./customized.yml");
    });
  });

  describe("pathUtils.getEnvFolderPath", () => {
    it("happy path", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue(
        "version: 1.0.0\nenvironmentFolderPath: /home/envs" as any
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./xxx");
      const res = await pathUtils.getEnvFolderPath(".");
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value, "/home/envs");
      }
    });
    it("returns default value", async () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
      vi.spyOn(fs, "readFile").mockResolvedValue("version: 1.0.0" as any);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      const res = await pathUtils.getEnvFolderPath("");
      assert.isTrue(res.isOk());
    });
    it("returns undefined value", async () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
      vi.spyOn(fs, "readFile").mockResolvedValue(
        "version: 1.0.0\nenvironmentFolderPath: /home/envs" as any
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await pathUtils.getEnvFolderPath("");
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.isUndefined(res.value);
      }
    });
  });

  describe("pathUtils.getEnvFilePath", () => {
    it("happy path", async () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./xxx");
      vi.spyOn(fs, "readFile").mockResolvedValue(
        "version: 1.0.0\nenvironmentFolderPath: /home/envs" as any
      );
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      const res = await pathUtils.getEnvFilePath(".", "dev");
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value, path.join("/home/envs", ".env.dev"));
      }
    });
    it("returns default value", async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("version: 1.0.0" as any);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./xxx");
      const res = await pathUtils.getEnvFilePath(".", "dev");
      assert.isTrue(res.isOk());
    });
  });
  describe("pathUtils.resolveFilePath", () => {
    const sandbox = vi;
    beforeEach(() => {});
    afterEach(async () => {
      vi.restoreAllMocks();
    });
    it("relative path", async () => {
      const res = pathUtils.resolveFilePath("/test");
      assert.isTrue(res === "\\test" || res === "/test");
    });
    it("absolute path", async () => {
      const res = pathUtils.resolveFilePath("/test", "/test2");
      assert.isTrue(res === "\\test2" || res === "/test2");
    });
  });
  describe("pathUtils.readEnv", () => {
    it("happy path", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      const encRes = await cryptoProvider.encrypt(decrypted);
      if (encRes.isErr()) throw encRes.error;
      const encrypted = encRes.value;
      vi.spyOn(fs, "readFile")
        .mockResolvedValueOnce(
          "TEAMSFX_ENV=env\nTEAMS_APP_ID=testappid\nTAB_ENDPOINT=testendpoint" as any
        )
        .mockResolvedValueOnce(("SECRET_ABC=" + encrypted) as any);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      const res = await envUtil.readEnv(".", "dev");
      assert.isTrue(res.isOk());
      assert.equal(process.env.SECRET_ABC, decrypted);
    });
    it("silent", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      const res = await envUtil.readEnv(".", "dev", false, true);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.deepEqual(res.value, { TEAMSFX_ENV: "dev" });
      }
    });
    it("not silent 1", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      const res = await envUtil.readEnv(".", "dev", false, false);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.isTrue(res.error instanceof FileNotFoundError);
      }
    });
    it("not silent 2", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(""));
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      const res = await envUtil.readEnv(".", "dev", false, false);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.isTrue(res.error instanceof FileNotFoundError);
      }
    });

    it("loadToProcessEnv false", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(".env.dev"));
      const encRes = await cryptoProvider.encrypt(decrypted);
      if (encRes.isErr()) throw encRes.error;
      const encrypted = encRes.value;
      vi.spyOn(fs, "readFile").mockResolvedValue(("SECRET_ABC=" + encrypted) as any);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      const res = await envUtil.readEnv(".", "dev", false);
      assert.isTrue(res.isOk());
      assert.equal(process.env.SECRET_ABC, decrypted);
    });

    it("read settings.json fail", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(".env.dev"));
      vi.spyOn(fs, "readFile").mockResolvedValue("SECRET_ABC=AAA" as any);
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(
        err(new UserError({ source: "test", name: "TestError", message: "message" }))
      );
      const res = await envUtil.readEnv(".", "dev");
      assert.isTrue(res.isErr());
    });
  });

  it("MissingEnvironmentVariablesError", async () => {
    const error1 = new MissingEnvironmentVariablesError("test", "ABC", "./abc.yml");
    assert.isTrue(error1.message.includes("abc.yml"));
    globalVars.ymlFilePath = "./abc.yml";
    const error2 = new MissingEnvironmentVariablesError("test", "ABC");
    assert.isTrue(error2.message.includes("abc.yml"));
    globalVars.ymlFilePath = "";
    const error3 = new MissingEnvironmentVariablesError("test", "ABC");
    assert.isFalse(error3.message.includes("abc.yml"));
  });

  describe("pathUtils.writeEnv", () => {
    beforeEach(() => {
      vi.spyOn(fs, "ensureFile").mockResolvedValue();
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("happy path", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(".env.dev"));
      let value = "";
      vi.spyOn(fs, "writeFile").mockImplementation(
        async (file: fs.PathLike | number, data: any) => {
          value = data as string;
          return Promise.resolve();
        }
      );
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      const res = await envUtil.writeEnv(".", "dev", { SECRET_ABC: decrypted });
      assert.isTrue(res.isOk());
      assert.isDefined(value);
      value = value!.substring("SECRET_ABC=".length);
      const decRes = await cryptoProvider.decrypt(value);
      if (decRes.isErr()) throw decRes.error;
      assert.isTrue(decRes.isOk());
      assert.equal(decRes.value, decrypted);
    });
    it("no variables", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(".env.dev"));
      vi.spyOn(fs, "readFile").mockResolvedValue("" as any);
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      const res = await envUtil.writeEnv(".", "dev", {});
      assert.isTrue(res.isOk());
    });
    it("write to default path", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(undefined));
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      const res = await envUtil.writeEnv(".", "dev", {
        SECRET_ABC: decrypted,
        TEAMS_APP_UPDATE_TIME: "xx-xx-xx",
      });
      assert.isTrue(res.isOk());
    });
    it("write failed", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(".env.dev"));
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(
        err(new UserError({ source: "test", name: "TestError", message: "message" }))
      );
      const res = await envUtil.writeEnv(".", "dev", { SECRET_ABC: decrypted });
      assert.isTrue(res.isErr());
    });
  });

  describe("pathUtils.listEnv", () => {
    it("happy path", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      vi.spyOn(fs, "readdir").mockResolvedValue([".env.dev", ".env.prod"] as any);
      const res = await envUtil.listEnv(".");
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.deepEqual(res.value, ["dev", "prod"]);
      }
    });

    it("remote env only", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      vi.spyOn(fs, "readdir").mockResolvedValue([
        ".env.dev",
        ".env.prod",
        ".env.local",
        ".env.testtool",
      ] as any);
      const res = await envUtil.listEnv(".", true);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.deepEqual(res.value, ["dev", "prod"]);
      }
    });
  });

  describe("pathUtils.mergeEnv", () => {
    it("case 1", async () => {
      const env: DotenvOutput = {};
      mockedEnvRestore = mockedEnv({
        mykey: "myvalue",
      });
      envUtil.mergeEnv(process.env, env);
      assert.equal(process.env.mykey, "myvalue");
    });

    it("case 2", async () => {
      const env: DotenvOutput = { mykey: "myvalue" };
      mockedEnvRestore = mockedEnv({
        mykey: "",
      });
      envUtil.mergeEnv(process.env, env);
      assert.equal(process.env.mykey, "myvalue");
    });

    it("case 3", async () => {
      const env: DotenvOutput = { mykey: "myvalue2" };
      mockedEnvRestore = mockedEnv({
        mykey: "myvalue",
      });
      envUtil.mergeEnv(process.env, env);
      assert.equal(process.env.mykey, "myvalue");
    });

    it("case 4", async () => {
      const env: DotenvOutput = { mykey: "" };
      mockedEnvRestore = mockedEnv({
        mykey: "myvalue",
      });
      envUtil.mergeEnv(process.env, env);
      assert.equal(process.env.mykey, "myvalue");
    });
  });

  describe("environmentManager", () => {
    it("environmentManager.listAllEnvConfigs", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      vi.spyOn(fs, "readdir").mockResolvedValue([".env.dev", ".env.prod"] as any);
      const res = await environmentManager.listAllEnvConfigs(".");
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.deepEqual(res.value, ["dev", "prod"]);
      }
    });
    it("environmentManager.listAllEnvConfigs projectPath doesn't exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await environmentManager.listAllEnvConfigs(".");
      assert.isFalse(res.isOk());
      assert.instanceOf(res._unsafeUnwrapErr(), FileNotFoundError);
    });
    it("environmentManager.listRemoteEnvConfigs", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      vi.spyOn(fs, "readdir").mockResolvedValue([".env.dev", ".env.prod", ".env.local"] as any);
      const res = await environmentManager.listRemoteEnvConfigs(".");
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.deepEqual(res.value, ["dev", "prod"]);
      }
    });
    it("environmentManager.listRemoteEnvConfigs projectPath doesn't exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await environmentManager.listRemoteEnvConfigs(".");
      assert.isFalse(res.isOk());
      assert.instanceOf(res._unsafeUnwrapErr(), FileNotFoundError);
    });
    it("environmentManager.listRemoteEnvConfigs no remote env, only local", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      vi.spyOn(fs, "readdir").mockResolvedValue([".env.local"] as any);
      const res = await environmentManager.listRemoteEnvConfigs(".", true);
      assert.isFalse(res.isOk());
      assert.instanceOf(res._unsafeUnwrapErr(), NoEnvFilesError);
    });
    it("environmentManager.listRemoteEnvConfigs return error", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      vi.spyOn(fs, "readdir").mockResolvedValue([] as any);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./xxx");
      const res = await environmentManager.listRemoteEnvConfigs(".", true);
      assert.isTrue(res.isErr());
    });
    it("environmentManager.getExistingNonRemoteEnvs with testtool env", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      vi.spyOn(fs, "readdir").mockResolvedValue([
        ".env.dev",
        ".env.prod",
        ".env.local",
        ".env.testtool",
      ] as any);
      const res = await environmentManager.getExistingNonRemoteEnvs(".");
      assert.deepEqual(res, ["testtool", "local"]);
    });
    it("environmentManager.getExistingNonRemoteEnvs with playground env", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      vi.spyOn(fs, "readdir").mockResolvedValue([
        ".env.dev",
        ".env.prod",
        ".env.local",
        ".env.playground",
      ] as any);
      const res = await environmentManager.getExistingNonRemoteEnvs(".");
      assert.deepEqual(res, ["playground", "local"]);
    });
    it("environmentManager.getExistingNonRemoteEnvs without testtool env", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      vi.spyOn(fs, "readdir").mockResolvedValue([".env.dev", ".env.prod", ".env.local"] as any);
      const res = await environmentManager.getExistingNonRemoteEnvs(".");
      assert.deepEqual(res, ["local"]);
    });
    it("environmentManager.getExistingNonRemoteEnvs without projectPath", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await environmentManager.getExistingNonRemoteEnvs(".");
      assert.deepEqual(res, ["local"]);
    });
  });

  describe("EnvLoaderMW", () => {
    it("Enables local env when manifest is Declarative Agent", async () => {
      vi.spyOn(manifestUtils, "readAppManifest").mockResolvedValue(
        ok({ copilotAgents: { declarativeAgents: [{}] } } as any)
      );
      vi.spyOn(projectTypeChecker, "IsDeclarativeAgentManifest").mockReturnValue(true);
      let capturedRemoteOnly: boolean | undefined;
      vi.spyOn(envUtil, "listEnv").mockImplementation(
        async (projectPath: string, remoteOnly?: boolean) => {
          capturedRemoteOnly = remoteOnly;
          return ok([]);
        }
      );
      vi.spyOn(TOOLS.ui, "selectOption").mockImplementation(async (config: any) => {
        if (typeof config.options === "function") {
          await config.options();
        }
        return ok({ type: "success", result: "dev", options: ["dev"] } as any);
      });
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));

      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, { myMethod: [EnvLoaderMW(false)] });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk());
      assert.equal(capturedRemoteOnly, false, "should include local env when DA manifest detected");
    });

    it("Keeps local env disabled when manifest is not Declarative Agent", async () => {
      vi.spyOn(manifestUtils, "readAppManifest").mockResolvedValue(ok({} as any));
      vi.spyOn(projectTypeChecker, "IsDeclarativeAgentManifest").mockReturnValue(false);
      let capturedRemoteOnly: boolean | undefined;
      vi.spyOn(envUtil, "listEnv").mockImplementation(
        async (projectPath: string, remoteOnly?: boolean) => {
          capturedRemoteOnly = remoteOnly;
          return ok([]);
        }
      );
      vi.spyOn(TOOLS.ui, "selectOption").mockImplementation(async (config: any) => {
        if (typeof config.options === "function") {
          await config.options();
        }
        return ok({ type: "success", result: "dev", options: ["dev"] } as any);
      });
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));

      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, { myMethod: [EnvLoaderMW(false)] });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk());
      assert.equal(capturedRemoteOnly, true, "should exclude local env when non-DA manifest");
    });
    it("EnvLoaderMW success", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      const encRes = await cryptoProvider.encrypt(decrypted);
      if (encRes.isErr()) throw encRes.error;
      const encrypted = encRes.value;
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(("SECRET_ABC=" + encrypted) as any);
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      if (process.env.SECRET_ABC || process.env.SECRET_ABC === undefined) {
        delete process.env.SECRET_ABC;
      }
      vi.spyOn(dotenvUtil, "deserialize")
        .mockReturnValueOnce({
          lines: [],
          obj: {},
        })
        .mockReturnValueOnce({
          lines: [],
          obj: { SECRET_ABC: encrypted },
        })
        .mockReturnValueOnce({
          lines: [],
          obj: {},
        });
      process.env.ENV_VAR = "1";
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          assert.equal(process.env.SECRET_ABC, decrypted);
          process.env.ENV_VAR = "2";
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(true)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        env: "dev",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk());
      assert.isUndefined(process.env.SECRET_ABC);
      assert.equal(process.env.ENV_VAR, "1", "process.env.ENV_VAR should be restored to 1");
    });

    it("EnvLoaderMW skip load", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(true, true)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk());
    });

    it("EnvLoaderMW ignore-env-file", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(true)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        "ignore-env-file": true,
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk());
    });

    it("EnvLoaderMW success for F5 (missing .env file)", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok("."));
      vi.spyOn(fs, "pathExistsSync").mockReturnValue(false);
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(false)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        env: "dev",
        isLocalDebug: true,
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk());
    });
    it("EnvLoaderMW failed for F5 (missing .env file and getEnvFilePath Error)", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(err(new UserError({})));
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(false)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        env: "dev",
        isLocalDebug: true,
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr());
    });
    it("EnvLoaderMW success: no env available", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok([]));
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(true)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk());
    });
    it("EnvLoaderMW ignoreEnvInfo", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(true)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        ignoreEnvInfo: true,
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk());
      const core = new FxCore(tools);
    });
    it("EnvLoaderMW fail without projectPath", async () => {
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(true)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        env: "dev",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr());
      if (res.isErr()) {
        assert.equal(res.error.name, "NoProjectOpenedError");
      }
    });
    it("EnvLoaderMW fail with listEnv Error", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      // sandbox
      //   .stub(envUtil, "listEnv")
      //   .mockResolvedValue(err(new UserError({ source: "test", name: "TestError", message: "message" })));
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      vi.spyOn(TOOLS.ui, "selectOption").mockResolvedValue(err(new UserError({})));
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(true)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr());
    });
    it("EnvLoaderMW fail with envUtil Error", async () => {
      const encRes = await cryptoProvider.encrypt(decrypted);
      if (encRes.isErr()) throw encRes.error;
      const encrypted = encRes.value;
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue(("SECRET_ABC=" + encrypted) as any);
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      vi.spyOn(envUtil, "readEnv").mockResolvedValue(
        err(new UserError({ source: "test", name: "TestError", message: "message" }))
      );
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(true)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        env: "dev",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr());
    });
    it("EnvLoaderMW cancel", async () => {
      vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["dev", "prod"]));
      vi.spyOn(tools.ui, "selectOption").mockResolvedValue(err(new UserCancelError()));
      class MyClass {
        async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [EnvLoaderMW(true)],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr());
    });
  });

  describe("EnvWriterMW", () => {
    beforeEach(() => {
      vi.spyOn(fs, "ensureFile").mockResolvedValue();
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("EnvWriterMW success", async () => {
      vi.spyOn(pathUtils, "getEnvFolderPath").mockResolvedValue(ok("teamsfx"));
      let value = "";
      vi.spyOn(fs, "writeFile").mockImplementation(
        async (file: fs.PathLike | number, data: any) => {
          value = data as string;
          return Promise.resolve();
        }
      );
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      const envs = { SECRET_ABC: decrypted };
      class MyClass {
        async myMethod(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          ctx!.envVars = envs;
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [ContextInjectorMW, EnvWriterMW],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        env: "dev",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isOk());
      assert.isDefined(value);
      value = value!.substring("SECRET_ABC=".length);
      const decRes = await cryptoProvider.decrypt(value);
      if (decRes.isErr()) throw decRes.error;
      assert.isTrue(decRes.isOk());
      assert.equal(decRes.value, decrypted);
    });

    it("EnvWriterMW fail with envUtil Error", async () => {
      vi.spyOn(envUtil, "writeEnv").mockResolvedValue(
        err(new UserError({ source: "test", name: "TestError", message: "message" }))
      );
      vi.spyOn(settingsUtil, "readSettings").mockResolvedValue(ok(mockSettings));
      const envs = { SECRET_ABC: decrypted };
      class MyClass {
        async myMethod(inputs: Inputs, ctx?: CoreHookContext): Promise<Result<any, FxError>> {
          ctx!.envVars = envs;
          return ok(undefined);
        }
      }
      hooks(MyClass, {
        myMethod: [ContextInjectorMW, EnvWriterMW],
      });
      const my = new MyClass();
      const inputs = {
        platform: Platform.VSCode,
        projectPath: ".",
        env: "dev",
      };
      const res = await my.myMethod(inputs);
      assert.isTrue(res.isErr());
    });
  });

  describe("dotenvUtil", () => {
    it("dotenvUtil deserialize & serialize", async () => {
      const original =
        '#COMMENT\n\n\nKEY1=VALUE1#COMMENT2\nKEY2=\'VALUE2\'\nKEY3="VALUE3#"\nindexPath="/index.html#"#COMMENT3';
      const expected =
        '#COMMENT\n\n\nKEY1=VALUE1 #COMMENT2\nKEY2=\'VALUE2\'\nKEY3="VALUE3#"\nindexPath="/index.html#" #COMMENT3\nKEY4="VALUE4"\nKEY5="VALUE5#"';
      const parsed = dotenvUtil.deserialize(original);
      console.log(parsed);
      assert.deepEqual(parsed, {
        lines: [
          "#COMMENT",
          "",
          "",
          { key: "KEY1", value: "VALUE1", comment: "#COMMENT2" },
          { key: "KEY2", value: "VALUE2", quote: "'" },
          { key: "KEY3", value: "VALUE3#", quote: '"' },
          { key: "indexPath", value: "/index.html#", quote: '"', comment: "#COMMENT3" },
        ],
        obj: { KEY1: "VALUE1", KEY2: "VALUE2", KEY3: "VALUE3#", indexPath: "/index.html#" },
      });
      parsed.lines?.push({ key: "KEY4", value: "VALUE4", quote: '"' });
      parsed.obj["KEY5"] = "VALUE5#";
      const serialized = dotenvUtil.serialize(parsed);
      assert.equal(serialized, expected);
    });
    it("dotenvUtil deserialize & serialize empty", async () => {
      const original = "";
      const parsed = dotenvUtil.deserialize(original);
      assert.deepEqual(parsed, {
        lines: [""],
        obj: {},
      });
      const serialized = dotenvUtil.serialize(parsed);
      assert.equal(serialized, original);
    });
    it("dotenvUtil serialize without lines", async () => {
      const parsed = {
        obj: { KEY: "VALUE", KEY2: "VALUE2" },
      };
      const str = dotenvUtil.serialize(parsed);
      assert.equal(str, "KEY=VALUE\nKEY2=VALUE2");
    });
  });

  describe("settingsUtil", () => {
    let getBooleanValueStub: any;

    beforeEach(() => {
      getBooleanValueStub = vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    });

    it("settingsUtil read not exist", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
      const res = await settingsUtil.readSettings("abc");
      assert.isTrue(res.isErr());
    });
    afterEach(() => {
      if (getBooleanValueStub && getBooleanValueStub.restore) {
        getBooleanValueStub.restore();
      }
      vi.restoreAllMocks();
    });

    it("settingsUtil read and ensure trackingId", async () => {
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(".");
      vi.spyOn(fs, "readFile").mockResolvedValue("version: 1.0.0" as any);
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      const res = await settingsUtil.readSettings("abc");
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.isDefined(res.value.trackingId);
      }
    });

    it("settingsUtil write success", async () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue(".");
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      vi.spyOn(fs, "readFile").mockResolvedValue("version: 1.0.0" as any);
      const res = await settingsUtil.writeSettings(".", { trackingId: "123", version: "2" });
      assert.isTrue(res.isOk());
    });
    it("settingsUtil write failed", async () => {
      vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("./m365agents.yml");
      vi.spyOn(fs, "pathExists").mockResolvedValue(false);
      const res = await settingsUtil.writeSettings(".", { trackingId: "123", version: "2" });
      assert.isTrue(res.isErr());
      assert.isTrue(res._unsafeUnwrapErr() instanceof FileNotFoundError);
    });
  });

  describe("extractEnvNameFromFileName", () => {
    it("happy path", async () => {
      const res = await envUtil.extractEnvNameFromFileName(".env.dev");
      assert.isTrue(res === "dev");
    });
    it("return undefined", async () => {
      const res = await envUtil.extractEnvNameFromFileName(".env.dev.user");
      assert.isUndefined(res);
    });
    it("return undefined", async () => {
      const res = await envUtil.extractEnvNameFromFileName(".env1.dev");
      assert.isTrue(res === undefined);
    });
  });

  describe("loadEnvFile", () => {
    it("happy path", async () => {
      vi.spyOn(dotenvUtil, "deserialize").mockReturnValue({ obj: { KEY: "VALUE" } });
      vi.spyOn(fs, "readFile").mockResolvedValue("" as any);
      await envUtil.loadEnvFile(".env.dev");
      assert.equal(process.env.KEY, "VALUE");
    });
  });

  describe("resetEnvFile", () => {
    it("happy path", async () => {
      const obj: any = { obj: { IKEY: "IKEY", KEY: "KEY" } };
      vi.spyOn(dotenvUtil, "deserialize").mockReturnValue(obj);
      vi.spyOn(fs, "readFile").mockResolvedValue("" as any);
      vi.spyOn(fs, "writeFile").mockResolvedValue();
      await envUtil.resetEnvFile(" ", ["IKEY"]);
      assert.equal(obj.obj.KEY, "");
    });
  });

  describe("resetEnv", () => {
    it("happy path", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(".env.dev"));
      vi.spyOn(envUtil, "resetEnvFile").mockResolvedValue();
      vi.spyOn(fs, "pathExists").mockResolvedValue(true);
      await envUtil.resetEnv(" ", "dev", ["IKEY"]);
    });
    it("getEnvFilePath error", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(err(new UserCancelError()));
      await envUtil.resetEnv(" ", "dev", ["IKEY"]);
    });
    it("getEnvFilePath return undefined", async () => {
      vi.spyOn(pathUtils, "getEnvFilePath").mockResolvedValue(ok(undefined));
      await envUtil.resetEnv(" ", "dev", ["IKEY"]);
    });
  });
});

describe("parseSetOutputCommand", () => {
  const tools = new MockTools();
  setTools(tools);
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn | undefined;
  afterEach(() => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });
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
});
