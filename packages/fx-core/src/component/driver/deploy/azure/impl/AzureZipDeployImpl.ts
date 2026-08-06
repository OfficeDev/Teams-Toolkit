// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author FanH <Siglud@gmail.com>
 */
import { AzureDeployImpl } from "./azureDeployImpl";
import {
  AxiosZipDeployResult,
  AzureUploadConfig,
  DeployContext,
  DeployStepArgs,
} from "../../../interface/buildAndDeployArgs";
import { AzureResourceInfo, DriverContext } from "../../../interface/commonArgs";
import { TokenCredential } from "@azure/core-auth";
import { LogProvider } from "@microsoft/teamsfx-api";
import { ProgressMessages } from "../../../../messages";
import { DeployConstant } from "../../../../constant/deployConstant";
import { createHash } from "crypto";
import { default as axios } from "axios";
import { HttpStatusCode } from "../../../../constant/commonConstant";
import { getLocalizedString } from "../../../../../common/localizeUtils";
import path from "path";
import { zipFolderAsync } from "../../../../utils/fileOperation";
import { DeployZipPackageError } from "../../../../../error/deploy";
import { ErrorContextMW } from "../../../../../common/globalVars";
import { hooks } from "@feathersjs/hooks";
import { ReadStream } from "fs-extra";
import { getResourceServiceEndpoint, ResourceServiceType } from "../../../../../common/constants";

