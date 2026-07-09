// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, ManifestProperties, ok } from "@microsoft/teamsfx-api";
import mockedEnv, { RestoreFn } from "mocked-env";
import { chai, expect, vi } from "vitest";
import { FeatureFlagName } from "../../../src";
import { SovereignCloudEnvironment } from "../../../src/common/accountUtils";
import { GraphScopes } from "../../../src/common/constants";
import { outlookCopilotAppId } from "../../../src/component/m365/constants";
import { NotExtendedToM365Error } from "../../../src/component/m365/errors";
import { LaunchHelper } from "../../../src/component/m365/launchHelper";
import { PackageService } from "../../../src/component/m365/packageService";
import { HubTypes } from "../../../src/question";
import { MockedM365Provider } from "../../core/utils";

describe("LaunchHelper", () => {
  const m365TokenProvider = new MockedM365Provider();
  const launchHelper = new LaunchHelper(m365TokenProvider);
  let restoreEnv: RestoreFn | undefined;

  afterEach(() => {
    vi.restoreAllMocks();
    restoreEnv?.();
    restoreEnv = undefined;
  });

  describe("getLaunchUrl", () => {
    it("getLaunchUrl: Teams, signed in", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      const properties: ManifestProperties = {
        capabilities: ["staticTab"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      const result = await launchHelper.getLaunchUrl(HubTypes.teams, "test-id", properties);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        "https://teams.microsoft.com/l/app/test-id?installAppPackage=true&webjoin=true&tenantId=test-tid&appTenantId=test-tid&login_hint=test-upn"
      );
    });

    it("getLaunchUrl: Teams, signed in, copilot plugin", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      const properties: ManifestProperties = {
        capabilities: ["plugin"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      const result = await launchHelper.getLaunchUrl(HubTypes.teams, "test-id", properties, true);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        "https://teams.microsoft.com/?tenantId=test-tid&appTenantId=test-tid&login_hint=test-upn"
      );
    });

    it("getLaunchUrl: Teams, signed in, copilot plugin + staticTab", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      const properties: ManifestProperties = {
        capabilities: ["MessageExtension", "staticTab"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      const result = await launchHelper.getLaunchUrl(HubTypes.teams, "test-id", properties, true);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        "https://teams.microsoft.com/l/app/test-id?installAppPackage=true&webjoin=true&tenantId=test-tid&appTenantId=test-tid&login_hint=test-upn"
      );
    });

    it("getLaunchUrl: Teams, signed in, copilot plugin + configurableTab", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      const properties: ManifestProperties = {
        capabilities: ["MessageExtension", "configurableTab"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      const result = await launchHelper.getLaunchUrl(HubTypes.teams, "test-id", properties, true);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        "https://teams.microsoft.com/l/app/test-id?installAppPackage=true&webjoin=true&tenantId=test-tid&appTenantId=test-tid&login_hint=test-upn"
      );
    });

    it("getLaunchUrl: Teams, signed in, copilot plugin + bot", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      const properties: ManifestProperties = {
        capabilities: ["MessageExtension", "Bot", "plugin"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      const result = await launchHelper.getLaunchUrl(HubTypes.teams, "test-id", properties, true);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        "https://teams.microsoft.com/l/app/test-id?installAppPackage=true&webjoin=true&tenantId=test-tid&appTenantId=test-tid&login_hint=test-upn"
      );
    });

    it("Teams, signed out", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
        })
      );
      const properties: ManifestProperties = {
        capabilities: ["staticTab"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      const result = await launchHelper.getLaunchUrl(HubTypes.teams, "test-id", properties);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        "https://teams.microsoft.com/l/app/test-id?installAppPackage=true&webjoin=true&login_hint=login_your_m365_account"
      );
    });

    it("getLaunchUrl uses Graph scopes in sovereign high cloud", async () => {
      restoreEnv = mockedEnv({
        [FeatureFlagName.SovereignCloudEnvironment]: SovereignCloudEnvironment.GCCH,
      });
      const getStatusStub = vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      const properties: ManifestProperties = {
        capabilities: ["staticTab"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };

      const result = await launchHelper.getLaunchUrl(HubTypes.teams, "test-id", properties);

      chai.assert(result.isOk());
      expect(getStatusStub).toHaveBeenCalledTimes(2);
      chai.assert.deepEqual(getStatusStub.mock.calls[0][0].scopes, GraphScopes);
      chai.assert.deepEqual(getStatusStub.mock.calls[1][0].scopes, GraphScopes);
    });

    it("Outlook, staticTab, acquired, signed in", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      const properties: ManifestProperties = {
        capabilities: ["staticTab"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      vi.spyOn(LaunchHelper.prototype, "getM365AppId" as any).mockResolvedValue(ok("test-app-id"));
      const result = await launchHelper.getLaunchUrl(HubTypes.outlook, "test-id", properties);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        "https://outlook.office.com/host/test-app-id?login_hint=test-upn"
      );
    });

    it("Outlook, staticTab, unacquired, signed in", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      vi.spyOn(LaunchHelper.prototype, "getM365AppId" as any).mockResolvedValue(
        err({ foo: "bar" })
      );
      const properties: ManifestProperties = {
        capabilities: ["staticTab"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      const result = await launchHelper.getLaunchUrl(HubTypes.outlook, "test-id", properties);
      chai.assert(result.isErr());
      chai.assert.deepEqual((result as any).error, { foo: "bar" });
    });

    it("Outlook, Bot, signed in", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      vi.spyOn(LaunchHelper.prototype, "getM365AppId" as any).mockResolvedValue(ok("test-app-id"));
      const properties: ManifestProperties = {
        capabilities: ["Bot"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      const result = await launchHelper.getLaunchUrl(HubTypes.outlook, "test-id", properties);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        "https://outlook.office.com/mail?login_hint=test-upn"
      );
    });

    it("Outlook, signed in", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      vi.spyOn(LaunchHelper.prototype, "getM365AppId" as any).mockResolvedValue(ok("test-app-id"));
      const properties: ManifestProperties = {
        capabilities: ["Bot"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      const result = await launchHelper.getLaunchUrl(HubTypes.office, "test-id", properties);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        "https://www.office.com/m365apps/test-app-id?auth=2&login_hint=test-upn"
      );
    });

    it("Outlook, copilot extension", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      const properties: ManifestProperties = {
        capabilities: ["plugin"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      vi.spyOn(LaunchHelper.prototype, "getM365AppId" as any).mockResolvedValue(ok("test-app-id"));
      const result = await launchHelper.getLaunchUrl(HubTypes.outlook, "test-id", properties);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        `https://outlook.office.com/host/${outlookCopilotAppId}?login_hint=test-upn`
      );
    });

    it("Office, copilot extension", async () => {
      vi.spyOn(m365TokenProvider, "getStatus").mockResolvedValue(
        ok({
          status: "",
          accountInfo: {
            tid: "test-tid",
            upn: "test-upn",
          },
        })
      );
      vi.spyOn(LaunchHelper.prototype, "getM365AppId" as any).mockResolvedValue(ok("test-app-id"));
      const properties: ManifestProperties = {
        capabilities: ["copilotGpt"],
        id: "test-id",
        version: "1.0.0",
        manifestVersion: "1.16",
        isApiME: false,
        isSPFx: false,
        isApiMeAAD: false,
      };
      const result = await launchHelper.getLaunchUrl(HubTypes.office, "test-id", properties);
      chai.assert(result.isOk());
      chai.assert.equal(
        (result as any).value,
        "https://www.office.com/chat?auth=2&login_hint=test-upn"
      );
    });
  });

  describe("getM365AppId", () => {
    it("getAccessToken error", async () => {
      vi.spyOn(m365TokenProvider, "getAccessToken").mockResolvedValue(err({ foo: "bar" } as any));
      const result = await launchHelper.getM365AppId("test-id");
      chai.assert(result.isErr());
      chai.assert.deepEqual((result as any).error, { foo: "bar" });
    });

    it("retrieveAppId 404", async () => {
      vi.spyOn(m365TokenProvider, "getAccessToken").mockResolvedValue(ok(""));
      vi.spyOn(PackageService.prototype, "retrieveAppId").mockRejectedValue(
        new NotExtendedToM365Error("test")
      );
      const result = await launchHelper.getM365AppId("test-id");
      chai.assert(result.isErr());
      chai.assert.deepEqual((result as any).error.name, "NotExtendedToM365Error");
    });

    it("retrieveAppId undefined", async () => {
      vi.spyOn(m365TokenProvider, "getAccessToken").mockResolvedValue(ok(""));
      vi.spyOn(PackageService.prototype, "retrieveAppId").mockResolvedValue(undefined);
      const result = await launchHelper.getM365AppId("test-id");
      chai.assert(result.isErr());
      chai.assert.deepEqual((result as any).error.name, "NotExtendedToM365Error");
    });

    it("happy path", async () => {
      vi.spyOn(m365TokenProvider, "getAccessToken").mockResolvedValue(ok(""));
      vi.spyOn(PackageService.prototype, "retrieveAppId").mockResolvedValue("test-app-id");
      const result = await launchHelper.getM365AppId("test-id");
      chai.assert(result.isOk());
      chai.assert.deepEqual((result as any).value, "test-app-id");
    });
  });
});
