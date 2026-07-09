// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author yuqzho@microsoft.com
 */

import {
  AdaptiveCardGenerator,
  ErrorResult,
  ErrorType,
  SpecParser,
  Utils,
  ValidationStatus,
  WarningType,
} from "@microsoft/m365-spec-parser";
import {
  err,
  IComposeExtension,
  ok,
  Platform,
  PluginManifestSchema,
  SystemError,
  TeamsAppManifest,
} from "@microsoft/teamsfx-api";
import { fail } from "assert";
import axios from "axios";
import fs from "fs-extra";
import mockedEnv, { RestoreFn } from "mocked-env";
import { OpenAPIV3 } from "openapi-types";
import path from "path";
import { format } from "util";
import { assert, chai, vi } from "vitest";
import * as daSpecParser from "../../../../src/common/daSpecParser";
import {
  featureFlagManager,
  FeatureFlagName,
  FeatureFlags,
} from "../../../../src/common/featureFlags";
import { createContext, setTools } from "../../../../src/common/globalVars";
import { getLocalizedString } from "../../../../src/common/localizeUtils";
import * as commonUtils from "../../../../src/common/utils";
import { ActionInjector } from "../../../../src/component/configManager/actionInjector";
import { manifestUtils } from "../../../../src/component/driver/teamsApp/utils/ManifestUtils";
import { PluginManifestUtils } from "../../../../src/component/driver/teamsApp/utils/PluginManifestUtils";
import * as openApiSpecHelper from "../../../../src/component/generator/openApiSpec/helper";
import {
  formatValidationErrors,
  generateAdaptiveCardInPluginManifestForKiota,
  generateScaffoldingSummary,
  injectAuthAction,
  listPluginExistingOperations,
} from "../../../../src/component/generator/openApiSpec/helper";
import { pathUtils } from "../../../../src/component/utils/pathUtils";
import { DeclarativeAgentApiSpecOptionId, QuestionNames } from "../../../../src/question";
import { MockTools } from "../../../core/utils";
import { teamsManifest } from "./fakeData";

const tools = new MockTools();

describe("generateScaffoldingSummary", async () => {
  const sandbox = vi;

  beforeEach(() => {
    setTools(tools);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
  });
  it("no warnings", async () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const composeExtension: IComposeExtension = {
      composeExtensionType: "apiBased",
      commands: [
        { id: "command1", type: "query", apiResponseRenderingTemplateFile: "test", title: "" },
        { id: "command1", type: "action", title: "" },
      ],
    };
    const res = await generateScaffoldingSummary(
      [],
      {
        ...teamsManifest,
        composeExtensions: [composeExtension],
      },
      "path",
      undefined,
      ""
    );
    assert.equal(res.length, 0);
  });

  it("warnings about missing property", async () => {
    const res = await generateScaffoldingSummary(
      [],
      {
        ...teamsManifest,
        name: { short: "", full: "" },
        description: { short: "", full: "" },
      },
      "path",
      undefined,
      ""
    );

    assert.isTrue(
      res.includes(
        getLocalizedString(
          "core.copilotPlugin.scaffold.summary.warning.teamsManifest.missingFullDescription"
        )
      )
    );
  });

  it("warnings if exceeding length", async () => {
    const invalidShortName = "a".repeat(65);
    const invalidFullName = "a".repeat(101);
    const invalidShortDescription = "a".repeat(101);
    const invalidFullDescription = "a".repeat(4001);
    const res = await generateScaffoldingSummary(
      [],
      {
        ...teamsManifest,
        name: { short: invalidShortName, full: invalidFullName },
        description: { short: invalidShortDescription, full: invalidFullDescription },
      },
      "path",
      undefined,
      ""
    );
    assert.isTrue(res.includes("name/short"));
  });

  it("no warnings if exceeding length with placeholder in short name", async () => {
    const shortName = "testdebug09051${{APP_NAME_SUFFIX}}";
    const res = await generateScaffoldingSummary(
      [],
      {
        ...teamsManifest,
        name: { short: shortName, full: "full" },
        description: { short: "short", full: "full" },
      },
      "path",
      undefined,
      ""
    );
    assert.equal(res.length, 0);
  });

  it("warnings about API spec", async () => {
    const res = await generateScaffoldingSummary(
      [{ type: WarningType.OperationIdMissing, content: "content" }],
      teamsManifest,
      "path",
      undefined,
      ""
    );

    assert.isTrue(res.includes("content"));
  });

  it("warnings about operationid contains special characters", async () => {
    const res = await generateScaffoldingSummary(
      [
        {
          type: WarningType.OperationIdContainsSpecialCharacters,
          content:
            "Operation id 'user/repo' contained special characters and was renamed to 'user_repo'.",
          data: "user/repo",
        },
        {
          type: WarningType.OperationIdContainsSpecialCharacters,
          content:
            "Operation id 'user/issue' contained special characters and was renamed to 'user_issue'.",
          data: "user/issue",
        },
      ],
      teamsManifest,
      "path",
      undefined,
      ""
    );
    assert.isTrue(res.includes("user_repo"));
    assert.isTrue(res.includes("user_issue"));
  });

  it("warnings about spec version", async () => {
    const res = await generateScaffoldingSummary(
      [
        {
          type: WarningType.ConvertSwaggerToOpenAPI,
          content: "Convert swagger to openapi 3.0",
        },
        {
          type: WarningType.OpenAPI31ConvertTo30,
          content: "Convert openapi 3.1 to openapi 3.0",
        },
      ],
      teamsManifest,
      "path",
      undefined,
      ""
    );
    assert.isTrue(res.includes("Swagger") && res.includes("3.1"));
  });

  it("warnings about adaptive card template in manifest", async () => {
    const composeExtension: IComposeExtension = {
      composeExtensionType: "apiBased",
      commands: [{ id: "command1", type: "query", title: "" }],
    };
    const res = await generateScaffoldingSummary(
      [],
      {
        ...teamsManifest,
        composeExtensions: [composeExtension],
      },
      "path",
      undefined,
      ""
    );

    assert.isTrue(res.includes("apiResponseRenderingTemplateFile"));
  });

  it("warnings about missing adaptive card template", async () => {
    const composeExtension: IComposeExtension = {
      composeExtensionType: "apiBased",
      commands: [
        { id: "command1", type: "query", apiResponseRenderingTemplateFile: "", title: "" },
      ],
    };
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const res = await generateScaffoldingSummary(
      [{ type: WarningType.GenerateCardFailed, content: "test", data: "command1" }],
      {
        ...teamsManifest,
        composeExtensions: [composeExtension],
      },
      "path",
      undefined,
      ""
    );

    assert.isTrue(res.includes("apiResponseRenderingTemplateFile"));
    assert.isTrue(res.includes("test"));
  });

  it("warnings about command parameters", async () => {
    const composeExtension: IComposeExtension = {
      composeExtensionType: "apiBased",
      apiSpecificationFile: "testApiFile",
      commands: [
        {
          id: "getAll",
          type: "query",
          title: "",
          apiResponseRenderingTemplateFile: "apiResponseRenderingTemplateFile",
          parameters: [
            {
              name: "test",
              title: "test",
            },
          ],
        },
      ],
    };
    const res = await generateScaffoldingSummary(
      [{ type: WarningType.OperationOnlyContainsOptionalParam, content: "", data: "getAll" }],
      {
        ...teamsManifest,
        composeExtensions: [composeExtension],
      },
      "path",
      undefined,
      ""
    );

    assert.isTrue(res.includes("testApiFile"));
  });

  it("warnings about command parameters with some properties missing", async () => {
    const composeExtension: IComposeExtension = {
      composeExtensionType: "apiBased",
      commands: [
        {
          id: "getAll",
          type: "query",
          title: "",
          apiResponseRenderingTemplateFile: "apiResponseRenderingTemplateFile",
          parameters: [],
        },
      ],
    };
    const res = await generateScaffoldingSummary(
      [{ type: WarningType.OperationOnlyContainsOptionalParam, content: "", data: "getAll" }],
      {
        ...teamsManifest,
        composeExtensions: [composeExtension],
      },
      "path",
      undefined,
      ""
    );

    assert.isFalse(res.includes("testApiFile"));
  });
});

