// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Colors,
  Context,
  err,
  FxError,
  InputsWithProjectPath,
  M365TokenProvider,
  ok,
  Platform,
  Result,
  SystemError,
  TokenProvider,
  UserError,
} from "@microsoft/teamsfx-api";
import axios from "axios";
import * as dotenv from "dotenv";
import fs from "fs-extra";
import { validate as uuidValidate } from "uuid";
import {
  getResourceServiceEndpoint,
  GraphScopes,
  ResourceServiceType,
  VSCodeExtensionCommand,
} from "../common/constants";
import { getDefaultString, getLocalizedString } from "../common/localizeUtils";
import {
  AadOwner,
  AgentOwner,
  AppIds,
  CollaborationState,
  ListCollaboratorResult,
  PermissionsResult,
  ResourcePermission,
} from "../common/permissionInterface";
import { SolutionError, SolutionSource, SolutionTelemetryProperty } from "../component/constants";
import { parseShareAppActionYamlConfig } from "../component/driver/share/utils";
import { AppUser } from "../component/driver/teamsApp/interfaces/appdefinitions/appUser";
import {
  AadCollaboration,
  AgentCollaboration,
  TeamsCollaboration,
} from "../component/feature/collaboration";
import { FailedToLoadManifestId, FileNotFoundError } from "../error/common";
import { QuestionNames } from "../question/constants";

export class CollaborationConstants {
  // Collaboartion CLI parameters
  static readonly TeamsAppId = "teamsAppId";
  static readonly AadObjectId = "aadObjectId";
  static readonly DotEnvFilePath = "dotEnvFilePath";

  // Collaboration env key
  static readonly AadObjectIdEnv = "AAD_APP_OBJECT_ID";
  static readonly TeamsAppIdEnv = "TEAMS_APP_ID";
  static readonly TeamsAppTenantIdEnv = "TEAMS_APP_TENANT_ID";

  // App Type Question
  static readonly AppType = "collaborationType";
  static readonly TeamsAppQuestionId = "teamsApp";
  static readonly AadAppQuestionId = "aadApp";
  static readonly AgentOptionId = "agent";

  static readonly placeholderRegex = /\$\{\{ *[a-zA-Z0-9_.-]* *\}\}/g;
}

export class CollaborationUtil {
  static async getCurrentUserInfo(
    m365TokenProvider?: M365TokenProvider
  ): Promise<Result<AppUser, FxError>> {
    const user = await CollaborationUtil.getUserInfo(m365TokenProvider);

    if (!user) {
      return err(
        new SystemError(
          SolutionSource,
          SolutionError.FailedToRetrieveUserInfo,
          "Failed to retrieve current user info from graph token."
        )
      );
    }

    return ok(user);
  }

  static async getUserInfo(
    m365TokenProvider?: M365TokenProvider,
    email?: string
  ): Promise<AppUser | undefined> {
    const currentUserRes = await m365TokenProvider?.getJsonObject({ scopes: GraphScopes });
    const currentUser = currentUserRes?.isOk() ? currentUserRes.value : undefined;

    if (!currentUser) {
      return undefined;
    }

    const tenantId = currentUser["tid"] as string;
    let aadId = currentUser["oid"] as string;
    let userPrincipalName = currentUser["unique_name"] as string;
    let displayName = currentUser["name"] as string;
    const isAdministrator = true;

    if (email) {
      const graphTokenRes = await m365TokenProvider?.getAccessToken({ scopes: GraphScopes });
      const graphToken = graphTokenRes?.isOk() ? graphTokenRes.value : undefined;
      const instance = axios.create({
        baseURL: `${getResourceServiceEndpoint(ResourceServiceType.Graph)}/v1.0`,
      });
      instance.defaults.headers.common["Authorization"] = `Bearer ${graphToken as string}`;
      const res = await instance.get(
        `/users?$filter=startsWith(mail,'${email}') or startsWith(userPrincipalName, '${email}')`
      );
      if (!res || !res.data || !res.data.value) {
        return undefined;
      }

      const collaborator = res.data.value.find(
        (user: any) =>
          user.mail?.toLowerCase() === email.toLowerCase() ||
          user.userPrincipalName?.toLowerCase() === email.toLowerCase()
      );

      if (!collaborator) {
        return undefined;
      }

      aadId = collaborator.id;
      userPrincipalName = collaborator.userPrincipalName;
      displayName = collaborator.displayName;
    }

    return {
      tenantId,
      aadId,
      userPrincipalName,
      displayName,
      isAdministrator,
    };
  }

