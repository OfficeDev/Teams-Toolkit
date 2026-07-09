// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ResourceManagementClient } from "@azure/arm-resources";
import { Context, err, FxError, ok, Result } from "@microsoft/teamsfx-api";
import { ConstantString } from "../../../../common/constants";
import { getResourceGroupNameFromResourceId } from "../../../../common/stringUtils";
import { DeployArmError, GetArmDeploymentError } from "../../../../error/arm";
import { ResourceGroupNotExistError } from "../../../../error/azure";
import * as innerHandleError from "./innerHandleError";

// constant string
const ErrorCodes = {
  InvalidTemplate: "InvalidTemplate",
  InvalidTemplateDeployment: "InvalidTemplateDeployment",
  ResourceGroupNotFound: "ResourceGroupNotFound",
  DeploymentOperationFailed: "DeploymentOperationFailed",
};
const filteredErrorMessage = "Template output evaluation skipped";

export type DeployContext = {
  ctx: Context;
  finished: boolean;
  client: ResourceManagementClient;
  resourceGroupName: string;
  deploymentStartTime: number;
  deploymentName: string;
};

/* eslint-disable @typescript-eslint/no-namespace */
export namespace ArmErrorHandle {
  export function fetchInnerError(error: any): any {
    if (!error.details) {
      return error;
    }
    if (error.details.error) {
      return fetchInnerError(error.details.error);
    } else if (error.details instanceof Array && error.details[0]) {
      return fetchInnerError(error.details[0]);
    }
    return error;
  }

  export async function handleArmDeploymentError(
    error: any,
    deployCtx: DeployContext
  ): Promise<Result<undefined, FxError>> {
    // return the error if the template is invalid
    if (Object.keys(ErrorCodes).includes(error.code)) {
      if (error.code === ErrorCodes.InvalidTemplateDeployment) {
        error = fetchInnerError(error);
      }
      if (error.code === ErrorCodes.ResourceGroupNotFound) {
        return err(
          new ResourceGroupNotExistError(
            deployCtx.resourceGroupName,
            deployCtx.client.subscriptionId
          )
        );
      } else if (
        error.code === ErrorCodes.InvalidTemplate ||
        error.code === ErrorCodes.InvalidTemplateDeployment
      ) {
        return err(
          new DeployArmError(deployCtx.deploymentName, deployCtx.resourceGroupName, error)
        );
      }
    }

    // try to get deployment error
    const result = await ArmErrorHandle.wrapGetDeploymentError(
      deployCtx,
      deployCtx.resourceGroupName,
      deployCtx.deploymentName,
      error
    );
    if (result.isOk()) {
      const deploymentError = result.value;

      // return thrown error if deploymentError is empty
      if (!deploymentError) {
        return err(
          new DeployArmError(deployCtx.deploymentName, deployCtx.resourceGroupName, error)
        );
      }
      const deploymentErrorObj = formattedDeploymentError(deploymentError);
      const deploymentErrorMessage = JSON.stringify(deploymentErrorObj, undefined, 2);
      let failedDeployments: string[] = [];
      if (deploymentError.subErrors) {
        failedDeployments = Object.keys(deploymentError.subErrors);
      } else {
        failedDeployments.push(deployCtx.deploymentName);
      }
      const format = failedDeployments.map((deployment) => deployment + " module");
      error.message = (error.message as string) + "\n" + deploymentErrorMessage;
      return err(new DeployArmError(format.join(", "), deployCtx.resourceGroupName, error));
    } else {
      deployCtx.ctx.logProvider?.info(
        `origin error message is : \n${JSON.stringify(error, undefined, 2)}`
      );
      return result;
    }
  }

  export async function wrapGetDeploymentError(
    deployCtx: DeployContext,
    resourceGroupName: string,
    deploymentName: string,
    rawError: any
  ): Promise<Result<any, FxError>> {
    try {
      const deploymentError = await ArmErrorHandle.getDeploymentError(
        deployCtx,
        resourceGroupName,
        deploymentName
      );
      return ok(deploymentError);
    } catch (error: any) {
      return err(
        new GetArmDeploymentError(
          deployCtx.deploymentName,
          deployCtx.resourceGroupName,
          rawError,
          error
        )
      );
    }
  }

  export async function getDeploymentError(
    deployCtx: DeployContext,
    resourceGroupName: string,
    deploymentName: string
  ): Promise<any> {
    let deployment;
    try {
      deployment = await innerHandleError.innerGetDeploymentError(
        deployCtx.client,
        resourceGroupName,
        deploymentName
      );
    } catch (error: any) {
      if (
        deploymentName !== deployCtx.deploymentName &&
        error.code === ConstantString.DeploymentNotFound
      ) {
        return undefined;
      }
      throw error;
    }

    // The root deployment error name is deployCtx.deploymentName.
    // If we find the root error has a timestamp less than startTime, it is an old error to be ignored.
    // Other erros will be ignored as well.
    if (
      deploymentName === deployCtx.deploymentName &&
      deployment.properties?.timestamp &&
      deployment.properties.timestamp.getTime() < deployCtx.deploymentStartTime
    ) {
      return undefined;
    }
    if (!deployment.properties?.error) {
      return undefined;
    }
    const deploymentError: any = {
      error: deployment.properties?.error,
    };
    const operations = [];
    const deploymentOperations = await innerHandleError.innerGetDeploymentOperations(
      deployCtx.client,
      resourceGroupName,
      deploymentName
    );
    for (const deploymentOperation of deploymentOperations) {
      operations.push(deploymentOperation);
    }
    for (const operation of operations) {
      if (operation.properties?.statusMessage?.error) {
        if (!deploymentError.subErrors) {
          deploymentError.subErrors = {};
        }
        const name = operation.properties.targetResource?.resourceName ?? operation.id;
        deploymentError.subErrors[name!] = {
          error: operation.properties.statusMessage.error,
        };
        if (
          operation.properties.targetResource?.resourceType ===
            ConstantString.DeploymentResourceType &&
          operation.properties.targetResource?.resourceName &&
          operation.properties.targetResource?.id
        ) {
          const resourceGroupName: string = getResourceGroupNameFromResourceId(
            operation.properties.targetResource.id
          );
          const subError = await getDeploymentError(
            deployCtx,
            resourceGroupName,
            operation.properties.targetResource?.resourceName
          );
          if (subError) {
            deploymentError.subErrors[name!].inner = subError;
          }
        }
      }
    }
    return deploymentError;
  }

  export function formattedDeploymentError(deploymentError: any): any {
    if (deploymentError.subErrors) {
      const result: any = {};
      for (const key in deploymentError.subErrors) {
        const subError = deploymentError.subErrors[key];
        if (subError.inner) {
          result[key] = formattedDeploymentError(subError.inner);
        } else {
          const needFilter =
            subError.error?.message?.includes(filteredErrorMessage) &&
            subError.error?.code === ErrorCodes.DeploymentOperationFailed;
          if (!needFilter) {
            result[key] = subError.error;
          }
        }
      }
      return result;
    } else {
      return deploymentError.error;
    }
  }
}
