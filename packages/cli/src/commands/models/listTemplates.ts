// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { CLICommand, ok } from "@microsoft/teamsfx-api";
import { listAllTemplates, TemplateGroup } from "@microsoft/teamsfx-core";
import chalk from "chalk";

// Re-export fx-core's listAllTemplates so consumers (e.g. create.ts) can import
// it through this module's namespace and stub it in unit tests. Binding the
// fx-core function directly at a call site would remove that stubbing seam.
export { listAllTemplates } from "@microsoft/teamsfx-core";
import Table from "cli-table3";
import { logger } from "../../commonlib/logger";
import { commands } from "../../resource";
import { TelemetryEvent } from "../../telemetry/cliTelemetryEvents";
import { ListFormatOption } from "../common";

export const listTemplatesCommand: CLICommand = {
  name: "templates",
  description: commands["list.templates"].description,
  options: [ListFormatOption],
  defaultInteractiveOption: false,
  handler: (ctx) => {
    const format = ctx.optionValues.format;
    const templates = listAllTemplates();
    let result;
    if (format === "table") {
      result = jsonToTable(templates);
    } else {
      result = JSON.stringify(templates, null, 2);
    }
    logger.info(result);
    return ok(undefined);
  },
  telemetry: {
    event: TelemetryEvent.ListSample,
  },
};

function jsonToTable(templates: TemplateGroup[]): string {
  let maxIdLength = 0;
  let maxNameLength = 0;
  let maxDescriptionLength = 0;
  templates.forEach((template) => {
    const id = template.alias || template.name;
    if (id.length > maxIdLength) {
      maxIdLength = id.length;
    }
    if (template.displayName.length > maxNameLength) {
      maxNameLength = template.displayName.length;
    }
    if (template.description.length > maxDescriptionLength) {
      maxDescriptionLength = template.description.length;
    }
  });
  maxIdLength += 2;
  maxNameLength += 2;
  maxDescriptionLength += 2;

  const terminalWidth = process.stdout.isTTY ? process.stdout.columns : 80;
  const idColWidth = Math.max(15, maxIdLength);
  const nameColWidth = Math.max(20, maxNameLength);
  const descColWidth = Math.min(
    maxDescriptionLength,
    terminalWidth - idColWidth - nameColWidth - 4
  );

  const table = new Table({
    head: [
      chalk.cyanBright("Capability(Id)"),
      chalk.cyanBright("Name"),
      chalk.cyanBright("Description"),
    ],
    colAligns: ["left", "left", "left"],
    colWidths: [idColWidth, nameColWidth, descColWidth],
    wordWrap: true,
  });

  templates.forEach((template) => {
    const id = template.alias || template.name;
    table.push([id, template.displayName, template.description]);
  });

  return table.toString();
}
