// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import path from "path";
import { describe, expect, it } from "vitest";

interface CommandContribution {
  command: string;
  title: string;
  category?: string;
  enablement?: string;
}

interface CommandPaletteContribution {
  command: string;
  when?: string;
}

interface ExtensionManifest {
  contributes: {
    commands: CommandContribution[];
    menus: {
      commandPalette: CommandPaletteContribution[];
    };
  };
}

describe("package contributions", () => {
  it("AC-01: exposes Share in the command palette only for declarative agent projects", () => {
    const manifest: ExtensionManifest = fs.readJsonSync(
      path.resolve(__dirname, "../../package.json")
    );

    expect(
      manifest.contributes.commands.find((command) => command.command === "fx-extension.share")
    ).toEqual({
      command: "fx-extension.share",
      title: "%teamstoolkit.commands.share.title%",
      category: "Microsoft 365 Agents",
      enablement:
        "fx-extension.isTeamsFx && fx-extension.isDeclarativeCopilotApp && isWorkspaceTrusted && !fx-extension.commandLocked",
    });
    expect(
      manifest.contributes.menus.commandPalette.find(
        (command) => command.command === "fx-extension.share"
      )
    ).toEqual({
      command: "fx-extension.share",
      when: "fx-extension.isDeclarativeCopilotApp",
    });
  });
});
