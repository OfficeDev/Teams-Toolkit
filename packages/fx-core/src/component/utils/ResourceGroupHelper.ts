// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { ResourceManagementClient } from "@azure/arm-resources";
import { SubscriptionClient } from "@azure/arm-subscriptions";
import {
  AzureAccountProvider,
  err,
  FxError,
  Inputs,
  InputsWithProjectPath,
  IQTreeNode,
  ok,
  OptionItem,
  Result,
  SingleSelectQuestion,
  TextInputQuestion,
} from "@microsoft/teamsfx-api";
import { TOOLS } from "../../common/globalVars";
import { getLocalizedString } from "../../common/localizeUtils";
import { InputValidationError } from "../../error";
import {
  CheckResourceGroupExistenceError,
  CreateResourceGroupError,
  GetResourceGroupError,
  InvalidAzureCredentialError,
  ListResourceGroupLocationsError,
  ListResourceGroupsError,
  ResourceGroupConflictError,
} from "../../error/azure";
import { QuestionNames, recommendedLocations } from "../../question/constants";
import { traverse } from "../../ui/visitor";
import { azureClientHelper } from "./azureClient";

const MsResources = "Microsoft.Resources";
const ResourceGroups = "resourceGroups";

const createSubscriptionClient = (token: any) => new SubscriptionClient(token);

export const resourceGroupHelperDeps = {
  createSubscriptionClient,
};

export type ResourceGroupInfo = {
  createNewResourceGroup: boolean;
  name: string;
  location: string;
};

// TODO: use the emoji plus sign like Azure Functions extension
export const newResourceGroupOption = "+ New resource group";
/**
 * select existing resource group or create new resource group
 */
export function selectResourceGroupQuestion(
  azureAccountProvider: AzureAccountProvider,
  subscriptionId: string
): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.TargetResourceGroupName,
    title: getLocalizedString("core.QuestionSelectResourceGroup.title"),
    staticOptions: [{ id: newResourceGroupOption, label: newResourceGroupOption }],
    dynamicOptions: async (inputs: Inputs): Promise<OptionItem[]> => {
      const rmClient = await azureClientHelper.createRmClient(azureAccountProvider, subscriptionId);
      const listRgRes = await resourceGroupHelper.listResourceGroups(rmClient);
      if (listRgRes.isErr()) throw listRgRes.error;
      const rgList = listRgRes.value;
      const options: OptionItem[] = rgList.map((rg) => {
        return {
          id: rg[0],
          label: rg[0],
          description: rg[1],
        };
      });
      const existingResourceGroupNames = rgList.map((rg) => rg[0]);
      inputs.existingResourceGroupNames = existingResourceGroupNames; // cache existing resource group names for valiation usage
      return [{ id: newResourceGroupOption, label: newResourceGroupOption }, ...options];
    },
    skipSingleOption: true,
    returnObject: true,
    forgetLastValue: true,
  };
}

export function selectResourceGroupLocationQuestion(
  azureAccountProvider: AzureAccountProvider,
  subscriptionId: string
): SingleSelectQuestion {
  return {
    type: "singleSelect",
    name: QuestionNames.NewResourceGroupLocation,
    title: getLocalizedString("core.QuestionNewResourceGroupLocation.title"),
    staticOptions: [],
    dynamicOptions: async (inputs: Inputs) => {
      const rmClient = await azureClientHelper.createRmClient(azureAccountProvider, subscriptionId);
      const getLocationsRes = await resourceGroupHelper.getLocations(
        azureAccountProvider,
        rmClient
      );
      if (getLocationsRes.isErr()) {
        throw getLocationsRes.error;
      }
      const recommended = getLocationsRes.value.filter((location) => {
        return recommendedLocations.indexOf(location) >= 0;
      });
      const others = getLocationsRes.value.filter((location) => {
        return recommendedLocations.indexOf(location) < 0;
      });
      return [
        ...recommended.map((location) => {
          return {
            id: location,
            label: location,
            groupName: getLocalizedString(
              "core.QuestionNewResourceGroupLocation.group.recommended"
            ),
          } as OptionItem;
        }),
        ...others.map((location) => {
          return {
            id: location,
            label: location,
            groupName: getLocalizedString("core.QuestionNewResourceGroupLocation.group.others"),
          } as OptionItem;
        }),
      ];
    },
    default: "Central US",
  };
}

