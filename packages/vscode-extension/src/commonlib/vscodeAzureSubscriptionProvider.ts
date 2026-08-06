// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SubscriptionClient, TenantIdDescription } from "@azure/arm-resources-subscriptions";
import { TokenCredential } from "@azure/core-auth";
import * as vscode from "vscode";
import * as azureEnv from "@azure/ms-rest-azure-env";
import { AzureScopes, isSovereignHigh } from "@microsoft/teamsfx-core";
import { LoginFailureError } from "./codeFlowLogin";
import { Environment } from "@azure/ms-rest-azure-env";

export const Microsoft = "microsoft";
export const MicrosoftSovereignCloud = "microsoft-sovereign-cloud";

export function getConfiguredAuthProviderId(): string {
  return isSovereignHigh() ? MicrosoftSovereignCloud : Microsoft;
}

// Licensed under the MIT license.
export class VSCodeAzureSubscriptionProvider {
  private async getSubscriptionClient(
    tenantId?: string,
    scopes?: string[]
  ): Promise<{
    client: SubscriptionClient;
    credential: TokenCredential;
    authentication: AzureAuthentication;
  }> {
    const armSubs = await import("@azure/arm-resources-subscriptions");
    const session = await getSessionFromVSCode(scopes, tenantId, {
      createIfNone: false,
      silent: true,
    });
    if (!session) {
      return Promise.reject(LoginFailureError());
    }

    const credential: TokenCredential = {
      // eslint-disable-next-line @typescript-eslint/require-await
      getToken: async () => {
        return {
          token: session.accessToken,
          expiresOnTimestamp: 0,
        };
      },
    };

    const configuredAzureEnv = getConfiguredAzureEnv();
    const endpoint = configuredAzureEnv.resourceManagerEndpointUrl;

    return {
      client: new armSubs.SubscriptionClient(credential, { endpoint }),
      credential: credential,
      authentication: {
        getSession: () => session,
      },
    };
  }

  /**
   * Gets a list of tenants available to the user.
   *
   * @returns A list of tenants.
   */
  public async getTenants(): Promise<TenantIdDescription[]> {
    const { client } = await this.getSubscriptionClient(undefined, AzureScopes());

    const results: TenantIdDescription[] = [];

    for await (const tenant of client.tenants.list()) {
      results.push(tenant);
    }

    return results;
  }

  /**
   * Gets a list of Azure subscriptions available to the user.
   */
  public async getSubscriptions(tenantId?: string): Promise<AzureSubscription[]> {
    const results: AzureSubscription[] = [];

    if (tenantId) {
      results.push(...(await this.getSubscriptionsForTenant(tenantId)));
    } else {
      for (const tenant of await this.getTenants()) {
        try {
          // Get the list of tenants

          const tenantId = tenant.tenantId!;

          // For each tenant, get the list of subscriptions
          results.push(...(await this.getSubscriptionsForTenant(tenantId)));
        } catch (e) {}
      }
    }

    const sortSubscriptions = (subscriptions: AzureSubscription[]): AzureSubscription[] =>
      subscriptions.sort((a, b) => a.name.localeCompare(b.name));
    return sortSubscriptions(results);
  }

  /**
   * Gets the subscriptions for a given tenant.
   *
   * @param tenantId The tenant ID to get subscriptions for.
   *
   * @returns The list of subscriptions for the tenant.
   */
  private async getSubscriptionsForTenant(tenantId: string): Promise<AzureSubscription[]> {
    const { client, credential, authentication } = await this.getSubscriptionClient(
      tenantId,
      AzureScopes()
    );
    const environment = getConfiguredAzureEnv();

    const subscriptions: AzureSubscription[] = [];

    for await (const subscription of client.subscriptions.list()) {
      subscriptions.push({
        authentication: authentication,
        environment: environment,
        credential: credential,
        isCustomCloud: environment.isCustomCloud,

        name: subscription.displayName!,
        subscriptionId: subscription.subscriptionId!,

        tenantId: tenantId,
      });
    }

    return subscriptions;
  }
}

