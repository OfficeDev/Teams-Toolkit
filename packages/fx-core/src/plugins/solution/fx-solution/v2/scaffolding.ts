import { v2, Inputs, FxError, Result, ok, err } from "@microsoft/teamsfx-api";
import { getStrings, isMultiEnvEnabled } from "../../../../common/tools";
import {
  AzureResourceFunction,
  BotOptionItem,
  MessageExtensionItem,
  TabOptionItem,
} from "../question";
import { executeConcurrently, NamedThunk } from "./executor";
import { combineRecords, getAzureSolutionSettings, getSelectedPlugins } from "./utils";
import path from "path";
import fs from "fs-extra";
import { getTemplatesFolder } from "../../../..";
import { LocalSettingsProvider } from "../../../../common/localSettingsProvider";

export async function scaffoldSourceCode(
  ctx: v2.Context,
  inputs: Inputs
): Promise<Result<Record<v2.PluginName, { output: Record<string, string> }>, FxError>> {
  const plugins = getSelectedPlugins(getAzureSolutionSettings(ctx));

  const thunks: NamedThunk<{ output: Record<string, string> }>[] = plugins
    .filter((plugin) => !!plugin.scaffoldSourceCode)
    .map((plugin) => {
      return {
        pluginName: `${plugin.name}`,
        taskName: "scaffoldSourceCode",
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        thunk: () => plugin.scaffoldSourceCode!(ctx, inputs),
      };
    });

  const result = await executeConcurrently(thunks, ctx.logProvider);
  const solutionSettings = getAzureSolutionSettings(ctx);
  if (result.isOk()) {
    const capabilities = solutionSettings.capabilities;
    const azureResources = solutionSettings.azureResources;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await scaffoldReadmeAndLocalSettings(capabilities, azureResources, inputs.projectPath!);

    ctx.userInteraction.showMessage(
      "info",
      `Success: ${getStrings().solution.ScaffoldSuccessNotice}`,
      false
    );
    return ok(combineRecords(result.value));
  } else {
    return err(result.error);
  }
}

export async function scaffoldByPlugins(ctx: v2.Context, inputs: Inputs, plugins: v2.ResourcePlugin[]): Promise<Result<Record<v2.PluginName, { output: Record<string, string> }>, FxError>> {
  const thunks: NamedThunk<{ output: Record<string, string> }>[] = plugins
    .filter((plugin) => !!plugin.scaffoldSourceCode)
    .map((plugin) => {
      return {
        pluginName: `${plugin.name}`,
        taskName: "scaffoldSourceCode",
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        thunk: () => plugin.scaffoldSourceCode!(ctx, inputs),
      };
    });

  const result = await executeConcurrently(thunks, ctx.logProvider);
  const solutionSettings = getAzureSolutionSettings(ctx);
  if (result.isOk()) {
    const capabilities = solutionSettings.capabilities;
    const azureResources = solutionSettings.azureResources;

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await scaffoldReadmeAndLocalSettings(capabilities, azureResources, inputs.projectPath!);

    ctx.userInteraction.showMessage(
      "info",
      `Success: ${getStrings().solution.ScaffoldSuccessNotice}`,
      false
    );
    return ok(combineRecords(result.value));
  } else {
    return err(result.error);
  }
}

export async function scaffoldReadmeAndLocalSettings(
  capabilities: string[],
  azureResources: string[],
  projectPath: string
): Promise<void> {
  const hasBot = capabilities.includes(BotOptionItem.id);
  const hasMsgExt = capabilities.includes(MessageExtensionItem.id);
  const hasTab = capabilities.includes(TabOptionItem.id);
  if (hasTab && (hasBot || hasMsgExt)) {
    const readme = path.join(getTemplatesFolder(), "plugins", "solution", "README.md");
    if (await fs.pathExists(readme)) {
      await fs.copy(readme, `${projectPath}/README.md`);
    }
  }

  // TODO: add migrate V1 project README file

  const hasBackend = azureResources.includes(AzureResourceFunction.id);

  if (isMultiEnvEnabled()) {
    const localSettingsProvider = new LocalSettingsProvider(projectPath);
    const localSettings = await localSettingsProvider.load();

    if (localSettings !== undefined) {
      // Add local settings for the new added capability/resource
      await localSettingsProvider.save(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        localSettingsProvider.incrementalInit(localSettings!, hasBackend, hasBot)
      );
    } else {
      // Initialize a local settings on scaffolding
      await localSettingsProvider.save(localSettingsProvider.init(hasTab, hasBackend, hasBot));
    }
  }
}
