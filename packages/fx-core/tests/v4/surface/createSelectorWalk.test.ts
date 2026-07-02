// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  OptionItem as SurfaceOptionItem,
  SingleSelectConfig,
  SingleSelectResult,
  SystemError,
  UserError,
  UserInteraction,
} from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import path from "path";
import { Result, err, ok } from "neverthrow";
import { openCreateSelectorPresentation } from "../../../src/v4/distribution/createSelector";
import { assert } from "vitest";
import {
  resolveCreateTargetByTemplateId,
  runCreateSelector,
} from "../../../src/v4/surface/createSelectorWalk";

/**
 * Tests for docs/03-specs/operations/scaffolding/walk-create-selector.md.
 * One `it` per WCS-* acceptance-criteria row. v4-isolated (no v3 import).
 *
 * The floor is built in-memory from the loose `templates/v4` source — the same
 * `addLocalFolder(templates/v4, "v4")` layout `generateV4Zip.js` ships — so the
 * real shipped `selector.json` + `da/mcp-server` descriptor are exercised with
 * no built `templates.zip` artifact (CI-clean).
 */

const TEMPLATES_V4_DIR = path.resolve(__dirname, "../../../../../templates/v4");

function buildFloor(): Buffer {
  const zip = new AdmZip();
  zip.addLocalFolder(TEMPLATES_V4_DIR, "v4");
  return zip.toBuffer();
}

/** The feature-flag reader that turns on exactly the named flags (every other flag is off). */
function flagsOn(...names: string[]): (name: string) => boolean {
  const on = new Set(names);
  return (name) => on.has(name);
}

/**
 * A scripted host `UserInteraction`: answers `selectOption` from a per-name
 * script and records every config it saw (so option-visibility can be asserted).
 * A question with no scripted answer returns an error (a surface cancellation).
 * Only `selectOption` is implemented — the create Q1 is all `singleSelect`; the
 * cast in `asUI` is test-only (the src no-`as` rule does not apply to tests).
 */
class ScriptedUI {
  selectNames: string[] = [];
  configByName = new Map<string, SingleSelectConfig>();
  constructor(private readonly answers: Record<string, string>) {}

  selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    this.selectNames.push(config.name);
    this.configByName.set(config.name, config);
    const answer = this.answers[config.name];
    if (answer === undefined) {
      return Promise.resolve(
        err(new UserError({ source: "Test", name: "UserCancelError", message: config.name }))
      );
    }
    const result: SingleSelectResult = { type: "success", result: answer };
    return Promise.resolve(ok(result));
  }
}

function asUI(ui: ScriptedUI | SequencedUI): UserInteraction {
  return ui as unknown as UserInteraction;
}

/** One scripted reply to a `selectOption` call: a chosen id, or the host Back button. */
type ScriptedResponse = { type: "success"; result: string } | { type: "back" };

/**
 * A scripted host that answers `selectOption` calls in invocation order, so a
 * `back` reply can re-ask a question whose next answer differs. It records the
 * `(name, step)` of every call, so a test can assert both the Back-button
 * progress (`step > 1`) and the re-ask sequence after a back.
 */
class SequencedUI {
  calls: { name: string; step?: number }[] = [];
  private cursor = 0;
  constructor(private readonly responses: ScriptedResponse[]) {}

  selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    this.calls.push({ name: config.name, step: config.step });
    const response = this.responses[this.cursor++];
    if (response === undefined) {
      return Promise.resolve(
        err(new UserError({ source: "Test", name: "UserCancelError", message: config.name }))
      );
    }
    if (response.type === "back") {
      return Promise.resolve(ok({ type: "back" }));
    }
    return Promise.resolve(ok({ type: "success", result: response.result }));
  }
}

/** The ids a recorded `selectOption` config offered (after the prompt face's filtering). */
function offeredIds(config: SingleSelectConfig | undefined): string[] {
  const options = (config?.options ?? []) as SurfaceOptionItem[];
  return options.map((option) => option.id);
}

const MCP_DA_PICKS: Record<string, string> = {
  projectType: "copilot-agent-type",
  daTemplate: "add-action",
  actionSource: "mcp",
};
const LANGUAGE_QUESTION = ["lang", "uage"].join("");

