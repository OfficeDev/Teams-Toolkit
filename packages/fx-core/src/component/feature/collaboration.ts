// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  Context,
  FxError,
  LogProvider,
  M365TokenProvider,
  Result,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import axios from "axios";
import { Service } from "typedi";
import { GraphClient } from "../../client/graphClient";
import { teamsDevPortalClient } from "../../client/teamsDevPortalClientProvider";
import { AppStudioScopes, MosServiceScope } from "../../common/constants";
import { ErrorContextMW } from "../../common/globalVars";
import {
  AadOwner,
  AgentOwner,
  ResourcePermission,
  TeamsAppAdmin,
} from "../../common/permissionInterface";
import { AgentPermission, PackageService } from "../../component/m365/packageService";
import { HttpClientError, HttpServerError, assembleError } from "../../error/common";
import { AppIdNotExist } from "../../error/teamsApp";
import { AadAppClient } from "../../client/aadAppClient";
import { permissionsKeys } from "../driver/aad/utility/constants";
import { addStartAndEndTelemetry } from "../driver/middleware/addStartAndEndTelemetry";
import { Constants } from "../driver/teamsApp/constants";
import { AppUser } from "../driver/teamsApp/interfaces/appdefinitions/appUser";

const EventName = {
  grantPermission: "grant-permission",
  listCollaborator: "list-collaborator",
  checkPermission: "check-permission",
};
const componentNameAad = "fx-resource-aad-app-for-teams";
const componentNameTeams = "AppStudioPlugin";
const componentNameAgent = "AgentPlugin";

@Service("aad-collaboration")
export class AadCollaboration {
  private readonly aadAppClient: AadAppClient;

  constructor(m365TokenProvider: M365TokenProvider, logProvider?: LogProvider) {
    this.aadAppClient = new AadAppClient(m365TokenProvider, logProvider);
  }
  @hooks([
    ErrorContextMW({ source: "Graph", component: "AadCollaboration" }),
    addStartAndEndTelemetry(EventName.grantPermission, componentNameAad),
  ])
  public async grantPermission(
    ctx: Context,
    objectId: string,
    userObjectId: string
  ): Promise<Result<ResourcePermission[], FxError>> {
    try {
      await this.aadAppClient.addOwner(objectId, userObjectId);

      const result = [
        {
          name: permissionsKeys.name,
          type: permissionsKeys.type,
          roles: [permissionsKeys.owner],
          resourceId: objectId,
        },
      ];
      return ok(result);
    } catch (error) {
      return err(this.handleError(error, ctx, objectId));
    }
  }
  @hooks([
    ErrorContextMW({ source: "Graph", component: "AadCollaboration" }),
    addStartAndEndTelemetry(EventName.listCollaborator, componentNameAad),
  ])
  public async listCollaborator(
    ctx: Context,
    objectId: string
  ): Promise<Result<AadOwner[], FxError>> {
    try {
      const owners = await this.aadAppClient.getOwners(objectId);
      return ok(owners ?? []);
    } catch (error) {
      return err(this.handleError(error, ctx, objectId));
    }
  }
  @hooks([
    ErrorContextMW({ source: "Graph", component: "AadCollaboration" }),
    addStartAndEndTelemetry(EventName.checkPermission, componentNameAad),
  ])
  public async checkPermission(
    ctx: Context,
    objectId: string,
    userObjectId: string
  ): Promise<Result<ResourcePermission[], FxError>> {
    try {
      const owners = await this.aadAppClient.getOwners(objectId);
      const isAadOwner = owners?.find((owner: AadOwner) => owner.userObjectId === userObjectId);

      const result = [
        {
          name: permissionsKeys.name,
          type: permissionsKeys.type,
          roles: isAadOwner ? [permissionsKeys.owner] : [permissionsKeys.noPermission],
          resourceId: objectId,
        },
      ];
      return ok(result);
    } catch (error) {
      return err(this.handleError(error, ctx, objectId));
    }
  }

  private handleError(error: any, ctx: Context, appId: string): FxError {
    if (axios.isAxiosError(error)) {
      const message = JSON.stringify(error.response!.data);
      ctx.logProvider?.error(message);
      if (error.response!.status === 404) {
        return new AppIdNotExist(appId);
      } else if (error.response!.status >= 400 && error.response!.status < 500) {
        return new HttpClientError(error, componentNameAad, message);
      } else {
        return new HttpServerError(error, componentNameAad, message);
      }
    }

    const message = JSON.stringify(error);
    ctx.logProvider?.error(message);
    return assembleError(error as Error, componentNameAad);
  }
}

@Service("teams-collaboration")
export class TeamsCollaboration {
  private readonly tokenProvider: M365TokenProvider;

