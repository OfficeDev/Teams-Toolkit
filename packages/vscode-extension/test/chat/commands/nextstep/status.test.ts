import * as status from "../../../../src/chat/commands/nextstep/status";
import { MachineStatus, WholeStatus } from "../../../../src/chat/commands/nextstep/types";
import * as projectStatusUtils from "../../../../src/utils/projectStatusUtils";
import * as helper from "../../../../src/chat/commands/nextstep/helper";
import { vi, expect } from "vitest";

describe("chat nextstep status", () => {
  afterEach(() => {
    // Restore the default sandbox here
    vi.restoreAllMocks();
  });

  describe("func: getWholeStatus", () => {
    it("folder === undefined", async () => {
      vi.spyOn(helper, "checkCredential").mockResolvedValue({
        m365LoggedIn: true,
        azureLoggedIn: true,
      });
      vi.spyOn(helper, "globalStateGet").mockResolvedValue(true);
      vi.spyOn(helper, "globalStateUpdate").mockResolvedValue(undefined as any);
      await expect(status.getWholeStatus()).resolves.toEqual({
        machineStatus: {
          azureLoggedIn: true,
          firstInstalled: true,
          m365LoggedIn: true,
        },
      } as WholeStatus);
    });

    it("folder !== undefined", async () => {
      vi.spyOn(helper, "getProjectMetadata").mockReturnValue({ projectId: "test-id" });
      vi.spyOn(projectStatusUtils, "getProjectStatus").mockResolvedValue(
        projectStatusUtils.emptyProjectStatus()
      );
      vi.spyOn(projectStatusUtils, "getFileModifiedTime").mockResolvedValue(new Date(0));
      vi.spyOn(projectStatusUtils, "getREADME").mockResolvedValue(undefined);
      vi.spyOn(projectStatusUtils, "getLaunchJSON").mockResolvedValue(undefined);
      vi.spyOn(helper, "checkCredential").mockResolvedValue({
        m365LoggedIn: true,
        azureLoggedIn: true,
      });
      vi.spyOn(helper, "globalStateGet").mockResolvedValue(true);
      vi.spyOn(helper, "globalStateUpdate").mockResolvedValue(undefined as any);
      await expect(status.getWholeStatus("test-folder")).resolves.toEqual({
        machineStatus: {
          azureLoggedIn: true,
          firstInstalled: true,
          m365LoggedIn: true,
        },
        projectOpened: {
          path: "test-folder",
          projectId: "test-id",
          codeModifiedTime: {
            source: new Date(0),
            infra: new Date(0),
          },
          actionStatus: projectStatusUtils.emptyProjectStatus(),
          readmeContent: undefined,
          launchJSONContent: undefined,
        },
      } as WholeStatus);
    });

    it("folder !== undefined (no project id)", async () => {
      vi.spyOn(helper, "getProjectMetadata").mockReturnValue(undefined);
      vi.spyOn(projectStatusUtils, "getProjectStatus").mockResolvedValue(
        projectStatusUtils.emptyProjectStatus()
      );
      vi.spyOn(projectStatusUtils, "getFileModifiedTime").mockResolvedValue(new Date(0));
      vi.spyOn(projectStatusUtils, "getREADME").mockResolvedValue(undefined);
      vi.spyOn(projectStatusUtils, "getLaunchJSON").mockResolvedValue(undefined);
      vi.spyOn(helper, "checkCredential").mockResolvedValue({
        m365LoggedIn: true,
        azureLoggedIn: true,
      });
      vi.spyOn(helper, "globalStateGet").mockResolvedValue(true);
      vi.spyOn(helper, "globalStateUpdate").mockResolvedValue(undefined as any);
      await expect(status.getWholeStatus("test-folder")).resolves.toEqual({
        machineStatus: {
          azureLoggedIn: true,
          firstInstalled: true,
          m365LoggedIn: true,
        },
        projectOpened: {
          path: "test-folder",
          projectId: undefined,
          codeModifiedTime: {
            source: new Date(0),
            infra: new Date(0),
          },
          actionStatus: projectStatusUtils.emptyProjectStatus(),
          readmeContent: undefined,
          launchJSONContent: undefined,
        },
      } as WholeStatus);
    });
  });

  describe("func: getMachineStatus", () => {
    it("func: getMachineStatus", async () => {
      vi.spyOn(helper, "checkCredential").mockResolvedValue({
        m365LoggedIn: true,
        azureLoggedIn: true,
      });
      vi.spyOn(helper, "globalStateGet").mockResolvedValue(true);
      vi.spyOn(helper, "globalStateUpdate").mockResolvedValue(undefined as any);
      await expect(status.getMachineStatus()).resolves.toEqual({
        azureLoggedIn: true,
        firstInstalled: true,
        m365LoggedIn: true,
      } as MachineStatus);
    });
  });
});