type JsonObject = Record<string, unknown>;

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class AzureZipDeployImpl extends AzureDeployImpl {
  pattern =
    /\/subscriptions\/([^\/]*)\/resourceGroups\/([^\/]*)\/providers\/Microsoft.Web\/sites\/([^\/]*)/i;
  private readonly serviceName: string;
  protected helpLink;
  protected summaries: () => string[];
  protected summaryPrepare: () => string[];

  constructor(
    args: unknown,
    context: DriverContext,
    serviceName: string,
    helpLink: string,
    summaries: string[],
    summaryPrepare: string[]
  ) {
    super(args, context);
    this.helpLink = helpLink;
    this.serviceName = serviceName;
    this.summaries = () =>
      summaries.map((summary) => getLocalizedString(summary, this.distDirectory));
    this.summaryPrepare = () =>
      summaryPrepare.map((summary) => getLocalizedString(summary, this.zipFilePath));
  }

  async azureDeploy(
    args: DeployStepArgs,
    azureResource: AzureResourceInfo,
    azureCredential: TokenCredential
  ): Promise<void> {
    const cost = await this.zipDeploy(args, azureResource, azureCredential);
    await this.restartFunctionApp(azureResource);
    if (cost > DeployConstant.DEPLOY_OVER_TIME) {
      this.context.logProvider?.info(
        getLocalizedString(
          "driver.deploy.notice.deployAcceleration",
          "https://aka.ms/teamsfx-config-run-from-package"
        )
      );
    }
  }

  protected prepare: (args: DeployStepArgs) => Promise<void> = async (args: DeployStepArgs) => {
    await this.packageToZip(args, this.context);
  };

  /**
   * deploy to azure app service or azure function use zip deploy method
   * @param args local file needed to be deployed
   * @param azureResource azure resource info
   * @param azureCredential azure user login credential
   * @return the zip deploy time cost
   * @protected
   */
  public async zipDeploy(
    args: DeployStepArgs,
    azureResource: AzureResourceInfo,
    azureCredential: TokenCredential
  ): Promise<number> {
    const zipBuffer = await this.packageToZip(args, this.context);
    this.context.logProvider.debug("Start to get Azure account info for deploy");
    const config = await this.createAzureDeployConfig(azureResource, azureCredential);
    this.context.logProvider.debug("Get Azure account info for deploy complete");
    const endpoint = await AzureZipDeployImpl.getZipDeployEndpoint(azureResource, config);
    this.context.logProvider.debug(`Start to upload code to ${endpoint}`);
    const startTime = Date.now();
    const location = await this.zipDeployPackage(
      endpoint,
      zipBuffer,
      config,
      this.context.logProvider
    );
    this.context.logProvider.debug("Upload code to Azure complete");
    this.context.logProvider.debug("Start to check Azure deploy status");
    const deployRes = await this.checkDeployStatus(location, config, this.context.logProvider);
    this.context.logProvider.debug("Check Azure deploy status complete");
    const cost = Date.now() - startTime;
    const telemetryData = {
      time_cost: cost.toString(),
      status: deployRes?.status?.toString() ?? "",
      message: deployRes?.message ?? "",
      received_time: deployRes?.received_time ?? "",
      started_time: deployRes?.start_time?.toString() ?? "",
      end_time: deployRes?.end_time?.toString() ?? "",
      last_success_end_time: deployRes?.last_success_end_time?.toString() ?? "",
      complete: deployRes?.complete?.toString() ?? "",
      active: deployRes?.active?.toString() ?? "",
      is_readonly: deployRes?.is_readonly?.toString() ?? "",
      site_name_hash: deployRes?.site_name
        ? createHash("sha256").update(deployRes.site_name).digest("hex")
        : "",
    };
    this.context.logProvider.verbose(`Start send telemetry data ${JSON.stringify(telemetryData)}`);
    this.context.telemetryReporter?.sendTelemetryEvent("deployResponse", telemetryData);
    return cost;
  }

  /**
   * pack dist folder into zip
   * @param args dist folder and ignore files
   * @param context log provider etc..
   * @protected
   */
  protected async packageToZip(args: DeployStepArgs, context: DeployContext): Promise<ReadStream> {
    const ig = await this.handleIgnore(args, context);
    this.zipFilePath = this.zipFilePath
      ? path.isAbsolute(this.zipFilePath)
        ? this.zipFilePath
        : path.join(this.workingDirectory, this.zipFilePath)
      : path.join(
          this.workingDirectory,
          DeployConstant.DEPLOYMENT_TMP_FOLDER,
          DeployConstant.DEPLOYMENT_ZIP_CACHE_FILE
        );
    this.context.logProvider?.debug(`start zip dist folder ${this.distDirectory}`);
    const res = await zipFolderAsync(this.distDirectory, this.zipFilePath, ig);
    this.context.logProvider?.debug(
      `zip dist folder ${this.distDirectory} to ${this.zipFilePath} complete`
    );
    return res;
  }

  /**
   * call azure app service or azure function zip deploy method
   * @param zipDeployEndpoint azure zip deploy endpoint
   * @param zipBuffer zip file buffer
   * @param config azure upload config, including azure account credential
   * @param logger log provider
   * @protected
   */
  @hooks([ErrorContextMW({ source: "Azure", component: "AzureZipDeployImpl" })])
  async zipDeployPackage(
    zipDeployEndpoint: string,
    zipBuffer: ReadStream,
    config: AzureUploadConfig,
    logger: LogProvider
  ): Promise<string> {
    let res: AxiosZipDeployResult;
    let retryCount = 0;
    while (true) {
      this.context.logProvider.verbose(`Start to upload zip file to ${zipDeployEndpoint}`);
      try {
        res = await AzureDeployImpl.AXIOS_INSTANCE.post(zipDeployEndpoint, zipBuffer, config);
        this.context.logProvider.verbose(
          `Upload zip file to ${zipDeployEndpoint} complete, response: ${JSON.stringify(
            res,
            Object.getOwnPropertyNames(res)
          )}.`
        );
        break;
      } catch (e) {
        this.context.logProvider.verbose(
          `Upload zip file failed with error: ${JSON.stringify(
            e,
            Object.getOwnPropertyNames(e),
            2
          )}`
        );
        if (axios.isAxiosError(e)) {
          // if the error is remote server error, retry
          if ((e.response?.status ?? HttpStatusCode.OK) >= HttpStatusCode.INTERNAL_SERVER_ERROR) {
            retryCount += 1;
            if (retryCount < DeployConstant.DEPLOY_UPLOAD_RETRY_TIMES) {
              logger.warning(
                `Upload zip file failed with response status code: ${
                  e.response?.status ?? "NA"
                }. Retrying...`
              );
            } else {
              // if retry times exceed, throw error
              logger.warning(
                `Retry times exceeded. Upload zip file failed with remote server error. Message: ${JSON.stringify(
                  e.response?.data
                )}`
              );
              throw new DeployZipPackageError(zipDeployEndpoint, e, this.helpLink);
            }
          } else {
            // None server error, throw
            logger.error(
              `Upload zip file failed with response status code: ${
                e.response?.status ?? "NA"
              }, message: ${JSON.stringify(e.response?.data)}`
            );
            throw new DeployZipPackageError(zipDeployEndpoint, e, this.helpLink);
          }
        } else {
          // if the error is not axios error, throw
          logger.error(`Upload zip file failed with error: ${JSON.stringify(e)}`);
          throw new DeployZipPackageError(zipDeployEndpoint, e as Error, this.helpLink);
        }
      } finally {
        zipBuffer.destroy();
      }
    }

    if (res?.status !== HttpStatusCode.OK && res?.status !== HttpStatusCode.ACCEPTED) {
      if (res?.status) {
        logger.error(`Deployment is failed with error code: ${res.status}.`);
      }
      throw new DeployZipPackageError(
        zipDeployEndpoint,
        new Error(`status code: ${res?.status ?? "NA"}`),
        this.helpLink
      );
    }

    return res.headers.location;
  }

  /**
   * create azure zip deploy endpoint
   * @param azureResource resource id of the website
   * @param config azure upload config, including azure account credential
   */
  public static async getZipDeployEndpoint(
    azureResource: AzureResourceInfo,
    config: AzureUploadConfig
  ): Promise<string> {
    const response = await fetch(
      `${getResourceServiceEndpoint(ResourceServiceType.Azure)}/subscriptions/${
        azureResource.subscriptionId
      }/resourceGroups/${azureResource.resourceGroupName}/providers/Microsoft.Web/sites/${
        azureResource.instanceId
      }?api-version=2024-04-01`,
      {
        headers: config.headers,
      }
    );
    const responseData = await AzureZipDeployImpl.readResponseData(response);
    if (!response.ok) {
      throw new Error(
        `Failed to get Azure App Service host names. Status code: ${
          response.status
        }. Response: ${AzureZipDeployImpl.formatResponseData(responseData)}`
      );
    }
    const hostNames = AzureZipDeployImpl.getEnabledHostNames(responseData);
    if (!hostNames) {
      throw new Error(
        `Failed to get Azure App Service host names. Response does not contain properties.enabledHostNames. Response: ${AzureZipDeployImpl.formatResponseData(
          responseData
        )}`
      );
    }
    const scmHostName = hostNames.find((host) => host.includes("scm"));
    if (!scmHostName) {
      throw new Error(`Cannot find SCM host name. Available host names: ${hostNames.join(", ")}`);
    }
    return `https://${scmHostName}/api/zipdeploy?isAsync=true`;
  }

  private static async readResponseData(response: Response): Promise<unknown> {
    const responseText = await response.text();
    if (!responseText) {
      return "";
    }
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }

  private static getEnabledHostNames(responseData: unknown): string[] | undefined {
    if (!isJsonObject(responseData) || !isJsonObject(responseData.properties)) {
      return undefined;
    }
    const hostNames = responseData.properties.enabledHostNames;
    if (!Array.isArray(hostNames) || !hostNames.every((hostName) => typeof hostName === "string")) {
      return undefined;
    }
    return hostNames;
  }

  private static formatResponseData(responseData: unknown): string {
    const responseText =
      typeof responseData === "string" ? responseData : JSON.stringify(responseData);
    return responseText.length > 1000 ? `${responseText.substring(0, 1000)}...` : responseText;
  }

  updateProgressbar(): void {
    void this.progressBar?.next(
      ProgressMessages.deployToAzure(this.workingDirectory, this.serviceName)
    );
  }
}