export function validateResourceGroupName(input: string, inputs?: Inputs): string | undefined {
  const name = input;
  // https://docs.microsoft.com/en-us/rest/api/resources/resource-groups/create-or-update#uri-parameters
  const match = name.match(/^[-\w._()]+$/);
  if (!match) {
    return getLocalizedString("core.QuestionNewResourceGroupName.validation");
  }

  // To avoid the issue in CLI that using async func for validation and filter will make users input answers twice,
  // we check the existence of a resource group from the list rather than call the api directly for now.
  // Bug: https://msazure.visualstudio.com/Microsoft%20Teams%20Extensibility/_workitems/edit/15066282
  // GitHub issue: https://github.com/SBoudrias/Inquirer.js/issues/1136
  if (inputs?.existingResourceGroupNames) {
    const maybeExist =
      inputs.existingResourceGroupNames.findIndex(
        (o: string) => o.toLowerCase() === input.toLowerCase()
      ) >= 0;
    if (maybeExist) {
      return `resource group already exists: ${name}`;
    }
  }
  return undefined;
}

export function newResourceGroupNameQuestion(defaultResourceGroupName: string): TextInputQuestion {
  return {
    type: "text",
    name: QuestionNames.NewResourceGroupName,
    title: getLocalizedString("core.QuestionNewResourceGroupName.title"),
    placeholder: getLocalizedString("core.QuestionNewResourceGroupName.placeholder"),
    // default resource group name will change with env name
    forgetLastValue: true,
    default: defaultResourceGroupName,
    validation: {
      validFunc: validateResourceGroupName,
    },
  };
}

export function resourceGroupQuestionNode(
  azureAccountProvider: AzureAccountProvider,
  subscriptionId: string,
  defaultResourceGroupName: string
): IQTreeNode {
  return {
    data: selectResourceGroupQuestion(azureAccountProvider, subscriptionId),
    children: [
      {
        condition: { equals: newResourceGroupOption },
        data: newResourceGroupNameQuestion(defaultResourceGroupName),
        children: [
          {
            data: selectResourceGroupLocationQuestion(azureAccountProvider, subscriptionId),
          },
        ],
      },
    ],
  };
}

class ResourceGroupHelper {
  async createNewResourceGroup(
    resourceGroupName: string,
    azureAccountProvider: AzureAccountProvider,
    subscriptionId: string,
    location: string
  ): Promise<Result<string, FxError>> {
    const rmClient = await azureClientHelper.createRmClient(azureAccountProvider, subscriptionId);
    const maybeExist = await this.checkResourceGroupExistence(resourceGroupName, rmClient);
    if (maybeExist.isErr()) {
      return err(maybeExist.error);
    }
    if (maybeExist.value) {
      return err(new ResourceGroupConflictError(resourceGroupName, subscriptionId));
    }
    try {
      const response = await rmClient.resourceGroups.createOrUpdate(resourceGroupName, {
        location: location,
        tags: { "created-by": "teamsfx" },
      });
      if (response.name === undefined) {
        return err(
          new CreateResourceGroupError(
            resourceGroupName,
            subscriptionId,
            `illegal response: ${JSON.stringify(response)}`
          )
        );
      }
      return ok(response.name);
    } catch (e: any) {
      delete e["request"];
      return err(
        new CreateResourceGroupError(
          resourceGroupName,
          subscriptionId,
          e.message || JSON.stringify(e),
          e
        )
      );
    }
  }

  async checkResourceGroupExistence(
    resourceGroupName: string,
    rmClient: ResourceManagementClient
  ): Promise<Result<boolean, FxError>> {
    try {
      const checkRes = await rmClient.resourceGroups.checkExistence(resourceGroupName);
      return ok(!!checkRes.body);
    } catch (e: any) {
      return err(
        new CheckResourceGroupExistenceError(
          resourceGroupName,
          rmClient.subscriptionId,
          e.message || JSON.stringify(e),
          e
        )
      );
    }
  }

