// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { Context, err, Inputs, ok, Platform } from "@microsoft/teamsfx-api";
import * as uuid from "uuid";
import { chai, vi } from "vitest";

import * as fs from "fs-extra";
import { setTools } from "../../../../src/common/globalVars";
import { AddWebPartDriver } from "../../../../src/component/driver/add/addWebPart";
import { NoConfigurationError } from "../../../../src/component/driver/add/error/noConfigurationError";
import { AddWebPartArgs } from "../../../../src/component/driver/add/interface/AddWebPartArgs";
import { AppStudioResultFactory } from "../../../../src/component/driver/teamsApp/results";
import { manifestUtils } from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { SPFxGenerator } from "../../../../src/component/generator/spfx/spfxGenerator";
import { InstallSoftwareError } from "../../../../src/error/common";
import { MockedM365Provider, MockTools } from "../../../core/utils";
import { MockedLogProvider, MockedUserInteraction } from "../../../plugins/solution/util";

vi.mock("fs-extra", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs-extra")>();
  const pathExists = vi.fn();
  return {
    ...actual.default,
    ...actual,
    default: {
      ...actual.default,
      pathExists,
    },
    pathExists,
  };
});
vi.mock("../../../../src/component/generator/spfx/spfxGenerator");
vi.mock("../../../../src/component/driver/teamsApp/utils/ManifestUtils");
describe("Add web part driver", async () => {
  const args: AddWebPartArgs = {
    spfxFolder: "C://TeamsApp//src",
    webpartName: "HelloWorld",
    manifestPath: "C://TeamsApp//appPackage//manifest.json",
    localManifestPath: "C://TeamsApp//appPackage//manifest.local.json",
    spfxPackage: "installLocally",
  };
  const driver = new AddWebPartDriver();
  const mockedDriverContext: any = {
    logProvider: new MockedLogProvider(),
    ui: new MockedUserInteraction(),
    m365TokenProvider: new MockedM365Provider(),
    platform: Platform.VSCode,
    projectPath: "C://TeamsApp",
  };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    setTools(new MockTools());
  });

  it("Returns error when no .yo-rc.json file exist", async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(false);

    const res = await driver.run(args, mockedDriverContext);

    chai.expect(res.isErr()).to.be.true;
    chai.expect((res as any).error).instanceOf(NoConfigurationError);
  });

  it("Returns error when Yeoman scaffold fails", async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true);
    vi.mocked(SPFxGenerator.doYeomanScaffold).mockResolvedValue(
      err(new InstallSoftwareError("spfx", "yo"))
    );

    const res = await driver.run(args, mockedDriverContext);

    chai.expect(res.isErr()).to.be.true;
  });

  it("Returns error when updating manifest fails", async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true);
    const componentId = uuid.v4();
    vi.mocked(SPFxGenerator.doYeomanScaffold).mockResolvedValue(ok(componentId));
    vi.mocked(manifestUtils.addCapabilities).mockResolvedValue(
      err(AppStudioResultFactory.UserError("test", ["test msg", "test msg"]))
    );

    const res = await driver.run(args, mockedDriverContext);

    chai.expect(res.isErr()).to.be.true;
  });

  it("Returns success when add web part OK", async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true);
    const componentId = uuid.v4();
    const doYeomanScaffoldStub = vi
      .mocked(SPFxGenerator.doYeomanScaffold)
      .mockResolvedValue(ok(componentId));
    const addCapabilitiesStub = vi
      .mocked(manifestUtils.addCapabilities)
      .mockResolvedValue(ok(undefined));

    const res = await driver.run(args, mockedDriverContext);

    chai.expect(res.isOk(), res.isErr() ? String(res.error?.message ?? res.error) : undefined).to.be
      .true;
    chai.expect(doYeomanScaffoldStub.mock.calls.length).to.equal(1);
    chai.expect(addCapabilitiesStub.mock.calls.length).to.equal(2);
  });

  it("Returns success when add web part for SPFx higher than 1.21", async () => {
    vi.mocked(fs.pathExists).mockResolvedValue(true);
    const componentId = uuid.v4();
    const doYeomanScaffoldStub = vi
      .mocked(SPFxGenerator.doYeomanScaffold)
      .mockImplementation(async (SPFxContext: Context, inputs: Inputs, projectPath: string) => {
        if (!SPFxContext.templateVariables) {
          SPFxContext.templateVariables = {};
        }
        SPFxContext.templateVariables!["useNewDevUrl"] = "true";
        return Promise.resolve(ok(componentId));
      });
    const addCapabilitiesStub = vi
      .mocked(manifestUtils.addCapabilities)
      .mockResolvedValue(ok(undefined));

    const res = await driver.run(args, mockedDriverContext);

    chai.expect(res.isOk(), res.isErr() ? String(res.error?.message ?? res.error) : undefined).to.be
      .true;
    chai.expect(doYeomanScaffoldStub.mock.calls.length).to.equal(1);
    chai.expect(addCapabilitiesStub.mock.calls.length).to.equal(2);
  });
});
