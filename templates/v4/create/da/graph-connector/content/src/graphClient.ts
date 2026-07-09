import { ClientSecretCredential } from "@azure/identity";
import { Client, MiddlewareFactory } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { LongRunningOperationMiddleware } from "./longRunningOperationMiddleware";

const delayInterval = 60_000; // 60 seconds

/**
 * Returns a new instance of the Microsoft Graph client.
 * @returns A new instance of the Microsoft Graph client.
 */
export function getClient(): Client {
  const credential = new ClientSecretCredential(
    process.env.AZURE_TENANT_ID!,
    process.env.AZURE_CLIENT_ID!,
    process.env.AZURE_CLIENT_SECRET!
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  const middleware = MiddlewareFactory.getDefaultMiddlewareChain(authProvider);
  // add as a second middleware to get access to the access token
  middleware.splice(1, 0, new LongRunningOperationMiddleware(delayInterval));

  return Client.initWithMiddleware({ middleware });
}
