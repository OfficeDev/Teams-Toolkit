// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import { TeamsManifestLatest } from "@microsoft/teamsfx-api";
import AdmZip from "adm-zip";
import fs from "fs-extra";
import path from "path";
import { Service } from "typedi";
import { getLocalizedString } from "../../../common/localizeUtils";
import { FileNotFoundError } from "../../../error/common";
import { Constants } from "./constants";
import { asFactory, asString, wrapRun } from "../../utils/common";
import { DriverContext } from "../interface/commonArgs";
import { ExecutionResult, StepDriver } from "../interface/stepDriver";
import { addStartAndEndTelemetry } from "../middleware/addStartAndEndTelemetry";
import { WrapDriverContext } from "../util/wrapUtil";
import { copyAppPackageToSPFxArgs } from "./interfaces/CopyAppPackageToSPFxArgs";

const actionName = "teamsApp/copyAppPackageToSPFx";

@Service(actionName)
export class copyAppPackageToSPFxDriver implements StepDriver {
  public readonly description = getLocalizedString(
    "driver.teamsApp.description.copyAppPackageToSPFxDriver"
  );
  public readonly progressTitle = getLocalizedString(
    "driver.teamsApp.progressBar.copyAppPackageToSPFxStepMessage"
  );

  private readonly EmptyMap = new Map<string, string>();

  private asCopyAppPackageArgs = asFactory<copyAppPackageToSPFxArgs>({
    appPackagePath: asString,
    spfxFolder: asString,
  });

  @hooks([addStartAndEndTelemetry(actionName, actionName)])
  public async execute(
    args: copyAppPackageToSPFxArgs,
    ctx: DriverContext
  ): Promise<ExecutionResult> {
    const wrapContext = new WrapDriverContext(ctx, actionName, actionName);
    const result = await wrapRun(() => this.copy(args, wrapContext), actionName);
    return {
      result,
      summaries: wrapContext.summaries,
    };
  }

  public async copy(
    args: copyAppPackageToSPFxArgs,
    context: WrapDriverContext
  ): Promise<Map<string, string>> {
    const copyAppPackageArgs = this.asCopyAppPackageArgs(args);
    const appPackagePath = path.isAbsolute(copyAppPackageArgs.appPackagePath)
      ? copyAppPackageArgs.appPackagePath
      : path.join(context.projectPath, copyAppPackageArgs.appPackagePath);
    if (!(await fs.pathExists(appPackagePath))) {
      throw new FileNotFoundError(actionName, appPackagePath);
    }
    const pictures = await this.getIcons(appPackagePath);
    const spfxFolder = path.isAbsolute(copyAppPackageArgs.spfxFolder)
      ? copyAppPackageArgs.spfxFolder
      : path.join(context.projectPath, copyAppPackageArgs.spfxFolder);
    const spfxTeamsPath = `${spfxFolder}/teams`;
    await fs.copyFile(appPackagePath, path.join(spfxTeamsPath, "TeamsSPFxApp.zip"));
    context.addSummary(
      getLocalizedString(
        "driver.teamsApp.summary.copyAppPackageSuccess",
        appPackagePath,
        path.join(spfxTeamsPath, "TeamsSPFxApp.zip")
      )
    );

    let replacedIcons = 0;
    for (const file of await fs.readdir(spfxTeamsPath)) {
      if (file.endsWith("color.png") && pictures.color) {
        await fs.writeFile(path.join(spfxTeamsPath, file), pictures.color);
        replacedIcons++;
      } else if (file.endsWith("outline.png") && pictures.outline) {
        await fs.writeFile(path.join(spfxTeamsPath, file), pictures.outline);
        replacedIcons++;
      }
    }
    if (replacedIcons > 0) {
      context.addSummary(
        getLocalizedString("driver.teamsApp.summary.copyIconSuccess", replacedIcons, spfxTeamsPath)
      );
    }
    return this.EmptyMap;
  }

  public async getIcons(appPackagePath: string): Promise<IIcons> {
    const archivedFile = await fs.readFile(appPackagePath);
    const zipEntries = new AdmZip(archivedFile).getEntries();
    const manifestFile = zipEntries.find((x) => x.entryName === Constants.MANIFEST_FILE);
    if (!manifestFile) {
      throw new FileNotFoundError(actionName, Constants.MANIFEST_FILE);
    }
    const manifestString = manifestFile.getData().toString();
    const manifest = JSON.parse(manifestString) as TeamsManifestLatest;

    const colorFile =
      manifest.icons.color && !manifest.icons.color.startsWith("https://")
        ? zipEntries.find((x) => x.entryName.includes("color.png"))
        : undefined;
    const outlineFile =
      manifest.icons.outline && !manifest.icons.outline.startsWith("https://")
        ? zipEntries.find((x) => x.entryName.includes("outline.png"))
        : undefined;
    return { color: colorFile?.getData(), outline: outlineFile?.getData() };
  }
}

interface IIcons {
  color?: Buffer;
  outline?: Buffer;
}
