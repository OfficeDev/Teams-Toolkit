import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import { jsonUtils } from "../../src/common/jsonUtils";
import { setTools } from "../../src/common/globalVars";
import { FileNotFoundError, JSONSyntaxError } from "../../src/error/common";
import { MockTools } from "../core/utils";
import { assert, vi } from "vitest";

describe("JSONUtils", () => {
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

  beforeEach(() => {
    mockedEnvRestore = mockedEnv({
      TEAMSFX_V3: "true",
    });
  });
  it("parseJSON success", async () => {
    const res = jsonUtils.parseJSON(`{"a":1}`);
    assert.isTrue(res.isOk());
  });
  it("parseJSON syntax error", async () => {
    const res = jsonUtils.parseJSON(`{"a":1,}`);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof JSONSyntaxError);
    }
  });
  it("readJSONFile success", async () => {
    vi.spyOn(fs, "readJSON").mockResolvedValue({ a: 1 });
    const res = await jsonUtils.readJSONFile("xxx");
    assert.isTrue(res.isOk());
  });
  it("readJSONFile syntax error", async () => {
    vi.spyOn(fs, "readJSON").mockRejectedValue(
      new SyntaxError("Unexpected token } in JSON at position 7")
    );
    const res = await jsonUtils.readJSONFile("xxx");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof JSONSyntaxError);
    }
  });
  it("readJSONFile file not found", async () => {
    vi.spyOn(fs, "readJSON").mockRejectedValue(new Error("no such file or directory"));
    const res = await jsonUtils.readJSONFile("xxx");
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.isTrue(res.error instanceof FileNotFoundError);
    }
  });
});
