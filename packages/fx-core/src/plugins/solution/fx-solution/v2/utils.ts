import {
  v2,
  Inputs,
  FxError,
  LogProvider,
  Result,
  ok,
  err,
  AzureSolutionSettings,
  combine,
} from "@microsoft/teamsfx-api";
import { HostTypeOptionAzure } from "../question";
import { getActivatedResourcePlugins, getActivatedV2ResourcePlugins } from "../ResourcePluginContainer";

export function getSelectedPlugins(azureSettings: AzureSolutionSettings): v2.ResourcePlugin[] {
  const plugins = getActivatedV2ResourcePlugins(azureSettings);
  azureSettings.activeResourcePlugins = plugins.map((p) => p.name);
  return plugins;
}

export function getAzureSolutionSettings(ctx: v2.Context): AzureSolutionSettings {
  return ctx.projectSetting.solutionSettings as AzureSolutionSettings;
}

export function isAzureProject(azureSettings: AzureSolutionSettings): boolean {
  return HostTypeOptionAzure.id === azureSettings.hostType;
}

export function combineRecords(
  records: { name: string; result: { output: Record<string, string> } }[]
): Record<string, { output: Record<string, string> }> {
  const ret: Record<v2.PluginName, { output: Record<string, string> }> = {};
  for (const record of records) {
    ret[record.name] = record.result;
  }

  return ret;
}

export function extractSolutionInputs(record: Record<string, string>): v2.SolutionInputs {
  return {
    resourceNameSuffix: record["resourceNameSuffix"],
    resourceGroupName: record["resourceGroupName"],
    location: record["location"],
    teamsAppTenantId: record["teamsAppTenantId"],
    remoteTeamsAppId: undefined,
  };
}

export function reloadV2Plugins(solutionSettings: AzureSolutionSettings): v2.ResourcePlugin[] {
  const res = getActivatedV2ResourcePlugins(solutionSettings);
  solutionSettings.activeResourcePlugins = res.map((p) => p.name);
  return res;
}