  static async loadDotEnvFile(
    dotEnvFilePath: string
  ): Promise<Result<{ [key: string]: string }, FxError>> {
    try {
      const result: { [key: string]: string } = {};
      if (!(await fs.pathExists(dotEnvFilePath))) {
        throw new FileNotFoundError("CollaboratorUtil", dotEnvFilePath);
      }

      const envs = dotenv.parse(await fs.readFile(dotEnvFilePath));
      const entries = Object.entries(envs);
      for (const [key, value] of entries) {
        result[key] = value;
      }
      return ok(result);
    } catch (error: any) {
      return err(
        new UserError(
          SolutionSource,
          SolutionError.FailedToLoadDotEnvFile,
          getLocalizedString("core.collaboration.error.failedToLoadDotEnvFile", error?.message)
        )
      );
    }
  }

  // Priority parameter > dotenv > env
  static async getTeamsAppIdAndAadObjectId(
    inputs: InputsWithProjectPath
  ): Promise<Result<AppIds, FxError>> {
    let teamsAppId, aadObjectId;

    // load from parameter and dotenv only wroks for cli
    if (inputs?.platform == Platform.CLI) {
      // 1. Get from parameter
      teamsAppId = inputs?.[CollaborationConstants.TeamsAppId] ?? undefined;
      aadObjectId = inputs?.[CollaborationConstants.AadObjectId] ?? undefined;
      // Return if getting two app ids
      if (teamsAppId && aadObjectId) {
        return ok({
          teamsAppId: teamsAppId,
          aadObjectId: aadObjectId,
        });
      }

      // 2. Get from dotenv
      if (inputs?.[CollaborationConstants.DotEnvFilePath]) {
        const loadDotEnvFileResult = await this.loadDotEnvFile(
          inputs?.[CollaborationConstants.DotEnvFilePath]
        );
        if (loadDotEnvFileResult.isErr()) {
          return err(loadDotEnvFileResult.error);
        }

        const dotEnv = loadDotEnvFileResult.value;
        teamsAppId = teamsAppId ?? dotEnv[CollaborationConstants.TeamsAppIdEnv] ?? undefined;
        aadObjectId = aadObjectId ?? dotEnv[CollaborationConstants.AadObjectIdEnv] ?? undefined;
        // Return if getting two app ids
        if (teamsAppId && aadObjectId) {
          return ok({
            teamsAppId: teamsAppId,
            aadObjectId: aadObjectId,
          });
        }
      }
    }

    // 3. load from env
    const teamsAppManifestFilePath = inputs?.[QuestionNames.TeamsAppManifestFilePath] as string;
    const aadAppManifestFilePath = inputs?.[QuestionNames.AadAppManifestFilePath] as string;

    if (teamsAppManifestFilePath && !teamsAppId) {
      const teamsAppIdRes = await this.loadManifestId(teamsAppManifestFilePath);
      if (teamsAppIdRes.isOk()) {
        teamsAppId = this.parseManifestId(teamsAppIdRes.value);
        if (!teamsAppId) {
          return err(new FailedToLoadManifestId(teamsAppManifestFilePath));
        }
      } else {
        return err(teamsAppIdRes.error);
      }
    }

    if (aadAppManifestFilePath && !aadObjectId) {
      const aadObjectIdRes = await this.loadManifestId(aadAppManifestFilePath);
      if (aadObjectIdRes.isOk()) {
        aadObjectId = this.parseManifestId(aadObjectIdRes.value);
        if (!aadObjectId) {
          return err(new FailedToLoadManifestId(aadAppManifestFilePath));
        }
      } else {
        return err(aadObjectIdRes.error);
      }
    }

    return ok({
      teamsAppId: teamsAppId,
      aadObjectId: aadObjectId,
    });
  }

  static async loadManifestId(manifestFilePath: string): Promise<Result<string, FxError>> {
    try {
      if (!manifestFilePath || !(await fs.pathExists(manifestFilePath))) {
        return err(new FileNotFoundError(SolutionSource, manifestFilePath));
      }

      const manifest = await fs.readJson(manifestFilePath);
      if (!manifest || !manifest.id) {
        return err(
          new UserError(
            SolutionSource,
            SolutionError.InvalidManifestError,
            getLocalizedString("error.collaboration.InvalidManifestError", manifestFilePath)
          )
        );
      }

      const id = manifest.id;
      return ok(id);
    } catch (error) {
      return err(
        new UserError(
          SolutionSource,
          SolutionError.FailedToLoadManifestFile,
          getLocalizedString("error.collaboration.FailedToLoadManifest", manifestFilePath)
        )
      );
    }
  }

