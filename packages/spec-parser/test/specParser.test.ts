// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import SwaggerParser from "@apidevtools/swagger-parser";
import { expect } from "chai";
import { createHash } from "crypto";
import fs from "fs-extra";
import jsyaml from "js-yaml";
import "mocha";
import mockedEnv, { RestoreFn } from "mocked-env";
import { OpenAPI, OpenAPIV3 } from "openapi-types";
import path from "path";
import sinon from "sinon";
import converter from "swagger2openapi";
import { AdaptiveCardGenerator } from "../src/adaptiveCardGenerator";
import { ConstantString } from "../src/constants";
import {
  AdaptiveCardUpdateStrategy,
  ErrorType,
  ProjectType,
  ValidationStatus,
  WarningType,
} from "../src/interfaces";
import { ManifestUpdater } from "../src/manifestUpdater";
import { SpecFilter } from "../src/specFilter";
import { SpecParser } from "../src/specParser";
import { SpecParserError } from "../src/specParserError";
import { Utils } from "../src/utils";
import { SMEValidator } from "../src/validators/smeValidator";
import { ValidatorFactory } from "../src/validators/validatorFactory";

describe("SpecParser", () => {
  afterEach(() => {
    sinon.restore();
  });

  describe("listSupportedAPIInfo", () => {
    it("should throw not implemented error", async () => {
      const specParser = new SpecParser("/path/to/spec.yaml");
      try {
        await specParser.listSupportedAPIInfo();
        expect.fail("Should throw not implemented error");
      } catch (error: any) {
        expect(error.message).to.equal("Method not implemented.");
      }
    });
  });

  describe("validate", () => {
    it("should return an error result when the spec is not valid", async () => {
      const specParser = new SpecParser("/path/to/spec.yaml");
      const spec = { openapi: "3.0.0" };
      sinon.stub(specParser.parser, "parse").resolves(spec as any);
      sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const parseStub = sinon
        .stub(specParser.parser, "validate")
        .rejects(new Error("Invalid spec"));

      const result = await specParser.validate();

      expect(result.status).to.equal(ValidationStatus.Error);
      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.errors).to.be.an("array").that.has.lengthOf(1);
      expect(result.errors[0].type).to.equal(ErrorType.SpecNotValid);
      expect(result.errors[0].content).to.equal("Error: Invalid spec");
      sinon.assert.calledOnce(parseStub);
    });

    it("should return an warning result object if the spec version is 2.0", async function () {
      const specPath = "path/to/spec";
      const spec = {
        swagger: "2.0",
        info: {
          version: "1.0.0",
          title: "Swagger Petstore",
          description:
            "A sample API that uses a petstore as an example to demonstrate features in the swagger-2.0 specification",
        },
        host: "petstore.swagger.io",
        basePath: "/v2",
        schemes: ["https"],
        paths: {
          "/pet": {
            post: {
              summary: "Add a new pet to the store",
              operationId: "addPet",
              consumes: ["application/json"],
              produces: ["application/json"],
              parameters: [
                {
                  in: "body",
                  name: "body",
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      id: {
                        type: "integer",
                        format: "int64",
                      },
                      name: {
                        type: "string",
                      },
                    },
                  },
                },
              ],
              responses: {
                "200": {
                  description: "Pet added to the store",
                  schema: {
                    type: "object",
                    required: ["id", "name"],
                    properties: {
                      id: {
                        type: "integer",
                        format: "int64",
                      },
                      name: {
                        type: "string",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const specParser = new SpecParser(specPath);

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);

      const openapiSpecObj = await converter.convert(spec as any, {});
      const dereferenceStub = sinon
        .stub(specParser.parser, "dereference")
        .resolves(openapiSpecObj.openapi);
      const validateStub = sinon
        .stub(specParser.parser, "validate")
        .resolves(openapiSpecObj.openapi);

      const result = await specParser.validate();

      expect(result.warnings).to.deep.equal([
        {
          type: WarningType.ConvertSwaggerToOpenAPI,
          content: ConstantString.ConvertSwaggerToOpenAPI,
        },
      ]);
      expect(result.status).equal(ValidationStatus.Warning);
      expect(result.errors).to.be.an("array").that.is.empty;

      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return error object if the spec version is 2.0 with allowSwagger is false", async function () {
      const specPath = "path/to/spec";
      const spec = {
        swagger: "2.0",
        info: {
          version: "1.0.0",
          title: "Swagger Petstore",
          description:
            "A sample API that uses a petstore as an example to demonstrate features in the swagger-2.0 specification",
        },
        host: "petstore.swagger.io",
        basePath: "/v2",
        schemes: ["https"],
        paths: {
          "/pet": {
            post: {
              summary: "Add a new pet to the store",
              operationId: "addPet",
              consumes: ["application/json"],
              produces: ["application/json"],
              parameters: [
                {
                  in: "body",
                  name: "body",
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      id: {
                        type: "integer",
                        format: "int64",
                      },
                      name: {
                        type: "string",
                      },
                    },
                  },
                },
              ],
              responses: {
                "200": {
                  description: "Pet added to the store",
                  schema: {
                    type: "object",
                    required: ["id", "name"],
                    properties: {
                      id: {
                        type: "integer",
                        format: "int64",
                      },
                      name: {
                        type: "string",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const specParser = new SpecParser(specPath, { allowSwagger: false });

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);

      const openapiSpecObj = await converter.convert(spec as any, {});
      const dereferenceStub = sinon
        .stub(specParser.parser, "dereference")
        .resolves(openapiSpecObj.openapi);
      const validateStub = sinon
        .stub(specParser.parser, "validate")
        .resolves(openapiSpecObj.openapi);

      const result = await specParser.validate();

      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.status).equal(ValidationStatus.Error);
      expect(result.errors).to.deep.equal([
        {
          type: ErrorType.SwaggerNotSupported,
          content: ConstantString.SwaggerNotSupported,
        },
      ]);
    });

    it("should return an error result object if no server information", async function () {
      const specPath = "path/to/spec";
      const spec = { openapi: "3.0.0" };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        warnings: [],
        errors: [
          { type: ErrorType.NoServerInformation, content: ConstantString.NoServerInformation },
          { type: ErrorType.NoSupportedApi, content: ConstantString.NoSupportedApi, data: [] },
        ],
        specHash: "",
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return an error result object if server url is http", async function () {
      const specPath = "path/to/spec";
      const spec = { openapi: "3.0.0", servers: [{ url: "http://server1" }] };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        warnings: [],
        errors: [
          {
            type: ErrorType.UrlProtocolNotSupported,
            content: Utils.format(ConstantString.UrlProtocolNotSupported, "http"),
            data: "http",
          },
          { type: ErrorType.NoSupportedApi, content: ConstantString.NoSupportedApi, data: [] },
        ],
        specHash: createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex"),
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return an error result object if server url is relative path", async function () {
      const specPath = "path/to/spec";
      const spec = { openapi: "3.0.0", servers: [{ url: "path/to/server1" }] };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        warnings: [],
        errors: [
          {
            type: ErrorType.RelativeServerUrlNotSupported,
            content: ConstantString.RelativeServerUrlNotSupported,
            data: [
              {
                url: "path/to/server1",
              },
            ],
          },
          { type: ErrorType.NoSupportedApi, content: ConstantString.NoSupportedApi, data: [] },
        ],
        specHash: createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex"),
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return an error result object if no supported apis", async function () {
      const specPath = "path/to/spec";
      const spec = { openapi: "3.0.0", servers: [{ url: "https://server1" }] };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        warnings: [],
        errors: [
          { type: ErrorType.NoSupportedApi, content: ConstantString.NoSupportedApi, data: [] },
        ],
        specHash: createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex"),
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return an error result object if contain remote reference", async function () {
      const spec = {
        openapi: "3.0.3",
        info: {
          title: "Swagger Petstore - OpenAPI 3.",
          version: "1.0.11",
        },
        servers: [
          {
            url: "https://petstore3.swagger.io/api/v3",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "updatePet",
              responses: {
                "200": {
                  description: "Successful operation",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "https://petstore3.swagger.io/api/v3/openapi.json#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            Pet: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  example: "doggie",
                },
              },
            },
          },
        },
      } as OpenAPIV3.Document;
      const specPath = "path/to/spec";
      const specParser = new SpecParser(spec as any);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      // Mock the $refs.paths() to return multiple paths (indicating remote references)
      sinon
        .stub(specParser.parser.$refs, "paths")
        .returns([specPath, "https://petstore3.swagger.io/api/v3/openapi.json"]);
      const result = await specParser.validate();

      expect(result.errors[0].type).equal(ErrorType.RemoteRefNotSupported);
      expect(result.status).equal(ValidationStatus.Error);
      expect(result.specHash).to.equal(
        createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex")
      );
    });

    it("should return an warning result object if missing operation id", async function () {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://servers1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Warning,
        warnings: [
          {
            type: WarningType.OperationIdMissing,
            content: Utils.format(ConstantString.MissingOperationId, "GET /pet"),
            data: ["GET /pet"],
          },
        ],
        errors: [],
        specHash: createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex"),
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return no supported API error with invalid api info", async function () {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://servers1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath, { allowMissingId: false });
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();

      expect(result).to.deep.equal({
        status: ValidationStatus.Error,
        warnings: [],
        errors: [
          {
            type: ErrorType.NoSupportedApi,
            content: ConstantString.NoSupportedApi,
            data: [
              {
                api: "GET /pet",
                reason: [ErrorType.MissingOperationId],
              },
            ],
          },
        ],
        specHash: createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex"),
      });
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return a valid result when the spec is valid", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();
      expect(result.status).to.equal(ValidationStatus.Valid);
      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.errors).to.be.an("array").that.is.empty;
      expect(result.specHash).to.equal(
        createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex")
      );
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return a valid result when the spec is valid for copilot", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath, { projectType: ProjectType.Copilot });
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();
      expect(result.status).to.equal(ValidationStatus.Valid);
      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.errors).to.be.an("array").that.is.empty;
      expect(result.specHash).to.equal(
        createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex")
      );
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return a valid result if one api contains circular reference", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        info: {
          title: "Pet Service",
          version: "1.0.0",
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        components: {
          schemas: {
            Circular: {
              type: "object",
              properties: {
                item: {
                  $ref: "#/components/schemas/Circular",
                },
              },
            },
            Pet: {
              type: "object",
              properties: {
                item: {
                  type: "string",
                },
              },
            },
          },
        },
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  description: "getPet",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
            post: {
              tags: ["pet"],
              operationId: "postPet",
              summary: "Post pet information from the store",
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/Circular",
                    },
                  },
                },
              },
              responses: {
                "200": {
                  description: "postPet",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(spec as any, { projectType: ProjectType.Copilot });
      const result = await specParser.validate();
      expect(result.status).to.equal(ValidationStatus.Valid);
      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.errors).to.be.an("array").that.is.empty;
      expect(result.specHash).to.equal(
        createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex")
      );
    });

    it("should only create validator once if already created", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath, { projectType: ProjectType.Copilot });
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const createValidatorSpy = sinon.spy(ValidatorFactory, "create");
      const result1 = await specParser.validate();
      const result2 = await specParser.validate();
      sinon.assert.calledOnce(createValidatorSpy);
    });

    it("should return error result is project type is SME/Copilot, and OpenAPI spec version >= 3.1.0", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.1.0",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();
      expect(result.errors[0].type).equal(ErrorType.SpecVersionNotSupported);
      expect(result.errors[0].content).equal(
        Utils.format(ConstantString.SpecVersionNotSupported, "3.1.0")
      );
      expect(result.errors[0].data).equal("3.1.0");
      expect(result.status).equal(ValidationStatus.Error);
      expect(result.specHash).to.equal(
        createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex")
      );

      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should return valid result is project type is Teams Ai, and OpenAPI spec version >= 3.1.0", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.1.0",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath, { projectType: ProjectType.TeamsAi });
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
      const result = await specParser.validate();
      expect(result.status).to.equal(ValidationStatus.Valid);
      expect(result.warnings).to.be.an("array").that.is.empty;
      expect(result.errors).to.be.an("array").that.is.empty;
      expect(result.specHash).to.equal(
        createHash("sha256").update(JSON.stringify(spec.servers)).digest("hex")
      );
      sinon.assert.calledOnce(dereferenceStub);
    });

    it("should throw a SpecParserError when an error occurs", async () => {
      const specPath = "path/to/spec";
      const spec = {
        openapi: "3.0.2",
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pet": {
            get: {
              tags: ["pet"],
              operationId: "getPet",
              summary: "Get pet information from the store",
              parameters: [
                {
                  name: "tags",
                  in: "query",
                  description: "Tags to filter by",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/xml": {
                      schema: {
                        $ref: "#/components/schemas/Pet",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      try {
        const specParser = new SpecParser(specPath);
        const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        const validateStub = sinon.stub(specParser.parser, "validate").resolves(spec as any);
        sinon.stub(SMEValidator.prototype, "validateSpec").throws(new Error("validateSpec error"));

        const result = await specParser.validate();
        expect.fail("Expected SpecParserError to be thrown");
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.ValidateFailed);
        expect(err.message).to.equal("Error: validateSpec error");
      }
    });
  });

  describe("generateForCopilot", () => {
    it("should throw an error if the signal is aborted", async () => {
      const manifestPath = "path/to/manifest";
      const filter = ["GET /pet/{petId}"];
      const specPath = "path/to/spec";
      const signal = { aborted: true } as AbortSignal;
      const specParser = new SpecParser("/path/to/spec.yaml");
      const pluginFilePath = "ai-plugin.json";

      try {
        await specParser.generateForCopilot(
          manifestPath,
          filter,
          specPath,
          pluginFilePath,
          undefined,
          signal
        );
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after loadSpec", async () => {
      const manifestPath = "path/to/manifest";
      const filter = ["GET /pet/{petId}"];
      const specPath = "path/to/spec";
      const adaptiveCardFolder = "path/to/adaptiveCardFolder";
      const pluginFilePath = "ai-plugin.json";

      try {
        const signal = { aborted: false } as any;

        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = { openapi: "3.0.0", paths: {} };

        const parseStub = sinon.stub(specParser as any, "loadSpec").callsFake(async () => {
          signal.aborted = true;
          return Promise.resolve();
        });
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        await specParser.generateForCopilot(
          manifestPath,
          filter,
          specPath,
          pluginFilePath,
          undefined,
          signal
        );
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after specFilter", async () => {
      try {
        const signal = { aborted: false } as any;

        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = { openapi: "3.0.0", paths: {} };
        const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        const specFilterStub = sinon
          .stub(SpecFilter, "specFilter")
          .callsFake((filter: string[], unResolveSpec: any) => {
            signal.aborted = true;
            return {} as any;
          });
        const outputFileStub = sinon.stub(fs, "outputFile").resolves();
        const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
        const JsyamlSpy = sinon.spy(jsyaml, "dump");
        const pluginFilePath = "ai-plugin.json";

        const filter = ["get /hello"];

        const outputSpecPath = "path/to/output.yaml";

        await specParser.generateForCopilot(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          pluginFilePath,
          undefined,
          signal
        );

        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after specFilter", async () => {
      try {
        const signal = { aborted: false } as any;

        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = { openapi: "3.0.0", paths: {} };
        const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        const specFilterStub = sinon.stub(SpecFilter, "specFilter").resolves();
        const outputFileStub = sinon.stub(fs, "outputFile").resolves();
        const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();

        const JsyamlSpy = sinon.stub(jsyaml, "dump").callsFake((obj) => {
          signal.aborted = true;
          return {} as any;
        });

        const filter = ["get /hello"];

        const outputSpecPath = "path/to/output.yaml";
        const pluginFilePath = "ai-plugin.json";

        await specParser.generateForCopilot(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          pluginFilePath,
          undefined,
          signal
        );

        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should generate a new spec and write it to a yaml file if spec contains api", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const updateManifestWithAiPluginStub = sinon
        .stub(ManifestUpdater, "updateManifestWithAiPlugin")
        .resolves([{}, {}, []] as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const pluginFilePath = "ai-plugin.json";
      const result = await specParser.generateForCopilot(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        pluginFilePath
      );

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(updateManifestWithAiPluginStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledTwice).to.be.true;
    });

    it("should return warning result if auth is not supported", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              security: [
                {
                  api_key: [],
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "cookie",
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns(spec as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const updateManifestWithAiPluginStub = sinon
        .stub(ManifestUpdater, "updateManifestWithAiPlugin")
        .resolves([{}, {}, []] as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const pluginFilePath = "ai-plugin.json";
      const result = await specParser.generateForCopilot(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        pluginFilePath
      );

      expect(result.allSuccess).to.be.true;
      expect(result.warnings.length).equals(1);
      expect(result.warnings[0].content).contains("Unsupported authorization type");
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(updateManifestWithAiPluginStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledTwice).to.be.true;
    });

    it("should contains warning if operation id contains special characters", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              operationId: "get/hello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: "post_hello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns(spec as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const updateManifestWithAiPluginStub = sinon
        .stub(ManifestUpdater, "updateManifestWithAiPlugin")
        .resolves([{}, {}, []] as any);

      const filter = ["get /hello", "post /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const pluginFilePath = "ai-plugin.json";
      const result = await specParser.generateForCopilot(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        pluginFilePath
      );

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(updateManifestWithAiPluginStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledTwice).to.be.true;
      expect(result.warnings.length).equals(1);
      expect(result.warnings[0].content).contains("get_hello");
    });

    it("should throw a SpecParserError if outputFile throws an error", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = { openapi: "3.0.0", paths: {} };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").resolves();
      const outputFileStub = sinon.stub(fs, "outputFile").throws(new Error("outputFile error"));
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JSONStringifySpy = sinon.spy(JSON, "stringify");
      const JsyamlSpy = sinon.spy(jsyaml, "dump");
      const manifestUpdaterStub = sinon.stub(ManifestUpdater, "updateManifest").resolves([] as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.json";
      const pluginFilePath = "ai-plugin.json";

      try {
        await specParser.generateForCopilot(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          pluginFilePath
        );
        expect.fail("Expected generate to throw a SpecParserError");
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.GenerateFailed);
        expect(err.message).to.equal("Error: outputFile error");
      }
    });

    it("should generate adaptivecard for existing plugin manifest", async () => {
      const pluginManifest = {
        schema_version: "1",
        name_for_human: "test",
        description_for_human: "test",
      };
      const pluginManifestWithAdaptiveCard = {
        schema_version: "1",
        name_for_human: "test",
        description_for_human: "test",
        functions: [
          {
            name: "test",
          },
        ],
      };
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").callsFake((path, data) => {
        if (path === "pluginFilePath") {
          expect(data.function).to.not.be.undefined;
          expect(data.function[0].name).to.equal("test");
        }
      });
      const JsyamlSpy = sinon.spy(jsyaml, "dump");
      sinon.stub(fs, "readJSON").resolves(pluginManifest);

      const updateManifestWithAiPluginStub = sinon
        .stub(ManifestUpdater, "updateManifestWithAiPlugin")
        .resolves([{}, pluginManifestWithAdaptiveCard, []] as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const pluginFilePath = "ai-plugin.json";
      const result = await specParser.generateForCopilot(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        pluginFilePath,
        "existingPluginManifest"
      );

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(updateManifestWithAiPluginStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledTwice).to.be.true;
    });

    it("should generate adaptive card and data files for functions with valid static_template", async () => {
      const manifestPath = "path/to/manifest.json";
      const outputSpecPath = "path/to/spec.json";
      const pluginFilePath = "C:\\fakepath\\ai-plugin.json";
      const filter = ["get /hello"];

      const fakeSpec = { openapi: "3.0.0", paths: {} };
      const fakeUnresolvedSpec = { paths: {} };

      const adaptiveCardContent = { foo: "bar" };
      const adaptiveCardData = { key: "value" };
      const fakeApiPlugin = {
        $schema: "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.2/schema.json",
        schema_version: "v2.2",
        name_for_human: "testsep22",
        description_for_human: "A simple service to manage repairs",
        functions: [
          {
            name: "testFunc",
            capabilities: {
              response_semantics: {
                data_path: "$.results",
                static_template: adaptiveCardContent,
              },
            },
          },
          {
            name: "testFunc1",
            capabilities: {
              response_semantics: {
                data_path: "$.results",
                static_template: adaptiveCardContent,
              },
            },
          },
          {
            name: "skipFunc",
            capabilities: {
              response_semantics: {
                data_path: "$.results",
                static_template: {},
              },
            },
          },
          {
            name: "noCapability",
          },
        ],
      };

      const fakeWarnings: any[] = [];
      const fakeJsonDataSet = {
        testFunc: adaptiveCardData,
      };

      sinon
        .stub(ManifestUpdater, "updateManifestWithAiPlugin")
        .resolves([{} as any, fakeApiPlugin, fakeWarnings, fakeJsonDataSet]);

      sinon
        .stub(SpecParser.prototype, "getFilteredSpecs")
        .resolves([fakeUnresolvedSpec as any, fakeSpec as any]);

      // Stub fs.outputJSON to capture calls
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();

      // Stub fs.existsSync to only return true for testFunc1
      const fsExistsSyncStub = sinon.stub(fs, "existsSync").callsFake((path) => {
        return path.toString().endsWith("testFunc1.json");
      });

      // Use a dummy instance (other flows will be stubbed so they are not executed)
      const specParser = new SpecParser("path/to/spec.yaml");

      await specParser.generateForCopilot(manifestPath, filter, outputSpecPath, pluginFilePath);

      const adaptiveCardFolder = path.join(path.dirname(pluginFilePath), "adaptiveCards");
      const expectedCardPath = path.join(adaptiveCardFolder, "testFunc.json");
      const expectedDataPath = path.join(adaptiveCardFolder, "testFunc.data.json");

      expect(fakeApiPlugin?.functions).to.deep.equal([
        {
          name: "testFunc",
          capabilities: {
            response_semantics: {
              data_path: "$.results",
              static_template: {
                file: "adaptiveCards/testFunc.json",
              },
            },
          },
        },
        {
          name: "testFunc1",
          capabilities: {
            response_semantics: {
              data_path: "$.results",
              static_template: {
                file: "adaptiveCards/testFunc11.json",
              },
            },
          },
        },
        {
          name: "skipFunc",
          capabilities: {
            response_semantics: {
              data_path: "$.results",
              static_template: {},
            },
          },
        },
        {
          name: "noCapability",
        },
      ]);

      sinon.assert.calledWith(outputJSONStub, expectedCardPath, adaptiveCardContent, { spaces: 4 });
      sinon.assert.calledWith(outputJSONStub, expectedDataPath, adaptiveCardData, { spaces: 4 });
    });

    it("should generate adaptive card and not override if AdaptiveCardUpdateStrategy is KeepExisting", async () => {
      const manifestPath = "path/to/manifest.json";
      const outputSpecPath = "path/to/spec.json";
      const pluginFilePath = "C:\\fakepath\\ai-plugin.json";
      const filter = ["get /hello"];

      const fakeSpec = { openapi: "3.0.0", paths: {} };
      const fakeUnresolvedSpec = { paths: {} };

      const adaptiveCardContent = { foo: "bar" };
      const adaptiveCardData = { key: "value" };
      const fakeApiPlugin = {
        $schema: "https://developer.microsoft.com/json-schemas/copilot/plugin/v2.2/schema.json",
        schema_version: "v2.2",
        name_for_human: "testsep22",
        description_for_human: "A simple service to manage repairs",
        functions: [
          {
            name: "testFunc",
            capabilities: {
              response_semantics: {
                data_path: "$.results",
                static_template: adaptiveCardContent,
              },
            },
          },
          {
            name: "testFunc2",
            capabilities: {
              response_semantics: {
                data_path: "$.results",
                static_template: adaptiveCardContent,
              },
            },
          },
        ],
      };

      const fakeWarnings: any[] = [];
      const fakeJsonDataSet = {
        testFunc: adaptiveCardData,
      };

      sinon
        .stub(ManifestUpdater, "updateManifestWithAiPlugin")
        .resolves([{} as any, fakeApiPlugin, fakeWarnings, fakeJsonDataSet]);

      sinon
        .stub(SpecParser.prototype, "getFilteredSpecs")
        .resolves([fakeUnresolvedSpec as any, fakeSpec as any]);

      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();

      const fsExistsSyncStub = sinon.stub(fs, "existsSync").callsFake((path) => {
        return path.toString().endsWith("testFunc.json");
      });

      const specParser = new SpecParser("path/to/spec.yaml");

      await specParser.generateForCopilot(
        manifestPath,
        filter,
        outputSpecPath,
        pluginFilePath,
        undefined,
        undefined,
        AdaptiveCardUpdateStrategy.KeepExisting
      );

      expect(fakeApiPlugin?.functions).to.deep.equal([
        {
          name: "testFunc",
          capabilities: {
            response_semantics: {
              data_path: "$.results",
              static_template: {
                file: "adaptiveCards/testFunc.json",
              },
            },
          },
        },
        {
          name: "testFunc2",
          capabilities: {
            response_semantics: {
              data_path: "$.results",
              static_template: {
                file: "adaptiveCards/testFunc2.json",
              },
            },
          },
        },
      ]);

      sinon.assert.callCount(outputJSONStub, 4);
    });
  });

  describe("generate", () => {
    it("should throw an error if the signal is aborted", async () => {
      const manifestPath = "path/to/manifest";
      const filter = ["GET /pet/{petId}"];
      const specPath = "path/to/spec";
      const adaptiveCardFolder = "path/to/adaptiveCardFolder";
      const signal = { aborted: true } as AbortSignal;
      const parser = new SpecParser("/path/to/spec.yaml");

      try {
        await parser.generate(manifestPath, filter, specPath, adaptiveCardFolder, signal);
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after loadSpec", async () => {
      const manifestPath = "path/to/manifest";
      const filter = ["GET /pet/{petId}"];
      const specPath = "path/to/spec";
      const adaptiveCardFolder = "path/to/adaptiveCardFolder";
      try {
        const signal = { aborted: false } as any;

        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = { openapi: "3.0.0", paths: {} };

        const parseStub = sinon.stub(specParser as any, "loadSpec").callsFake(async () => {
          signal.aborted = true;
          return Promise.resolve();
        });
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        await specParser.generate(manifestPath, filter, specPath, adaptiveCardFolder, signal);
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after specFilter", async () => {
      try {
        const signal = { aborted: false } as any;

        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = { openapi: "3.0.0", paths: {} };
        const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        const specFilterStub = sinon
          .stub(SpecFilter, "specFilter")
          .callsFake((filter: string[], unResolveSpec: any) => {
            signal.aborted = true;
            return {} as any;
          });
        const outputFileStub = sinon.stub(fs, "outputFile").resolves();
        const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
        const JsyamlSpy = sinon.spy(jsyaml, "dump");

        const filter = ["get /hello"];

        const outputSpecPath = "path/to/output.yaml";
        await specParser.generate(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          "path/to/adaptiveCardFolder",
          signal
        );
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should throw an error if the signal is aborted after generateAdaptiveCard", async () => {
      try {
        const specParser = new SpecParser("path/to/spec.yaml");
        const spec = {
          openapi: "3.0.0",
          paths: {
            "/hello": {
              get: {
                responses: {
                  200: {
                    content: {
                      "application/json": {
                        schema: {
                          type: "object",
                          properties: {
                            name: {
                              type: "string",
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        };
        const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
        const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
        const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
        const outputFileStub = sinon.stub(fs, "outputFile").resolves();
        const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
        const JsyamlSpy = sinon.spy(jsyaml, "dump");
        const signal = { aborted: false } as any;

        const manifestUpdaterStub = sinon
          .stub(ManifestUpdater, "updateManifest")
          .resolves({} as any);

        const generateAdaptiveCardStub = sinon
          .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
          .callsFake((operationItem: OpenAPIV3.OperationObject) => {
            signal.aborted = true;
            return {} as any;
          });

        const filter = ["get /hello"];

        const outputSpecPath = "path/to/output.yaml";
        await specParser.generate(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          "path/to/adaptiveCardFolder",
          signal
        );
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.CancelledMessage);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });

    it("should generate a new spec and write it to a yaml file if spec is empty", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = { openapi: "3.0.0", paths: {} };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([] as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      await specParser.generate(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        "path/to/adaptiveCardFolder"
      );

      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
    });

    it("should generate a new spec and write it to a yaml file if spec contains api", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              operationId: "helloApi",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
          {},
          [],
        ]);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        "path/to/adaptiveCardFolder"
      );

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledThrice).to.be.true;
    });

    it("should not return warning if schema is empty and not generate json data", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              operationId: "helloApi",
              responses: {
                200: {
                  content: {
                    "application/json": {},
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);

      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
          {},
          [],
        ]);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        "path/to/adaptiveCardFolder"
      );

      expect(result.allSuccess).to.be.true;
      expect(result.warnings.length).equals(0);
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledThrice).to.be.true;
    });

    it("should works fine if paths object contains description", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            description: "additional description",
            get: {
              operationId: "helloApi",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
          {},
          [],
        ]);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        "path/to/adaptiveCardFolder"
      );

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledThrice).to.be.true;
    });

    it("should works fine if paths object contains description for teams ai project", async () => {
      const specParser = new SpecParser("path/to/spec.yaml", { projectType: ProjectType.TeamsAi });
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            description: "additional description",
            get: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
          {},
          [],
        ]);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate("path/to/manifest.json", filter, outputSpecPath);

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledOnce).to.be.true;
      expect(generateAdaptiveCardStub.notCalled).to.be.true;
    });

    it("should throw error if contain multiple API key in spec", async () => {
      const specParser = new SpecParser("path/to/spec.yaml", { allowAPIKeyAuth: true });
      const spec = {
        openapi: "3.0.0",
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
            api_key2: {
              type: "apiKey",
              name: "api_key2",
              in: "header",
            },
          },
        },
        paths: {
          "/hello": {
            get: {
              operationId: "getHello",
              security: [
                {
                  api_key: [],
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              security: [
                {
                  api_key2: [],
                },
              ],
              operationId: "postHello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
          {},
          [],
        ]);

      const filter = ["get /hello", "post /hello"];

      const outputSpecPath = "path/to/output.yaml";
      try {
        await specParser.generate(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          "path/to/adaptiveCardFolder"
        );
        expect.fail("Expected generate to throw a SpecParserError");
      } catch (err) {
        expect((err as SpecParserError).message).contain(ConstantString.MultipleAuthNotSupported);
        expect((err as SpecParserError).errorType).to.equal(ErrorType.MultipleAuthNotSupported);
      }
    });

    it("should work if two api contains same auth", async () => {
      const specParser = new SpecParser("path/to/spec.yaml", { allowAPIKeyAuth: true });
      const spec = {
        openapi: "3.0.0",
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
          },
        },
        paths: {
          "/hello": {
            get: {
              operationId: "getHello",
              security: [
                {
                  api_key: [],
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              security: [
                {
                  api_key: [],
                },
              ],
              operationId: "postHello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
          {},
          [],
        ]);

      const filter = ["get /hello", "post /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate("path/to/manifest.json", filter, outputSpecPath);
      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledOnce).to.be.true;
      expect(generateAdaptiveCardStub.notCalled).to.be.true;
    });

    it("should work if contain multiple API key in spec when project Type is teams ai", async () => {
      const specParser = new SpecParser("path/to/spec.yaml", {
        allowAPIKeyAuth: true,
        projectType: ProjectType.TeamsAi,
      });
      const spec = {
        openapi: "3.0.0",
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
            api_key2: {
              type: "apiKey",
              name: "api_key2",
              in: "header",
            },
          },
        },
        paths: {
          "/hello": {
            get: {
              operationId: "getHello",
              security: [
                {
                  api_key: [],
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              security: [
                {
                  api_key2: [],
                },
              ],
              operationId: "postHello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns([
          {
            type: "AdaptiveCard",
            $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
            version: "1.5",
            body: [
              {
                type: "TextBlock",
                text: "id: ${id}",
                wrap: true,
              },
            ],
          },
          "$",
          {},
          [],
        ]);

      const filter = ["get /hello", "post /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate("path/to/manifest.json", filter, outputSpecPath);

      expect(result.allSuccess).to.be.true;
      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
      expect(outputJSONStub.calledOnce).to.be.true;
      expect(generateAdaptiveCardStub.notCalled).to.be.true;
    });

    it("should contain warnings if generate adaptive card failed", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const cloneSpec = JSON.parse(JSON.stringify(spec));
      cloneSpec.paths["/hello"].get.operationId = "getHello";
      const dereferenceStub = sinon
        .stub(specParser.parser, "dereference")
        .resolves(cloneSpec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns({} as any);
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JsyamlSpy = sinon.spy(jsyaml, "dump");

      const manifestUpdaterStub = sinon
        .stub(ManifestUpdater, "updateManifest")
        .resolves([{}, []] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .throws(new Error("generate adaptive card failed"));

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.yaml";
      const result = await specParser.generate(
        "path/to/manifest.json",
        filter,
        outputSpecPath,
        "path/to/adaptiveCardFolder"
      );

      expect(result.allSuccess).to.be.false;
      expect(result.warnings).to.deep.equal([
        {
          type: WarningType.GenerateCardFailed,
          content: "Error: generate adaptive card failed",
          data: "getHello",
        },
      ]);

      expect(JsyamlSpy.calledOnce).to.be.true;
      expect(specFilterStub.calledOnce).to.be.true;
      expect(outputFileStub.calledOnce).to.be.true;
      expect(manifestUpdaterStub.calledOnce).to.be.true;
      expect(outputFileStub.firstCall.args[0]).to.equal(outputSpecPath);
    });

    it("should throw a SpecParserError if outputFile throws an error", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = { openapi: "3.0.0", paths: {} };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").resolves();
      const outputFileStub = sinon.stub(fs, "outputFile").throws(new Error("outputFile error"));
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JSONStringifySpy = sinon.spy(JSON, "stringify");
      const JsyamlSpy = sinon.spy(jsyaml, "dump");
      const manifestUpdaterStub = sinon.stub(ManifestUpdater, "updateManifest").resolves([] as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns({} as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.json";

      try {
        await specParser.generate(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          "path/to/adaptiveCardFolder"
        );
        expect.fail("Expected generate to throw a SpecParserError");
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.GenerateFailed);
        expect(err.message).to.equal("Error: outputFile error");
      }
    });

    it("should throw a SpecParserError if specFilter throws a SpecParserError", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = { openapi: "3.0.0", paths: {} };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon
        .stub(SpecFilter, "specFilter")
        .throws(new SpecParserError("specFilter error", ErrorType.FilterSpecFailed));
      const outputFileStub = sinon.stub(fs, "outputFile").resolves();
      const outputJSONStub = sinon.stub(fs, "outputJSON").resolves();
      const JSONStringifySpy = sinon.spy(JSON, "stringify");
      const JsyamlSpy = sinon.spy(jsyaml, "dump");
      const manifestUpdaterStub = sinon.stub(ManifestUpdater, "updateManifest").resolves();
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .returns({} as any);

      const filter = ["get /hello"];

      const outputSpecPath = "path/to/output.json";

      try {
        await specParser.generate(
          "path/to/manifest.json",
          filter,
          outputSpecPath,
          "path/to/adaptiveCardFolder"
        );
        expect.fail("Expected generate to throw a SpecParserError");
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.FilterSpecFailed);
        expect(err.message).to.equal("specFilter error");
      }
    });
  });

  describe("list", () => {
    let envRestore: RestoreFn | undefined;
    afterEach(() => {
      if (envRestore) {
        envRestore();
        envRestore = undefined;
      }
    });

    it("should return a list of HTTP methods and paths for all GET with 1 parameter and without security", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath);
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
            BearerAuth: {
              type: "http",
              scheme: "bearer",
            },
          },
        },
        paths: {
          "/pets": {
            get: {
              operationId: "getPetById",
              description: "Get pet by id",
              summary: "Get pet",
              security: [{ api_key: [], BearerAuth: [] }],
            },
          },
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              description: "Get user by id",
              summary: "Get user",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: "createUser",
              security: [{ api_key: [] }],
            },
          },
          "/store/order": {
            post: {
              operationId: "placeOrder",
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /pets",
            server: "https://server1",
            operationId: "getPetById",
            auth: {
              authScheme: {
                type: "multipleAuth",
              },
              name: "api_key, BearerAuth",
            },
            reason: ["auth-type-is-not-supported", "response-json-is-empty", "no-parameter"],
            isValid: false,
            description: "Get pet by id",
            summary: "Get pet",
          },
          {
            api: "GET /user/{userId}",
            server: "https://server1",

            operationId: "getUserById",
            isValid: true,
            reason: [],
            description: "Get user by id",
            summary: "Get user",
          },
          {
            api: "POST /user/{userId}",
            auth: {
              authScheme: {
                in: "header",
                name: "api_key",
                type: "apiKey",
              },
              name: "api_key",
            },
            server: "https://server1",
            operationId: "createUser",
            reason: ["auth-type-is-not-supported", "response-json-is-empty", "no-parameter"],
            isValid: false,
            description: undefined,
            summary: undefined,
          },
          {
            api: "POST /store/order",
            server: "https://server1",
            operationId: "placeOrder",
            reason: ["response-json-is-empty", "no-parameter"],
            isValid: false,
            description: undefined,
            summary: undefined,
          },
        ],
        allAPICount: 4,
        validAPICount: 1,
      });
    });

    it("should generate an operationId if not exist", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath);
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            operationId: "getUserUserId",
            isValid: true,
            reason: [],
            description: undefined,
            summary: undefined,
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });

    it("should return correct server information", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowAPIKeyAuth: true });
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
          {
            url: "https://server2",
          },
        ],
        paths: {
          "/user/{userId}": {
            servers: [
              {
                url: "https://server3",
              },
              {
                url: "https://server4",
              },
            ],
            get: {
              servers: [
                {
                  url: "https://server5",
                },
                {
                  url: "https://server6",
                },
              ],
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server5",
            operationId: "getUserById",
            isValid: true,
            description: undefined,
            summary: undefined,
            reason: [],
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });

    it("should return a list of HTTP methods and paths for all GET with 1 parameter and api key auth security", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowAPIKeyAuth: true });
      const spec = {
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
          },
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              security: [{ api_key: [] }],
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: { type: "apiKey", name: "api_key", in: "header" },
              name: "api_key",
            },
            operationId: "getUserById",
            isValid: true,
            reason: [],
            description: undefined,
            summary: undefined,
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });

    it("should return a list of HTTP methods and paths for all GET with 1 parameter and bearer token auth security", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowBearerTokenAuth: true });
      const spec = {
        components: {
          securitySchemes: {
            bearerTokenAuth: {
              type: "http",
              scheme: "bearer",
            },
          },
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              security: [{ bearerTokenAuth: [] }],
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();
      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "http",
                scheme: "bearer",
              },
              name: "bearerTokenAuth",
            },
            operationId: "getUserById",
            isValid: true,
            reason: [],
            description: undefined,
            summary: undefined,
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });

    it("should return correct auth information", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowAPIKeyAuth: true });
      const spec = {
        components: {
          securitySchemes: {
            aad_auth: {
              type: "oauth2",
              flows: {
                implicit: {
                  authorizationUrl: "https://authorize",
                  scopes: {
                    "write:pets": "modify pets in your account",
                    "read:pets": "read your pets",
                  },
                },
              },
            },
            api_key1: {
              type: "apiKey",
              name: "api_key1",
              in: "header",
            },
            api_key2: {
              type: "apiKey",
              name: "api_key2",
              in: "header",
            },
          },
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              security: [
                { api_key1: [], api_key2: [], aad_auth: ["write:pets"] },
                { api_key2: [], api_key1: [], aad_auth: ["write:pets"] },
                { api_key1: [] },
                { api_key2: [] },
              ],
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              security: [
                { api_key1: [], api_key2: [], aad_auth: ["write:pets"] },
                { api_key2: [], api_key1: [], aad_auth: ["write:pets"] },
                { api_key2: [] },
                { api_key1: [] },
              ],
              operationId: "postUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "apiKey",
                name: "api_key1",
                in: "header",
              },
              name: "api_key1",
            },
            operationId: "getUserById",
            isValid: true,
            reason: [],
            description: undefined,
            summary: undefined,
          },
          {
            api: "POST /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "apiKey",
                name: "api_key1",
                in: "header",
              },
              name: "api_key1",
            },
            operationId: "postUserById",
            isValid: true,
            reason: [],
            description: undefined,
            summary: undefined,
          },
        ],
        allAPICount: 2,
        validAPICount: 2,
      });
    });

    it("should return correct auth information when auth is in the spec root", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowAPIKeyAuth: true });
      const spec = {
        components: {
          securitySchemes: {
            aad_auth: {
              type: "oauth2",
              flows: {
                implicit: {
                  authorizationUrl: "https://authorize",
                  scopes: {
                    "write:pets": "modify pets in your account",
                    "read:pets": "read your pets",
                  },
                },
              },
            },
            api_key1: {
              type: "apiKey",
              name: "api_key1",
              in: "header",
            },
            api_key2: {
              type: "apiKey",
              name: "api_key2",
              in: "header",
            },
          },
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        security: [
          { api_key1: [], api_key2: [], aad_auth: ["write:pets"] },
          { api_key2: [], api_key1: [], aad_auth: ["write:pets"] },
          { api_key1: [] },
          { api_key2: [] },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: "postUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "apiKey",
                name: "api_key1",
                in: "header",
              },
              name: "api_key1",
            },
            operationId: "getUserById",
            isValid: true,
            reason: [],
            description: undefined,
            summary: undefined,
          },
          {
            api: "POST /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "apiKey",
                name: "api_key1",
                in: "header",
              },
              name: "api_key1",
            },
            operationId: "postUserById",
            isValid: true,
            reason: [],
            description: undefined,
            summary: undefined,
          },
        ],
        allAPICount: 2,
        validAPICount: 2,
      });
    });

    it("should allow multiple parameters if allowMultipleParameters is true", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowMultipleParameters: true });
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                  required: true,
                },
                {
                  name: "name",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                  required: true,
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            operationId: "getUserById",
            isValid: true,
            reason: [],
            description: undefined,
            summary: undefined,
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });

    it("should not list api without operationId with allowMissingId is false", async () => {
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowMissingId: false });
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            operationId: "getUserUserId",
            isValid: false,
            reason: ["missing-operation-id"],
            description: undefined,
            summary: undefined,
          },
        ],
        allAPICount: 1,
        validAPICount: 0,
      });
    });

    it("should throw an error when the SwaggerParser library throws an error", async () => {
      const specPath = "invalid-spec.yaml";
      const specParser = new SpecParser(specPath);
      sinon.stub(SwaggerParser, "validate").rejects(new Error("Invalid specification"));
      const parseStub = sinon
        .stub(specParser.parser, "parse")
        .rejects(new Error("Invalid specification"));
      try {
        await specParser.list();
        expect.fail("Expected an error to be thrown");
      } catch (err) {
        expect((err as SpecParserError).message).contain("Invalid specification");
        expect((err as SpecParserError).errorType).to.equal(ErrorType.ListFailed);
      }
    });

    it("should throw an error when the spec doesn't contain server information", async () => {
      const specPath = "valid-spec.yaml";
      const spec = {
        paths: {
          "/pets": {
            get: {
              operationId: "getPetById",
              security: [{ api_key: [] }],
            },
          },
          "/user/{userId}": {
            get: {
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const specParser = new SpecParser(specPath);
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /pets",
            server: "",
            operationId: "getPetById",
            isValid: false,
            reason: ["no-server-information", "response-json-is-empty", "no-parameter"],
            description: undefined,
            summary: undefined,
          },
          {
            api: "GET /user/{userId}",
            server: "",
            operationId: "getUserUserId",
            isValid: false,
            reason: ["no-server-information"],
            description: undefined,
            summary: undefined,
          },
        ],
        allAPICount: 2,
        validAPICount: 0,
      });
    });

    it("should return correct domain when domain contains placeholder", async () => {
      envRestore = mockedEnv({
        ["SERVER_ENV"]: "https://server1",
      });
      const specPath = "valid-spec.yaml";
      const specParser = new SpecParser(specPath, { allowAPIKeyAuth: true });
      const spec = {
        components: {
          securitySchemes: {
            api_key: {
              type: "apiKey",
              name: "api_key",
              in: "header",
            },
          },
        },
        servers: [
          {
            url: "${{SERVER_ENV}}",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              security: [{ api_key: [] }],
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon
        .stub(specParser.parser, "dereference")
        .callsFake(async (api: string | OpenAPI.Document) => {
          expect((api as OpenAPIV3.Document).servers![0].url == "https://server1");
          return api as any;
        });

      const result = await specParser.list();

      expect(result).to.deep.equal({
        APIs: [
          {
            api: "GET /user/{userId}",
            server: "https://server1",
            auth: {
              authScheme: {
                type: "apiKey",
                name: "api_key",
                in: "header",
              },
              name: "api_key",
            },
            operationId: "getUserById",
            isValid: true,
            reason: [],
            description: undefined,
            summary: undefined,
          },
        ],
        allAPICount: 1,
        validAPICount: 1,
      });
    });
  });

  describe("getFilteredSpecs", () => {
    it("should throw an error if failed to parse the spec", async () => {
      const specParser = new SpecParser("path/to/spec.yaml");
      const spec = { openapi: "3.0.0", paths: {} };
      const parseStub = sinon.stub(specParser.parser, "parse").throws(new Error("parse error"));
      const filter = ["get /hello"];
      try {
        await specParser.getFilteredSpecs(filter);
        expect.fail("Expected generate to throw a SpecParserError");
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.GetSpecFailed);
        expect(err.message).to.equal("Error: parse error");
      }
    });

    it("should works fine when filter spec", async () => {
      const spec = {
        openapi: "3.0.2",
        info: {
          title: "User Service",
          version: "1.0.0",
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  description: "test",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: "postUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  description: "test",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            User: {
              type: "object",
            },
          },
        },
      };
      const specParser = new SpecParser(spec as any);

      const filter = ["get /user/{userId}"];
      const result = await specParser.getFilteredSpecs(filter);
      expect(result[0]).to.deep.equal({
        openapi: "3.0.2",
        info: {
          title: "User Service",
          version: "1.0.0",
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  description: "test",
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            User: {
              type: "object",
            },
          },
        },
      });
      expect(result[1]).to.deep.equal({
        openapi: "3.0.2",
        info: {
          title: "User Service",
          version: "1.0.0",
        },
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  required: true,
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                "200": {
                  description: "test",
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                      },
                    },
                  },
                },
              },
            },
          },
        },
        components: {
          schemas: {
            User: {
              type: "object",
            },
          },
        },
      });
    });
  });

  describe("generateAdaptiveCardInPlugin", () => {
    it("should generate adaptive card in plugin", async () => {
      const pluginManifest = {
        schema_version: "1",
        name_for_human: "test",
        description_for_human: "test",
        functions: [
          {
            name: "hello",
          },
        ],
      };
      const specParser = new SpecParser("path/to/spec.yaml", {
        isGptPlugin: true,
        allowAPIKeyAuth: false,
        projectType: ProjectType.Copilot,
        allowMethods: ["get"],
        allowResponseSemantics: true,
        allowConversationStarters: true,
      });
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              operationId: "hello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns(spec as any);
      const outputJSONStub = sinon.stub(fs, "outputJSON").callsFake((path, data) => {
        if (path === "pluginFilePath") {
          expect(data.functions).to.not.be.undefined;
          expect(data.functions[0].capabilities).to.not.be.undefined;
          expect(data.functions[0].capabilities.response_semantics).to.not.be.undefined;
        }
      });
      sinon.stub(fs, "readJSON").resolves(pluginManifest);

      const filter = ["get /hello"];
      await specParser.generateAdaptiveCardInPlugin("pluginFilePath", filter, undefined);
    });

    it("should not add ac if no openeration id found in plugin manifest", async () => {
      const pluginManifest = {
        schema_version: "1",
        name_for_human: "test",
        description_for_human: "test",
        functions: [
          {
            name: "hello2",
          },
        ],
      };
      const specParser = new SpecParser("path/to/spec.yaml", {
        isGptPlugin: true,
        allowAPIKeyAuth: false,
        projectType: ProjectType.Copilot,
        allowMethods: ["get"],
        allowResponseSemantics: true,
        allowConversationStarters: true,
      });
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              operationId: "hello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns(spec as any);
      sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const outputJSONStub = sinon.stub(fs, "outputJSON").callsFake((path, data) => {
        if (path === "pluginFilePath") {
          expect(data.functions).to.not.be.undefined;
          expect(data.functions[0].capabilities).to.be.undefined;
        }
      });
      sinon.stub(fs, "readJSON").resolves(pluginManifest);

      const filter = ["get /hello"];
      await specParser.generateAdaptiveCardInPlugin("pluginFilePath", filter, undefined);
    });

    it("should not generate ac if allowResponseSemantics is false", async () => {
      const pluginManifest = {
        schema_version: "1",
        name_for_human: "test",
        description_for_human: "test",
        functions: [
          {
            name: "hello",
          },
        ],
      };
      const specParser = new SpecParser("path/to/spec.yaml", {
        isGptPlugin: true,
        allowAPIKeyAuth: false,
        projectType: ProjectType.Copilot,
        allowMethods: ["get"],
        allowResponseSemantics: false,
        allowConversationStarters: true,
      });
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              operationId: "hello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns(spec as any);
      const outputJSONStub = sinon.stub(fs, "outputJSON").callsFake((path, data) => {
        if (path === "pluginFilePath") {
          expect(data.functions).to.not.be.undefined;
          expect(data.functions[0].capabilities).to.be.undefined;
        }
      });
      sinon.stub(fs, "readJSON").resolves(pluginManifest);

      const filter = ["get /hello"];
      await specParser.generateAdaptiveCardInPlugin("pluginFilePath", filter, undefined);
    });

    it("should throw error if failed to generate ac", async () => {
      const pluginManifest = {
        schema_version: "1",
        name_for_human: "test",
        description_for_human: "test",
        functions: [
          {
            name: "hello",
          },
        ],
      };
      const specParser = new SpecParser("path/to/spec.yaml", {
        isGptPlugin: true,
        allowAPIKeyAuth: false,
        projectType: ProjectType.Copilot,
        allowMethods: ["get"],
        allowResponseSemantics: true,
        allowConversationStarters: true,
      });
      const spec = {
        openapi: "3.0.0",
        paths: {
          "/hello": {
            get: {
              operationId: "hello",
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const specFilterStub = sinon.stub(SpecFilter, "specFilter").returns(spec as any);
      sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      const generateAdaptiveCardStub = sinon
        .stub(AdaptiveCardGenerator, "generateAdaptiveCard")
        .throws(new Error("generate ac error"));
      sinon.stub(fs, "readJSON").resolves(pluginManifest);

      const filter = ["get /hello"];
      try {
        await specParser.generateAdaptiveCardInPlugin("pluginFilePath", filter, undefined);
      } catch (err: any) {
        expect(err).to.be.instanceOf(SpecParserError);
        expect(err.errorType).to.equal(ErrorType.GenerateAdaptiveCardFailed);
        expect(err.message).to.equal("Error: generate ac error");
      }
    });
  });

  describe("addAuthScheme", () => {
    it("should add auth scheme to spec for api key auth", async () => {
      const specPath = "valid-spec.json";
      const specParser = new SpecParser(specPath);
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPetById",
              description: "Get pet by id",
              summary: "Get pet",
            },
          },
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              description: "Get user by id",
              summary: "Get user",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: "createUser",
            },
          },
          "/store/order": {
            post: {
              operationId: "placeOrder",
            },
          },
        },
      };
      const authScheme = {
        type: "apiKey",
        in: "header",
        name: "name",
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      sinon
        .stub(Utils, "getAuthSchemaObject")
        .returns(authScheme as OpenAPIV3.ApiKeySecurityScheme);
      sinon.stub(fs, "outputFile").callsFake((path, data) => {
        expect(path).to.equal(specPath);
        const dataJson = JSON.parse(data as string);
        expect(dataJson.components.securitySchemes["authName"]).to.deep.equal(authScheme);
        const paths = dataJson.paths;
        for (const path in paths) {
          const methods = paths[path];
          for (const method in methods) {
            const operationId = (methods as any)[method].operationId;
            if (operationId === "getUserById") {
              expect((methods as any)[method].security).to.deep.equal([
                {
                  authName: [],
                },
              ]);
            }
          }
        }
      });
      await specParser.addAuthScheme("authName", "api-key", {
        apis: ["getUserById"],
      });
    });

    it("should throw error if failed", async () => {
      const specPath = "valid-spec.json";
      const specParser = new SpecParser(specPath);
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPetById",
              description: "Get pet by id",
              summary: "Get pet",
            },
          },
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              description: "Get user by id",
              summary: "Get user",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: "createUser",
            },
          },
          "/store/order": {
            post: {
              operationId: "placeOrder",
            },
          },
        },
      };
      const authScheme = {
        type: "apiKey",
        in: "header",
        name: "name",
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      sinon.stub(Utils, "getAuthSchemaObject").throws(new Error("error"));
      try {
        await specParser.addAuthScheme("authName", "api-key", {
          apis: ["getUserById"],
        });
      } catch (error) {
        expect((error as SpecParserError).errorType).to.equal(ErrorType.AddAuthFailed);
      }
    });

    it("should throw error if aborted", async () => {
      const specPath = "valid-spec.json";
      const specParser = new SpecParser(specPath);
      const signal = { aborted: true } as AbortSignal;
      const spec = {
        servers: [
          {
            url: "https://server1",
          },
        ],
        paths: {
          "/pets": {
            get: {
              operationId: "getPetById",
              description: "Get pet by id",
              summary: "Get pet",
            },
          },
          "/user/{userId}": {
            get: {
              operationId: "getUserById",
              description: "Get user by id",
              summary: "Get user",
              parameters: [
                {
                  name: "userId",
                  in: "path",
                  schema: {
                    type: "string",
                  },
                },
              ],
              responses: {
                200: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          name: {
                            type: "string",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: "createUser",
            },
          },
          "/store/order": {
            post: {
              operationId: "placeOrder",
            },
          },
        },
      };
      const authScheme = {
        type: "apiKey",
        in: "header",
        name: "name",
      };
      const parseStub = sinon.stub(specParser.parser, "parse").resolves(spec as any);
      const dereferenceStub = sinon.stub(specParser.parser, "dereference").resolves(spec as any);
      try {
        await specParser.addAuthScheme(
          "authName",
          "api-key",
          {
            apis: ["getUserById"],
          },
          signal
        );
      } catch (error) {
        expect((error as SpecParserError).errorType).to.equal(ErrorType.Cancelled);
      }
    });
  });
});
