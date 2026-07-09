import { vi, assert } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok } from "@microsoft/teamsfx-api";
import { envUtil } from "@microsoft/teamsfx-core";
import { v4 } from "uuid";
import * as vscode from "vscode";
import { environmentVariableRegex } from "../../src/constants";
import * as globalVariables from "../../src/globalVariables";
import { ManifestTemplateHoverProvider } from "../../src/hoverProvider";
import { MockCore } from "../mocks/mockCore";

describe("Manifest template hover - V3", async () => {
  const text = `{
    "$schema": "https://developer.microsoft.com/en-us/json-schemas/teams/v1.14/MicrosoftTeams.schema.json",
    "manifestVersion": "1.14",
    "version": "1.0.0",
    "id": "\${{TEAMS_APP_ID}}"
  }`;
  const document: vscode.TextDocument = {
    fileName: "manifest.template.json",
    getText: () => {
      return text;
    },
    lineAt: (line: number) => {
      const lines = text.split("\n");
      return {
        lineNumber: line,
        text: lines[line - 1],
      };
    },
    getWordRangeAtPosition: (position: vscode.Position, regex?: RegExp) => {
      return undefined;
    },
  } as any;

  beforeEach(() => {
    mockValue(globalVariables, "core", new MockCore());
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["local", "dev"]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    environmentVariableRegex.lastIndex = 0;
  });

  it("hover - match", async () => {
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        ["TEAMS_APP_ID"]: v4(),
      })
    );

    const hoverProvider = new ManifestTemplateHoverProvider();
    const position = new vscode.Position(5, 15);
    const cts = new vscode.CancellationTokenSource();
    const hover = await hoverProvider.provideHover(document, position, cts.token);

    assert.isTrue(hover !== undefined);
    if (hover !== undefined) {
      assert.isTrue(hover.contents.length > 0);
    }
  });

  it("hover - local", async () => {
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        ["TEAMS_APP_ID"]: v4(),
      })
    );

    const document: vscode.TextDocument = {
      fileName: "manifest.template.local.json",
      getText: () => {
        return text;
      },
      lineAt: (line: number) => {
        const lines = text.split("\n");
        return {
          lineNumber: line,
          text: lines[line - 1],
        };
      },
      getWordRangeAtPosition: (position: vscode.Position, regex?: RegExp) => {
        return undefined;
      },
    } as any;

    const hoverProvider = new ManifestTemplateHoverProvider();
    const position = new vscode.Position(5, 15);
    const cts = new vscode.CancellationTokenSource();
    const hover = await hoverProvider.provideHover(document, position, cts.token);

    assert.isTrue(hover !== undefined);
    if (hover !== undefined) {
      assert.isTrue(hover.contents.length > 0);
    }
  });

  it("hover-undefined", async () => {
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        ["TEAMS_APP_ID"]: v4(),
      })
    );

    const hoverProvider = new ManifestTemplateHoverProvider();
    const position = new vscode.Position(1, 1);
    const cts = new vscode.CancellationTokenSource();
    const hover = await hoverProvider.provideHover(document, position, cts.token);

    assert.isTrue(hover === undefined);
  });

  it("hover - no value", async () => {
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));

    const hoverProvider = new ManifestTemplateHoverProvider();
    const position = new vscode.Position(5, 15);
    const cts = new vscode.CancellationTokenSource();
    const hover = await hoverProvider.provideHover(document, position, cts.token);

    assert.isTrue(hover !== undefined);
    if (hover !== undefined) {
      assert.isTrue(hover.contents.length > 0);
    }
  });

  it("hover - playground env no value", async () => {
    (envUtil.listEnv as ReturnType<typeof vi.spyOn>).restore();
    vi.spyOn(envUtil, "listEnv").mockResolvedValue(ok(["local", "playground"]));
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(ok({}));

    const hoverProvider = new ManifestTemplateHoverProvider();
    const position = new vscode.Position(5, 15);
    const cts = new vscode.CancellationTokenSource();
    const hover = await hoverProvider.provideHover(document, position, cts.token);

    assert.isTrue(hover !== undefined);
    if (hover !== undefined) {
      assert.isTrue(hover.contents.length > 0);
      const content = (hover.contents[0] as vscode.MarkdownString).value;
      assert.notInclude(content, "playground");
      assert.notInclude(content, "command:fx-extension.localdebug");
      assert.include(content, "local");
    }
  });
});
