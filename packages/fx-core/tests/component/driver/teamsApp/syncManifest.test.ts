import { err, FxError, ok, Result, TeamsAppManifest, UserError } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { chai, vi } from "vitest";
import * as appStudio from "../../../../src/component/driver/teamsApp/appStudio";
import { AppStudioError } from "../../../../src/component/driver/teamsApp/errors";
import { SyncManifestArgs } from "../../../../src/component/driver/teamsApp/interfaces/SyncManifest";
import { SyncManifestDriver } from "../../../../src/component/driver/teamsApp/syncManifest";
import { manifestUtils } from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { DotenvOutput, envUtil } from "../../../../src/component/utils/envUtil";
import { metadataUtil } from "../../../../src/component/utils/metadataUtil";
import { pathUtils } from "../../../../src/component/utils/pathUtils";
import { MockedM365Provider } from "../../../core/utils";
import { MockedLogProvider } from "../../../plugins/solution/util";

vi.mock("../../../../src/component/driver/teamsApp/appStudio");

describe("teamsApp/syncManifest", async () => {
  const syncManifestDriver = new SyncManifestDriver();
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    logProvider: new MockedLogProvider(),
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("projectPath or env is empty", async () => {
    const emptyMap = new Map<string, string>();
    const args: SyncManifestArgs = {
      projectPath: emptyMap.get("projectPath") as string,
      env: emptyMap.get("env") as string,
    };
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal(AppStudioError.SyncManifestFailedError.name, result.error.name);
    }
  });

  it("getTeamsAppIdAndManifestTemplatePath error", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(err(new Error("fake error")));
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal("fake error", result.error.message);
    }
  });

  it("new manifest does not exist", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", "mockedTeamsAppId"],
          ["manifestTemplatePath", "mockedManifestTemplatePath"],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      err(new UserError("source", "name", "", ""))
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal("name", result.error.name);
    }
  });

  it("new manifest is empty", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", "mockedTeamsAppId"],
          ["manifestTemplatePath", "mockedManifestTemplatePath"],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(ok({}));
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal("SyncManifestFailed", result.error.name);
    }
  });

  it("cannot find current manifest", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", "mockedTeamsAppId"],
          ["manifestTemplatePath", "mockedManifestTemplatePath"],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(JSON.stringify({})),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.equal("FileNotFoundError", result.error.name);
    }
  });

  it("add diff", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            version: "1.0",
            id: "1",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "1",
      } as TeamsAppManifest)
    );
    vi.spyOn(envUtil, "readEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("delete diff", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "1",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "1",
        version: "1.0",
      } as TeamsAppManifest)
    );
    vi.spyOn(envUtil, "readEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("edit diff", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "id-11",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        TEAMS_APP_ID: "2",
      } as DotenvOutput)
    );
    vi.spyOn(envUtil, "writeEnv").mockImplementation(
      (
        projectPath: string,
        env: string,
        newEnv: DotenvOutput
      ): Promise<Result<undefined, FxError>> => {
        if (
          projectPath === args.projectPath &&
          env === args.env &&
          JSON.stringify(newEnv) === JSON.stringify({ TEAMS_APP_ID: "11" })
        ) {
          return Promise.resolve(ok(undefined));
        } else {
          return Promise.resolve(
            err(new UserError("ut", "Invalid parameters passed to writeEnv", "", ""))
          );
        }
      }
    );

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "id-${{TEAMS_APP_ID}}",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("edit diff with placeholder conflicts", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "11",
            version: "22",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "${{TEAMS_APP_ID}}",
        version: "${{TEAMS_APP_ID}}",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("edit diff with no placeholder in template", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "11",
            version: "22",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "111",
        version: "222",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("edit diff - cannot match template", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "11",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "app-${{TEAMS_APP_ID}}",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("edit diff - placeholder conflicts in one match", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "app-1-2",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "app-${{TEAMS_APP_ID}}-${{TEAMS_APP_ID}}",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("no diff", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "1",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "1",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("edit diff with same placeholders", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "1",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        TEAMS_APP_ID: "1",
      } as DotenvOutput)
    );
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "${{TEAMS_APP_ID}}",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("edit diff with duplicate placeholders", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "1",
            packageName: "1",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        TEAMS_APP_ID: "1",
      } as DotenvOutput)
    );
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "${{TEAMS_APP_ID}}",
        packageName: "${{TEAMS_APP_ID}}",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("read env failed", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "1",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(err(new UserError("ut", "error", "", "")));
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "${{TEAMS_APP_ID}}",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.deepEqual(result.error.name, "error");
    }
  });

  it("read env failed in getTeamsAppIdAndManifestTemplatePath", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    vi.spyOn(appStudio, "getAppPackage").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(fs, "mkdir").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(fs, "writeFile").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(err(new UserError("ut", "error", "", "")));
    vi.spyOn(envUtil, "writeEnv").mockImplementation(() => {
      throw "error";
    });
    vi.spyOn(manifestUtils, "_readAppManifest").mockImplementation(() => {
      throw "error";
    });
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.deepEqual(result.error.name, "error");
    }
  });

  it("write env failed", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const teamsAppId = "mockedTeamsAppId";
    const manifestTemplatePath = "mockedManifestTemplatePath";
    vi.spyOn(
      syncManifestDriver,
      "getTeamsAppIdAndManifestTemplatePath" as keyof SyncManifestDriver
    ).mockResolvedValue(
      ok(
        new Map([
          ["teamsAppId", teamsAppId],
          ["manifestTemplatePath", manifestTemplatePath],
        ])
      )
    );
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "id-11",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        TEAMS_APP_ID: "2",
      } as DotenvOutput)
    );
    vi.spyOn(envUtil, "writeEnv").mockResolvedValue(err(new UserError("ut", "error", "", "")));

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "id-${{TEAMS_APP_ID}}",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isErr());
    if (result.isErr()) {
      chai.assert.deepEqual(result.error.name, "error");
    }
  });

  it("happy path", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
    };
    const mockProjectModel: any = {
      projectId: "12345",
      provision: {
        name: "provision",
        driverDefs: [
          {
            uses: "teamsApp/create",
            with: {
              name: "testappname${{APP_NAME_SUFFIX}}",
            },
            writeToEnvironmentFile: {
              teamsAppId: "TEAMS_APP_ID",
            },
          },
          {
            uses: "teamsApp/zipAppPackage",
            with: {
              manifestPath: "./",
            },
            writeToEnvironmentFile: {
              teamsAppId: "TEAMS_APP_ID",
            },
          },
        ],
      },
    };
    vi.spyOn(pathUtils, "getYmlFilePath").mockResolvedValue("");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "1",
            version: "2.0",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        VERSION: "1.0",
        TEAMS_APP_ID: "1",
      } as DotenvOutput)
    );
    vi.spyOn(envUtil, "writeEnv").mockImplementation(
      (
        projectPath: string,
        env: string,
        newEnv: DotenvOutput
      ): Promise<Result<undefined, FxError>> => {
        if (
          projectPath === args.projectPath &&
          env === args.env &&
          JSON.stringify(newEnv) === JSON.stringify({ VERSION: "2.0" })
        ) {
          return Promise.resolve(ok(undefined));
        } else {
          return Promise.resolve(
            err(new UserError("ut", "Invalid parameters passed to writeEnv", "", ""))
          );
        }
      }
    );

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "1",
        version: "${{VERSION}}",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });

  it("happy path with teamsApp Id", async () => {
    const args: SyncManifestArgs = {
      projectPath: "fakePath",
      env: "dev",
      teamsAppId: "1",
    };
    const mockProjectModel: any = {
      projectId: "12345",
      provision: {
        name: "provision",
        driverDefs: [
          {
            uses: "teamsApp/create",
            with: {
              name: "testappname${{APP_NAME_SUFFIX}}",
            },
            writeToEnvironmentFile: {
              teamsAppId: "TEAMS_APP_ID",
            },
          },
          {
            uses: "teamsApp/zipAppPackage",
            with: {
              manifestPath: "./",
            },
            writeToEnvironmentFile: {
              teamsAppId: "TEAMS_APP_ID",
            },
          },
        ],
      },
    };
    vi.spyOn(pathUtils, "getYmlFilePath").mockResolvedValue("");
    vi.spyOn(metadataUtil, "parse").mockResolvedValue(ok(mockProjectModel));
    vi.mocked(appStudio.getAppPackage).mockResolvedValue(
      ok({
        manifest: Buffer.from(
          JSON.stringify({
            id: "1",
            version: "2.0",
          })
        ),
      })
    );
    vi.spyOn(fs, "mkdir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(envUtil, "readEnv").mockResolvedValue(
      ok({
        VERSION: "1.0",
      } as DotenvOutput)
    );
    vi.spyOn(envUtil, "writeEnv").mockImplementation(
      (
        projectPath: string,
        env: string,
        newEnv: DotenvOutput
      ): Promise<Result<undefined, FxError>> => {
        if (
          projectPath === args.projectPath &&
          env === args.env &&
          JSON.stringify(newEnv) === JSON.stringify({ VERSION: "2.0" })
        ) {
          return Promise.resolve(ok(undefined));
        } else {
          return Promise.resolve(
            err(new UserError("ut", "Invalid parameters passed to writeEnv", "", ""))
          );
        }
      }
    );

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      ok({
        id: "1",
        version: "${{VERSION}}",
      } as TeamsAppManifest)
    );
    const result = await syncManifestDriver.sync(args, mockedDriverContext);
    chai.assert.isTrue(result.isOk());
    if (result.isOk()) {
      chai.assert.deepEqual(result.value, new Map<string, string>());
    }
  });
});
