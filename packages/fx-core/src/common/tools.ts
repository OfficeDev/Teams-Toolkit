// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { Tunnel } from "@microsoft/dev-tunnels-contracts";
import {
  ManagementApiVersions,
  TunnelManagementHttpClient,
} from "@microsoft/dev-tunnels-management";
import { err, FxError, M365TokenProvider, ok, Result, SystemError } from "@microsoft/teamsfx-api";
import axios from "axios";
import fs from "fs-extra";
import path from "path";
import Container from "typedi";
import { parseDocument } from "yaml";
import { GraphClient } from "../client/graphClient";
import { teamsDevPortalClient } from "../client/teamsDevPortalClient";
import { DriverContext } from "../component/driver/interface/commonArgs";
import { NpmBuildDriver } from "../component/driver/script/npmBuildDriver";
import { TypeSpecCompileDriver } from "../component/driver/typeSpec/compile";
import { TypeSpecCompileArgs } from "../component/driver/typeSpec/interface/typeSpecCompileArgs";
import { pathUtils } from "../component/utils/pathUtils";
import {
  getResourceServiceEndpoint,
  GraphReadUserScopes,
  ResourceServiceType,
  SPFxScopes,
} from "./constants";
import { isTypeSpecProject } from "./projectTypeChecker";
import { MetadataV3, MetadataV4 } from "./versionMetadata";

export async function getSideloadingStatus(token: string): Promise<boolean | undefined> {
  return teamsDevPortalClient.getSideloadingStatus(token);
}

export async function isSandboxedEnabled(tokenProvider: M365TokenProvider): Promise<boolean> {
  const graphClient = new GraphClient(tokenProvider);
  const teamsAppSettings = await graphClient.GetTeamsAppSettingsAsync();
  return (
    teamsAppSettings.sandboxingConfiguration &&
    teamsAppSettings.sandboxingConfiguration.sensitivityLabelUsedToIdentifySandboxedContainers !==
      ""
  );
}

export async function listAllTenants(token: string): Promise<Record<string, any>[]> {
  const RM_ENDPOINT = `${getResourceServiceEndpoint(
    ResourceServiceType.Azure
  )}/tenants?api-version=2022-06-01`;
  if (token.length > 0) {
    try {
      const response = await axios.get(RM_ENDPOINT, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data.value;
    } catch (error) {
      return [];
    }
  }

  return [];
}

export async function getSPFxTenant(graphToken: string): Promise<string> {
  const GRAPH_TENANT_ENDPT = "https://graph.microsoft.com/v1.0/sites/root?$select=webUrl";
  if (graphToken.length > 0) {
    const response = await axios.get(GRAPH_TENANT_ENDPT, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });
    return response.data.webUrl;
  }
  return "";
}

export async function getSPFxToken(
  m365TokenProvider: M365TokenProvider
): Promise<string | undefined> {
  const graphTokenRes = await m365TokenProvider.getAccessToken({
    scopes: GraphReadUserScopes,
  });
  let spoToken = undefined;
  if (graphTokenRes && graphTokenRes.isOk()) {
    const tenant = await getSPFxTenant(graphTokenRes.value);
    const spfxTokenRes = await m365TokenProvider.getAccessToken({
      scopes: SPFxScopes(tenant),
    });
    spoToken = spfxTokenRes.isOk() ? spfxTokenRes.value : undefined;
  }
  return spoToken;
}

// this function will be deleted after VS has added get dev tunnel and list dev tunnels API
const TunnelManagementUserAgent = { name: "Teams-Toolkit" };
export async function listDevTunnels(
  token: string,
  isGitHub = false
): Promise<Result<Tunnel[], FxError>> {
  try {
    const tunnelManagementClientImpl = new TunnelManagementHttpClient(
      TunnelManagementUserAgent,
      ManagementApiVersions.Version20230927preview,
      () => {
        if (isGitHub === true) {
          const res = `github client_id=a200baed193bb2088a6e ${token}`;
          return Promise.resolve(res);
        } else {
          const res = `Bearer ${token}`;
          return Promise.resolve(res);
        }
      }
    );

    const options = {
      includeAccessControl: true,
    };
    const tunnels = await tunnelManagementClientImpl.listTunnels(undefined, undefined, options);
    return ok(tunnels);
  } catch (error) {
    return err(new SystemError("DevTunnels", "ListDevTunnelsFailed", error.message));
  }
}

export function isTestToolEnabledProject(projectPath: string): boolean {
  const testToolYmlPathV4 = path.join(projectPath, MetadataV4.testToolConfigFile);
  if (fs.pathExistsSync(testToolYmlPathV4)) {
    return true;
  }
  const testToolYmlPath = path.join(projectPath, MetadataV3.testToolConfigFile);
  if (fs.pathExistsSync(testToolYmlPath)) {
    return true;
  }
  return false;
}

export function getTypeSpecArgs(projectPath: string): TypeSpecCompileArgs {
  const defaultArgs = {
    path: "./main.tsp",
    manifestPath: "./appPackage/manifest.json",
    outputDir: "./appPackage/.generated",
    typeSpecConfigPath: "./tspconfig.yaml",
  };
  const yamlFilePath = pathUtils.getYmlFilePath(projectPath);
  if (!yamlFilePath) {
    return defaultArgs;
  }

  const yamlContent = fs.readFileSync(yamlFilePath, "utf8");
  const document = parseDocument(yamlContent);
  const provisionNode = document.get("provision") as any;
  if (!provisionNode) {
    return defaultArgs;
  }

  const tspCompileAction = provisionNode.items.find(
    (item: any) => item.get("uses") === "typeSpec/compile"
  );
  if (!tspCompileAction) {
    return defaultArgs;
  }

  const args = tspCompileAction.get("with");
  return {
    path: args.get("path") ?? defaultArgs.path,
    manifestPath: args.get("manifestPath") ?? defaultArgs.manifestPath,
    outputDir: args.get("outputDir") ?? defaultArgs.outputDir,
    typeSpecConfigPath: args.get("typeSpecConfigPath") ?? defaultArgs.typeSpecConfigPath,
  };
}

export async function runForTypeSpecProject(
  projectPath: string | undefined,
  context: DriverContext
): Promise<void> {
  const isTspProject = isTypeSpecProject(projectPath);
  if (isTspProject) {
    // Call npm/install
    const npmInstallDriver: NpmBuildDriver = Container.get("cli/runNpmCommand");
    const npmInstallArgs = {
      args: "install --no-audit --progress=false",
    };
    const npmInstallResult = (await npmInstallDriver.execute(npmInstallArgs, context)).result;
    if (npmInstallResult.isErr()) {
      throw err(npmInstallResult.error);
    }

    // call typespec/compile
    const typeSpecCompileDriver: TypeSpecCompileDriver = Container.get("typeSpec/compile");
    const typeSpecCompileArgs: TypeSpecCompileArgs = getTypeSpecArgs(projectPath!);
    const typeSpecCompileResult = (
      await typeSpecCompileDriver.execute(typeSpecCompileArgs, context)
    ).result;
    if (typeSpecCompileResult.isErr()) {
      throw err(typeSpecCompileResult.error);
    }
  }
}