  constructor(m365TokenProvider: M365TokenProvider) {
    this.tokenProvider = m365TokenProvider;
  }
  @hooks([
    ErrorContextMW({ source: "Teams", component: "TeamsCollaboration" }),
    addStartAndEndTelemetry(EventName.grantPermission, componentNameTeams),
  ])
  public async grantPermission(
    ctx: Context,
    teamsAppId: string,
    userInfo: AppUser
  ): Promise<Result<ResourcePermission[], FxError>> {
    try {
      const appStudioTokenRes = await this.tokenProvider.getAccessToken({
        scopes: AppStudioScopes(),
      });
      const appStudioToken = appStudioTokenRes.isOk() ? appStudioTokenRes.value : undefined;

      await teamsDevPortalClient.grantPermission(appStudioToken as string, teamsAppId, userInfo);
      const result: ResourcePermission[] = [
        {
          name: Constants.PERMISSIONS.name,
          roles: [Constants.PERMISSIONS.admin],
          type: Constants.PERMISSIONS.type,
          resourceId: teamsAppId,
        },
      ];
      return ok(result);
    } catch (error) {
      return err(this.handleError(error, ctx, teamsAppId));
    }
  }
  @hooks([
    ErrorContextMW({ source: "Teams", component: "TeamsCollaboration" }),
    addStartAndEndTelemetry(EventName.listCollaborator, componentNameTeams),
  ])
  public async listCollaborator(
    ctx: Context,
    teamsAppId: string
  ): Promise<Result<TeamsAppAdmin[], FxError>> {
    try {
      const appStudioTokenRes = await this.tokenProvider.getAccessToken({
        scopes: AppStudioScopes(),
      });
      const appStudioToken = appStudioTokenRes.isOk() ? appStudioTokenRes.value : undefined;

      const userLists = await teamsDevPortalClient.getUserList(
        appStudioToken as string,
        teamsAppId
      );
      if (!userLists) {
        return ok([]);
      }

      const teamsAppAdmin: TeamsAppAdmin[] = userLists
        .filter((userList) => {
          return userList.isAdministrator;
        })
        .map((userList) => {
          return {
            userObjectId: userList.aadId,
            displayName: userList.displayName,
            userPrincipalName: userList.userPrincipalName,
            resourceId: teamsAppId,
          };
        });

      return ok(teamsAppAdmin);
    } catch (error) {
      return err(this.handleError(error, ctx, teamsAppId));
    }
  }
  @hooks([
    ErrorContextMW({ source: "Teams", component: "TeamsCollaboration" }),
    addStartAndEndTelemetry(EventName.checkPermission, componentNameTeams),
  ])
  public async checkPermission(
    ctx: Context,
    teamsAppId: string,
    userInfo: AppUser
  ): Promise<Result<ResourcePermission[], FxError>> {
    try {
      const appStudioTokenRes = await this.tokenProvider.getAccessToken({
        scopes: AppStudioScopes(),
      });
      const appStudioToken = appStudioTokenRes.isOk() ? appStudioTokenRes.value : undefined;

      const teamsAppRoles = await teamsDevPortalClient.checkPermission(
        appStudioToken as string,
        teamsAppId,
        userInfo.aadId
      );

      const result: ResourcePermission[] = [
        {
          name: Constants.PERMISSIONS.name,
          roles: [teamsAppRoles],
          type: Constants.PERMISSIONS.type,
          resourceId: teamsAppId,
        },
      ];
      return ok(result);
    } catch (error) {
      return err(this.handleError(error, ctx, teamsAppId));
    }
  }

  private handleError(error: any, ctx: Context, appId: string): FxError {
    if (error.innerError) {
      const message = JSON.stringify(error.innerError.response.data);
      ctx.logProvider?.error(message);
      if (error.innerError.response.status) {
        const statusCode = error.innerError.response.status;
        if (statusCode === 404) {
          return new AppIdNotExist(appId);
        } else if (statusCode >= 400 && statusCode < 500) {
          return new HttpClientError(error, componentNameTeams, message);
        } else {
          return new HttpServerError(error, componentNameTeams, message);
        }
      }
    }

    const message = JSON.stringify(error);
    ctx.logProvider?.error(message);
    return assembleError(error as Error, componentNameTeams);
  }
}

@Service("agent-collaboration")
export class AgentCollaboration {
  private readonly tokenProvider: M365TokenProvider;

  constructor(m365TokenProvider: M365TokenProvider) {
    this.tokenProvider = m365TokenProvider;
  }

  @hooks([
    ErrorContextMW({ source: "M365", component: "AgentCollaboration" }),
    addStartAndEndTelemetry(EventName.grantPermission, componentNameAgent),
  ])
  public async grantPermission(
    ctx: Context,
    titleId: string,
    userInfo: AppUser
  ): Promise<Result<ResourcePermission[], FxError>> {
    const mosTokenRes = await this.tokenProvider.getAccessToken({
      scopes: MosServiceScope(),
    });
    if (mosTokenRes.isErr()) {
      return err(mosTokenRes.error);
    }
    const mosToken = mosTokenRes.value;
    // grant owner permission
    const res = await PackageService.GetSharedInstance().addOwner(mosToken, titleId, userInfo);
    if (res.isErr()) {
      return err(res.error);
    }
    const result: ResourcePermission[] = [
      {
        name: AgentPermission.name,
        roles: [AgentPermission.owner],
        type: AgentPermission.type,
        resourceId: titleId,
      },
    ];
    return ok(result);
  }

  @hooks([
    ErrorContextMW({ source: "M365", component: "AgentCollaboration" }),
    addStartAndEndTelemetry(EventName.listCollaborator, componentNameAgent),
  ])
  public async listCollaborator(
    ctx: Context,
    titleId: string
  ): Promise<Result<AgentOwner[], FxError>> {
    const mosTokenRes = await this.tokenProvider.getAccessToken({
      scopes: MosServiceScope(),
    });
    if (mosTokenRes.isErr()) {
      return err(mosTokenRes.error);
    }
    const mosToken = mosTokenRes.value;

    const res = await PackageService.GetSharedInstance().previewApp(mosToken, titleId);
    if (res.isErr()) {
      return err(res.error);
    }
    const owners = res.value.owners;
    const agentOwners: AgentOwner[] = [];
    const graphClient = new GraphClient(this.tokenProvider);
    for (const owner of owners) {
      const userInfo = await graphClient.getUserInfoFromId(owner.entityId);
      if (userInfo) {
        agentOwners.push({
          userObjectId: owner.entityId,
          displayName: userInfo.displayName,
          userPrincipalName: userInfo.userPrincipalName,
          resourceId: titleId,
        });
      }
    }

    return ok(agentOwners);
  }
}
