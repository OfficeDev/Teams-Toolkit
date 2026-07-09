// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import axios from "axios";
import mockedEnv from "mocked-env";
import { CreateDevChannelDriver } from "../../../../src/component/driver/devChannel/create";
import { GraphClient } from "../../../../src/client/graphClient";
import { MockedM365Provider, MockLogProvider } from "../../../core/utils";
import { WrapDriverContext } from "../../../../src/component/driver/util/wrapUtil";
import { chai, vi } from "vitest";

describe("CreateDevChannelDriver", () => {
  const sandbox = vi;
  const mockTokenProvider = new MockedM365Provider();
  const mockContext: WrapDriverContext = {
    m365TokenProvider: mockTokenProvider,
    logProvider: new MockLogProvider(),
    addSummary: vi.fn(),
    summaries: [],
  } as unknown as WrapDriverContext;

  const driver = new CreateDevChannelDriver();

  beforeEach(() => {});

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should skip creation if team and channel already exist", async () => {
    const args = {
      teamName: "Test Team",
      channelName: "Test channel",
      teamDescription: "Test Description",
    };
    const outputEnvVarNames = new Map([
      ["teamId", "TEAM_ID"],
      ["channelId", "CHANNEL_ID"],
      ["channelWebUrl", "CHANNEL_WEB_URL"],
    ]);

    const restore = mockedEnv({
      TEAM_ID: "existing-team-id",
      CHANNEL_ID: "exisitng-channel-id",
    });

    vi.spyOn(GraphClient.prototype, "GetChannelDeeplinkAsync").mockResolvedValue("fake-deeplink");
    const result = await driver.execute(args, mockContext, outputEnvVarNames);

    chai.expect(result.result.isOk()).to.be.true;
    if (result.result.isOk()) {
      chai.expect(result.result.value.size).to.equal(3);
    }
    restore();
  });

  it("should create team and channel successfully", async () => {
    const args = {
      teamName: "Test Team",
      channelName: "Channel name",
      teamDescription: "Test Description",
    };
    const outputEnvVarNames = new Map([
      ["teamId", "TEAM_ID"],
      ["channelId", "CHANNEL_ID"],
    ]);

    const mockGraphResponse = {
      teamId: "fake-team-id",
      channelId: "fake-channel-id",
    };

    vi.spyOn(GraphClient.prototype, "CreateTeamAndChannelAsync").mockResolvedValue(
      mockGraphResponse
    );
    vi.spyOn(GraphClient.prototype, "GetChannelDeeplinkAsync").mockResolvedValue("fake-deeplink");

    const result = await driver.create(args, mockContext, outputEnvVarNames);

    chai.expect(result.isOk()).to.be.true;
    if (result.isOk()) {
      chai.expect(result.value.get("TEAM_ID")).to.equal("fake-team-id");
      chai.expect(result.value.get("CHANNEL_ID")).to.equal("fake-channel-id");
    }
  });

  it("should handle error when CreateTeamAndChannelAsync fails", async () => {
    const args = {
      teamName: "Test Team",
      channelName: "Channel name",
      teamDescription: "Test Description",
    };
    const outputEnvVarNames = new Map([
      ["teamId", "TEAM_ID"],
      ["channelId", "CHANNEL_ID"],
    ]);

    const fakeAxiosInstance = axios.create();
    vi.spyOn(axios, "create").mockReturnValue(fakeAxiosInstance);
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    const error = {
      response: {
        status: 409,
      },
    };
    vi.spyOn(fakeAxiosInstance, "post").mockImplementation(() => {
      throw error;
    });

    const result = await driver.create(args, mockContext, outputEnvVarNames);

    chai.expect(result.isErr()).to.be.true;
  });
});