  static requireEnvQuestion(appId: string): boolean {
    return !!appId.match(CollaborationConstants.placeholderRegex);
  }

  static parseManifestId(appId: string): string | undefined {
    // Hardcoded id in manifest
    if (uuidValidate(appId)) {
      return appId;
    } else if (appId.match(CollaborationConstants.placeholderRegex)) {
      // Reference value in .env file
      const envName = appId
        .replace(/\$*\{+/g, "")
        .replace(/\}+/g, "")
        .trim();
      return process.env[envName] ?? undefined;
    }

    return undefined;
  }
}

export async function listCollaborator(
  ctx: Context,
  inputs: InputsWithProjectPath,
  tokenProvider: TokenProvider,
  telemetryProps?: Record<string, string>
): Promise<Result<ListCollaboratorResult, FxError>> {
  const result = await CollaborationUtil.getCurrentUserInfo(tokenProvider.m365TokenProvider);
  if (result.isErr()) {
    return err(result.error);
  }
  const user = result.value;

  const getAppIdsResult = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputs);
  if (getAppIdsResult.isErr()) {
    return err(getAppIdsResult.error);
  }
  const appIds = getAppIdsResult.value;
  let agentTitleId: string | undefined;
  if (
    inputs[QuestionNames.collaborationAppType] &&
    inputs[QuestionNames.collaborationAppType].indexOf(CollaborationConstants.AgentOptionId) > -1
  ) {
    const parseRes = await parseShareAppActionYamlConfig(inputs.projectPath);
    if (parseRes.isErr()) {
      return err(parseRes.error);
    }
    agentTitleId = parseRes.value.titleId;
  }

  const hasAad = appIds.aadObjectId != undefined;
  const hasTeams = appIds.teamsAppId != undefined;
  const teamsCollaboration = new TeamsCollaboration(tokenProvider.m365TokenProvider);
  const aadCollaboration = new AadCollaboration(tokenProvider.m365TokenProvider, ctx.logProvider);
  const agentCollaboration = new AgentCollaboration(tokenProvider.m365TokenProvider);
  const appStudioRes =
    appIds.teamsAppId != undefined
      ? await teamsCollaboration.listCollaborator(ctx, appIds.teamsAppId)
      : ok([]);
  if (appStudioRes.isErr()) return err(appStudioRes.error);
  const teamsAppOwners = appStudioRes.value;
  const aadRes =
    appIds.aadObjectId != undefined
      ? await aadCollaboration.listCollaborator(ctx, appIds.aadObjectId)
      : ok([]);
  if (aadRes.isErr()) return err(aadRes.error);
  const aadOwners: AadOwner[] = aadRes.value;
  const teamsAppId: string = teamsAppOwners[0]?.resourceId ?? "";
  const aadAppId: string = aadOwners[0]?.resourceId ?? "";
  const aadAppTenantId = user.tenantId;
  const agentOwners: AgentOwner[] = [];
  if (agentTitleId) {
    const result = await agentCollaboration.listCollaborator(ctx, agentTitleId);
    if (result.isErr()) return err(result.error);
    agentOwners.push(...result.value);
  }

  if (inputs.platform === Platform.CLI || inputs.platform === Platform.VSCode) {
    const message = [
      {
        content: getLocalizedString("core.collaboration.ListingM365Permission"),
        color: Colors.BRIGHT_WHITE,
      },
      {
        content: getLocalizedString("core.collaboration.AccountUsedToCheck"),
        color: Colors.BRIGHT_WHITE,
      },
      { content: user.userPrincipalName + "\n", color: Colors.BRIGHT_MAGENTA },
      { content: getLocalizedString("core.collaboration.TenantId"), color: Colors.BRIGHT_WHITE },
      { content: aadAppTenantId + "\n", color: Colors.BRIGHT_MAGENTA },
    ];

    if (hasTeams) {
      message.push(
        ...getPrintEnvMessage(
          inputs.env,
          getLocalizedString("core.collaboration.StartingListAllTeamsAppOwners")
        ),
        {
          content: getLocalizedString("core.collaboration.M365TeamsAppId"),
          color: Colors.BRIGHT_WHITE,
        },
        { content: teamsAppId, color: Colors.BRIGHT_MAGENTA },
        { content: `)\n`, color: Colors.BRIGHT_WHITE }
      );

      for (const teamsAppOwner of teamsAppOwners) {
        message.push(
          {
            content: getLocalizedString("core.collaboration.TeamsAppOwner"),
            color: Colors.BRIGHT_WHITE,
          },
          {
            content: teamsAppOwner.userPrincipalName ?? teamsAppOwner.displayName,
            color: Colors.BRIGHT_MAGENTA,
          },
          { content: `.\n`, color: Colors.BRIGHT_WHITE }
        );
      }
    }

    if (hasAad) {
      message.push(
        ...getPrintEnvMessage(
          inputs.env,
          getLocalizedString("core.collaboration.StartingListAllAadAppOwners")
        ),
        {
          content: getLocalizedString("core.collaboration.SsoAadAppId"),
          color: Colors.BRIGHT_WHITE,
        },
        { content: aadAppId, color: Colors.BRIGHT_MAGENTA },
        { content: `)\n`, color: Colors.BRIGHT_WHITE }
      );

      for (const aadOwner of aadOwners) {
        message.push(
          {
            content: getLocalizedString("core.collaboration.AadAppOwner"),
            color: Colors.BRIGHT_WHITE,
          },
          { content: aadOwner.userPrincipalName, color: Colors.BRIGHT_MAGENTA },
          { content: `.\n`, color: Colors.BRIGHT_WHITE }
        );
      }
    }

    if (agentTitleId) {
      message.push(
        ...getPrintEnvMessage(
          inputs.env,
          getLocalizedString("core.collaboration.StartingListAllAgentOwners")
        ),
        {
          content: getLocalizedString("core.collaboration.AgentTitleId"),
          color: Colors.BRIGHT_WHITE,
        },
        { content: agentTitleId, color: Colors.BRIGHT_MAGENTA },
        { content: `)\n`, color: Colors.BRIGHT_WHITE }
      );

      for (const agentOwner of agentOwners) {
        message.push(
          {
            content: getLocalizedString("core.collaboration.AgentOwner"),
            color: Colors.BRIGHT_WHITE,
          },
          {
            content: agentOwner.userPrincipalName ?? agentOwner.displayName,
            color: Colors.BRIGHT_MAGENTA,
          },
          { content: `.\n`, color: Colors.BRIGHT_WHITE }
        );
      }
    }

    if (inputs.platform === Platform.CLI) {
      void ctx.userInteraction.showMessage("info", message, false);
    } else if (inputs.platform === Platform.VSCode) {
      void ctx.userInteraction.showMessage(
        "info",
        getLocalizedString(
          "core.collaboration.ListCollaboratorsSuccess",
          VSCodeExtensionCommand.showOutputChannel
        ),
        false
      );
      void ctx.logProvider.info(message);
    }
  }
  const aadOwnerCount = hasAad ? aadOwners.length : -1;
  const teamsOwnerCount = hasTeams ? teamsAppOwners.length : -1;
  if (telemetryProps) {
    telemetryProps[SolutionTelemetryProperty.Env] = inputs.env || "";
    telemetryProps[SolutionTelemetryProperty.CollaboratorCount] = teamsOwnerCount.toString();
    telemetryProps[SolutionTelemetryProperty.AadOwnerCount] = aadOwnerCount.toString();
  }
  return ok({
    state: CollaborationState.OK,
  });
}