export async function getSessionFromVSCode(
  scopes?: string | string[] | vscode.AuthenticationWwwAuthenticateRequest,
  tenantId?: string,
  options?: vscode.AuthenticationGetSessionOptions
): Promise<vscode.AuthenticationSession | undefined> {
  const provider = getConfiguredAuthProviderId();
  const scopeList = formScopesArg(scopes, tenantId);
  const session = await vscode.authentication.getSession(provider, scopeList, options);
  return session;
}

function ensureEndingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function getResourceScopes(scopes?: string | string[]): string[] {
  if (scopes === undefined || scopes === "" || scopes.length === 0) {
    scopes = ensureEndingSlash(getConfiguredAzureEnv().managementEndpointUrl);
  }
  return Array.from(new Set<string>(scopes));
}

function addTenantIdScope(scopes: string[], tenantId: string): string[] {
  const scopeSet = new Set<string>(scopes);
  scopeSet.add(`VSCODE_TENANT:${tenantId}`);
  return Array.from(scopeSet);
}

function getScopes(scopes: string | string[] | undefined, tenantId?: string): string[] {
  let scopeArr = getResourceScopes(scopes);
  if (tenantId) {
    scopeArr = addTenantIdScope(scopeArr, tenantId);
  }
  return scopeArr;
}

export function isAuthenticationSessionRequest(
  scopes?: string | string[] | vscode.AuthenticationWwwAuthenticateRequest
): scopes is vscode.AuthenticationWwwAuthenticateRequest {
  return !!(scopes && typeof scopes === "object" && "wwwAuthenticate" in scopes);
}

function formScopesArg(
  scopes?: string | string[] | vscode.AuthenticationWwwAuthenticateRequest,
  tenantId?: string
): string[] | vscode.AuthenticationWwwAuthenticateRequest {
  const initialScopeList: string[] | undefined =
    typeof scopes === "string"
      ? [scopes]
      : Array.isArray(scopes)
        ? scopes
        : Array.from(scopes?.scopes ?? []);
  const scopeList = getScopes(initialScopeList, tenantId);
  return isAuthenticationSessionRequest(scopes)
    ? { fallbackScopes: scopeList, scopes: scopeList, wwwAuthenticate: scopes.wwwAuthenticate }
    : scopeList;
}

/**
 * Represents a means of obtaining authentication data for an Azure subscription.
 */
export interface AzureAuthentication {
  /**
   * Gets a VS Code authentication session for an Azure subscription.
   *
   * @param scopes - The scopes for which the authentication is needed.
   *
   * @returns A VS Code authentication session or undefined, if none could be obtained.
   */
  getSession(scopes?: string[]): vscode.ProviderResult<vscode.AuthenticationSession>;
}

/**
 * Gets the configured Azure environment.
 *
 * Derived from the same sovereign cloud source as `AzureScopes()` (the fx-core sovereign
 * cloud feature flag) so the resource manager endpoint matches the audience of the token
 * acquired for those scopes. Returning a mismatched endpoint (e.g. public ARM for a US
 * Government token) causes `InvalidAuthenticationTokenAudience` (401) errors.
 *
 * @returns The Azure environment matching the configured sovereign cloud.
 */
export function getConfiguredAzureEnv(): azureEnv.Environment & { isCustomCloud: boolean } {
  if (isSovereignHigh()) {
    return {
      ...azureEnv.Environment.USGovernment,
      isCustomCloud: false,
    };
  }

  return {
    ...azureEnv.Environment.AzureCloud,
    isCustomCloud: false,
  };
}

/**
 * Represents an Azure subscription.
 */
export interface AzureSubscription {
  /**
   * Access to the authentication session associated with this subscription.
   */
  readonly authentication: AzureAuthentication;

  /**
   * The Azure environment to which this subscription belongs.
   */
  readonly environment: Environment;

  /**
   * Whether this subscription belongs to a custom cloud.
   */
  readonly isCustomCloud: boolean;

  /**
   * The display name of this subscription.
   */
  readonly name: string;

  /**
   * The ID of this subscription.
   */
  readonly subscriptionId: string;

  /**
   * The ID of the tenant to which this subscription belongs.
   */
  readonly tenantId: string;

  /**
   * The credential for authentication to this subscription. Compatible with Azure track 2 SDKs.
   */
  readonly credential: TokenCredential;
}
