// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ConstantString, Utils } from "@microsoft/m365-spec-parser";
import fs from "fs-extra";
import { parseDocument } from "yaml";
import { InjectAPIKeyActionFailedError, InjectOAuthActionFailedError } from "../../error/common";
import { MicrosoftEntraAuthType } from "./constant";

export class ActionInjector {
  static hasActionWithName(
    provisionNode: any,
    action: string,
    name: string,
    specRelativePath: string
  ): any {
    const hasAuthAction = provisionNode.items.some(
      (item: any) =>
        item.get("uses") === action &&
        !!item.get("with") &&
        item.get("with").get("name") === name &&
        item.get("with").get("apiSpecPath") === specRelativePath
    );
    return hasAuthAction;
  }

  static getTeamsAppIdEnvName(provisionNode: any): string | undefined {
    for (const item of provisionNode.items) {
      if (item.get("uses") === "teamsApp/create") {
        return item.get("writeToEnvironmentFile")?.get("teamsAppId") as string;
      }
    }

    return undefined;
  }

  static generateAuthAction(
    actionName: string,
    authName: string,
    teamsAppIdEnvName: string,
    specRelativePath: string,
    envName: string,
    flow?: string,
    isMicrosoftEntra?: boolean,
    enablePKCE?: boolean
  ): any {
    const result: any = {
      uses: actionName,
      with: {
        name: `${authName}`,
        appId: `\${{${teamsAppIdEnvName}}}`,
        apiSpecPath: specRelativePath,
      },
    };

    if (flow) {
      result.with.flow = flow;
      result.writeToEnvironmentFile = {
        configurationId: envName,
      };
    } else {
      result.writeToEnvironmentFile = {
        registrationId: envName,
      };
    }

    if (enablePKCE) {
      result.with.isPKCEEnabled = true;
    }

    if (isMicrosoftEntra) {
      result.with.identityProvider = MicrosoftEntraAuthType;
      result.writeToEnvironmentFile.applicationIdUri = Utils.getSafeRegistrationIdEnvName(
        `${authName}_APPLICATION_ID_URI`
      );
    }

    return result;
  }

  static async injectCreateOAuthAction(
    ymlPath: string,
    authName: string,
    specRelativePath: string,
    forceToAddNew: boolean, // If it from add plugin, then we will add another CreateOAuthAction
    isMicrosoftEntra: boolean,
    enablePKCE?: boolean,
    registrationId?: string
  ): Promise<AuthActionInjectResult | undefined> {
    const ymlContent = await fs.readFile(ymlPath, "utf-8");
    const actionName = "oauth/register";

    const document = parseDocument(ymlContent);
    const provisionNode = document.get("provision") as any;
    if (provisionNode) {
      const hasOAuthAction = ActionInjector.hasActionWithName(
        provisionNode,
        actionName,
        authName,
        specRelativePath
      );
      if (!hasOAuthAction || forceToAddNew) {
        provisionNode.items = provisionNode.items.filter((item: any) => {
          const uses = item.get("uses");
          if (forceToAddNew) {
            return uses;
          } else {
            return (
              uses != actionName ||
              !item.get("with") ||
              item.get("with").get("apiSpecPath") !== specRelativePath ||
              item.get("with").get("name") !== authName
            );
          }
        });
        const existingConfigurationIdEnvNames: string[] = provisionNode.items
          .filter((item: any) => {
            const uses = item.get("uses");
            return uses == actionName;
          })
          .map((item: any) => item.get("writeToEnvironmentFile")?.get("configurationId"))
          .filter((item: string | undefined) => {
            return !!item;
          });
        const defaultEnvName = Utils.getSafeRegistrationIdEnvName(
          `${authName}_${ConstantString.RegistrationIdPostfix}`
        );
        const registrationIdEnvName =
          registrationId ??
          this.findNextAvailableEnvName(defaultEnvName, existingConfigurationIdEnvNames);
        const teamsAppIdEnvName = ActionInjector.getTeamsAppIdEnvName(provisionNode);
        if (teamsAppIdEnvName) {
          const index: number = provisionNode.items.findIndex(
            (item: any) => item.get("uses") === "teamsApp/create"
          );

          const flow = "authorizationCode";
          const action = ActionInjector.generateAuthAction(
            actionName,
            authName,
            teamsAppIdEnvName,
            specRelativePath,
            registrationIdEnvName,
            flow,
            isMicrosoftEntra,
            enablePKCE
          );
          provisionNode.items.splice(index + 1, 0, action);
        } else {
          throw new InjectOAuthActionFailedError();
        }

        await fs.writeFile(ymlPath, document.toString(), "utf8");
        return {
          defaultRegistrationIdEnvName: defaultEnvName,
          registrationIdEnvName: registrationIdEnvName,
        };
      }
    } else {
      throw new InjectOAuthActionFailedError();
    }

    return undefined;
  }