  async getResourceGroupInfo(
    resourceGroupName: string,
    rmClient: ResourceManagementClient
  ): Promise<Result<ResourceGroupInfo | undefined, FxError>> {
    try {
      const getRes = await rmClient.resourceGroups.get(resourceGroupName);
      if (getRes.name) {
        return ok({
          createNewResourceGroup: false,
          name: getRes.name,
          location: getRes.location,
        });
      } else return ok(undefined);
    } catch (e: any) {
      delete e["request"];
      return err(
        new GetResourceGroupError(
          resourceGroupName,
          rmClient.subscriptionId,
          e.message || JSON.stringify(e),
          e
        )
      );
    }
  }

  async listResourceGroups(
    rmClient: ResourceManagementClient
  ): Promise<Result<[string, string][], FxError>> {
    try {
      const results: [string, string][] = [];
      const res = rmClient.resourceGroups.list();
      let result;
      do {
        result = await res.next();
        if (result.value?.name) results.push([result.value.name, result.value.location]);
      } while (!result.done);
      return ok(results);
    } catch (e: any) {
      delete e["request"];
      return err(
        new ListResourceGroupsError(rmClient.subscriptionId, e.message || JSON.stringify(e), e)
      );
    }
  }

  async getLocations(
    azureAccountProvider: AzureAccountProvider,
    rmClient: ResourceManagementClient
  ): Promise<Result<string[], FxError>> {
    const azureToken = await azureAccountProvider.getIdentityCredentialAsync();
    if (!azureToken) return err(new InvalidAzureCredentialError());
    const subscriptionClient = resourceGroupHelperDeps.createSubscriptionClient(azureToken);
    const askSubRes = await azureAccountProvider.getSelectedSubscription(true);
    try {
      const res = subscriptionClient.subscriptions.listLocations(askSubRes!.subscriptionId);
      const locations: string[] = [];
      let result;
      do {
        result = await res.next();
        if (result.value?.displayName) locations.push(result.value.displayName);
      } while (!result.done);
      const providerData = await rmClient.providers.get(MsResources);
      const resourceTypeData = providerData.resourceTypes?.find(
        (rt) => rt.resourceType?.toLowerCase() === ResourceGroups.toLowerCase()
      );
      const resourceLocations = resourceTypeData?.locations;
      const rgLocations = resourceLocations?.filter((item) => locations.includes(item));
      if (!rgLocations || rgLocations.length == 0) {
        return err(
          new ListResourceGroupLocationsError(
            rmClient.subscriptionId,
            "No available locations found!"
          )
        );
      }
      return ok(rgLocations);
    } catch (e: any) {
      delete e["request"];
      return err(
        new ListResourceGroupLocationsError(
          rmClient.subscriptionId,
          e.message || JSON.stringify(e),
          e
        )
      );
    }
  }

  /**
   * Ask user to create a new resource group or use an existing resource group  V3
   */
  async askResourceGroupInfoV3(
    inputs: InputsWithProjectPath,
    azureAccountProvider: AzureAccountProvider,
    rmClient: ResourceManagementClient,
    defaultResourceGroupName: string
  ): Promise<Result<ResourceGroupInfo, FxError>> {
    const node = resourceGroupQuestionNode(
      azureAccountProvider,
      rmClient.subscriptionId,
      defaultResourceGroupName
    );
    if (node) {
      const res = await traverse(node, inputs, TOOLS.ui);
      if (res.isErr()) {
        return err(res.error);
      }
    }

    const targetResourceGroupNameOptionItem = inputs[
      QuestionNames.TargetResourceGroupName
    ] as unknown as OptionItem;

    const targetResourceGroupName = targetResourceGroupNameOptionItem.id;
    if (!targetResourceGroupName || typeof targetResourceGroupName !== "string") {
      return err(
        new InputValidationError(
          "targetResourceGroupName",
          "Invalid targetResourceGroupName",
          "ResourceGroupHelper"
        )
      );
    }
    if (targetResourceGroupName === newResourceGroupOption) {
      return ok({
        name: inputs[QuestionNames.NewResourceGroupName],
        location: inputs[QuestionNames.NewResourceGroupLocation],
        createNewResourceGroup: true,
      });
    } else {
      const location = targetResourceGroupNameOptionItem.description!; // location must exist because the user can only select from this list.
      return ok({
        createNewResourceGroup: false,
        name: targetResourceGroupName,
        location: location,
      });
    }
  }
}

export const resourceGroupHelper = new ResourceGroupHelper();
