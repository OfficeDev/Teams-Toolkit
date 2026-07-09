// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { ok } from "@microsoft/teamsfx-api";
import axios from "axios";
import fs from "fs-extra";
import { setTools } from "../../../../src/common/globalVars";
import { ArmDeployDriver } from "../../../../src/component/driver/arm/deploy";
import { ArmDeployImpl } from "../../../../src/component/driver/arm/deployImpl";
import { azureClientHelper } from "../../../../src/component/utils/azureClient";
import { cpUtils } from "../../../../src/component/utils/depsChecker/cpUtils";
import { assert, vi } from "vitest";
import {
  MockedAzureAccountProvider,
  MockedM365Provider,
  MockLogProvider,
  MockTelemetryReporter,
  MockTools,
  MockUserInteraction,
} from "../../../core/utils";

describe("Arm driver deploy", () => {
  const sandbox = vi;
  const tools = new MockTools();
  setTools(tools);
  const mockedDriverContext: any = {
    m365TokenProvider: new MockedM365Provider(),
    azureAccountProvider: new MockedAzureAccountProvider(),
    telemetryReporter: new MockTelemetryReporter(),
    ui: new MockUserInteraction(),
    logProvider: new MockLogProvider(),
    projectPath: "./",
  };
  const driver = new ArmDeployDriver();

  const bicepCliVersion = "v0.9.1";
  beforeEach(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  for (const actionMethod of ["run", "execute"]) {
    it(`happy path for ${actionMethod}`, async () => {
      vi.spyOn(fs, "readFile").mockResolvedValue("{}" as any);
      vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("{}" as any);
      const deployRes = ok({
        mockKey: {
          type: "string",
          value: "mockValue",
        },
      });
      vi.spyOn(azureClientHelper, "createRmClient").mockResolvedValue({} as any);
      vi.spyOn(ArmDeployImpl.prototype, "executeDeployment").mockResolvedValue(deployRes as any);
      vi.spyOn(ArmDeployImpl.prototype, "ensureBicepCli").mockResolvedValue("bicep");
      const fakeAxiosInstance = axios.create();
      vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
      vi.spyOn(fakeAxiosInstance, "get").mockResolvedValue({
        status: 200,
        data: "",
      });
      let res: any;
      let deployArgs = {
        subscriptionId: "00000000-0000-0000-0000-000000000000",
        resourceGroupName: "mock-group",
        bicepCliVersion: bicepCliVersion,
        templates: [
          {
            path: "mock-template.bicep",
            parameters: "mock-parameters.json",
            deploymentName: "mock-deployment",
          },
          {
            path: "mock-template2.json",
            deploymentName: "mock-deployment2",
          },
          {
            path: "mock-template3.json",
            parameters: "mock-parameters3.json",
            deploymentName: "mock-deployment3",
          },
        ],
      };

      res = await driver.execute(deployArgs, mockedDriverContext);
      assert.isTrue(res.result.isOk());

      deployArgs = {
        subscriptionId: "00000000-0000-0000-0000-000000000000",
        resourceGroupName: "mock-group",
        bicepCliVersion: "",
        templates: [
          {
            path: "mock-template.json",
            parameters: "mock-parameters.json",
            deploymentName: "mock-deployment",
          },
        ],
      };
      if (actionMethod === "run") {
        res = await driver.execute(deployArgs, mockedDriverContext);
        assert.isTrue(res.result.isOk());
      } else {
        res = await driver.execute(deployArgs, mockedDriverContext);
        assert.isTrue(res.result.isOk());
      }
    });
  }

  it("invalid parameters", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue("{}" as any);
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("{}" as any);
    let deployArgs = {
      subscriptionId: "",
      resourceGroupName: "",
      bicepCliVersion: "",
      templates: [
        {
          path: "mock-template",
          parameters: "mock-parameters",
          deploymentName: "",
        },
      ],
    } as any;
    let res = await driver.execute(deployArgs, mockedDriverContext);
    assert.isTrue(res.result.isErr());

    deployArgs = {
      subscriptionId: "00000000-0000-0000-0000-000000000000",
      resourceGroupName: "mock-group",
      bicepCliVersion: "",
      templates: [],
    } as any;
    res = await driver.execute(deployArgs, mockedDriverContext);
    assert.isTrue(res.result.isErr());

    deployArgs = {
      subscriptionId: "00000000-0000-0000-0000-000000000000",
      resourceGroupName: "mock-group",
      bicepCliVersion: "",
      templates: [
        {
          path: "C:/mock-template",
          parameters: "",
          deploymentName: "",
        },
      ],
    } as any;
    res = await driver.execute(deployArgs, mockedDriverContext);
    assert.isTrue(res.result.isErr());
  });

  it("deploy error", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue("{}" as any);
    vi.spyOn(cpUtils, "executeCommand").mockResolvedValue("{}" as any);
    vi.spyOn(ArmDeployImpl.prototype, "innerExecuteDeployment").mockRejectedValue(
      new Error("mocked deploy error")
    );
    vi.spyOn(ArmDeployImpl.prototype, "ensureBicepCli").mockResolvedValue();
    const deployArgs = {
      subscriptionId: "00000000-0000-0000-0000-000000000000",
      resourceGroupName: "mock-group",
      bicepCliVersion: bicepCliVersion,
      templates: [
        {
          path: "mock-template.bicep",
          parameters: "mock-parameters.json",
          deploymentName: "mock-deployment",
        },
        {
          path: "mock-template2.json",
          parameters: "mock-parameters2.json",
          deploymentName: "mock-deployment2",
        },
      ],
    };

    const res = await driver.execute(deployArgs, mockedDriverContext);
    assert.isTrue(res.result.isErr());
  });

  it("error handle", async () => {
    vi.spyOn(ArmDeployImpl.prototype, "run").mockImplementation(() => {
      throw "mocked deploy error";
    });

    const res = await driver.execute({} as any, mockedDriverContext);
    assert.isTrue(res.result.isErr());
  });
});