describe("isJsonSpecFile", () => {
  beforeEach(() => {
    setTools(tools);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("should return true for a valid JSON file", async () => {
    const result = await commonUtils.isJsonSpecFile("test.json");
    chai.expect(result).to.be.true;
  });

  it("should return false for an yaml file", async () => {
    const result = await commonUtils.isJsonSpecFile("test.yaml");
    chai.expect(result).to.be.false;
  });

  it("should handle local json files", async () => {
    const readFileStub = vi.spyOn(fs, "readFile").mockResolvedValue('{"name": "test"}' as any);
    const result = await commonUtils.isJsonSpecFile("path/to/localfile");
    chai.expect(result).to.be.true;
  });

  it("should handle remote files", async () => {
    const axiosStub = vi.spyOn(axios, "get").mockResolvedValue({ data: '{"name": "test"}' });
    const result = await commonUtils.isJsonSpecFile("http://example.com/remotefile");
    chai.expect(result).to.be.true;
  });

  it("should return false if it is a yaml file", async () => {
    const readFileStub = vi.spyOn(fs, "readFile").mockResolvedValue("openapi: 3.0.0" as any);
    const result = await commonUtils.isJsonSpecFile("path/to/localfile");
    chai.expect(result).to.be.false;
  });
});

describe("formatValidationErrors", () => {
  it("format validation errors from spec parser", () => {
    const errors: ErrorResult[] = [
      {
        type: ErrorType.SpecNotValid,
        content: "test",
      },
      {
        type: ErrorType.SpecNotValid,
        content: "ResolverError: Error downloading",
      },
      {
        type: ErrorType.RemoteRefNotSupported,
        content: "test",
      },
      {
        type: ErrorType.NoServerInformation,
        content: "test",
      },
      {
        type: ErrorType.UrlProtocolNotSupported,
        content: "protocol",
        data: "http",
      },
      {
        type: ErrorType.RelativeServerUrlNotSupported,
        content: "test",
      },
      {
        type: ErrorType.NoSupportedApi,
        content: "test",
        data: [],
      },
      {
        type: ErrorType.NoSupportedApi,
        content: "test",
        data: [
          {
            api: "GET /api",
            reason: [
              ErrorType.AuthTypeIsNotSupported,
              ErrorType.MissingOperationId,
              ErrorType.PostBodyContainMultipleMediaTypes,
              ErrorType.ResponseContainMultipleMediaTypes,
              ErrorType.ResponseJsonIsEmpty,
              ErrorType.MethodNotAllowed,
              ErrorType.UrlPathNotExist,
            ],
          },
          {
            api: "GET /api2",
            reason: [
              ErrorType.PostBodyContainsRequiredUnsupportedSchema,
              ErrorType.ParamsContainRequiredUnsupportedSchema,
              ErrorType.ExceededRequiredParamsLimit,
              ErrorType.NoParameter,
              ErrorType.NoAPIInfo,
              ErrorType.CircularReferenceNotSupported,
            ],
          },
          { api: "GET /api3", reason: ["unknown"] },
        ],
      },
      {
        type: ErrorType.NoExtraAPICanBeAdded,
        content: "test",
      },
      {
        type: ErrorType.ResolveServerUrlFailed,
        content: "resolveurl",
      },
      {
        type: ErrorType.Cancelled,
        content: "test",
      },
      {
        type: ErrorType.SwaggerNotSupported,
        content: "test",
      },
      {
        type: ErrorType.SpecVersionNotSupported,
        content: "test",
        data: "3.1.0",
      },
      {
        type: ErrorType.Unknown,
        content: "unknown",
      },
      {
        type: ErrorType.AddedAPINotInOriginalSpec,
        content: "test",
      },
    ];

    const res = formatValidationErrors(errors, {
      platform: Platform.VSCode,
      [QuestionNames.ManifestPath]: "testmanifest.json",
    });

    chai.expect(res[0].content).equals("test");
    chai.expect(res[1].content).includes(getLocalizedString("core.common.ErrorFetchApiSpec"));
    chai.expect(res[2].content).equals("test");
    chai.expect(res[3].content).equals(getLocalizedString("core.common.NoServerInformation"));
    chai
      .expect(res[4].content)
      .equals(getLocalizedString("core.common.UrlProtocolNotSupported", "http"));
    chai
      .expect(res[5].content)
      .equals(getLocalizedString("core.common.RelativeServerUrlNotSupported"));
    chai
      .expect(res[6].content)
      .equals(
        getLocalizedString(
          "core.common.NoSupportedApi",
          getLocalizedString("core.common.invalidReason.NoAPIs")
        )
      );

    const errorMessage1 = [
      getLocalizedString("core.common.invalidReason.AuthTypeIsNotSupported"),
      getLocalizedString("core.common.invalidReason.MissingOperationId"),
      getLocalizedString("core.common.invalidReason.PostBodyContainMultipleMediaTypes"),
      getLocalizedString("core.common.invalidReason.ResponseContainMultipleMediaTypes"),
      getLocalizedString("core.common.invalidReason.ResponseJsonIsEmpty"),
      getLocalizedString("core.common.invalidReason.MethodNotAllowed"),
      getLocalizedString("core.common.invalidReason.UrlPathNotExist"),
    ];
    const errorMessage2 = [
      getLocalizedString("core.common.invalidReason.PostBodyContainsRequiredUnsupportedSchema"),
      getLocalizedString("core.common.invalidReason.ParamsContainRequiredUnsupportedSchema"),
      getLocalizedString("core.common.invalidReason.ExceededRequiredParamsLimit"),
      getLocalizedString("core.common.invalidReason.NoParameter"),
      getLocalizedString("core.common.invalidReason.NoAPIInfo"),
      getLocalizedString("core.common.invalidReason.CircularReference"),
    ];

    chai
      .expect(res[7].content)
      .equals(
        getLocalizedString(
          "core.common.NoSupportedApi",
          "GET /api: " +
            errorMessage1.join(", ") +
            "\n" +
            "GET /api2: " +
            errorMessage2.join(", ") +
            "\n" +
            "GET /api3: unknown"
        )
      );
    chai.expect(res[8].content).equals(getLocalizedString("error.apime.noExtraAPICanBeAdded"));
    chai.expect(res[9].content).equals("resolveurl");
    chai.expect(res[10].content).equals(getLocalizedString("core.common.CancelledMessage"));
    chai.expect(res[11].content).equals(getLocalizedString("core.common.SwaggerNotSupported"));
    chai
      .expect(res[12].content)
      .equals(format(getLocalizedString("core.common.SpecVersionNotSupported"), res[12].data));
    chai.expect(res[13].content).equals("unknown");
    chai
      .expect(res[14].content)
      .equals(getLocalizedString("core.common.AddedAPINotInOriginalSpec"));
  });

  it("format validation errors from spec parser: copilot", () => {
    const errors: ErrorResult[] = [
      {
        type: ErrorType.NoSupportedApi,
        content: "test",
        data: [
          {
            api: "GET /api",
            reason: [
              ErrorType.AuthTypeIsNotSupported,
              ErrorType.MissingOperationId,
              ErrorType.PostBodyContainMultipleMediaTypes,
              ErrorType.ResponseContainMultipleMediaTypes,
              ErrorType.ResponseJsonIsEmpty,
              ErrorType.MethodNotAllowed,
              ErrorType.UrlPathNotExist,
            ],
          },
          {
            api: "GET /api2",
            reason: [
              ErrorType.PostBodyContainsRequiredUnsupportedSchema,
              ErrorType.ParamsContainRequiredUnsupportedSchema,
              ErrorType.ExceededRequiredParamsLimit,
              ErrorType.NoParameter,
              ErrorType.NoAPIInfo,
            ],
          },
          { api: "GET /api3", reason: ["unknown"] },
        ],
      },
      {
        type: ErrorType.NoExtraAPICanBeAdded,
        content: "test",
      },
    ];

    const res = formatValidationErrors(errors, {
      platform: Platform.VSCode,
      [QuestionNames.ActionType]: DeclarativeAgentApiSpecOptionId,
    });

    const errorMessage1 = [
      getLocalizedString("core.common.invalidReason.AuthTypeIsNotSupported"),
      getLocalizedString("core.common.invalidReason.MissingOperationId"),
      getLocalizedString("core.common.invalidReason.PostBodyContainMultipleMediaTypes"),
      getLocalizedString("core.common.invalidReason.ResponseContainMultipleMediaTypes"),
      getLocalizedString("core.common.invalidReason.ResponseJsonIsEmpty"),
      getLocalizedString("core.common.invalidReason.MethodNotAllowed"),
      getLocalizedString("core.common.invalidReason.UrlPathNotExist"),
    ];
    const errorMessage2 = [
      getLocalizedString("core.common.invalidReason.PostBodyContainsRequiredUnsupportedSchema"),
      getLocalizedString("core.common.invalidReason.ParamsContainRequiredUnsupportedSchema"),
      getLocalizedString("core.common.invalidReason.ExceededRequiredParamsLimit"),
      getLocalizedString("core.common.invalidReason.NoParameter"),
      getLocalizedString("core.common.invalidReason.NoAPIInfo"),
    ];

    chai
      .expect(res[0].content)
      .equals(
        getLocalizedString(
          "core.common.NoSupportedApiCopilot",
          "GET /api: " +
            errorMessage1.join(", ") +
            "\n" +
            "GET /api2: " +
            errorMessage2.join(", ") +
            "\n" +
            "GET /api3: unknown"
        )
      );
    chai.expect(res[1].content).equals(getLocalizedString("error.copilot.noExtraAPICanBeAdded"));
  });
});

describe("injectAuthAction", async () => {
  const sandbox = vi;
  beforeEach(() => {
    vi.spyOn(pathUtils, "getYmlFilePath").mockReturnValue("m365agents.yml");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("api key auth", async () => {
    vi.spyOn(fs, "pathExists")
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    vi.spyOn(Utils, "isBearerTokenAuth").mockReturnValue(true);
    const injectStub = vi
      .spyOn(ActionInjector, "injectCreateAPIKeyAction")
      .mockResolvedValue(undefined);
    const res = await injectAuthAction(
      "oauth",
      "test",
      { scheme: "", type: "http" },
      "test",
      false
    );

    assert.isUndefined(res);
    assert.isTrue(injectStub.mock.calls.length === 2);
  });

  it("api key auth: no local yaml", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(Utils, "isBearerTokenAuth").mockReturnValue(true);
    const injectStub = vi
      .spyOn(ActionInjector, "injectCreateAPIKeyAction")
      .mockResolvedValue(undefined);
    const res = await injectAuthAction(
      "oauth",
      "test",
      { scheme: "", type: "http" },
      "test",
      false
    );

    assert.isUndefined(res);
    assert.isTrue(injectStub.mock.calls.length === 1);
  });

  it("oauth auth", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(Utils, "isOAuthWithAuthCodeFlow").mockReturnValue(true);
    const injectStub = vi
      .spyOn(ActionInjector, "injectCreateOAuthAction")
      .mockResolvedValue(undefined);
    const res = await injectAuthAction(
      "oauth",
      "test",
      { scheme: "", type: "http" },
      "test",
      false
    );

    assert.isUndefined(res);
    assert.isTrue(injectStub.mock.calls.length === 2);
  });

  it("oauth auth: no local yaml", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);
    vi.spyOn(Utils, "isOAuthWithAuthCodeFlow").mockReturnValue(true);
    const injectStub = vi
      .spyOn(ActionInjector, "injectCreateOAuthAction")
      .mockResolvedValue(undefined);
    const res = await injectAuthAction(
      "oauth",
      "test",
      { scheme: "", type: "http" },
      "test",
      false
    );

    assert.isUndefined(res);
    assert.isTrue(injectStub.mock.calls.length === 1);
  });

  it("api key auth from authType", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    // vi.spyOn(Utils, "isBearerTokenAuth").mockReturnValue(true);
    const injectStub = vi
      .spyOn(ActionInjector, "injectCreateAPIKeyAction")
      .mockResolvedValue(undefined);
    const res = await injectAuthAction(
      "oauth",
      "test",
      undefined,
      "test",
      false,
      "ApiKeyPluginVault"
    );

    assert.isUndefined(res);
    assert.isTrue(injectStub.mock.calls.length === 2);
  });

  it("oauth auth from authType", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    const injectStub = vi
      .spyOn(ActionInjector, "injectCreateOAuthAction")
      .mockResolvedValue(undefined);
    const res = await injectAuthAction(
      "oauth",
      "test",
      undefined,
      "test",
      false,
      "OAuthPluginVault"
    );

    assert.isUndefined(res);
    assert.isTrue(injectStub.mock.calls.length === 2);
  });
});

