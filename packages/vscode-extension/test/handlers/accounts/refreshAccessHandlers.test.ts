import { ok } from "@microsoft/teamsfx-api";
import { vi, assert } from "vitest";
import {
  refreshCopilotCallback,
  refreshSideloadingCallback,
} from "../../../src/handlers/accounts/refreshAccessHandlers";
import M365TokenInstance from "../../../src/commonlib/m365Login";
import accountTreeViewProviderInstance from "../../../src/treeview/account/accountTreeViewProvider";

describe("refreshAccessHandlers", () => {
  describe("refreshSideloadingCallback", async () => {
    it("Happy path", async () => {
      const status = {
        status: "success",
        token: "test-token",
      };
      vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(ok(status));
      const updateChecksStub = vi.spyOn(
        accountTreeViewProviderInstance.m365AccountNode,
        "updateChecks"
      );
      await refreshSideloadingCallback();
      assert(updateChecksStub.calledOnceWithExactly("test-token", true, false));
    });

    it("No token", async () => {
      const status = {
        status: "success",
      };
      vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(ok(status));
      const updateChecksStub = vi.spyOn(
        accountTreeViewProviderInstance.m365AccountNode,
        "updateChecks"
      );
      await refreshSideloadingCallback();
      assert(updateChecksStub.notCalled);
    });
  });

  describe("refreshCopilotCallback", async () => {
    it("Happy path", async () => {
      const status = {
        status: "success",
        token: "test-token",
      };
      vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(ok(status));
      const updateChecksStub = vi.spyOn(
        accountTreeViewProviderInstance.m365AccountNode,
        "updateChecks"
      );
      await refreshCopilotCallback();
      assert(updateChecksStub.calledOnceWithExactly("test-token", false, true));
    });

    it("No token", async () => {
      const status = {
        status: "success",
      };
      vi.spyOn(M365TokenInstance, "getStatus").mockResolvedValue(ok(status));
      const updateChecksStub = vi.spyOn(
        accountTreeViewProviderInstance.m365AccountNode,
        "updateChecks"
      );
      await refreshCopilotCallback();
      assert(updateChecksStub.notCalled);
    });
  });
});
