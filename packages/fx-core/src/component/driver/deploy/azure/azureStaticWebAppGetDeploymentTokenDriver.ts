// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { WebSiteManagementClient } from "@azure/arm-appservice";
import { hooks } from "@feathersjs/hooks";
import { FxError, ok, Result } from "@microsoft/teamsfx-api";
import { Service } from "typedi";
import { getLocalizedString } from "../../../../common/localizeUtils";
import { TelemetryConstant } from "../../../constant/commonConstant";
import * as azureResourceOperation from "../../../utils/azureResourceOperation";
import { asFactory, asString, errorHandle } from "../../../utils/common";
import { DriverContext } from "../../interface/commonArgs";
import { AzureStaticWebAppConfigArgs } from "../../interface/provisionArgs";
import { ExecutionResult, StepDriver } from "../../interface/stepDriver";
import { addStartAndEndTelemetry } from "../../middleware/addStartAndEndTelemetry";

const ACTION_NAME = "azureStaticWebApps/getDeploymentToken";

@Service(ACTION_NAME)
export class AzureStaticWebAppGetDeploymentTokenDriver implements StepDriver {
  readonly description: string = getLocalizedString("driver.deploy.getSWADeploymentToken");

  static createWebSiteManagementClient(credential: any, subscriptionId: string) {
    return new WebSiteManagementClient(credential, subscriptionId);
  }

  protected static readonly STORAGE_CONFIG_ARGS = asFactory<AzureStaticWebAppConfigArgs>({
    resourceId: asString,
  });
  protected static readonly HELP_LINK = "https://aka.ms/teamsfx-actions/swa-get-deployment-key";
  protected static readonly RESOURCE_PATTERN =
    /\/subscriptions\/([^\/]*)\/resourceGroups\/([^\/]*)\/providers\/Microsoft.Web\/staticSites\/([^\/]*)/i;

  @hooks([addStartAndEndTelemetry(ACTION_NAME, TelemetryConstant.DEPLOY_COMPONENT_NAME)])
  async execute(
    args: unknown,
    ctx: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<ExecutionResult> {
    try {
      return await AzureStaticWebAppGetDeploymentTokenDriver.run(args, ctx, outputEnvVarNames);
    } catch (e) {
      return { result: await errorHandle(e, ACTION_NAME, ctx.logProvider), summaries: [] };
    }
  }

  static async run(
    args: unknown,
    ctx: DriverContext,
    outputEnvVarNames?: Map<string, string>
  ): Promise<ExecutionResult> {
    const input = AzureStaticWebAppGetDeploymentTokenDriver.STORAGE_CONFIG_ARGS(
      args,
      AzureStaticWebAppGetDeploymentTokenDriver.HELP_LINK
    );
    const allowOutput = !!outputEnvVarNames?.get("deploymentToken");
    const outputKey = !outputEnvVarNames?.get("deploymentToken")
      ? "SECRET_TAB_SWA_DEPLOYMENT_TOKEN"
      : outputEnvVarNames.get("deploymentToken")!;
    const resourceInfo = azureResourceOperation.parseAzureResourceId(
      input.resourceId,
      AzureStaticWebAppGetDeploymentTokenDriver.RESOURCE_PATTERN
    );
    const azureTokenCredential = await azureResourceOperation.getAzureAccountCredential(
      ctx.azureAccountProvider
    );
    const client = AzureStaticWebAppGetDeploymentTokenDriver.createWebSiteManagementClient(
      azureTokenCredential,
      resourceInfo.subscriptionId
    );
    const secrets = await client.staticSites.listStaticSiteSecrets(
      resourceInfo.resourceGroupName,
      resourceInfo.instanceId,
      {
        requestOptions: {
          customHeaders: {
            "User-Agent": "TeamsToolkit",
          },
        },
      }
    );
    const deploymentKey = secrets?.properties?.apiKey ?? "";
    // only set the output if the output key is not empty
    const result: Result<Map<string, string>, FxError> = allowOutput
      ? ok(new Map([[outputKey, deploymentKey]]))
      : ok(new Map());
    // always set the deployment token to the environment variable
    process.env[outputKey] = deploymentKey;
    return {
      result: result,
      summaries: [getLocalizedString("driver.deploy.getSWADeploymentTokenSummary")],
    };
  }
}