describe("listPluginExistingOperations", () => {
  const teamsManifestWithPlugin: TeamsAppManifest = {
    ...teamsManifest,
    copilotExtensions: {
      plugins: [
        {
          file: "resources/plugin.json",
          id: "plugin1",
        },
      ],
    },
  };

  const sandbox = vi;
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("success", async () => {
    vi.spyOn(
      PluginManifestUtils.prototype,
      "getApiSpecFilePathFromTeamsManifest"
    ).mockResolvedValue(ok(["openapi.yaml"]));
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );

    vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
      status: ValidationStatus.Valid,
      warnings: [],
      errors: [],
    });
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "api1",
          server: "https://test",
          operationId: "get",
          auth: {
            name: "test",
            authScheme: {
              type: "http",
              scheme: "bearer",
            },
          },
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 1,
    });
    const res = await listPluginExistingOperations(
      teamsManifestWithPlugin,
      "manifestPath",
      "openapi.yaml"
    );
    chai.expect(res).to.be.deep.equal(["api1"]);
  });

  it("get api spec error", async () => {
    vi.spyOn(
      PluginManifestUtils.prototype,
      "getApiSpecFilePathFromTeamsManifest"
    ).mockResolvedValue(
      err(new SystemError("getApiSpecFilePathFromTeamsManifest", "name", "", ""))
    );

    let hasException = false;

    try {
      await listPluginExistingOperations(teamsManifestWithPlugin, "manifestPath", "openapi.yaml");
    } catch (e) {
      hasException = true;
      chai.expect(e.source).equal("getApiSpecFilePathFromTeamsManifest");
    }
    chai.expect(hasException).to.be.true;
  });

  it("openapi is not referenced for plugin", async () => {
    vi.spyOn(
      PluginManifestUtils.prototype,
      "getApiSpecFilePathFromTeamsManifest"
    ).mockResolvedValue(ok(["openapi.yaml"]));
    let hasException = false;

    try {
      await listPluginExistingOperations(teamsManifestWithPlugin, "manifestPath", "notexist.yaml");
    } catch (e) {
      hasException = true;
      chai.expect(e.source).equal("listPluginExistingOperations");
      chai.expect(e.name).equal("api-spec-not-used-in-plugin");
    }
    chai.expect(hasException).to.be.true;
  });
});

