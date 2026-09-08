import { assert } from "chai";
import "mocha";
import fs from "fs-extra";
import sinon from "sinon";
import { AppManifestUtils } from "../src";
import { SchemaFetchError } from "../src";
import * as fetchHelper from "../src/fetchHelper";

describe("AppManifestUtils", async () => {
  const sandbox = sinon.createSandbox();

  afterEach(() => {
    sandbox.restore();
  });

  describe("fetchSchema", async () => {
    it("should return local schema", async () => {
      sandbox.stub(fs, "pathExists").resolves(true);
      const readFile = sandbox
        .stub(fs, "readFile")
        .resolves(JSON.stringify({ title: "test" }) as any);
      const fetchStub = sandbox.stub(fetchHelper, "default").resolves({
        ok: true,
        json: async () => ({}),
      } as any);
      const schema = await AppManifestUtils.fetchSchema(
        "https://developer.microsoft.com/json-schemas/teams/v1.17/MicrosoftTeams.schema.json"
      );
      assert.isTrue(readFile.calledOnce);
      assert.isTrue(fetchStub.notCalled);
      assert.deepEqual(schema, { title: "test" } as any);
    });
    it("should return local schema for localized microsoft docs url", async () => {
      sandbox.stub(fs, "pathExists").resolves(true);
      const readFile = sandbox
        .stub(fs, "readFile")
        .resolves(JSON.stringify({ title: "test" }) as any);
      const fetchStub = sandbox.stub(fetchHelper, "default").resolves({
        ok: true,
        json: async () => ({}),
      } as any);
      const schema = await AppManifestUtils.fetchSchema(
        "https://developer.microsoft.com/en-us/json-schemas/teams/v1.17/MicrosoftTeams.schema.json"
      );
      assert.isTrue(readFile.calledOnce);
      assert.isTrue(fetchStub.notCalled);
      assert.deepEqual(schema, { title: "test" } as any);
    });
    it("should apply regex workaround for \\a and \\v characters when reading local schema", async () => {
      const rawContent = '{"pattern":"\\\\a test \\\\v pattern"}';
      sandbox.stub(fs, "pathExists").resolves(true);
      const readFile = sandbox.stub(fs, "readFile").resolves(rawContent as any);
      const fetchStub = sandbox.stub(fetchHelper, "default");
      const schema = await AppManifestUtils.fetchSchema(
        "https://developer.microsoft.com/json-schemas/teams/v1.25/MicrosoftTeams.schema.json"
      );
      assert.isTrue(readFile.calledOnce);
      assert.isTrue(fetchStub.notCalled);
      assert.deepEqual((schema as any).pattern, "\\u0007 test \\u000b pattern");
    });
    it("should fetch remote schema", async () => {
      const readJson = sandbox.stub(fs, "readJson").resolves({});
      const pathExists = sandbox.stub(fs, "pathExists").resolves(false);
      const fetchStub = sandbox.stub(fetchHelper, "default").resolves({
        ok: true,
        text: async () => JSON.stringify({}),
      } as any);
      const schema = await AppManifestUtils.fetchSchema("https://abc.schema.json");
      assert.isTrue(readJson.notCalled);
      assert.isTrue(fetchStub.calledOnce);
      assert.deepEqual(schema, {} as any);
    });
    it("should apply regex workaround for \\a and \\v characters when fetching remote schema", async () => {
      const mockResponseText = '{"pattern":"\\\\a test \\\\v pattern"}';
      const mockResponse = {
        text: sandbox.stub().resolves(mockResponseText),
      };
      const fetchStub = sandbox.stub(fetchHelper, "default").resolves(mockResponse as any);
      sandbox.stub(fs, "pathExists").resolves(false);
      const schema = await AppManifestUtils.fetchSchema(
        "https://developer.microsoft.com/json-schemas/teams/v1.24/MicrosoftTeams.schema.json"
      );
      assert.isTrue(fetchStub.calledOnce);
      assert.isTrue(mockResponse.text.calledOnce);
    });
    it("should throw SchemaFetchError preserving the cause when fetch fails", async () => {
      sandbox.stub(fs, "pathExists").resolves(false);
      const fetchError = new Error("Network error");
      sandbox.stub(fetchHelper, "default").rejects(fetchError);

      try {
        await AppManifestUtils.fetchSchema("https://abc.schema.json");
        assert.fail("Expected error not thrown");
      } catch (error: unknown) {
        assert.instanceOf(error, SchemaFetchError);
        const schemaFetchError = error as SchemaFetchError;
        assert.strictEqual(schemaFetchError.schemaUrl, "https://abc.schema.json");
        assert.strictEqual(schemaFetchError.cause, fetchError);
        assert.strictEqual(
          schemaFetchError.message,
          "Failed to get manifest at url https://abc.schema.json due to: Network error"
        );
      }
    });
    it("should throw SchemaFetchError with unknown-error message for non-Error cause", async () => {
      sandbox.stub(fs, "pathExists").resolves(false);
      sandbox.stub(fetchHelper, "default").callsFake(() => Promise.reject("string error"));

      try {
        await AppManifestUtils.fetchSchema("https://abc.schema.json");
        assert.fail("Expected error not thrown");
      } catch (error: unknown) {
        assert.instanceOf(error, SchemaFetchError);
        assert.strictEqual((error as SchemaFetchError).cause, "string error");
        assert.strictEqual(
          (error as SchemaFetchError).message,
          "Failed to get manifest at url https://abc.schema.json due to: unknown error"
        );
      }
    });
  });

  describe("validateAgainstSchema", async () => {
    const schema = {
      $schema: "http://json-schema.org/draft-04/schema#",
      type: "object",
      properties: {
        id: { type: "string" },
      },
      additionalProperties: false,
    };

    it("should ignore undefined-valued keys injected by the converter", async () => {
      // The generated converters populate absent optional fields with
      // `undefined` (e.g. a ribbon group under a built-in tab gains phantom
      // `builtInGroupId` / `overriddenByRibbonApi` keys). These have no JSON
      // representation and must not trigger additionalProperties errors.
      const manifest = {
        id: "abc",
        builtInGroupId: undefined,
        overriddenByRibbonApi: undefined,
      };
      const errors = await AppManifestUtils.validateAgainstSchema(manifest as any, schema as any);
      assert.deepEqual(errors, []);
    });

    it("should ignore undefined-valued keys on nested objects", async () => {
      // Mirrors the real scenario: a ribbon group nested under a built-in tab
      // gains phantom `builtInGroupId` / `overriddenByRibbonApi` keys from the
      // converter. The undefined keys sit on a nested object guarded by
      // `additionalProperties: false`, and must be stripped recursively.
      const nestedSchema = {
        $schema: "http://json-schema.org/draft-04/schema#",
        type: "object",
        properties: {
          id: { type: "string" },
          group: {
            type: "object",
            properties: {
              label: { type: "string" },
            },
            additionalProperties: false,
          },
        },
        additionalProperties: false,
      };
      const manifest = {
        id: "abc",
        group: {
          label: "g1",
          builtInGroupId: undefined,
          overriddenByRibbonApi: undefined,
        },
      };
      const errors = await AppManifestUtils.validateAgainstSchema(
        manifest as any,
        nestedSchema as any
      );
      assert.deepEqual(errors, []);
    });

    it("should still report real additional properties", async () => {
      const manifest = {
        id: "abc",
        bogusProp: "x",
      };
      const errors = await AppManifestUtils.validateAgainstSchema(manifest as any, schema as any);
      assert.isTrue(errors.length > 0);
      assert.isTrue(errors.some((e) => e.includes("bogusProp")));
    });
  });
});