export async function checkPermission(
  ctx: Context,
  inputs: InputsWithProjectPath,
  tokenProvider: TokenProvider,
  telemetryProps?: Record<string, string>
): Promise<Result<PermissionsResult, FxError>> {
  const result = await CollaborationUtil.getCurrentUserInfo(tokenProvider.m365TokenProvider);
  if (result.isErr()) {
    return err(result.error);
  }

  const userInfo = result.value;

  if (inputs.platform === Platform.CLI) {
    // TODO: get tenant id from .env
    const aadAppTenantId = userInfo.tenantId;
    const message = [
      {
        content: getLocalizedString("core.collaboration.AccountUsedToCheck"),
        color: Colors.BRIGHT_WHITE,
      },
      { content: userInfo.userPrincipalName + "\n", color: Colors.BRIGHT_MAGENTA },
      ...getPrintEnvMessage(
        inputs.env,
        getLocalizedString("core.collaboration.StaringCheckPermission")
      ),
      { content: getLocalizedString("core.collaboration.TenantId"), color: Colors.BRIGHT_WHITE },
      { content: aadAppTenantId + "\n", color: Colors.BRIGHT_MAGENTA },
    ];
    void ctx.userInteraction.showMessage("info", message, false);
  }

  const getAppIdsResult = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputs);
  if (getAppIdsResult.isErr()) {
    return err(getAppIdsResult.error);
  }
  const appIds = getAppIdsResult.value;

  const teamsCollaboration = new TeamsCollaboration(tokenProvider.m365TokenProvider);
  const aadCollaboration = new AadCollaboration(tokenProvider.m365TokenProvider, ctx.logProvider);

  const isTeamsActivated = appIds.teamsAppId != undefined;
  const appStudioRes = isTeamsActivated
    ? await teamsCollaboration.checkPermission(ctx, appIds.teamsAppId!, userInfo)
    : ok([] as ResourcePermission[]);
  if (appStudioRes.isErr()) {
    return err(appStudioRes.error);
  }
  const permissions = appStudioRes.value;
  const isAadActivated = appIds.aadObjectId != undefined;
  if (isAadActivated) {
    const aadRes = await aadCollaboration.checkPermission(
      ctx,
      appIds.aadObjectId!,
      result.value.aadId
    );
    if (aadRes.isErr()) return err(aadRes.error);
    aadRes.value.forEach((r: ResourcePermission) => {
      permissions.push(r);
    });
  }
  if (inputs.platform === Platform.CLI) {
    for (const permission of permissions) {
      const message = [
        {
          content: getLocalizedString("core.collaboration.CheckPermissionResourceId"),
          color: Colors.BRIGHT_WHITE,
        },
        {
          content: permission.resourceId ?? getLocalizedString("core.collaboration.Undefined"),
          color: Colors.BRIGHT_MAGENTA,
        },
        {
          content: getLocalizedString("core.collaboration.ResourceName"),
          color: Colors.BRIGHT_WHITE,
        },
        { content: permission.name, color: Colors.BRIGHT_MAGENTA },
        {
          content: getLocalizedString("core.collaboration.Permission"),
          color: Colors.BRIGHT_WHITE,
        },
        {
          content: permission.roles
            ? permission.roles.toString()
            : getLocalizedString("core.collaboration.Undefined") + "\n",
          color: Colors.BRIGHT_MAGENTA,
        },
      ];
      void ctx.userInteraction.showMessage("info", message, false);
    }
  }
  const aadPermission = permissions.find((permission) => permission.name === "Azure AD App");
  const teamsAppPermission = permissions.find((permission) => permission.name === "Teams App");
  if (telemetryProps) {
    telemetryProps[SolutionTelemetryProperty.AadPermission] = aadPermission?.roles
      ? aadPermission.roles.join(";")
      : getLocalizedString("core.collaboration.Undefined");
    telemetryProps[SolutionTelemetryProperty.TeamsAppPermission] = teamsAppPermission?.roles
      ? teamsAppPermission.roles.join(";")
      : getLocalizedString("core.collaboration.Undefined");
  }
  return ok({
    state: CollaborationState.OK,
    permissions,
  });
}