describe("updateForCustomApi", async () => {
  const sandbox = vi;
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "My API",
      version: "1.0.0",
    },
    description: "test",
    paths: {
      "/hello": {
        get: {
          operationId: "getHello",
          summary: "Returns a greeting",
          parameters: [
            {
              name: "query",
              in: "query",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "A greeting message",
              content: {
                "application/json": {
                  schema: {
                    type: "string",
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: "createPet",
          summary: "Create a pet",
          description: "Create a new pet in the store",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: {
                      type: "string",
                      description: "Name of the pet",
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  } as OpenAPIV3.Document;

  const manifest: TeamsAppManifest = {
    manifestVersion: "version",
    id: "mock-app-id",
    name: { short: "short-name" },
    description: { short: "", full: "" },
    version: "version",
    icons: { outline: "outline.png", color: "color.png" },
    accentColor: "#ffffff",
    developer: {
      privacyUrl: "",
      websiteUrl: "",
      termsOfUseUrl: "",
      name: "developer-name",
    },
    bots: [
      {
        botId: "${{BOT_ID}}",
        scopes: ["personal", "team", "groupChat"],
        supportsFiles: false,
        isNotificationOnly: false,
      },
    ],
    validDomains: ["valid-domain"],
  };

  let mockedEnvRestore: RestoreFn | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });

  it("happy path: ts", async () => {
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));

    vi.spyOn(manifestUtils, "_writeAppManifest").mockImplementation(
      async (updatedManifest, manifestPath) => {
        chai.expect(manifestPath.replace(/\\/g, "/")).to.be.equal("path/appPackage/manifest.json");
        chai
          .expect(updatedManifest.bots![0].commandLists![0].commands[0].title)
          .to.be.equal("Returns a greeting");
        chai
          .expect(updatedManifest.bots![0].commandLists![0].commands[1].title)
          .to.be.equal("Create a pet");
        return ok(undefined);
      }
    );
    await openApiSpecHelper.updateForCustomApi(spec, "typescript", "path", "openapi.yaml");
  });

  it("happy path: ts with cea enabled", async () => {
    mockedEnvRestore = mockedEnv({
      [FeatureFlagName.CEAEnabled]: "true",
    });
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));

    vi.spyOn(manifestUtils, "_writeAppManifest").mockImplementation(
      async (updatedManifest, manifestPath) => {
        chai.expect(manifestPath.replace(/\\/g, "/")).to.be.equal("path/appPackage/manifest.json");
        chai
          .expect(updatedManifest.bots![0].commandLists![0].scopes)
          .deep.equal(["personal", "copilot"]);
        chai
          .expect(updatedManifest.bots![0].commandLists![0].commands[0].title)
          .to.be.equal("Returns a greeting");
        chai
          .expect(updatedManifest.bots![0].commandLists![0].commands[1].title)
          .to.be.equal("Create a pet");
        return ok(undefined);
      }
    );
    await openApiSpecHelper.updateForCustomApi(spec, "typescript", "path", "openapi.yaml");
  });

  it("read manifest failed", async () => {
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(
      err(new SystemError("test", "", "", ""))
    );
    try {
      await openApiSpecHelper.updateForCustomApi(spec, "typescript", "path", "openapi.yaml");
      assert.fail("should throw error");
    } catch (e) {
      chai.expect(e.source).to.be.equal("test");
    }
  });

  it("happy path: should contain warning if generate adaptive card failed", async () => {
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );

    vi.spyOn(AdaptiveCardGenerator, "generateAdaptiveCard").mockImplementation(() => {
      throw new Error("generate adaptive card failed");
    });

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));

    const result = await openApiSpecHelper.updateForCustomApi(
      spec,
      "typescript",
      "path",
      "openapi.yaml"
    );

    chai.expect(result).to.be.deep.equal([
      {
        type: WarningType.GenerateCardFailed,
        content:
          "Failed to create the adaptive card for API 'getHello': generate adaptive card failed. Mitigation: Not required but you can manually add it to the adaptiveCards folder.",
        data: "getHello",
      },
      {
        type: WarningType.GenerateCardFailed,
        content:
          "Failed to create the adaptive card for API 'createPet': generate adaptive card failed. Mitigation: Not required but you can manually add it to the adaptiveCards folder.",
        data: "createPet",
      },
    ]);
  });

  it("happy path: js", async () => {
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.js")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.js")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));

    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));

    await openApiSpecHelper.updateForCustomApi(spec, "javascript", "path", "openapi.yaml");
  });

  it("happy path: should contain warning if generate adaptive card data failed", async () => {
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );

    vi.spyOn(AdaptiveCardGenerator, "generateAdaptiveCard").mockReturnValue([
      {
        type: "AdaptiveCard",
        $schema: "https://adaptivecards.io/schemas/adaptive-card.json",
        version: "1.5",
        body: [
          {
            type: "TextBlock",
            text: "name: ${if(name, name, 'N/A')}",
            wrap: true,
          },
        ],
      },
      "$",
      {},
      [{ type: WarningType.GenerateJsonDataFailed, content: "generate json data failed" }],
    ]);

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));

    const result = await openApiSpecHelper.updateForCustomApi(
      spec,
      "typescript",
      "path",
      "openapi.yaml"
    );

    chai.expect(result).to.be.deep.equal([
      {
        type: WarningType.GenerateJsonDataFailed,
        content:
          "Failed to create the adaptive card mock data for API 'getHello': generate json data failed. Mitigation: Not required but you can manually add it to the adaptiveCards folder.",
        data: "getHello",
      },
      {
        type: WarningType.GenerateJsonDataFailed,
        content:
          "Failed to create the adaptive card mock data for API 'createPet': generate json data failed. Mitigation: Not required but you can manually add it to the adaptiveCards folder.",
        data: "createPet",
      },
    ]);
  });

  it("happy path: js", async () => {
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    await openApiSpecHelper.updateForCustomApi(spec, "javascript", "path", "openapi.yaml");
  });

  it("happy path: python", async () => {
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file == path.join("path", "src", "prompts", "chat", "skprompt.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "prompts", "chat", "actions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file == path.join("path", "src", "bot.py")) {
        chai.expect(data).to.contains(`@bot_app.ai.action("getHello")`);
        chai.expect(data).not.to.contains("{{");
        chai.expect(data).not.to.contains("# Replace with action code");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from("test code # Replace with action code {{OPENAPI_SPEC_PATH}}")
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    await openApiSpecHelper.updateForCustomApi(spec, "python", "path", "openapi.yaml");
  });

  it("happy path: csharp", async () => {
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file == path.join("path", "APIActions.cs")) {
        chai.expect(data).to.contains(`[Action("getHello")]`);
        chai.expect(data).to.contains(`public async Task<string> GetHelloAsync`);
        chai.expect(data).to.contains("openapi.yaml");
        chai.expect(data).not.to.contains("{{");
        chai.expect(data).not.to.contains("# Replace with action code");
      }

      if (file.toString().endsWith("actions.json")) {
        chai.expect(file == path.join("path", "prompts", "Chat", "actions.json")).to.be.true;
      }

      if (file.toString().endsWith("skprompt.txt")) {
        chai.expect(file == path.join("path", "prompts", "Chat", "skprompt.txt")).to.be.true;
      }

      if (file.toString().endsWith("getHello.json")) {
        chai.expect(file == path.join("path", "adaptiveCards", "getHello.json")).to.be.true;
      }
    });

    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from("test code // Replace with action code {{OPENAPI_SPEC_PATH}}")
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    //sandbox fs.readdir(destinationPath)
    vi.spyOn(fs, "readdir").mockResolvedValue(["MyApp.csproj"] as any);
    await openApiSpecHelper.updateForCustomApi(spec, "csharp", "path", "openapi.yaml");
  });

  it("unknown language: unknown", async () => {
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file == path.join("path", "APIActions.cs")) {
        fail("actions.json should not be created for unknown language");
      }

      if (file.toString().endsWith("actions.json")) {
        fail("actions.json should not be created for unknown language");
      }

      if (file.toString().endsWith("skprompt.txt")) {
        fail("actions.json should not be created for unknown language");
      }

      if (file.toString().endsWith("getHello.json")) {
        fail("actions.json should not be created for unknown language");
      }
    });

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from("test code // Replace with action code {{OPENAPI_SPEC_PATH}}")
    );
    await openApiSpecHelper.updateForCustomApi(spec, "unknown", "path", "openapi.yaml");
  });

  it("happy path with spec without path", async () => {
    const limitedSpec = {
      openapi: "3.0.0",
      info: {
        title: "My API",
        version: "1.0.0",
      },
    } as OpenAPIV3.Document;
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "prompts", "chat", "skprompt.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "prompts", "chat", "actions.json")) {
        chai.expect(data).to.equals("[]");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).not.to.contains("{{");
        chai.expect(data).not.to.contains("// Replace with action code");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from("test code // Replace with action code {{OPENAPI_SPEC_PATH}}")
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    await openApiSpecHelper.updateForCustomApi(limitedSpec, "javascript", "path", "openapi.yaml");
  });

  it("happy path with spec without pathItem", async () => {
    const limitedSpec = {
      openapi: "3.0.0",
      info: {
        title: "My API",
        version: "1.0.0",
      },
      paths: {},
    } as OpenAPIV3.Document;
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.equals("{}");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );

    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    await openApiSpecHelper.updateForCustomApi(limitedSpec, "javascript", "path", "openapi.yaml");
  });

  it("happy path with spec with patch", async () => {
    const limitedSpec = {
      openapi: "3.0.0",
      info: {
        title: "My API",
        version: "1.0.0",
      },
      paths: {
        patch: {
          operationId: "createPet",
          summary: "Create a pet",
          description: "Create a new pet in the store",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: {
                      type: "string",
                      description: "Name of the pet",
                    },
                  },
                },
              },
            },
          },
        },
      },
    } as OpenAPIV3.Document;
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    const mockWriteFile = vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.equals("[]");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.equals("{}");
      } else if (file === path.join("path", "src", "app", "app.js")) {
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.js")) {
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    await openApiSpecHelper.updateForCustomApi(limitedSpec, "javascript", "path", "openapi.yaml");
    chai.expect(mockWriteFile.mock.calls.length).to.equal(4);
  });

  it("happy path with spec with required and multiple parameter", async () => {
    const newSpec = {
      openapi: "3.0.0",
      info: {
        title: "My API",
        version: "1.0.0",
      },
      description: "test",
      paths: {
        "/hello": {
          get: {
            operationId: "getHello",
            summary: "Returns a greeting",
            parameters: [
              {
                name: "query",
                in: "query",
                schema: { type: "string" },
                required: true,
              },
              {
                name: "query2",
                in: "query",
                schema: { type: "string" },
                requried: false,
              },
              {
                name: "query3",
                in: "query",
                schema: { type: "string" },
                requried: true,
                description: "test",
              },
            ],
            responses: {
              "200": {
                description: "",
                content: {
                  "application/json": {
                    schema: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    } as OpenAPIV3.Document;
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));

    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    await openApiSpecHelper.updateForCustomApi(newSpec, "typescript", "path", "openapi.yaml");
  });

  it("happy path with spec request body and schema contains format", async () => {
    const newSpec = {
      openapi: "3.0.0",
      info: {
        title: "My API",
        version: "1.0.0",
      },
      description: "test",
      paths: {
        "/hello": {
          get: {
            operationId: "getHello",
            summary: "Returns a greeting",
            parameters: [
              {
                name: "query",
                in: "query",
                schema: { type: "string" },
                required: true,
              },
              {
                name: "query2",
                in: "query",
                schema: { type: "string" },
                requried: false,
              },
              {
                name: "query3",
                in: "query",
                schema: { type: "string" },
                requried: true,
                description: "test",
              },
              {
                name: "query4",
                in: "query",
                schema: {
                  type: "array",
                  items: {
                    type: "string",
                    format: "test",
                  },
                },
              },
            ],
            responses: {
              "200": {
                description: "",
                content: {
                  "application/json": {
                    schema: {
                      type: "string",
                    },
                  },
                },
              },
            },
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "",
            requestBody: {
              required: true,
              description: "request body description",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["date"],
                    properties: {
                      date: {
                        type: "string",
                        description: "",
                        format: "date-time",
                      },
                      array: {
                        type: "array",
                        items: {
                          type: "string",
                          format: "test",
                        },
                      },
                      object: {
                        type: "object",
                        properties: {
                          nestedObjProperty: {
                            type: "string",
                            description: "",
                            format: "test",
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
      },
    } as OpenAPIV3.Document;
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));

    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));

    await openApiSpecHelper.updateForCustomApi(newSpec, "typescript", "path", "openapi.yaml");
  });

  it("happy path with spec with auth", async () => {
    const authSpec = {
      openapi: "3.0.0",
      info: {
        title: "My API",
        version: "1.0.0",
      },
      description: "test",
      paths: {
        "/hello": {
          get: {
            operationId: "getHello",
            summary: "Returns a greeting",
            parameters: [
              {
                name: "query",
                in: "query",
                schema: { type: "string" },
              },
            ],
            responses: {
              "200": {
                description: "A greeting message",
                content: {
                  "application/json": {
                    schema: {
                      type: "string",
                    },
                  },
                },
              },
            },
            security: [
              {
                api_key: [],
              },
            ],
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            description: "Create a new pet in the store",
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["name"],
                    properties: {
                      name: {
                        type: "string",
                        description: "Name of the pet",
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
            in: "header",
          },
        },
      },
    } as OpenAPIV3.Document;
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));

    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));
    await openApiSpecHelper.updateForCustomApi(authSpec, "typescript", "path", "openapi.yaml");
  });

  it("happy path with spec with jsonPath", async () => {
    const specWithJsonPath = {
      openapi: "3.0.0",
      info: {
        title: "My API",
        version: "1.0.0",
      },
      description: "test",
      paths: {
        "/hello": {
          get: {
            operationId: "getHello",
            summary: "Returns a greeting",
            parameters: [
              {
                name: "query",
                in: "query",
                schema: { type: "string" },
              },
            ],
            responses: {
              "200": {
                description: "A greeting message",
                content: {
                  "application/json": {
                    schema: {
                      type: "object",
                      properties: {
                        results: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: {
                                type: "string",
                                description: "id",
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
          },
        },
      },
    } as OpenAPIV3.Document;
    vi.spyOn(fs, "ensureDir").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockImplementation((file, data) => {
      if (file === path.join("path", "src", "app", "instructions.txt")) {
        chai.expect(data).to.contains("The following is a conversation with an AI assistant.");
      } else if (file === path.join("path", "src", "adaptiveCard", "hello.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "functions.json")) {
        chai.expect(data).to.contains("getHello");
      } else if (file === path.join("path", "src", "app", "app.ts")) {
        chai.expect(data).to.contains("functionDefs.getHello");
        chai.expect(data).not.to.contains("// Replace with function definition code");
      } else if (file === path.join("path", "src", "app", "handlers.ts")) {
        chai.expect(data).to.contains("const client = await api.getClient();");
        chai.expect(data).not.to.contains("{{");
      }
    });
    vi.spyOn(fs, "readFile").mockResolvedValue(
      Buffer.from(
        "// Replace with function definition code // Replace with function handler code {{OPENAPI_SPEC_PATH}}"
      )
    );
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));

    vi.spyOn(manifestUtils, "_writeAppManifest").mockResolvedValue(ok(undefined));

    await openApiSpecHelper.updateForCustomApi(
      specWithJsonPath,
      "typescript",
      "path",
      "openapi.yaml"
    );
  });
});

describe("listOperations", async () => {
  const sandbox = vi;
  const spec = {
    openapi: "3.0.0",
    info: {
      title: "My API",
      version: "1.0.0",
    },
    description: "test",
    paths: {
      "/hello": {
        get: {
          operationId: "getHello",
          summary: "Returns a greeting",
          parameters: [
            {
              name: "query",
              in: "query",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "A greeting message",
              content: {
                "application/json": {
                  schema: {
                    type: "string",
                  },
                },
              },
            },
          },
          security: [
            {
              api_key: [],
            },
          ],
        },
        post: {
          operationId: "createPet",
          summary: "Create a pet",
          description: "Create a new pet in the store",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name"],
                  properties: {
                    name: {
                      type: "string",
                      description: "Name of the pet",
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
          in: "header",
        },
      },
    },
  } as OpenAPIV3.Document;

  beforeEach(() => {
    setTools(tools);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it("allow auth for teams ai project", async () => {
    const context = createContext();
    const inputs = {
      "custom-copilot-rag": "custom-copilot-rag-customApi",
      platform: Platform.VSCode,
    };
    vi.spyOn(openApiSpecHelper, "formatValidationErrors").mockResolvedValue([]);
    vi.spyOn(openApiSpecHelper, "logValidationResults").mockResolvedValue();
    vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
      status: ValidationStatus.Valid,
      warnings: [],
      errors: [],
      specHash: "xxx",
    });
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [],
      allAPICount: 1,
      validAPICount: 0,
    });

    const res = await openApiSpecHelper.listOperations(context, "", inputs, true, false, "");
    chai.expect(res.isOk()).to.be.true;
  });

  it("will show invalid api reasons", async () => {
    const context = createContext();
    const inputs = {
      "custom-copilot-rag": "custom-copilot-rag-customApi",
      platform: Platform.VSCode,
    };
    vi.spyOn(openApiSpecHelper, "formatValidationErrors").mockResolvedValue([]);
    vi.spyOn(openApiSpecHelper, "logValidationResults").mockResolvedValue();
    vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
      status: ValidationStatus.Valid,
      warnings: [],
      errors: [],
      specHash: "",
    });
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "1",
          server: "https://test",
          operationId: "id1",
          isValid: false,
          reason: [ErrorType.NoParameter],
        },
        {
          api: "2",
          server: "https://test",
          operationId: "id2",
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 2,
      validAPICount: 1,
    });
    const warningSpy = vi.spyOn(context.logProvider, "warning");

    const res = await openApiSpecHelper.listOperations(context, "", inputs, true, false, "");
    chai.expect(res.isOk()).to.be.true;
    chai.expect(warningSpy.mock.calls.length === 1).to.be.true;
  });

  it("should throw error if list api not from original OpenAPI spec", async () => {
    const context = createContext();
    const inputs = {
      platform: Platform.VSCode,
      "manifest-path": "fake-path",
    };
    vi.spyOn(openApiSpecHelper, "formatValidationErrors").mockResolvedValue([]);
    vi.spyOn(openApiSpecHelper, "logValidationResults").mockResolvedValue();
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok({} as any));
    vi.spyOn(manifestUtils, "getOperationIds").mockReturnValue(["getHello"]);
    vi.spyOn(openApiSpecHelper, "listPluginExistingOperations").mockResolvedValue(["getHello"]);
    vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
      status: ValidationStatus.Valid,
      warnings: [],
      errors: [],
      specHash: "",
    });
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "GET /api",
          server: "https://test",
          operationId: "getApi",
          isValid: true,
          reason: [],
        },
      ],
      allAPICount: 1,
      validAPICount: 0,
    });

    const res = await openApiSpecHelper.listOperations(context, "", inputs, false, false, "");
    chai.expect(res.isErr()).to.be.true;
    if (res.isErr()) {
      chai.expect(res.error.length).to.be.equal(1);
      chai.expect(res.error[0].type).to.be.equal(ErrorType.AddedAPINotInOriginalSpec);
    }
  });

  it("should not allow auth for VS project", async () => {
    const context = createContext();
    const inputs = {
      platform: Platform.VS,
    };
    vi.spyOn(openApiSpecHelper, "formatValidationErrors").mockResolvedValue([]);
    vi.spyOn(openApiSpecHelper, "logValidationResults").mockResolvedValue();
    vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
      status: ValidationStatus.Valid,
      warnings: [],
      errors: [],
      specHash: "xxx",
    });
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "1",
          server: "https://test",
          operationId: "id1",
          isValid: false,
          reason: [ErrorType.AuthTypeIsNotSupported],
        },
      ],
      allAPICount: 1,
      validAPICount: 0,
    });

    const res = await openApiSpecHelper.listOperations(context, "", inputs, true, false, "");
    chai.expect(res.isOk()).to.be.true;
  });

  it("should not allow auth for VS copilot project", async () => {
    const context = createContext();
    const inputs = {
      platform: Platform.VS,
      "api-plugin-type": "api-spec",
    };
    vi.spyOn(openApiSpecHelper, "formatValidationErrors").mockResolvedValue([]);
    vi.spyOn(openApiSpecHelper, "logValidationResults").mockResolvedValue();
    vi.spyOn(SpecParser.prototype, "validate").mockResolvedValue({
      status: ValidationStatus.Valid,
      warnings: [],
      errors: [],
      specHash: "xxx",
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      APIs: [
        {
          api: "1",
          server: "https://test",
          operationId: "id1",
          isValid: false,
          reason: [ErrorType.AuthTypeIsNotSupported],
        },
      ],
      allAPICount: 1,
      validAPICount: 0,
    });

    const res = await openApiSpecHelper.listOperations(context, "", inputs, true, false, "");
    chai.expect(res.isOk()).to.be.true;
  });
});

