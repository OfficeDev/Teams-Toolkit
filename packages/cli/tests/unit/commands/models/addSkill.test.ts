// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { CLIContext, ok } from "@microsoft/teamsfx-api";
import { FxCore } from "@microsoft/teamsfx-core";
import "mocha";
import * as activate from "../../../../src/activate";
import { addSkillCommand } from "../../../../src/commands/models/addSkill";
import { assert, expect, vi } from "vitest";

describe("addSkill command", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should call FxCore.addSkill with command inputs", async () => {
    const mockCore = new FxCore({} as any);
    const addSkillStub = vi.spyOn(mockCore, "addSkill").mockResolvedValue(ok(undefined));
    vi.spyOn(activate, "getFxCore").mockReturnValue(mockCore);

    const ctx: CLIContext = {
      command: { ...addSkillCommand, fullName: "add skill" },
      optionValues: {
        folder: "./",
        skill: "mySkill",
        description: "A test skill",
      },
      globalOptionValues: {},
      argumentValues: [],
      telemetryProperties: {},
    };

    const result = await addSkillCommand.handler!(ctx);

    assert.isTrue(result.isOk());
    expect(addSkillStub).toHaveBeenCalledExactlyOnceWith(ctx.optionValues);
  });
});
