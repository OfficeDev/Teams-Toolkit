import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import fs from "fs-extra";
import "mocha";
import * as path from "path";
import sinon from "sinon";
import {
  AppManifestUtils,
  ManifestUtil,
  SchemaFetchError,
  TeamsAppManifest,
  TeamsManifestConverter,
} from "../src";

chai.use(chaiAsPromised);

describe("Manifest manipulation", async () => {
  describe("loadFromPath", async () => {
    it("should succeed when loading from a valid path", async () => {
      const filePath = path.join(__dirname, "manifest.json");
      const manifest = await ManifestUtil.loadFromPath(filePath);
      chai.expect(manifest.id).equals("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    });

    it("should throw when loading from an invalid path", async () => {
      const invalidPath = path.join(__dirname, "invalid.json");
      chai.expect(await fs.pathExists(invalidPath)).equals(false);

      chai.expect(ManifestUtil.loadFromPath(invalidPath)).to.be.rejectedWith(Error);
    });
  });

  describe("writeToPath", async () => {
    const mocker = sinon.createSandbox();
    const fileContent: Map<string, string> = new Map();

    before(() => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      mocker.stub(fs, "writeJson").callsFake((file: string, obj: any) => {
        fileContent.set(file, JSON.stringify(obj));
      });
    });

    after(() => {
      mocker.restore();
      fileContent.clear();
    });

    it("should succeed when writing to a valid path", async () => {
      const filePath = path.join(__dirname, "test_manifest.json");
      const manifest = new TeamsAppManifest();
      const fakeId = "some-fake-id";
      manifest.id = fakeId;
      await ManifestUtil.writeToPath(filePath, manifest);
      chai.expect(fileContent.get(filePath)).is.not.undefined;
      chai.expect(JSON.parse(fileContent.get(filePath)!).id).equals(fakeId);
    });
  });

  describe("validateManifest", async () => {
    const sandbox = sinon.createSandbox();

    afterEach(() => {
      sandbox.restore();
    });

    it("should throw if $schema is undefined", async () => {
      const manifest = new TeamsAppManifest();
      manifest.$schema = undefined;
      chai.expect(ManifestUtil.validateManifest(manifest)).to.be.rejectedWith(Error);
    });

    it("should return empty array when validation passes", async () => {
      sandbox.stub(ManifestUtil, "fetchSchema").resolves({} as any);
      sandbox.stub(ManifestUtil, "validateManifestAgainstSchema").resolves([]);
      const result = await ManifestUtil.validateManifest({} as any);
      chai.expect(result).to.be.empty;
    });
  });

  describe("validateManifestAgainstSchema", async () => {
    it("should return empty array when validation passes", async () => {
      const schema = await loadSchema();
      const filePath = path.join(__dirname, "manifest.json");
      const validManifest = await ManifestUtil.loadFromPath(filePath);
      const result = await ManifestUtil.validateManifestAgainstSchema(validManifest, schema);
      chai.expect(result).to.be.empty;
    });
    it("loadAndValidateFromPath passes", async () => {
      const filePath = path.join(__dirname, "manifest.json");
      const [manifest, validateResults] = await ManifestUtil.loadAndValidateFromPath(filePath);
      chai.expect(validateResults).to.be.empty;
    });
    it("should return error string array", async () => {
      // schema has version 1.11
      const schema = await loadSchema();
      const manifest = new TeamsAppManifest();
      chai.expect(manifest.manifestVersion).equals("1.15");
      const result = await ManifestUtil.validateManifestAgainstSchema(manifest, schema);
      chai.expect(result).not.to.be.empty;
      chai.expect(result.length).equals(7);
      // 1.15 doesn't match 1.11, so it should return an error
      chai.expect(result[5]).to.contain("/manifestVersion");
    });
  });
});

describe("ManifestUtil", () => {
  const sandbox = sinon.createSandbox();
  afterEach(() => {
    sandbox.restore();
  });
  it("should return the correct manifest version", () => {
    const json = {
      $schema:
        "https://developer.microsoft.com/en-us/json-schemas/teams/v1.19/MicrosoftTeams.schema.json",
      manifestVersion: "1.19",
      version: 1.0,
      id: "${{TEAMS_APP_ID}}",
      developer: {
        name: "Teams App, Inc.",
        websiteUrl: "https://www.example.com",
        privacyUrl: "https://www.example.com/privacy",
        termsOfUseUrl: "https://www.example.com/termofuse",
      },
      icons: {
        color: "color.png",
        outline: "outline.png",
      },
      name: {
        short: "huajiecea040906${{APP_NAME_SUFFIX}}",
        full: "full name for huajiecea040906",
      },
      description: {
        short: "Repair Service",
        full: "A simple service to manage repairs",
      },
      accentColor: "#FFFFFF",
      bots: [
        {
          botId: "${{BOT_ID}}",
          scopes: ["personal", "team", "groupChat"],
          supportsFiles: false,
          isNotificationOnly: false,
          commandLists: [
            {
              scopes: ["personal"],
              commands: [
                {
                  title: "List all repairs without auth",
                  description: "List all repairs without auth",
                },
              ],
            },
          ],
        },
      ],
      composeExtensions: [],
      configurableTabs: [],
      staticTabs: [],
      permissions: ["identity", "messageTeamMembers"],
      validDomains: [],
    };
    try {
      TeamsManifestConverter.jsonToManifest(JSON.stringify(json));
      chai.assert.fail("Expected error not thrown");
    } catch (error: any) {
      chai.assert.include(error.message, `Invalid value for key "version"`);
    }
  });
  it("invalid manifestVersion", () => {
    try {
      TeamsManifestConverter.jsonToManifest(JSON.stringify({ manifestVersion: "1.100" }));
    } catch (error: any) {
      chai.assert.include(error.message, "Teams manifest version 1.100 is not supported");
    }
  });
  it("fetchSchema missing schema", async () => {
    try {
      AppManifestUtils.fetchSchema({} as any);
    } catch (e: any) {
      chai.assert.include(
        e.message,
        "Manifest does not have a $schema property or schema url is not provided."
      );
    }
  });

  describe("fetchSchema", () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mockFetch = require("../src/fetchHelper");

    afterEach(() => {
      sandbox.restore();
    });

    it("should successfully fetch and parse schema with regex workaround", async () => {
      const mockResponse = {
        text: sandbox.stub().resolves('{"type":"object","properties":{},"regex":"\\\\a"}'),
      };

      sandbox.stub(mockFetch, "default").resolves(mockResponse as any);

      const manifest = { $schema: "https://example.com/schema.json" } as TeamsAppManifest;
      const result = await ManifestUtil.fetchSchema(manifest);

      chai.expect(result).to.deep.include({ type: "object", properties: {} });
      chai.expect(mockResponse.text.calledOnce).to.be.true;
    });

    it("should apply regex workaround for \\a characters", async () => {
      const mockResponseText = '{"pattern":"\\\\a test pattern"}';
      const expectedCleanedText = '{"pattern":"\\x07 test pattern"}';
      const mockResponse = {
        text: sandbox.stub().resolves(mockResponseText),
      };

      sandbox.stub(mockFetch, "default").resolves(mockResponse as any);
      const jsonParseStub = sandbox.stub(JSON, "parse").callsFake((text) => {
        return { pattern: "\\x07 test pattern" };
      });

      const manifest = { $schema: "https://example.com/schema.json" } as TeamsAppManifest;
      await ManifestUtil.fetchSchema(manifest);

      chai.expect(jsonParseStub.calledOnce).to.be.true;
    });

    it("should throw error with schema URL when fetch fails", async () => {
      const fetchError = new Error("Network error");
      sandbox.stub(mockFetch, "default").rejects(fetchError);

      const manifest = { $schema: "https://example.com/invalid-schema.json" } as TeamsAppManifest;

      try {
        await ManifestUtil.fetchSchema(manifest);
        chai.assert.fail("Expected error not thrown");
      } catch (error: unknown) {
        chai
          .expect((error as Error).message)
          .to.equal(
            "Failed to get manifest at url https://example.com/invalid-schema.json due to: Network error"
          );
      }
    });

    it("should throw a typed SchemaFetchError preserving the cause", async () => {
      const fetchError = new Error("Network error");
      sandbox.stub(mockFetch, "default").rejects(fetchError);

      const manifest = { $schema: "https://example.com/invalid-schema.json" } as TeamsAppManifest;

      try {
        await ManifestUtil.fetchSchema(manifest);
        chai.assert.fail("Expected error not thrown");
      } catch (error: unknown) {
        chai.expect(error).to.be.instanceOf(SchemaFetchError);
        const schemaFetchError = error as SchemaFetchError;
        chai.expect(schemaFetchError.schemaUrl).to.equal("https://example.com/invalid-schema.json");
        chai.expect(schemaFetchError.cause).to.equal(fetchError);
      }
    });

    it("should throw error with schema URL when response.text() fails", async () => {
      const textError = new Error("Failed to read response text");
      const mockResponse = {
        text: sandbox.stub().rejects(textError),
      };

      sandbox.stub(mockFetch, "default").resolves(mockResponse as any);

      const manifest = { $schema: "https://example.com/schema.json" } as TeamsAppManifest;

      try {
        await ManifestUtil.fetchSchema(manifest);
        chai.assert.fail("Expected error not thrown");
      } catch (error: unknown) {
        chai
          .expect((error as Error).message)
          .to.equal(
            "Failed to get manifest at url https://example.com/schema.json due to: Failed to read response text"
          );
      }
    });

    it("should throw error with schema URL when JSON.parse fails", async () => {
      const mockResponse = {
        text: sandbox.stub().resolves("invalid json content"),
      };

      sandbox.stub(mockFetch, "default").resolves(mockResponse as any);

      const manifest = { $schema: "https://example.com/schema.json" } as TeamsAppManifest;

      try {
        await ManifestUtil.fetchSchema(manifest);
        chai.assert.fail("Expected error not thrown");
      } catch (error: unknown) {
        chai
          .expect((error as Error).message)
          .to.include("Failed to get manifest at url https://example.com/schema.json due to:");
      }
    });

    it("should throw generic error when non-Error exception occurs", async () => {
      sandbox.stub(mockFetch, "default").rejects("string error");

      const manifest = { $schema: "https://example.com/schema.json" } as TeamsAppManifest;

      try {
        await ManifestUtil.fetchSchema(manifest);
        chai.assert.fail("Expected error not thrown");
      } catch (error: unknown) {
        chai
          .expect((error as Error).message)
          .to.contain("Failed to get manifest at url https://example.com/schema.json");
      }
    });

    it("should work with manifest using 'schema' property instead of '$schema'", async () => {
      const mockSchema = { type: "object" };
      const mockResponse = {
        text: sandbox.stub().resolves('{"type":"object"}'),
      };

      sandbox.stub(mockFetch, "default").resolves(mockResponse as any);

      const manifest = { schema: "https://example.com/schema.json" } as unknown as TeamsAppManifest;
      const result = await ManifestUtil.fetchSchema(manifest);

      chai.expect(result).to.deep.equal(mockSchema);
    });
  });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadSchema(): Promise<any> {
  const schemaPath = path.join(__dirname, "MicrosoftTeams.schema.json");
  return fs.readJson(schemaPath);
}