describe("parseAndUpdatePluginManifestForKiota", async () => {
  const tools = new MockTools();
  setTools(tools);
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });

  it("happy path: update plugin manifest", async () => {
    vi.spyOn(fs, "readJSON").mockResolvedValue({
      schema_version: "v1",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "ApiKeyPluginVault",
            reference_id: "{test_REIGSTRATION_ID}",
          },
          spec: {
            url: "mock_spec_url",
          },
          run_for_functions: ["mockedOperationId"],
        },
        {
          type: "OpenApi",
          auth: {
            type: "OAuthPluginVault",
            reference_id: "{test2_REIGSTRATION_ID}",
          },
          spec: {
            url: "mock_spec_url",
          },
          run_for_functions: ["mockedOperationId"],
        },
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "mock_spec_url2",
          },
          run_for_functions: ["mockedOperationId2"],
        },
      ],
    } as PluginManifestSchema);
    vi.spyOn(fs, "writeJSON").mockImplementation((path, data) => {
      const dataJson = JSON.parse(data);
      assert.isTrue(dataJson.runtimes.length === 2);
      assert.equal(dataJson.runtimes[0].auth.reference_id, "${{TEST_REIGSTRATION_ID}}");
    });

    const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(
      "pluginManifestPath",
      true
    );
    assert.deepEqual(result, [
      {
        authName: "test",
        authType: "apiKey",
        registrationId: "TEST_REGISTRATION_ID",
        specPath: "mock_spec_url",
      },
      {
        authName: "test2",
        authType: "oauth2",
        registrationId: "TEST2_REGISTRATION_ID",
        specPath: "mock_spec_url",
      },
    ]);
  });

  it("happy path: skip update plugin manifest", async () => {
    vi.spyOn(fs, "readJSON").mockResolvedValue({
      schema_version: "v1",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "ApiKeyPluginVault",
            reference_id: "{test_REIGSTRATION_ID}",
          },
          spec: {
            url: "mock_spec_url",
          },
          run_for_functions: ["mockedOperationId"],
        },
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "mock_spec_url2",
          },
          run_for_functions: ["mockedOperationId2"],
        },
      ],
    } as PluginManifestSchema);
    const writeJsonStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(
      "pluginManifestPath",
      false
    );
    assert.deepEqual(result, [
      {
        authName: "test",
        authType: "apiKey",
        registrationId: "TEST_REGISTRATION_ID",
        specPath: "mock_spec_url",
      },
    ]);
    assert.isTrue(writeJsonStub.mock.calls.length === 0);
  });

  it("happy path: skip update plugin manifest if no auth", async () => {
    vi.spyOn(fs, "readJSON").mockResolvedValue({
      schema_version: "v1",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "mock_spec_url2",
          },
          run_for_functions: ["mockedOperationId2"],
        },
      ],
    } as PluginManifestSchema);
    const writeJsonStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(
      "pluginManifestPath",
      true
    );
    assert.isTrue(result.length === 0);
    assert.isTrue(writeJsonStub.mock.calls.length === 0);
  });

  it("happy path: do nothing if no auth in runtime", async () => {
    vi.spyOn(fs, "readJSON").mockResolvedValue({
      schema_version: "v1",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          run_for_functions: ["mockedOperationId"],
        },
      ],
    } as PluginManifestSchema);
    const writeJsonStub = vi.spyOn(fs, "writeJSON").mockResolvedValue();

    const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(
      "pluginManifestPath",
      true
    );
    assert.isTrue(writeJsonStub.mock.calls.length === 0);
  });

  it("happy path: do nothing if no placeholder", async () => {
    vi.spyOn(fs, "readJSON").mockResolvedValue({
      schema_version: "v1",
      name_for_human: "test",
      description_for_human: "test",
      runtimes: [
        {
          type: "OpenApi",
          auth: {
            type: "ApiKeyPluginVault",
            reference_id: "mocekd-reference-id",
          },
          spec: {
            url: "mock_spec_url",
          },
          run_for_functions: ["mockedOperationId"],
        },
        {
          type: "OpenApi",
          auth: {
            type: "OAuthPluginVault",
            reference_id: "mocekd-reference-id",
          },
          spec: {
            url: "mock_spec_url",
          },
          run_for_functions: ["mockedOperationId"],
        },
        {
          type: "OpenApi",
          auth: {
            type: "None",
          },
          spec: {
            url: "mock_spec_url2",
          },
          run_for_functions: ["mockedOperationId2"],
        },
      ],
    } as PluginManifestSchema);
    vi.spyOn(fs, "writeJSON").mockImplementation((path, data) => {
      const dataJson = JSON.parse(data);
      assert.isTrue(dataJson.runtimes.length === 2);
      assert.equal(dataJson.runtimes[0].auth.reference_id, "${{TEST_REIGSTRATION_ID}}");
    });

    const result = await daSpecParser.parseAndUpdatePluginManifestForKiota(
      "pluginManifestPath",
      true
    );
    assert.deepEqual(result, []);
  });
});

