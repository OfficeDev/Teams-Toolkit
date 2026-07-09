// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as toolUtils from "@microsoft/teamsfx-core/build/common/tools";
import { ExtTelemetry } from "../../telemetry/extTelemetry";
import { AccountType, TelemetryEvent, TelemetryProperty } from "../../telemetry/extTelemetryEvents";
import * as telemetryUtils from "../../utils/telemetryUtils";
import M365TokenInstance from "../../commonlib/m365Login";
import azureAccountManager from "../../commonlib/azureLogin";
import { AzureScopes, isUserCancelError } from "@microsoft/teamsfx-core";
import { FxError, SingleSelectConfig, SystemError } from "@microsoft/teamsfx-api";
import * as localizeUtils from "../../utils/localizeUtils";
import { VS_CODE_UI } from "../../qm/vsc_ui";
import { ExtensionSource } from "../../error/error";
import { showError } from "../../error/common";

export async function onSwitchM365Tenant(...args: unknown[]): Promise<void> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SwitchTenantStart, {
    [TelemetryProperty.AccountType]: AccountType.M365,
    ...telemetryUtils.getTriggerFromProperty(args),
  });

  let error: FxError | undefined = undefined;
  const tokenRes = await M365TokenInstance.getAccessToken({ scopes: AzureScopes() });
  if (tokenRes.isOk()) {
    const config: SingleSelectConfig = {
      name: "SwitchTenant",
      title: localizeUtils.localize("teamstoolkit.handlers.switchtenant.quickpick.title"),
      options: async () => {
        const tenants = await toolUtils.listAllTenants(tokenRes.value);
        return tenants.map((tenant: any) => {
          return {
            id: tenant.tenantId,
            label: tenant.displayName,
            description: tenant.defaultDomain,
          };
        });
      },
    };
    const result = await VS_CODE_UI.selectOption(config);
    if (result.isOk()) {
      const progressHandler = VS_CODE_UI.createProgressBar(
        localizeUtils.localize("teamstoolkit.commands.switchTenant.progressbar.title"),
        1
      );
      await progressHandler.start();
      await progressHandler.next(
        localizeUtils.localize("teamstoolkit.commands.switchTenant.progressbar.detail")
      );
      const switchRes = await M365TokenInstance.switchTenant(result.value.result as string);
      await progressHandler.end(switchRes.isOk());
      if (switchRes.isOk()) {
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SwitchTenant, {
          [TelemetryProperty.AccountType]: AccountType.M365,
          [TelemetryProperty.TenantId]: result.value.result as string,
          ...telemetryUtils.getTriggerFromProperty(args),
        });
        return;
      } else {
        error = switchRes.error;
      }
    } else {
      error = result.error;
    }
  } else {
    error = tokenRes.error;
  }

  if (!isUserCancelError(error)) {
    void showError(error);
  }
  ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.SwitchTenant, error, {
    [TelemetryProperty.AccountType]: AccountType.M365,
    ...telemetryUtils.getTriggerFromProperty(args),
  });
}

export async function onSwitchAzureTenant(...args: unknown[]): Promise<void> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SwitchTenantStart, {
    [TelemetryProperty.AccountType]: AccountType.Azure,
    ...telemetryUtils.getTriggerFromProperty(args),
  });

  const config: SingleSelectConfig = {
    name: "SwitchTenant",
    title: localizeUtils.localize("teamstoolkit.handlers.switchtenant.quickpick.title"),
    options: async () => {
      const tokenCredential = await azureAccountManager.getIdentityCredentialAsync(false);
      const token = tokenCredential ? await tokenCredential.getToken(AzureScopes()) : undefined;
      if (token && token.token) {
        const tenants = await toolUtils.listAllTenants(token.token);
        return tenants.map((tenant: any) => {
          return {
            id: tenant.tenantId,
            label: tenant.displayName,
            description: tenant.defaultDomain,
          };
        });
      } else {
        throw new SystemError(
          ExtensionSource,
          "SwitchTenantFailed",
          localizeUtils.localize("teamstoolkit.handlers.switchtenant.error")
        );
      }
    },
  };
  const result = await VS_CODE_UI.selectOption(config);
  let error: any;
  if (result.isOk()) {
    const progressHandler = VS_CODE_UI.createProgressBar(
      localizeUtils.localize("teamstoolkit.commands.switchTenant.progressbar.title"),
      1
    );
    await progressHandler.start();
    await progressHandler.next(
      localizeUtils.localize("teamstoolkit.commands.switchTenant.progressbar.detail")
    );
    const switchRes = await azureAccountManager.switchTenant(result.value.result as string);
    await progressHandler.end(switchRes.isOk());
    if (switchRes.isOk()) {
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SwitchTenant, {
        [TelemetryProperty.AccountType]: AccountType.Azure,
        [TelemetryProperty.TenantId]: result.value.result as string,
        ...telemetryUtils.getTriggerFromProperty(args),
      });
      return;
    } else {
      error = switchRes.error;
    }
  } else {
    error = result.error;
  }

  if (!isUserCancelError(error)) {
    void showError(error);
  }
  ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.SwitchTenant, error, {
    [TelemetryProperty.AccountType]: AccountType.Azure,
    ...telemetryUtils.getTriggerFromProperty(args),
  });
}
