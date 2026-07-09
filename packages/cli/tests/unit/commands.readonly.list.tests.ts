// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLIContext } from "@microsoft/teamsfx-api";
import { helpCommand, listSamplesCommand, listTemplatesCommand } from "../../src/commands/models";
import * as listTemplatesModule from "../../src/commands/models/listTemplates";
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

    it("groupTemplatesByName groups by name and falls back display name", async () => {
      const templates = listTemplatesModule.groupTemplatesByName([
        {
          name: "dup-template",
          alias: "dup-alias",
          description: "desc 1",
          language: "typescript",
        },
        {
          name: "dup-template",
          alias: "dup-alias-2",
          description: "desc 2",
          language: "javascript",
        },
        {
          name: "no-alias-template",
          description: "desc 3",
          language: "typescript",
        },
      ] as any);

      assert.equal(templates.length, 2);
      assert.equal(templates[0].displayName, "dup-alias");
      assert.equal(templates[1].displayName, "no-alias-template");
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