describe("generateAdaptiveCardInPluginManifestForKiota", async () => {
  const tools = new MockTools();
  setTools(tools);
  const context = createContext();
  const sandbox = vi;
  let mockedEnvRestore: RestoreFn | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (mockedEnvRestore) {
      mockedEnvRestore();
    }
  });

  it("happy path", async () => {
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      allAPICount: 1,
      validAPICount: 1,
      APIs: [
        {
          api: "mockedApi1",
          server: "mockedSever1",
          operationId: "mockedOperationId1",
          isValid: true,
          reason: [],
          auth: {
            name: "mockedAuthName1",
            authScheme: {
              type: "http",
              scheme: "bearer",
            },
          },
        },
      ],
    });
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(SpecParser.prototype, "generateAdaptiveCardInPlugin").mockResolvedValue();
    const warningStub = vi.spyOn(tools.logProvider, "warning").mockResolvedValue();
    await generateAdaptiveCardInPluginManifestForKiota("pluginManifestPath", "specPath", context);
    assert.isTrue(warningStub.mock.calls.length === 0);
  });

  it("happy path: should not throw error if error occurs", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation((flag) =>
      flag === FeatureFlags.KiotaNPMIntegration ? false : false
    );
    vi.spyOn(SpecParser.prototype, "list").mockResolvedValue({
      allAPICount: 1,
      validAPICount: 1,
      APIs: [
        {
          api: "mockedApi1",
          server: "mockedSever1",
          operationId: "mockedOperationId1",
          isValid: true,
          reason: [],
          auth: {
            name: "mockedAuthName1",
            authScheme: {
              type: "http",
              scheme: "bearer",
            },
          },
        },
      ],
    });
    vi.spyOn(SpecParser.prototype, "generateAdaptiveCardInPlugin").mockImplementation(() => {
      throw new Error("test");
    });
    const warningStub = vi.spyOn(tools.logProvider, "warning").mockResolvedValue();
    await generateAdaptiveCardInPluginManifestForKiota("pluginManifestPath", "specPath", context);
    assert.isTrue(warningStub.mock.calls.length === 1);
  });
});
