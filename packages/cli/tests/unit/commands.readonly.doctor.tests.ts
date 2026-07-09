// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { CLIContext, err, ok, signedIn, signedOut } from "@microsoft/teamsfx-api";
import {
  FuncToolChecker,
  FxCore,
  LocalCertificateManager,
  LtsNodeChecker,
  UserCancelError,
} from "@microsoft/teamsfx-core";
import * as tools from "@microsoft/teamsfx-core/build/common/tools";
import { setCommand } from "../../src/commands/models/set";
import { setSensitivityLabelCommand } from "../../src/commands/models/setSensitivityLabel";
import { DoctorChecker, teamsappDoctorCommand } from "../../src/commands/models/teamsapp/doctor";
import M365TokenProvider from "../../src/commonlib/M365TokenProviderWrapper";
import { assert, vi } from "vitest";

describe("CLI read-only commands doctor", () => {
  const sandbox = vi;

  beforeEach(() => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true as any);
    vi.spyOn(process.stderr, "write").mockReturnValue(true as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("doctor", async () => {
    describe("checkAccount", async () => {
      it("checkAccount error", async () => {
        vi.spyOn(DoctorChecker.prototype, "checkM365Account").mockResolvedValue(
          err(new UserCancelError())
        );
        const checker = new DoctorChecker();
        await checker.checkAccount();
      });
      it("checkAccount success", async () => {
        vi.spyOn(DoctorChecker.prototype, "checkM365Account").mockResolvedValue(ok("success"));
        const checker = new DoctorChecker();
        await checker.checkAccount();
      });
    });
    describe("checkM365Account", async () => {
      it("checkM365Account - signin", async () => {
        const token = "test-token";
        const tenantId = "test-tenant-id";
        const upn = "test-user";
        vi.spyOn(M365TokenProvider, "getStatus").mockReturnValue(
          Promise.resolve(
            ok({
              status: signedIn,
              token: token,
              accountInfo: {
                tid: tenantId,
                upn: upn,
              },
            })
          )
        );
        vi.spyOn(DoctorChecker.prototype as any, "getSideloadingStatus").mockResolvedValue(true);
        const checker = new DoctorChecker();
        const accountRes = await checker.checkM365Account();
        assert.isTrue(accountRes.isOk());
        const account = (accountRes as any).value;
        assert.include(account, "is signed in and custom app upload permission is enabled");
      });
      it("checkM365Account - error", async () => {
        vi.spyOn(M365TokenProvider, "getStatus").mockResolvedValue(err(new UserCancelError()));
        vi.spyOn(DoctorChecker.prototype as any, "getSideloadingStatus").mockResolvedValue(true);
        const checker = new DoctorChecker();
        const accountRes = await checker.checkM365Account();
        assert.isTrue(accountRes.isOk());
        const account = (accountRes as any).value;
        assert.include(account, "You've not signed into your Microsoft 365 account yet.");
      });
      it("checkM365Account - error2", async () => {
        vi.spyOn(M365TokenProvider, "getStatus").mockRejectedValue(new Error("test"));
        vi.spyOn(DoctorChecker.prototype as any, "getSideloadingStatus").mockResolvedValue(true);
        const checker = new DoctorChecker();
        const accountRes = await checker.checkM365Account();
        assert.isTrue(accountRes.isErr());
      });
      it("checkM365Account - signout", async () => {
        const token = "test-token";
        const tenantId = "test-tenant-id";
        const upn = "test-user";
        const getStatusStub = vi.spyOn(M365TokenProvider, "getStatus");
        getStatusStub.mockResolvedValueOnce(
          ok({
            status: signedOut,
          })
        );
        getStatusStub.mockResolvedValueOnce(
          ok({
            status: signedIn,
            token: token,
            accountInfo: {
              tid: tenantId,
              upn: upn,
            },
          })
        );
        vi.spyOn(M365TokenProvider, "getAccessToken").mockResolvedValue(ok(token));
        vi.spyOn(DoctorChecker.prototype as any, "getSideloadingStatus").mockResolvedValue(true);
        const checker = new DoctorChecker();
        const accountRes = await checker.checkM365Account();
        assert.isTrue(accountRes.isOk());
        const account = (accountRes as any).value;
        assert.include(account, "is signed in and custom app upload permission is enabled");
      });

      it("checkM365Account - no custom app upload permission", async () => {
        const token = "test-token";
        const tenantId = "test-tenant-id";
        const upn = "test-user";
        vi.spyOn(M365TokenProvider, "getStatus").mockReturnValue(
          Promise.resolve(
            ok({
              status: signedIn,
              token: token,
              accountInfo: {
                tid: tenantId,
                upn: upn,
              },
            })
          )
        );
        vi.spyOn(DoctorChecker.prototype as any, "getSideloadingStatus").mockResolvedValue(false);
        const checker = new DoctorChecker();
        const accountRes = await checker.checkM365Account();
        assert.isTrue(accountRes.isOk());
        const value = (accountRes as any).value;
        assert.include(
          value,
          "Your Microsoft 365 tenant admin hasn't enabled custom app upload permission for your account"
        );
      });
    });

    describe("checkNodejs", async () => {
      it("installed", async () => {
        vi.spyOn(LtsNodeChecker.prototype, "getInstallationInfo").mockResolvedValue({
          isInstalled: true,
        } as any);
        const checker = new DoctorChecker();
        await checker.checkNodejs();
      });
      it("error", async () => {
        vi.spyOn(LtsNodeChecker.prototype, "getInstallationInfo").mockResolvedValue({
          isInstalled: true,
          error: new UserCancelError(),
        } as any);
        const checker = new DoctorChecker();
        await checker.checkNodejs();
      });
      it("not installed", async () => {
        vi.spyOn(LtsNodeChecker.prototype, "getInstallationInfo").mockResolvedValue({
          isInstalled: false,
        } as any);
        const checker = new DoctorChecker();
        await checker.checkNodejs();
      });
    });
    describe("checkFuncCoreTool", async () => {
      it("installed", async () => {
        vi.spyOn(FuncToolChecker.prototype, "queryFuncVersion").mockResolvedValue({
          versionStr: "3.0",
        } as any);
        const checker = new DoctorChecker();
        await checker.checkFuncCoreTool();
      });
      it("not installed", async () => {
        vi.spyOn(FuncToolChecker.prototype, "queryFuncVersion").mockRejectedValue(new Error());
        const checker = new DoctorChecker();
        await checker.checkFuncCoreTool();
      });
    });
    describe("checkCert", async () => {
      it("not found", async () => {
        vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
          found: false,
        } as any);
        const checker = new DoctorChecker();
        await checker.checkCert();
      });
      it("found trusted", async () => {
        vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
          found: true,
          alreadyTrusted: true,
        } as any);
        const checker = new DoctorChecker();
        await checker.checkCert();
      });
      it("found not trusted", async () => {
        vi.spyOn(LocalCertificateManager.prototype, "setupCertificate").mockResolvedValue({
          found: true,
          alreadyTrusted: false,
        } as any);
        const checker = new DoctorChecker();
        await checker.checkCert();
      });
    });

    it("getSideloadingStatus defaults to false when dependency returns undefined", async () => {
      vi.spyOn(tools, "getSideloadingStatus").mockResolvedValue(undefined);
      const checker = new DoctorChecker();
      const result = await (checker as any).getSideloadingStatus("token");
      assert.isFalse(result);
    });

    it("happy", async () => {
      vi.spyOn(DoctorChecker.prototype, "checkAccount").mockResolvedValue();
      vi.spyOn(DoctorChecker.prototype, "checkNodejs").mockResolvedValue();
      vi.spyOn(DoctorChecker.prototype, "checkFuncCoreTool").mockResolvedValue();
      vi.spyOn(DoctorChecker.prototype, "checkCert").mockResolvedValue();
      const ctx: CLIContext = {
        command: {
          ...teamsappDoctorCommand,
          fullName: `${process.env.TEAMSFX_CLI_BIN_NAME} doctor`,
        },
        optionValues: {},
        globalOptionValues: {},
        argumentValues: [],
        telemetryProperties: {},
      };
      const res = await teamsappDoctorCommand.handler!(ctx);
      assert.isTrue(res.isOk());
    });
    describe("getSetCommand", async () => {
      it("set command", async () => {
        const commands = setCommand();
        assert.isTrue(commands.commands?.length === 1);
      });
    });

    describe("set sensitivity label", async () => {
      it("success", async () => {
        vi.spyOn(FxCore.prototype, "setSensitivityLabel").mockResolvedValue(ok(undefined));
        const ctx: CLIContext = {
          command: { ...setSensitivityLabelCommand, fullName: "set sensitivity label" },
          optionValues: {},
          globalOptionValues: {},
          argumentValues: [],
          telemetryProperties: {},
        };
        const res = await setSensitivityLabelCommand.handler!(ctx);
        assert.isTrue(res.isOk());
      });
    });
  });
});