describe("runCreateSelector (walk-create-selector)", () => {
  it("WCS-00: selector-only Q1 can resolve from the selector's own v4 routes", async () => {
    const selectorBytes = fs.readFileSync(path.join(TEMPLATES_V4_DIR, "create", "selector.json"));
    const picks = {
      projectType: "custom-engine-agent-type",
      customEngineAgent: "weather-agent",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(selectorBytes, asUI(ui), "vscode", {
      flagReader: () => false,
      selectorBytesKind: "json",
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "weather-agent");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
  });

  it("WCS-01: copilot→add-action→mcp with DT on resolves the v4 da/mcp-server front door", async () => {
    const ui = new ScriptedUI(MCP_DA_PICKS);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: flagsOn("TEAMSFX_MCP_FOR_DA_DT"),
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "da/mcp-server");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, MCP_DA_PICKS);
    }
    // The selector funnels to exactly the three MCP-DA dimensions (no apiAuth — that is new-api only).
    assert.deepEqual(ui.selectNames, ["projectType", "daTemplate", "actionSource"]);
  });

  it("WCS-02: CLI DA+MCP with DT off resolves the v4 static MCP route", async () => {
    const ui = new ScriptedUI(MCP_DA_PICKS);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "cli", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "da/mcp-server-static");
      assert.equal(res.value.engine, "v4");
    }
  });

  it("WCS-02b: VS Code DA+MCP with DT off resolves the v4 static MCP route", async () => {
    const ui = new ScriptedUI(MCP_DA_PICKS);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "da/mcp-server-static");
      assert.equal(res.value.engine, "v4");
    }
  });

  it("WCS-02c: custom-engine→basic-custom-engine-agent resolves the v4 route", async () => {
    const picks = {
      projectType: "custom-engine-agent-type",
      customEngineAgent: "basic-custom-engine-agent",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "basic-custom-engine-agent");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "customEngineAgent"]);
  });

  it("WCS-02c: custom-engine→weather-agent resolves the v4 route", async () => {
    const picks = {
      projectType: "custom-engine-agent-type",
      customEngineAgent: "weather-agent",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "weather-agent");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "customEngineAgent"]);
  });

  it("WCS-02d: teams→custom-copilot-basic resolves the v4 route", async () => {
    const picks = {
      projectType: "teams-agent-and-app-type",
      teamsApp: "custom-copilot-basic",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "custom-copilot-basic");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "teamsApp"]);
  });

  it("WCS-02e: teams→teams-collaborator-agent resolves the v4 route", async () => {
    const picks = {
      projectType: "teams-agent-and-app-type",
      teamsApp: "teams-collaborator-agent",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "teams-collaborator-agent");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "teamsApp"]);
  });

  it("WCS-02f: teams→rag→custom-copilot-rag-azure-ai-search resolves the v4 route", async () => {
    const picks = {
      projectType: "teams-agent-and-app-type",
      teamsApp: "rag",
      customCopilotRagType: "custom-copilot-rag-azure-ai-search",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "custom-copilot-rag-azure-ai-search");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "teamsApp", "customCopilotRagType"]);
  });

  it("WCS-02g: teams→rag→custom-copilot-rag-custom-api resolves the v4 route", async () => {
    const picks = {
      projectType: "teams-agent-and-app-type",
      teamsApp: "rag",
      customCopilotRagType: "custom-copilot-rag-custom-api",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "custom-copilot-rag-custom-api");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "teamsApp", "customCopilotRagType"]);
  });

  it("WCS-03: teams→other→default-bot resolves the nested v4 route and surfaces its answers", async () => {
    const picks = {
      projectType: "teams-agent-and-app-type",
      teamsApp: "other",
      teamsOtherAppType: "default-bot",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "default-bot");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "teamsApp", "teamsOtherAppType"]);
  });

  it("WCS-03b: teams→other→non-sso-tab resolves the nested v4 route", async () => {
    const picks = {
      projectType: "teams-agent-and-app-type",
      teamsApp: "other",
      teamsOtherAppType: "non-sso-tab",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "non-sso-tab");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "teamsApp", "teamsOtherAppType"]);
  });

  it("WCS-03c: teams→other→default-message-extension resolves the nested v4 route", async () => {
    const picks = {
      projectType: "teams-agent-and-app-type",
      teamsApp: "other",
      teamsOtherAppType: "default-message-extension",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "default-message-extension");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "teamsApp", "teamsOtherAppType"]);
  });

  it("WCS-04: github-copilot (vscode + flag on) is offered and resolves the surface-action", async () => {
    const ui = new ScriptedUI({ projectType: "start-with-github-copilot" });

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: flagsOn("TEAMSFX_CHAT_PARTICIPANT_ENTRIES"),
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "open-github-copilot-chat");
      assert.equal(res.value.engine, "surface-action");
      assert.deepEqual(res.value.answers, { projectType: "start-with-github-copilot" });
    }
    assert.include(offeredIds(ui.configByName.get("projectType")), "start-with-github-copilot");
  });

  it("WCS-05: on a non-vscode surface the github-copilot option is filtered from projectType", async () => {
    const ui = new ScriptedUI({ projectType: "copilot-agent-type", daTemplate: "no-action" });

    // flags all on, so only `surface != 'vscode'` can hide the option.
    const res = await runCreateSelector(buildFloor(), asUI(ui), "cli", { flagReader: () => true });

    assert.isTrue(res.isOk());
    assert.notInclude(offeredIds(ui.configByName.get("projectType")), "start-with-github-copilot");
  });

  it("WCS-06: a surface cancellation surfaces as the Result error", async () => {
    const ui = new ScriptedUI({}); // no scripted answer → the first prompt cancels

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => true,
    });

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "UserCancelError");
    }
  });

  it("WCS-08: a single-language v4 route (da/mcp-server) never prompts a language", async () => {
    const ui = new ScriptedUI(MCP_DA_PICKS);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: flagsOn("TEAMSFX_MCP_FOR_DA_DT"),
    });

    assert.isTrue(res.isOk());
    assert.notInclude(ui.selectNames, LANGUAGE_QUESTION);
  });

  it("WCS-12: the skill daTemplate option is hidden unless TEAMSFX_AGENT_SKILLS is on", async () => {
    const ui = new ScriptedUI({
      projectType: "copilot-agent-type",
      daTemplate: "no-action",
    });

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    const offered = offeredIds(ui.configByName.get("daTemplate"));
    // The question is reached (no-action is always offered) but skill is filtered out.
    assert.include(offered, "no-action");
    assert.notInclude(offered, "skill");
  });

  it("WCS-22: DA add-action no longer offers the Office Add-in Action source", async () => {
    const ui = new ScriptedUI(MCP_DA_PICKS);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: flagsOn("TEAMSFX_DA_METAOS", "TEAMSFX_MCP_FOR_DA_DT"),
    });

    assert.isTrue(res.isOk());
    const offered = offeredIds(ui.configByName.get("actionSource"));
    assert.include(offered, "mcp");
    assert.notInclude(offered, "da-meta-os");
  });

  it("WCS-13: copilot\u2192skill with TEAMSFX_AGENT_SKILLS on resolves the v4 route", async () => {
    const picks = { projectType: "copilot-agent-type", daTemplate: "skill" };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: flagsOn("TEAMSFX_AGENT_SKILLS"),
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "da/skill");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    // The skill option is offered (its featureFlag condition holds) and ends the walk
    // (no actionSource follow-up \u2014 that is add-action only).
    assert.include(offeredIds(ui.configByName.get("daTemplate")), "skill");
    assert.deepEqual(ui.selectNames, ["projectType", "daTemplate"]);
  });

  it("WCS-18: copilot\u2192typespec resolves the v4 route", async () => {
    const picks = { projectType: "copilot-agent-type", daTemplate: "typespec" };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode");

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "da/typespec");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "daTemplate"]);
  });

  it("WCS-19: copilot\u2192graph-connector resolves the v4 route", async () => {
    const picks = { projectType: "copilot-agent-type", daTemplate: "graph-connector" };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode");

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "da/graph-connector");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "daTemplate"]);
  });

  it("WCS-20: Office DA MetaOS upgrade resolves the v4 pipeline-only route", async () => {
    const picks = {
      projectType: "office-meta-os-type",
      officeAddinCapability: "office-da-meta-os",
      daMetaOsCapability: "declarative-agent-meta-os-upgrade-project",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: flagsOn("TEAMSFX_DA_METAOS"),
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "declarative-agent-meta-os-upgrade-project");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, [
      "projectType",
      "officeAddinCapability",
      "daMetaOsCapability",
    ]);
  });

  it("WCS-21: Office task pane resolves the v4 route", async () => {
    const picks = {
      projectType: "office-meta-os-type",
      officeAddinCapability: "office-addin-wxpo-taskpane",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode");

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "office-addin-wxpo-taskpane");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "officeAddinCapability"]);
  });

  it("WCS-22: Office Excel custom function shortcut resolves the v4 route", async () => {
    const picks = {
      projectType: "office-meta-os-type",
      officeAddinCapability: "office-addin-excel-cfshortcut",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode");

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "office-addin-excel-cfshortcut");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "officeAddinCapability"]);
  });

  it("WCS-22b: Office Add-in common configuration resolves the v4 route", async () => {
    const picks = {
      projectType: "office-meta-os-type",
      officeAddinCapability: "office-addin-config",
    };
    const ui = new ScriptedUI(picks);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode");

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "office-addin-config");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, picks);
    }
    assert.deepEqual(ui.selectNames, ["projectType", "officeAddinCapability"]);
  });

  it("WCS-14: each interactive prompt carries its 1-based step (no Back on the first)", async () => {
    const ui = new SequencedUI([
      { type: "success", result: "copilot-agent-type" }, // projectType
      { type: "success", result: "add-action" }, // daTemplate
      { type: "success", result: "mcp" }, // actionSource
    ]);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: flagsOn("TEAMSFX_MCP_FOR_DA_DT"),
    });

    assert.isTrue(res.isOk());
    // step increments per prompt, so the host shows a Back button from the 2nd on, never the 1st.
    assert.deepEqual(ui.calls, [
      { name: "projectType", step: 1 },
      { name: "daTemplate", step: 2 },
      { name: "actionSource", step: 3 },
    ]);
  });

  it("WCS-15: a Back re-asks the previous dimension and discards the stale pick before re-routing", async () => {
    const ui = new SequencedUI([
      { type: "success", result: "copilot-agent-type" }, // projectType (step 1)
      { type: "success", result: "add-action" }, // daTemplate (step 2)
      { type: "back" }, // actionSource (step 3) → back
      { type: "success", result: "no-action" }, // daTemplate re-asked (step 2)
    ]);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: flagsOn("TEAMSFX_MCP_FOR_DA_DT"),
    });

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      // the discarded add-action pick leaves no actionSource answer behind.
      assert.deepEqual(res.value.answers, {
        projectType: "copilot-agent-type",
        daTemplate: "no-action",
      });
    }
    assert.deepEqual(ui.calls, [
      { name: "projectType", step: 1 },
      { name: "daTemplate", step: 2 },
      { name: "actionSource", step: 3 },
      { name: "daTemplate", step: 2 },
    ]);
  });

  it("WCS-16: a Back at the second prompt re-asks the first dimension at step 1", async () => {
    const ui = new SequencedUI([
      { type: "success", result: "copilot-agent-type" }, // projectType (step 1)
      { type: "back" }, // daTemplate (step 2) → back
      { type: "success", result: "copilot-agent-type" }, // projectType re-asked (step 1)
      { type: "success", result: "no-action" }, // daTemplate (step 2)
    ]);

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isOk());
    // re-asking the first dimension lands back at step 1, so the walk floor shows no Back.
    assert.deepEqual(ui.calls, [
      { name: "projectType", step: 1 },
      { name: "daTemplate", step: 2 },
      { name: "projectType", step: 1 },
      { name: "daTemplate", step: 2 },
    ]);
  });

  it("WCS-17: a Back at the very first prompt cancels the walk", async () => {
    const ui = new SequencedUI([{ type: "back" }]); // defensive: the host shows no Back at step 1

    const res = await runCreateSelector(buildFloor(), asUI(ui), "vscode", {
      flagReader: () => false,
    });

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.equal(res.error.name, "BuildTargetWalkCancelled");
    }
  });
});