  static async injectCreateAPIKeyAction(
    ymlPath: string,
    authName: string,
    specRelativePath: string,
    forceToAddNew: boolean, // If it from add plugin, then we will add another CreateApiKeyAction
    registrationId?: string
  ): Promise<AuthActionInjectResult | undefined> {
    const ymlContent = await fs.readFile(ymlPath, "utf-8");
    const actionName = "apiKey/register";

    const document = parseDocument(ymlContent);
    const provisionNode = document.get("provision") as any;

    if (provisionNode) {
      const hasApiKeyAction = ActionInjector.hasActionWithName(
        provisionNode,
        actionName,
        authName,
        specRelativePath
      );

      if (!hasApiKeyAction || forceToAddNew) {
        provisionNode.items = provisionNode.items.filter((item: any) => {
          const uses = item.get("uses");
          if (forceToAddNew) {
            return uses;
          } else {
            return (
              uses != actionName ||
              !item.get("with") ||
              item.get("with").get("apiSpecPath") !== specRelativePath ||
              item.get("with").get("name") !== authName
            );
          }
        });
        const existingRegistrationIdEnvNames: string[] = provisionNode.items
          .filter((item: any) => {
            const uses = item.get("uses");
            return uses == actionName;
          })
          .map((item: any) => item.get("writeToEnvironmentFile")?.get("registrationId"))
          .filter((item: string | undefined) => {
            return !!item;
          });
        const teamsAppIdEnvName = ActionInjector.getTeamsAppIdEnvName(provisionNode);
        const defaultEnvName = Utils.getSafeRegistrationIdEnvName(
          `${authName}_${ConstantString.RegistrationIdPostfix}`
        );
        const registrationIdEnvName =
          registrationId ??
          this.findNextAvailableEnvName(defaultEnvName, existingRegistrationIdEnvNames);
        if (teamsAppIdEnvName) {
          const index: number = provisionNode.items.findIndex(
            (item: any) => item.get("uses") === "teamsApp/create"
          );
          const action = ActionInjector.generateAuthAction(
            actionName,
            authName,
            teamsAppIdEnvName,
            specRelativePath,
            registrationIdEnvName
          );
          provisionNode.items.splice(index + 1, 0, action);
        } else {
          throw new InjectAPIKeyActionFailedError();
        }

        await fs.writeFile(ymlPath, document.toString(), "utf8");
        return {
          defaultRegistrationIdEnvName: defaultEnvName,
          registrationIdEnvName: registrationIdEnvName,
        };
      }
    } else {
      throw new InjectAPIKeyActionFailedError();
    }
    return undefined;
  }

  static async injectCreateOAuthActionForMCP(
    ymlPath: string,
    authType: string,
    authName: string,
    registrationId: string,
    mcpServerUrl: string,
    authorizationUrl?: string,
    tokenUrl?: string,
    refreshUrl?: string,
    credentialEnvNames?: {
      clientIdEnvName: string;
      clientSecretEnvName?: string;
      scopeEnvName?: string;
    }
  ): Promise<AuthActionInjectResult | undefined> {
    const ymlContent = await fs.readFile(ymlPath, "utf-8");

    const document = parseDocument(ymlContent);
    const provisionNode = document.get("provision") as any;
    if (provisionNode) {
      const hasAuthActionWithSameReferenceId = provisionNode.items.some(
        (item: any) =>
          (item.get("uses") as string) === "oauth/register" &&
          !!item.get("with") &&
          !!item.get("writeToEnvironmentFile") &&
          (item.get("writeToEnvironmentFile").get("configurationId") as string) === registrationId
      );
      if (hasAuthActionWithSameReferenceId) {
        return undefined;
      }

      provisionNode.items = provisionNode.items.filter((item: any) => {
        const uses = item.get("uses");
        return uses;
      });

      const teamsAppIdEnvName = ActionInjector.getTeamsAppIdEnvName(provisionNode);
      if (teamsAppIdEnvName) {
        const index: number = provisionNode.items.findIndex(
          (item: any) => item.get("uses") === "teamsApp/create"
        );

        // DT mode injects explicit ${{...}} refs to credentials that the
        // add-action flow persists to env files; legacy mode omits them and
        // lets the oauth/register driver fall back to in-process bridge env
        // vars (`oauth-client-id` etc.).
        const credentialFields: Record<string, string> = {};
        if (credentialEnvNames) {
          if (authType === "oauth") {
            credentialFields.clientId = `\${{${credentialEnvNames.clientIdEnvName}}}`;
            if (credentialEnvNames.clientSecretEnvName) {
              credentialFields.clientSecret = `\${{${credentialEnvNames.clientSecretEnvName}}}`;
            }
            if (credentialEnvNames.scopeEnvName) {
              credentialFields.scope = `\${{${credentialEnvNames.scopeEnvName}}}`;
            }
          } else {
            credentialFields.clientId = `\${{${credentialEnvNames.clientIdEnvName}}}`;
          }
        }

        const action: any = {
          uses: "oauth/register",
          with: {
            name: `${authName}`,
            appId: `\${{${teamsAppIdEnvName}}}`,
            flow: "authorizationCode",
            ...(authType === "oauth"
              ? {
                  authorizationUrl: authorizationUrl,
                  tokenUrl: tokenUrl,
                  refreshUrl: refreshUrl ?? undefined,
                  identityProvider: "Custom",
                }
              : {
                  identityProvider: MicrosoftEntraAuthType,
                }),
            baseUrl: mcpServerUrl,
            ...credentialFields,
          },
          writeToEnvironmentFile: {
            configurationId: registrationId,
          },
        };
        provisionNode.items.splice(index + 1, 0, action);
      } else {
        throw new InjectOAuthActionFailedError();
      }

      await fs.writeFile(ymlPath, document.toString(), "utf8");
      return {
        defaultRegistrationIdEnvName: registrationId,
        registrationIdEnvName: registrationId,
      };
    } else {
      throw new InjectOAuthActionFailedError();
    }
  }

