import { Context } from "@microsoft/teamsfx-api";
import { AxiosRequestConfig, default as axios } from "axios";
import mockFs from "mock-fs";
import * as stream from "stream";
import { expect, vi } from "vitest";
import { createContext, setTools } from "../../../../src/common/globalVars";
import { ensureBicepForDriver } from "../../../../src/component/driver/arm/util/bicepChecker";
import { DriverContext } from "../../../../src/component/driver/interface/commonArgs";
import { cpUtils } from "../../../../src/component/utils/depsChecker/cpUtils";
import { MockTools } from "../../../core/utils";

function createFakeAxiosInstance(sandbox: any) {
  const fakeAxiosInstance = axios.create();
  vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
  return fakeAxiosInstance;
}

const mockBicepVersion = "0.4.1318";
const bicepReleaseApiUrl = "https://api.github.com/repos/Azure/bicep/releases";
const bicepDownloadUrlPrefix = "https://github.com/Azure/bicep/releases/download/";

describe("BicepChecker", () => {
  let sandbox: any;
  let downloaded: boolean;
  let context: Context;

  beforeEach(() => {
    sandbox = vi;
    // prevent actually touching real file system
    mockFs({});

    downloaded = false;

    vi.spyOn(cpUtils, "executeCommand").mockImplementation(
      async (
        workDir: string | undefined,
        logger: any,
        options: any,
        command: string,
        ...args: string[]
      ): Promise<string> => {
        if (command === "bicep") {
          throw new Error("Global bicep not installed");
        } else if (args.includes("--version")) {
          if (downloaded) {
            return `Bicep CLI version ${mockBicepVersion}`;
          } else {
            throw new Error("bicep command not found");
          }
        } else {
          throw new Error("Not implemented");
        }
      }
    );

    const tools = new MockTools();
    setTools(tools);
    context = createContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockFs.restore();
  });

  it("Timeout for downloading bicep", async () => {
    const axiosInstance = createFakeAxiosInstance(sandbox);
    vi.spyOn(axiosInstance, "get").mockImplementation(
      async (url: string, config?: AxiosRequestConfig) => {
        if (url === bicepReleaseApiUrl) {
          return {
            data: [{ tag_name: "v" + mockBicepVersion }],
          };
        } else if (url.startsWith(bicepDownloadUrlPrefix)) {
          const reader = new stream.Readable({
            read(size) {
              // mock a timeout error
              // https://nodejs.org/api/stream.html#errors-while-reading
              this.destroy(new Error("Timeout error"));
            },
          });

          return {
            data: reader,
          };
        } else {
          throw new Error(`Not implemented`);
        }
      }
    );

    // If timeout is not handled, there will be unhandled promise rejection but it seems chai has no way to assert that
    await expect(
      ensureBicepForDriver(context as unknown as DriverContext, "v0.9.1")
    ).rejects.toThrow(/Unable to download/);
  });
});
