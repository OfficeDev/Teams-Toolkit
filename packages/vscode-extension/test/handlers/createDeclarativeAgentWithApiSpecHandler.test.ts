import * as globalVariables from "../../src/globalVariables";
import * as telemetry from "../../src/telemetry/extTelemetry";
import { createDeclarativeAgentWithApiSpec } from "../../src/handlers/createDeclarativeAgentWithApiSpecHandler";
import { err, UserError } from "@microsoft/teamsfx-api";
import * as globalState from "@microsoft/teamsfx-core/build/common/globalState";
import { MockCore } from "../mocks/mockCore";
import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";

describe("createDeclarativeAgentWithApiSpecHandler", () => {
  beforeEach(() => {
    vi.spyOn(telemetry.ExtTelemetry, "sendTelemetryEvent");
    vi.spyOn(telemetry.ExtTelemetry, "sendTelemetryErrorEvent");
    vi.spyOn(globalState, "globalStateUpdate").mockResolvedValue(undefined as any);
  });

  it("should return error if args are invalid", async () => {
    const core = new MockCore();
    mockValue(globalVariables, "core", core);

    const res = await createDeclarativeAgentWithApiSpec([]);

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "invalidParameter");
    }
  });

  it("should create project successfully with valid args", async () => {
    const core = new MockCore();
    mockValue(globalVariables, "core", core);

    const res = await createDeclarativeAgentWithApiSpec(["test-path"]);

    assert.isTrue(res.isOk());
  });

  it("should throw error if core return error", async () => {
    const core = new MockCore();
    mockValue(globalVariables, "core", core);
    vi.spyOn(globalVariables.core, "createProject").mockResolvedValue(
      err(new UserError("core", "fakeError", "fakeErrorMessage"))
    );

    const res = await createDeclarativeAgentWithApiSpec(["test-path"]);

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "fakeError");
    }
  });
});
