// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Constants } from "./constants";
import { GraphClientErrorMessage } from "./errors";
import { IAADPassword } from "./interfaces/IAADApplication";
import { IAADDefinition } from "./interfaces/IAADDefinition";

import axios from "axios";
import { AadOwner } from "../../../common/permissionInterface";
const baseUrl = `https://graph.microsoft.com/v1.0`;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace GraphClient {
  export async function createAADApp(
    graphToken: string,
    aadApp: IAADDefinition
  ): Promise<IAADDefinition> {
    if (!aadApp) {
      throw new Error(
        `${GraphClientErrorMessage.CreateFailed}: ${GraphClientErrorMessage.AppDefinitionIsNull}.`
      );
    }

    const instance = initAxiosInstance(graphToken);
    const response = await instance.post(`${baseUrl}/applications`, aadApp);
    if (response && response.data) {
      const app = <IAADDefinition>response.data;

      if (app) {
        return app;
      }
    }

    throw new Error(
      `${GraphClientErrorMessage.CreateFailed}: ${GraphClientErrorMessage.EmptyResponse}.`
    );
  }

  export async function updateAADApp(
    graphToken: string,
    objectId: string,
    aadApp: IAADDefinition
  ): Promise<void> {
    if (!aadApp) {
      throw new Error(
        `${GraphClientErrorMessage.UpdateFailed}: ${GraphClientErrorMessage.AppDefinitionIsNull}.`
      );
    }

    if (!objectId) {
      throw new Error(
        `${GraphClientErrorMessage.UpdateFailed}: ${GraphClientErrorMessage.AppObjectIdIsNull}.`
      );
    }

    const instance = initAxiosInstance(graphToken);
    await instance.patch(`${baseUrl}/applications/${objectId}`, aadApp);
  }

  export async function createAadAppSecret(
    graphToken: string,
    objectId: string
  ): Promise<IAADPassword> {
    if (!objectId) {
      throw new Error(
        `${GraphClientErrorMessage.CreateSecretFailed}: ${GraphClientErrorMessage.AppObjectIdIsNull}.`
      );
    }

    const instance = initAxiosInstance(graphToken);
    const aadSecretObject = createAadAppSecretObject();
    const response = await instance.post(
      `${baseUrl}/applications/${objectId}/addPassword`,
      aadSecretObject
    );
    if (response && response.data) {
      const app = response.data;

      if (app) {
        return {
          hint: app.hint,
          id: app.keyId,
          endDate: app.endDateTime,
          startDate: app.startDateTime,
          value: app.secretText,
        } as IAADPassword;
      }
    }

    throw new Error(
      `${GraphClientErrorMessage.CreateSecretFailed}: ${GraphClientErrorMessage.EmptyResponse}.`
    );
  }

  export async function getAadApp(graphToken: string, objectId: string): Promise<IAADDefinition> {
    if (!objectId) {
      throw new Error(
        `${GraphClientErrorMessage.GetFailed}: ${GraphClientErrorMessage.AppObjectIdIsNull}.`
      );
    }

    const instance = initAxiosInstance(graphToken);
    const response = await instance.get(`${baseUrl}/applications/${objectId}`);
    if (response && response.data) {
      const app = <IAADDefinition>response.data;
      return app;
    }

    throw new Error(
      `${GraphClientErrorMessage.GetFailed}: ${GraphClientErrorMessage.EmptyResponse}.`
    );
  }

  export async function getAadOwners(
    graphToken: string,
    objectId: string
  ): Promise<AadOwner[] | undefined> {
    if (!objectId) {
      throw new Error(
        `${GraphClientErrorMessage.CheckPermissionFailed}: ${GraphClientErrorMessage.AppObjectIdIsNull}.`
      );
    }
    const instance = initAxiosInstance(graphToken);
    const response = await instance.get(`${baseUrl}/applications/${objectId}/owners`);

    if (response && response.data && response.data.value) {
      return response.data.value as AadOwner[];
    }

    return undefined;
  }

  export async function checkPermission(
    graphToken: string,
    objectId: string,
    userObjectId: string
  ): Promise<boolean> {
    if (!userObjectId) {
      throw new Error(
        `${GraphClientErrorMessage.CheckPermissionFailed}: ${GraphClientErrorMessage.UserObjectIdIsNull}.`
      );
    }

    const owners = await getAadOwners(graphToken, objectId);
    const findUser = owners?.find((owner: AadOwner) => owner.id === userObjectId);
    if (findUser) {
      return true;
    } else {
      return false;
    }
  }

  export async function grantPermission(
    graphToken: string,
    objectId: string,
    userObjectId: string
  ): Promise<void> {
    if (!objectId) {
      throw new Error(
        `${GraphClientErrorMessage.GrantPermissionFailed}: ${GraphClientErrorMessage.AppObjectIdIsNull}.`
      );
    }

    if (!userObjectId) {
      throw new Error(
        `${GraphClientErrorMessage.GrantPermissionFailed}: ${GraphClientErrorMessage.UserObjectIdIsNull}.`
      );
    }

    const instance = initAxiosInstance(graphToken);
    await instance.post(`${baseUrl}/applications/${objectId}/owners/$ref`, {
      "@odata.id": `${baseUrl}/directoryObjects/${userObjectId}`,
    });
  }

  export function initAxiosInstance(graphToken: string) {
    const instance = axios.create({
      baseURL: baseUrl,
    });
    instance.defaults.headers.common["Authorization"] = `Bearer ${graphToken}`;
    return instance;
  }

  function createAadAppSecretObject() {
    return {
      passwordCredential: {
        displayName: Constants.aadAppPasswordDisplayName,
      },
    };
  }
}