  /**
   * Inject a `dcr/register` action for MCP `oauth-dynamic` flow. Idempotent on
   * (action name + configurationId). Writes a single configurationId env var.
   */
  static async injectCreateDcrActionForMCP(
    ymlPath: string,
    authName: string,
    registrationId: string,
    mcpServerUrl: string,
    wellKnownAuthorizationServer: string
  ): Promise<AuthActionInjectResult | undefined> {
    const ymlContent = await fs.readFile(ymlPath, "utf-8");

    const document = parseDocument(ymlContent);
    const provisionNode = document.get("provision") as any;
    if (provisionNode) {
      const hasDcrActionWithSameReferenceId = provisionNode.items.some(
        (item: any) =>
          (item.get("uses") as string) === "dcr/register" &&
          !!item.get("with") &&
          !!item.get("writeToEnvironmentFile") &&
          (item.get("writeToEnvironmentFile").get("configurationId") as string) === registrationId
      );
      if (hasDcrActionWithSameReferenceId) {
        return undefined;
      }

      provisionNode.items = provisionNode.items.filter((item: any) => {
        const uses = item.get("uses");
        return uses;
      });

      const teamsAppIdEnvName = ActionInjector.getTeamsAppIdEnvName(provisionNode);
      if (teamsAppIdEnvName) {
        const index: number = provisionNode.items.findIndex(
          (item: any) => item.get("uses") === "teamsApp/create"
        );

        const action: any = {
          uses: "dcr/register",
          with: {
            name: `${authName}`,
            appId: `\${{${teamsAppIdEnvName}}}`,
            applicableToApps: "AnyApp",
            targetAudience: "HomeTenant",
            wellKnownAuthorizationServer: wellKnownAuthorizationServer,
            targetUrlsShouldStartWith: [mcpServerUrl],
          },
          writeToEnvironmentFile: {
            configurationId: registrationId,
          },
        };
        provisionNode.items.splice(index + 1, 0, action);
      } else {
        throw new InjectOAuthActionFailedError();
      }

      // dcr/register requires yaml-schema v1.13+; upgrade if the template is older.
      ActionInjector.ensureMinimumYamlVersion(document, "v1.13");

      await fs.writeFile(ymlPath, document.toString(), "utf8");
      return {
        defaultRegistrationIdEnvName: registrationId,
        registrationIdEnvName: registrationId,
      };
    } else {
      throw new InjectOAuthActionFailedError();
    }
  }

  static findNextAvailableEnvName(baseEnvName: string, existingEnvNames: string[]): string {
    let suffix = 1;
    let envName = baseEnvName;
    while (existingEnvNames.includes(envName)) {
      envName = `${baseEnvName}${suffix}`;
      suffix++;
    }
    return envName;
  }

  /**
   * Ensure the parsed yml document's top-level `version` is at least `minVersion`.
   * Supports `vX.Y` and `X.Y.Z` formats. No-op when current >= minVersion or
   * when the version field is missing/unparseable.
   */
  static ensureMinimumYamlVersion(document: any, minVersion: string): void {
    const current = document.get("version") as string | undefined;
    if (!current) return;
    const parse = (v: string): number[] | undefined => {
      const m = /^v?(\d+(?:\.\d+){1,2})$/.exec(v);
      if (!m) return undefined;
      return m[1].split(".").map((n) => parseInt(n, 10));
    };
    const cur = parse(current);
    const min = parse(minVersion);
    if (!cur || !min) return;
    const length = Math.max(cur.length, min.length);
    for (let i = 0; i < length; i++) {
      const a = cur[i] ?? 0;
      const b = min[i] ?? 0;
      if (a > b) return;
      if (a < b) {
        document.set("version", minVersion);
        return;
      }
    }
  }
}

export interface AuthActionInjectResult {
  defaultRegistrationIdEnvName: string | undefined; // The default registration id env name without suffix
  registrationIdEnvName: string | undefined; // The real env name of registration id we write in the yaml file
}
