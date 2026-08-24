// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import fs from "fs-extra";
import * as path from "path";
import { inspectPathWithinRoot } from "./fileSystem";
import { generatePlaceholderPng } from "./placeholderPng";
import { ParsedOpenPlugin } from "./types";

const COLOR_FILL: [number, number, number] = [0x4a, 0x90, 0xd9];
const OUTLINE_FILL: [number, number, number] = [0xff, 0xff, 0xff];

/**
 * Write color.png and outline.png into the appPackage directory. Resolution
 * order matches the conversion plan: user-supplied root PNG → Open Plugin
 * `logo` (when it is a local .png) → generated placeholder.
 */
export async function applyIcons(
  parsed: ParsedOpenPlugin,
  appPackageDir: string,
  warnings: string[]
): Promise<void> {
  const colorDest = path.join(appPackageDir, "color.png");
  const outlineDest = path.join(appPackageDir, "outline.png");

  const appliedColor = await tryApplyRootIcon(parsed.pluginRoot, "color.png", colorDest, warnings);
  if (!appliedColor && typeof parsed.manifest.logo === "string" && parsed.manifest.logo) {
    const applied = await tryApplyLogo(parsed, colorDest, warnings);
    if (!applied) {
      await fs.writeFile(colorDest, generatePlaceholderPng(192, ...COLOR_FILL));
    }
  } else if (!appliedColor) {
    await fs.writeFile(colorDest, generatePlaceholderPng(192, ...COLOR_FILL));
  }

  const appliedOutline = await tryApplyRootIcon(
    parsed.pluginRoot,
    "outline.png",
    outlineDest,
    warnings
  );
  if (!appliedOutline) {
    await fs.writeFile(outlineDest, generatePlaceholderPng(32, ...OUTLINE_FILL));
  }
}

async function tryApplyRootIcon(
  pluginRoot: string,
  fileName: string,
  destination: string,
  warnings: string[]
): Promise<boolean> {
  const inspected = await inspectPathWithinRoot(pluginRoot, fileName, "file");
  if (inspected.status === "ok") {
    await fs.copy(inspected.path, destination);
    return true;
  }
  if (inspected.status === "outside") {
    warnings.push(`'${fileName}' resolves outside the plugin root and was ignored.`);
  } else if (inspected.status === "wrong-kind") {
    warnings.push(`'${fileName}' is not a regular file and was ignored.`);
  }
  return false;
}

async function tryApplyLogo(
  parsed: ParsedOpenPlugin,
  colorDest: string,
  warnings: string[]
): Promise<boolean> {
  const logo = parsed.manifest.logo;
  if (typeof logo !== "string") return false;
  if (/^https?:\/\//i.test(logo)) {
    warnings.push(
      `'logo' field points to a remote URL (${logo}); using placeholder color.png. Download manually if you want to ship the original.`
    );
    return false;
  }
  if (!/\.png$/i.test(logo)) {
    warnings.push(`'logo' field '${logo}' is not a .png file; using placeholder color.png.`);
    return false;
  }
  const inspectedLogo = await inspectPathWithinRoot(parsed.pluginRoot, logo, "file");
  if (inspectedLogo.status === "outside") {
    warnings.push(
      `'logo' field '${logo}' resolves outside the plugin root; using placeholder color.png.`
    );
    return false;
  }
  if (inspectedLogo.status === "missing") {
    warnings.push(`'logo' field '${logo}' does not exist; using placeholder color.png.`);
    return false;
  }
  if (inspectedLogo.status === "wrong-kind") {
    warnings.push(`'logo' field '${logo}' is not a file; using placeholder color.png.`);
    return false;
  }
  await fs.copy(inspectedLogo.path, colorDest);
  return true;
}
