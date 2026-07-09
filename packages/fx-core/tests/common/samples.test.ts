import axios from "axios";
import { chai, vi } from "vitest";

import { err } from "@microsoft/teamsfx-api";

import {
  SampleConfigBranchForPrerelease,
  SampleConfigTag,
  sampleProvider,
} from "../../src/common/samples";
import { AccessGithubError } from "../../src/error/common";
import sampleConfigV3 from "./samples-config-v3.json";

const packageJson = require("../../package.json");

describe("Samples", () => {
  const fakedSampleConfig = {
    filterOptions: {
      capabilities: ["Tab"],
      languages: ["TS"],
      technologies: ["Azure"],
    },
    samples: [
      {
        id: "hello-world-tab-with-backend",
        title: "Tab App with Azure Backend",
        shortDescription:
          "A Hello World app of Microsoft Teams Tab app which has a backend service",
        fullDescription:
          "This is a Hello World app of Microsoft Teams Tab app which accomplishes very simple function like single-sign on. You can run this app locally or deploy it to Microsoft Azure. This app has a Tab frontend and a backend service using Azure Function.",
        tags: ["Tab", "TS", "Azure function"],
        time: "5min to run",
        configuration: "Ready for debug",
        thumbnailPath: "",
        suggested: true,
      },
    ],
  };

  afterEach(() => {
    vi.restoreAllMocks();
    sampleProvider["sampleCollection"] = undefined;
    process.env["TEAMSFX_SAMPLE_CONFIG_BRANCH"] = undefined;
  });

  describe("fetchSampleConfig", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      sampleProvider["sampleCollection"] = undefined;
      process.env["TEAMSFX_SAMPLE_CONFIG_BRANCH"] = undefined;
    });

    it("download sample config on 'dev' branch in alpha version", async () => {
      packageJson.version = "2.0.4-alpha.888a35067.0";
      vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
        if (
          url ===
          "https://raw.githubusercontent.com/OfficeDev/TeamsFx-Samples/dev/.config/samples-config-v3.json"
        ) {
          return { data: fakedSampleConfig, status: 200 };
        } else {
          throw err(undefined);
        }
      });

      const samples = (await sampleProvider.SampleCollection).samples;
      chai.expect(samples[0].downloadUrlInfo).deep.equal({
        owner: "OfficeDev",
        repository: "TeamsFx-Samples",
        ref: "dev",
        dir: "hello-world-tab-with-backend",
      });
      chai.expect(samples[0].gifUrl).equal(undefined);
      const filterOptions = (await sampleProvider.SampleCollection).filterOptions;
      chai.expect(filterOptions.capabilities).to.deep.equal(["Tab"]);
    });

    it("download sample config of prerelease branch in prerelease(beta) version", async () => {
      packageJson.version = "2.0.4-beta.0";
      vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
        if (
          url ===
          `https://raw.githubusercontent.com/OfficeDev/TeamsFx-Samples/${SampleConfigBranchForPrerelease}/.config/samples-config-v3.json`
        ) {
          return { data: fakedSampleConfig, status: 200 };
        } else {
          throw err(undefined);
        }
      });

      const samples = (await sampleProvider.SampleCollection).samples;
      chai.expect(samples[0].downloadUrlInfo).deep.equal({
        owner: "OfficeDev",
        repository: "TeamsFx-Samples",
        ref: SampleConfigBranchForPrerelease,
        dir: "hello-world-tab-with-backend",
      });
      chai.expect(samples[0].gifUrl).equal(undefined);
    });

    it("download sample config of rc tag in rc version", async () => {
      packageJson.version = "2.0.3-rc.1";
      vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
        if (
          url ===
          `https://raw.githubusercontent.com/OfficeDev/TeamsFx-Samples/${SampleConfigTag}/.config/samples-config-v3.json`
        ) {
          return { data: fakedSampleConfig, status: 200 };
        } else {
          throw err(undefined);
        }
      });

      const samples = (await sampleProvider.SampleCollection).samples;
      chai.expect(samples[0].downloadUrlInfo).deep.equal({
        owner: "OfficeDev",
        repository: "TeamsFx-Samples",
        ref: SampleConfigTag,
        dir: "hello-world-tab-with-backend",
      });
      chai.expect(samples[0].gifUrl).equal(undefined);
    });

    it("download sample config of release tag in stable version", async () => {
      packageJson.version = "2.0.3";
      vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
        if (
          url ===
          `https://raw.githubusercontent.com/OfficeDev/TeamsFx-Samples/${SampleConfigTag}/.config/samples-config-v3.json`
        ) {
          return { data: fakedSampleConfig, status: 200 };
        } else {
          throw err(undefined);
        }
      });

      const samples = (await sampleProvider.SampleCollection).samples;
      chai.expect(samples[0].downloadUrlInfo).deep.equal({
        owner: "OfficeDev",
        repository: "TeamsFx-Samples",
        ref: SampleConfigTag,
        dir: "hello-world-tab-with-backend",
      });
      chai.expect(samples[0].gifUrl).equal(undefined);
    });

    it("download sample config using feature flag if available in stable version", async () => {
      packageJson.version = "2.0.3";
      process.env["TEAMSFX_SAMPLE_CONFIG_BRANCH"] = "v2.0.0";
      process.env["TEAMSFX_OFFICE_SAMPLE_CONFIG_BRANCH"] = "v0.0.1";
      vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
        if (
          url ===
          `https://raw.githubusercontent.com/OfficeDev/TeamsFx-Samples/v2.0.0/.config/samples-config-v3.json`
        ) {
          return { data: fakedSampleConfig, status: 200 };
        } else {
          throw err(undefined);
        }
      });

      const samples = (await sampleProvider.SampleCollection).samples;
      chai.expect(samples[0].downloadUrlInfo).deep.equal({
        owner: "OfficeDev",
        repository: "TeamsFx-Samples",
        ref: "v2.0.0",
        dir: "hello-world-tab-with-backend",
      });
      chai.expect(samples[0].gifUrl).equal(undefined);
    });

    it("download bundled sample config if feature flag branch is unavailable in stable version", async () => {
      packageJson.version = "2.0.3";
      process.env["TEAMSFX_SAMPLE_CONFIG_BRANCH"] = "v2.0.0";
      vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
        if (
          url ===
          `https://raw.githubusercontent.com/OfficeDev/TeamsFx-Samples/${SampleConfigTag}/.config/samples-config-v3.json`
        ) {
          return { data: fakedSampleConfig, status: 200 };
        } else {
          throw err(undefined);
        }
      });

      try {
        const samples = (await sampleProvider.SampleCollection).samples;
        chai.expect(samples[0].downloadUrlInfo).deep.equal({
          owner: "OfficeDev",
          repository: "TeamsFx-Samples",
          ref: SampleConfigTag,
          dir: "hello-world-tab-with-backend",
        });
        chai.expect(samples[0].gifUrl).equal(undefined);
      } catch (e) {
        chai.assert.fail("should not reach here");
      }
    });

    it("has empty sample collection if network in disconnected", async () => {
      packageJson.version = "2.0.3";
      vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
        throw err(undefined);
      });

      try {
        await sampleProvider.SampleCollection;
        chai.assert.fail("should not reach here");
      } catch (e) {
        chai.assert.isTrue(e instanceof AccessGithubError);
      }
    });
  });

  describe("getSampleReadmeHtml", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("calls GitHub API to get html response", async () => {
      let requestUrl = "";
      vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
        requestUrl = url;
        return { data: "html content", status: 200 };
      });

      const fakeSample = {
        id: "external-sample",
        title: "Test external sample",
        shortDescription: "short description for external sample",
        fullDescription: "full description for external sample",
        types: [],
        tags: ["External"],
        time: "5min to run",
        configuration: "Ready for debug",
        thumbnailPath: "",
        onboardDate: new Date(),
        suggested: false,
        downloadUrlInfo: {
          owner: "Test",
          repository: "Test-Samples",
          ref: "main",
          dir: "faked-external-sample",
        },
      };
      const html = await sampleProvider.getSampleReadmeHtml(fakeSample);
      chai.expect(html).equal("html content");
      chai
        .expect(requestUrl)
        .equal(
          "https://api.github.com/repos/Test/Test-Samples/readme/faked-external-sample/?ref=main"
        );
    });

    it("returns empty string when content is empty", async () => {
      let requestUrl = "";
      vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
        requestUrl = url;
        return { status: 200 };
      });

      const fakeSample = {
        id: "external-sample",
        title: "Test external sample",
        shortDescription: "short description for external sample",
        fullDescription: "full description for external sample",
        types: [],
        tags: ["External"],
        time: "5min to run",
        configuration: "Ready for debug",
        thumbnailPath: "",
        onboardDate: new Date(),
        suggested: false,
        downloadUrlInfo: {
          owner: "Test",
          repository: "Test-Samples",
          ref: "main",
          dir: "faked-external-sample",
        },
      };
      const html = await sampleProvider.getSampleReadmeHtml(fakeSample);
      chai.expect(html).equal("");
      chai
        .expect(requestUrl)
        .equal(
          "https://api.github.com/repos/Test/Test-Samples/readme/faked-external-sample/?ref=main"
        );
    });

    it("throws error when no network connection", async () => {
      vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
        throw err(undefined);
      });

      const fakeSample = {
        id: "external-sample",
        title: "Test external sample",
        shortDescription: "short description for external sample",
        fullDescription: "full description for external sample",
        types: [],
        tags: ["External"],
        time: "5min to run",
        configuration: "Ready for debug",
        thumbnailPath: "",
        onboardDate: new Date(),
        suggested: false,
        downloadUrlInfo: {
          owner: "Test",
          repository: "Test-Samples",
          ref: "main",
          dir: "faked-external-sample",
        },
      };
      try {
        await sampleProvider.getSampleReadmeHtml(fakeSample);
        chai.assert.fail("should not reach here");
      } catch (e) {
        chai.assert.isTrue(e instanceof AccessGithubError);
      }
    });
  });

  it("External sample url can be retrieved correctly in v3", async () => {
    const fakedExternalSample = {
      id: "external-sample",
      title: "Test external sample",
      shortDescription: "short description for external sample",
      fullDescription: "full description for external sample",
      tags: ["External"],
      time: "5min to run",
      configuration: "Ready for debug",
      suggested: false,
      downloadUrlInfo: {
        owner: "Test",
        repository: "Test-Samples",
        ref: "main",
        dir: "faked-external-sample",
      },
    };
    sampleConfigV3.samples.push(fakedExternalSample as any);

    vi.spyOn(axios, "get").mockImplementation(async () => {
      return { data: sampleConfigV3, status: 200 };
    });
    const samples = (await sampleProvider.SampleCollection).samples;
    const faked = samples.find((sample) => sample.id === fakedExternalSample.id);
    chai.expect(faked).exist;
    chai.expect(faked?.downloadUrlInfo).equals(fakedExternalSample.downloadUrlInfo);
    chai.expect(faked?.gifUrl).equals(undefined);

    sampleConfigV3.samples.splice(sampleConfigV3.samples.length - 1, 1);
    vi.restoreAllMocks();
  });

  it("fetchSampleConfig - online sample config returns undefined when failed to fetch", async () => {
    vi.spyOn(axios, "get").mockImplementation(async (url: string, config) => {
      if (
        url ===
        "https://raw.githubusercontent.com/OfficeDev/TeamsFx-Samples/v2.2.0/.config/samples-config-v3.json"
      ) {
        throw new Error("test error");
      }
    });

    try {
      await sampleProvider.SampleCollection;
      chai.assert.fail("should not reach here");
    } catch (e) {
      chai.assert.isTrue(e instanceof AccessGithubError);
    }
  });
});
