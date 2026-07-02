// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  SingleSelectConfig,
  SingleSelectResult,
  UserError,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import path from "path";
import { Result, err, ok } from "neverthrow";
import { runModifySelector } from "../../../src/v4/surface/modifySelectorWalk";
import { assert } from "vitest";

const TEMPLATES_V4_DIR = path.resolve(__dirname, "../../../../../templates/v4");
const DT = "TEAMSFX_MCP_FOR_DA_DT";

function buildFloor(): Buffer {
  const zip = new AdmZip();
  zip.addLocalFolder(TEMPLATES_V4_DIR, "v4");
  return zip.toBuffer();
}

function flagsOn(...names: string[]): (name: string) => boolean {
  const on = new Set(names);
  return (name) => on.has(name);
}

class ScriptedUI {
  selectNames: string[] = [];
  constructor(private readonly answers: Record<string, string>) {}

  selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    this.selectNames.push(config.name);
    const answer = this.answers[config.name];
    if (answer === undefined) {
      return Promise.resolve(
        err(new UserError({ source: "Test", name: "UserCancelError", message: config.name }))
      );
    }
    return Promise.resolve(ok({ type: "success", result: answer }));
  }
}

function asUI(ui: ScriptedUI): UserInteraction {
  return ui as unknown as UserInteraction;
}

const MCP_ADD_ACTION_PICKS: Record<string, string> = {
  addCapability: "add-action",
  actionSource: "mcp",
};

describe("runModifySelector", () => {
  it("WMS-00: selector-only Q1 can resolve from the selector's own v4 routes", async () => {
    const selectorBytes = fs.readFileSync(path.join(TEMPLATES_V4_DIR, "modify", "selector.json"));
    const ui = new ScriptedUI(MCP_ADD_ACTION_PICKS);

    const res = await runModifySelector(selectorBytes, asUI(ui), "vscode", {
      flagReader: flagsOn(DT),
      selectorBytesKind: "json",
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "add-mcp-server");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, MCP_ADD_ACTION_PICKS);
    }
  });

  it("WMS-01: add-action→mcp with DT on resolves the v4 add-mcp-server modify package", async () => {
    const ui = new ScriptedUI(MCP_ADD_ACTION_PICKS);

    const res = await runModifySelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: flagsOn(DT),
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "add-mcp-server");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, MCP_ADD_ACTION_PICKS);
    }
    assert.deepEqual(ui.selectNames, ["addCapability", "actionSource"]);
  });

  it("uses the default env flag reader when no flagReader override is provided", async () => {
    const saved = process.env[DT];
    process.env[DT] = "true";
    const ui = new ScriptedUI(MCP_ADD_ACTION_PICKS);

    try {
      const res = await runModifySelector(buildFloor(), asUI(ui), "vscode");

      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value.templateId, "add-mcp-server");
        assert.equal(res.value.engine, "v4");
      }
    } finally {
      if (saved === undefined) {
        delete process.env[DT];
      } else {
        process.env[DT] = saved;
      }
    }
  });

  it("WMS-02: add-action→mcp with DT off resolves the v3 addPlugin core method", async () => {
    const ui = new ScriptedUI(MCP_ADD_ACTION_PICKS);

    const res = await runModifySelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "addPlugin");
      assert.equal(res.value.engine, "v3-core-method");
      assert.deepEqual(res.value.answers, MCP_ADD_ACTION_PICKS);
    }
  });
});