describe("openCreateSelectorPresentation (walk-create-selector)", () => {
  it("WCS-07: projects the questions with their unfiltered options; a missing entry is a SystemError", () => {
    const pres = openCreateSelectorPresentation(buildFloor());

    assert.isTrue(pres.isOk());
    if (pres.isOk()) {
      const projectType = pres.value.questions.find((q) => q.name === "projectType");
      assert.isDefined(projectType);
      assert.equal(projectType?.title, "New Project");
      // presentation is unfiltered — all six options, including the conditioned github-copilot one.
      assert.equal(projectType?.staticOptions.length, 6);
      assert.include(
        (projectType?.staticOptions ?? []).map((option) => option.id),
        "start-with-github-copilot"
      );
    }

    const missing = openCreateSelectorPresentation(new AdmZip().toBuffer());
    assert.isTrue(missing.isErr());
    if (missing.isErr()) {
      assert.instanceOf(missing.error, SystemError);
      assert.equal(missing.error.name, "PackageFileMissing");
    }
  });
});

describe("resolveCreateTargetByTemplateId (dispatch-create-by-engine — preset template-name short-circuit)", () => {
  it("resolves a v4 route's engine by templateId without walking Q1", () => {
    const res = resolveCreateTargetByTemplateId(buildFloor(), "da/mcp-server");

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "da/mcp-server");
      assert.equal(res.value.engine, "v4");
      assert.deepEqual(res.value.answers, {});
    }
  });

  it("resolves the weather-agent v4 route's engine by templateId", () => {
    const res = resolveCreateTargetByTemplateId(buildFloor(), "weather-agent");

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.engine, "v4");
    }
  });

  it("defaults an id with no selector route to the v3 coexistence engine (dispatch-create-by-engine DCE-12)", () => {
    const res = resolveCreateTargetByTemplateId(buildFloor(), "some-unrouted-template");

    assert.isTrue(res.isOk());
    if (res.isOk()) {
      assert.equal(res.value.templateId, "some-unrouted-template");
      assert.equal(res.value.engine, "v3");
      assert.deepEqual(res.value.answers, {});
    }
  });

  it("surfaces the selector read error when the floor has no selector.json", () => {
    const res = resolveCreateTargetByTemplateId(new AdmZip().toBuffer(), "da/mcp-server");

    assert.isTrue(res.isErr());
    if (res.isErr()) {
      assert.instanceOf(res.error, SystemError);
      assert.equal(res.error.name, "PackageFileMissing");
    }
  });
});
