// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { applyIcons } from "../../../../src/component/generator/openPlugin/iconStrategy";
import { ParsedOpenPlugin } from "../../../../src/component/generator/openPlugin/types";
import { chai } from "vitest";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function tmp(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function makeParsed(overrides: Partial<ParsedOpenPlugin>): ParsedOpenPlugin {
  return {
    pluginRoot: overrides.pluginRoot ?? "",
    manifest: { name: "fixture", ...(overrides.manifest as any) },
    manifestPath: "",
    manifestKind: "open-plugin",
    mcpServers: {},
    skills: [],
    commands: [],
    hasColorPng: false,
    hasOutlinePng: false,
    warnings: [],
    ...overrides,
  };
}

describe("openPlugin.applyIcons", () => {
  let pluginRoot: string;
  let appPkg: string;

  beforeEach(async () => {
    pluginRoot = await tmp("op-icon-plugin-");
    appPkg = await tmp("op-icon-app-");
  });

  afterEach(async () => {
    await fs.remove(pluginRoot);
    await fs.remove(appPkg);
  });

  it("copies a user-supplied color.png and outline.png verbatim", async () => {
    const colorBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xab, 0xcd]);
    const outlineBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0xde, 0xad]);
    await fs.writeFile(path.join(pluginRoot, "color.png"), colorBytes);
    await fs.writeFile(path.join(pluginRoot, "outline.png"), outlineBytes);
    const warnings: string[] = [];
    await applyIcons(
      makeParsed({ pluginRoot, hasColorPng: true, hasOutlinePng: true }),
      appPkg,
      warnings
    );
    const writtenColor = await fs.readFile(path.join(appPkg, "color.png"));
    const writtenOutline = await fs.readFile(path.join(appPkg, "outline.png"));
    chai.expect(writtenColor.equals(colorBytes)).to.equal(true);
    chai.expect(writtenOutline.equals(outlineBytes)).to.equal(true);
    chai.expect(warnings).to.deep.equal([]);
  });

  it("falls back to a placeholder PNG when both icons are absent", async () => {
    const warnings: string[] = [];
    await applyIcons(makeParsed({ pluginRoot }), appPkg, warnings);
    const color = await fs.readFile(path.join(appPkg, "color.png"));
    const outline = await fs.readFile(path.join(appPkg, "outline.png"));
    chai.expect(color.subarray(0, 8).equals(PNG_SIGNATURE)).to.equal(true);
    chai.expect(outline.subarray(0, 8).equals(PNG_SIGNATURE)).to.equal(true);
    chai.expect(warnings).to.deep.equal([]);
  });

  it("uses a local logo PNG referenced in plugin.json", async () => {
    const logoBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x12, 0x34]);
    await fs.ensureDir(path.join(pluginRoot, "branding"));
    await fs.writeFile(path.join(pluginRoot, "branding", "color.png"), logoBytes);
    const warnings: string[] = [];
    await applyIcons(
      makeParsed({
        pluginRoot,
        manifest: { name: "fixture", logo: "./branding/color.png" } as any,
      }),
      appPkg,
      warnings
    );
    const color = await fs.readFile(path.join(appPkg, "color.png"));
    chai.expect(color.equals(logoBytes)).to.equal(true);
    chai.expect(warnings).to.deep.equal([]);
  });

  it("warns and falls back when logo is an .svg", async () => {
    await fs.writeFile(path.join(pluginRoot, "logo.svg"), "<svg/>");
    const warnings: string[] = [];
    await applyIcons(
      makeParsed({ pluginRoot, manifest: { name: "fixture", logo: "./logo.svg" } as any }),
      appPkg,
      warnings
    );
    const color = await fs.readFile(path.join(appPkg, "color.png"));
    chai.expect(color.subarray(0, 8).equals(PNG_SIGNATURE)).to.equal(true);
    chai.expect(warnings.some((w) => w.includes(".svg"))).to.equal(true);
  });

  it("warns and falls back when logo is a remote URL", async () => {
    const warnings: string[] = [];
    await applyIcons(
      makeParsed({
        pluginRoot,
        manifest: { name: "fixture", logo: "https://contoso.com/logo.png" } as any,
      }),
      appPkg,
      warnings
    );
    const color = await fs.readFile(path.join(appPkg, "color.png"));
    chai.expect(color.subarray(0, 8).equals(PNG_SIGNATURE)).to.equal(true);
    chai.expect(warnings.some((w) => w.includes("remote URL"))).to.equal(true);
  });

  it("warns and falls back when logo resolves outside the plugin root", async () => {
    const warnings: string[] = [];
    await applyIcons(
      makeParsed({
        pluginRoot,
        manifest: { name: "fixture", logo: "../escape.png" } as any,
      }),
      appPkg,
      warnings
    );
    const color = await fs.readFile(path.join(appPkg, "color.png"));
    chai.expect(color.subarray(0, 8).equals(PNG_SIGNATURE)).to.equal(true);
    chai.expect(warnings.some((w) => w.includes("outside the plugin root"))).to.equal(true);
  });

  it("warns and falls back when the referenced logo file is missing", async () => {
    const warnings: string[] = [];
    await applyIcons(
      makeParsed({
        pluginRoot,
        manifest: { name: "fixture", logo: "./does-not-exist.png" } as any,
      }),
      appPkg,
      warnings
    );
    const color = await fs.readFile(path.join(appPkg, "color.png"));
    chai.expect(color.subarray(0, 8).equals(PNG_SIGNATURE)).to.equal(true);
    chai.expect(warnings.some((w) => w.includes("does not exist"))).to.equal(true);
  });
});
