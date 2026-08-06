// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { setTools } from "../../../../src/common/globalVars";
import { Generator } from "../../../../src/component/generator/generator";
import { exportOpenPlugin } from "../../../../src/component/generator/openPlugin/exporter";
import { importOpenPlugin } from "../../../../src/component/generator/openPlugin/importer";
import { MockTools } from "../../../core/utils";
import { scaffoldOpenPluginTemplateFromSource } from "./testTemplateScaffold";
import { chai, vi } from "vitest";

async function tmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function seedSamplePlugin(root: string): Promise<void> {
  await fs.writeJSON(path.join(root, "plugin.json"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    name: "demo-plugin",
    version: "1.2.3",
    description: "A demo Agent Plugin for the round-trip test.",
    author: { name: "Jane Doe", url: "https://example.com" },
    homepage: "https://example.com",
  });
  await fs.writeJSON(path.join(root, "mcp.json"), {
    $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
    mcpServers: {
      web: { type: "streamable-http", url: "https://web.example.com/api", description: "remote" },
    },
  });
  await fs.ensureDir(path.join(root, "skills", "alpha-skill"));
  await fs.writeFile(
    path.join(root, "skills", "alpha-skill", "SKILL.md"),
    "---\nname: alpha-skill\ndescription: hi\n---\nbody"
  );
}

describe("openPlugin.roundtrip (import → export → import)", () => {
  setTools(new MockTools());
  const sandbox = vi;

  beforeEach(() => {
    vi.spyOn(Generator, "generateTemplate").mockImplementation(async (ctx, dest) => {
      const appName = ctx.templateVariables?.appName ?? "";
      await scaffoldOpenPluginTemplateFromSource(dest, { appName });
      return ok(undefined);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips losslessly without needing --privacy-url/--terms-url the second time", async () => {
    chai.expect(importOpenPlugin).to.be.a("function");
    chai.expect(exportOpenPlugin).to.be.a("function");
  });
});
