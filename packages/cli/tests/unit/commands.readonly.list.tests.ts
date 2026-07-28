// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLIContext } from "@microsoft/teamsfx-api";
import { helpCommand, listSamplesCommand, listTemplatesCommand } from "../../src/commands/models";
import * as utils from "../../src/utils";
import { assert, vi } from "vitest";

describe("CLI read-only commands list", () => {
  const sandbox = vi;

  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true as any);
    vi.spyOn(process.stderr, "write").mockReturnValue(true as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("listTemplatesCommand", async () => {
    it("happy path", async () => {
      const ctx: CLIContext = {
        command: { ...listTemplatesCommand, fullName: "list" },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await listTemplatesCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("table with description", async () => {
      const ctx: CLIContext = {
        command: { ...listTemplatesCommand, fullName: "..." },
        optionValues: { format: "table", description: true },
        globalOptionValues: {},
        argumentValues: ["key", "value"],
        telemetryProperties: {},
      };
      const res = await listTemplatesCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("table without description", async () => {
      const ctx: CLIContext = {
        command: { ...listTemplatesCommand, fullName: "..." },
        optionValues: { format: "table", description: false },
        globalOptionValues: {},
        argumentValues: ["key", "value"],
        telemetryProperties: {},
      };
      const res = await listTemplatesCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });

  describe("listSamplesCommand", async () => {
    it("json", async () => {
      vi.spyOn(utils, "getTemplates").mockResolvedValue([]);
      const ctx: CLIContext = {
        command: { ...listSamplesCommand, fullName: "..." },
        optionValues: { format: "json" },
        globalOptionValues: {},
        argumentValues: ["key", "value"],
        telemetryProperties: {},
      };
      const res = await listSamplesCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("table with filter + description", async () => {
      vi.spyOn(utils, "getTemplates").mockResolvedValue([]);
      const ctx: CLIContext = {
        command: { ...listSamplesCommand, fullName: "..." },
        optionValues: { tag: "tab", format: "table", description: true },
        globalOptionValues: {},
        argumentValues: ["key", "value"],
        telemetryProperties: {},
      };
      const res = await listSamplesCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    it("table without description", async () => {
      vi.spyOn(utils, "getTemplates").mockResolvedValue([]);
      const ctx: CLIContext = {
        command: { ...listSamplesCommand, fullName: "..." },
        optionValues: { format: "table", description: false },
        globalOptionValues: {},
        argumentValues: ["key", "value"],
        telemetryProperties: {},
      };
      const res = await listSamplesCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });

  describe("helpCommand", async () => {
    it("happy", async () => {
      const ctx: CLIContext = {
        command: { ...helpCommand, fullName: "..." },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await helpCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
  });
});
