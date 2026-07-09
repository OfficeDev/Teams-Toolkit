// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { FxError, SystemError } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import { Result, err, ok } from "neverthrow";
import { TemplateFileEntry, TemplateLocator } from "../model/dataModel";

/** Open resolved package bytes for one template. See open-template-package spec. */

const SOURCE = "Scaffold";

/** The `<language>/<scenario>/` prefix this locator resolves to (trailing slash = boundary). */
function locatorPrefix(locator: TemplateLocator): string {
  return `${locator.language}/${locator.scenario}/`;
}

/** Zip-Slip guard for stripped entry paths. */
function isSafeRelativePath(rel: string): boolean {
  return rel.split("/").every((seg) => seg.length > 0 && seg !== "." && seg !== "..");
}

/** Open the resolved package and return located file entries. */
export function openTemplatePackage(
  bytes: Buffer,
  locator: TemplateLocator
): Result<TemplateFileEntry[], FxError> {
  let zip: AdmZip;
  try {
    zip = new AdmZip(bytes);
  } catch {
    return err(
      new SystemError({
        source: SOURCE,
        name: "TemplatePackageCorrupt",
        message: "The resolved template package is not a valid archive.",
      })
    );
  }

  const prefix = locatorPrefix(locator);
  const entries: TemplateFileEntry[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }
    const name = entry.entryName.replace(/\\/g, "/");
    if (!name.startsWith(prefix)) {
      continue;
    }
    const rel = name.slice(prefix.length);
    if (!isSafeRelativePath(rel)) {
      return err(
        new SystemError({
          source: SOURCE,
          name: "TemplatePackageUnsafePath",
          message: `The resolved template package contains an unsafe entry path: "${entry.entryName}".`,
        })
      );
    }
    entries.push({ path: rel, data: entry.getData() });
  }

  if (entries.length === 0) {
    return err(
      new SystemError({
        source: SOURCE,
        name: "TemplateNotFoundInPackage",
        message: `Template "${prefix}" was not found in the resolved package.`,
      })
    );
  }

  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return ok(entries);
}