export async function grantPermission(
  ctx: Context,
  inputs: InputsWithProjectPath,
  tokenProvider: TokenProvider
): Promise<Result<PermissionsResult, FxError>> {
  const progressBar = ctx.userInteraction.createProgressBar(
    getLocalizedString("core.collaboration.GrantingPermission"),
    1
  );
  try {
    const result = await CollaborationUtil.getCurrentUserInfo(tokenProvider.m365TokenProvider);
    if (result.isErr()) {
      return err(result.error);
    }
    const email = inputs.email;
    if (!email || email === result.value.userPrincipalName) {
      return err(
        new UserError(
          "core",
          SolutionError.EmailCannotBeEmptyOrSame,
          getDefaultString("core.collaboration.EmailCannotBeEmptyOrSame"),
          getLocalizedString("core.collaboration.EmailCannotBeEmptyOrSame")
        )
      );
    }

    const userInfo = await CollaborationUtil.getUserInfo(tokenProvider.m365TokenProvider, email);

    if (!userInfo) {
      return err(
        new UserError(
          "core",
          SolutionError.CannotFindUserInCurrentTenant,
          getDefaultString("core.collaboration.CannotFindUserInCurrentTenant"),
          getLocalizedString("core.collaboration.CannotFindUserInCurrentTenant")
        )
      );
    }

    await progressBar?.start();
    await progressBar?.next(getLocalizedString("core.collaboration.GrantPermissionForUser", email));

    const getAppIdsResult = await CollaborationUtil.getTeamsAppIdAndAadObjectId(inputs);
    if (getAppIdsResult.isErr()) {
      return err(getAppIdsResult.error);
    }
    const appIds = getAppIdsResult.value;
    let agentTitleId: string | undefined;
    if (
      inputs[QuestionNames.collaborationAppType] &&
      inputs[QuestionNames.collaborationAppType].indexOf(CollaborationConstants.AgentOptionId) > -1
    ) {
      const parseRes = await parseShareAppActionYamlConfig(inputs.projectPath);
      if (parseRes.isErr()) {
        return err(parseRes.error);
      }
      agentTitleId = parseRes.value.titleId;
    }

    if (inputs.platform === Platform.CLI) {
      // TODO: get tenant id from .env
      const aadAppTenantId = result.value.tenantId;
      const message = [
        {
          content: getLocalizedString("core.collaboration.AccountToGrantPermission"),
          color: Colors.BRIGHT_WHITE,
        },
        { content: userInfo.userPrincipalName + "\n", color: Colors.BRIGHT_MAGENTA },
        ...getPrintEnvMessage(
          inputs.env,
          getLocalizedString("core.collaboration.StartingGrantPermission")
        ),
        { content: getLocalizedString("core.collaboration.TenantId"), color: Colors.BRIGHT_WHITE },
        { content: aadAppTenantId + "\n", color: Colors.BRIGHT_MAGENTA },
      ];

      void ctx.userInteraction.showMessage("info", message, false);
    }
    const isAadActivated = appIds.aadObjectId != undefined;
    const isTeamsActivated = appIds.teamsAppId != undefined;
    const teamsCollaboration = new TeamsCollaboration(tokenProvider.m365TokenProvider);
    const aadCollaboration = new AadCollaboration(tokenProvider.m365TokenProvider, ctx.logProvider);
    const agentCollaboration = new AgentCollaboration(tokenProvider.m365TokenProvider);
    const appStudioRes = isTeamsActivated
      ? await teamsCollaboration.grantPermission(ctx, appIds.teamsAppId!, userInfo)
      : ok([] as ResourcePermission[]);
    if (appStudioRes.isErr()) {
      return err(appStudioRes.error);
    }
    const permissions = appStudioRes.value;
    if (isAadActivated) {
      const aadRes = await aadCollaboration.grantPermission(
        ctx,
        appIds.aadObjectId!,
        userInfo.aadId
      );
      if (aadRes.isErr()) return err(aadRes.error);
      aadRes.value.forEach((r: ResourcePermission) => {
        permissions.push(r);
      });
    }
    if (agentTitleId) {
      const result = await agentCollaboration.grantPermission(ctx, agentTitleId, userInfo);
      if (result.isErr()) return err(result.error);
      result.value.forEach((r: ResourcePermission) => {
        permissions.push(r);
      });
    }
    if (inputs.platform === Platform.CLI) {
      for (const permission of permissions) {
        const message = [
          { content: `${permission.roles?.join(",") as string} `, color: Colors.BRIGHT_MAGENTA },
          {
            content: getLocalizedString("core.collaboration.PermissionHasBeenGrantTo"),
            color: Colors.BRIGHT_WHITE,
          },
          { content: permission.name, color: Colors.BRIGHT_MAGENTA },
          {
            content: getLocalizedString("core.collaboration.GrantPermissionResourceId"),
            color: Colors.BRIGHT_WHITE,
          },
          { content: `${permission.resourceId as string}`, color: Colors.BRIGHT_MAGENTA },
        ];
        void ctx.userInteraction.showMessage("info", message, false);
      }
    }
    return ok({
      state: CollaborationState.OK,
      userInfo: userInfo,
      permissions,
    });
  } finally {
    await progressBar?.end(true);
  }
}

function getPrintEnvMessage(env: string | undefined, message: string) {
  return env
    ? [
        {
          content: message,
          color: Colors.BRIGHT_WHITE,
        },
        { content: `${env}\n`, color: Colors.BRIGHT_MAGENTA },
      ]
    : [];
}
