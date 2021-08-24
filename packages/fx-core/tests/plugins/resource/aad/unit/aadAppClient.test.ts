// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import * as chai from "chai";
import * as sinon from "sinon";
import faker from "faker";
import axios from "axios";
import { AadAppClient } from "../../../../../src/plugins/resource/aad/aadAppClient";
import { ProvisionConfig } from "../../../../../src/plugins/resource/aad/utils/configs";
import { TestHelper } from "../helper";
import { PluginContext } from "@microsoft/teamsfx-api";
import {
  TokenAudience,
  TokenProvider,
} from "../../../../../src/plugins/resource/aad/utils/tokenProvider";
import { GraphClient } from "../../../../../src/plugins/resource/aad/graph";
import { RequiredResourceAccess } from "../../../../../src/plugins/resource/aad/interfaces/IAADDefinition";
import { AppStudio } from "../../../../../src/plugins/resource/aad/appStudio";
import { UserError } from "@microsoft/teamsfx-api";
import { SystemError } from "@microsoft/teamsfx-api";
import {
  CreateAppError,
  CreateSecretError,
  GetAppError,
  UpdateAppIdUriError,
  UpdatePermissionError,
  UpdateRedirectUriError,
} from "../../../../../src/plugins/resource/aad/errors";

describe("AAD App Client Test", () => {
  let ctx: PluginContext;
  let config: ProvisionConfig;

  beforeEach(async () => {
    ctx = await TestHelper.pluginContext(new Map(), true, false, false);
    config = new ProvisionConfig(true);
    config.restoreConfigFromContext(ctx);
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("createAadApp", async () => {
    it("Happy Path: Graph", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const displayName = "createAADApp";

      sinon.stub(GraphClient, "createAADApp").resolves({
        id: objectId,
        displayName: displayName,
      });

      await AadAppClient.createAadApp(ctx, "createAADApp", config);
      chai.assert.equal(config.objectId, objectId);
    });

    it("Happy Path: App Studio", async () => {
      TokenProvider.init(ctx, TokenAudience.AppStudio);
      const objectId = faker.datatype.uuid();
      const displayName = "createAADApp";

      sinon.stub(AppStudio, "createAADAppV2").resolves({
        id: objectId,
        displayName: displayName,
      });

      await AadAppClient.createAadApp(ctx, "createAADApp", config);
      chai.assert.equal(config.objectId, objectId);
    });

    it("System Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);

      const error = {
        response: {
          status: 500,
          message: "errorMessage",
        },
      };
      sinon.stub(GraphClient, "createAADApp").throws(error);
      try {
        await AadAppClient.createAadApp(ctx, "createAADApp", config);
      } catch (error) {
        chai.assert.isTrue(error instanceof SystemError);
        chai.assert.equal(error.message, CreateAppError.message());
      }
    });

    it("User Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);

      const error = {
        response: {
          status: 404,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        await AadAppClient.createAadApp(ctx, "createAADApp", config);
      } catch (error) {
        chai.assert.isTrue(error instanceof UserError);
        chai.assert.equal(error.message, CreateAppError.message());
      }
    });
  });

  describe("createAadAppSecret", () => {
    it("Happy Path: Graph", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      sinon.stub(GraphClient, "createAadAppSecret").resolves({
        hint: "hint",
        id: faker.datatype.uuid(),
        endDate: "endDate",
        startDate: "startDate",
        value: "secret",
      });

      await AadAppClient.createAadAppSecret(ctx, "createAadAppSecret", config);
      chai.assert.equal(config.password, "secret");
    });

    it("Happy Path: App Studio", async () => {
      TokenProvider.init(ctx, TokenAudience.AppStudio);
      sinon.stub(AppStudio, "createAADAppPassword").resolves({
        hint: "hint",
        id: faker.datatype.uuid(),
        endDate: "endDate",
        startDate: "startDate",
        value: "secret",
      });

      await AadAppClient.createAadAppSecret(ctx, "createAadAppSecret", config);
      chai.assert.equal(config.password, "secret");
    });

    it("System Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);

      const error = {
        response: {
          status: 500,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        await AadAppClient.createAadAppSecret(ctx, "createAadAppSecret", config);
      } catch (error) {
        chai.assert.isTrue(error instanceof SystemError);
        chai.assert.equal(error.message, CreateSecretError.message());
      }
    });

    it("User Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);

      const error = {
        response: {
          status: 404,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        await AadAppClient.createAadAppSecret(ctx, "createAadAppSecret", config);
      } catch (error) {
        chai.assert.isTrue(error instanceof UserError);
        chai.assert.equal(error.message, CreateSecretError.message());
      }
    });
  });

  describe("updateAadAppRedirectUri", () => {
    it("Happy Path: Graph", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const redirectUris = ["redirectUri"];

      sinon.stub(GraphClient, "updateAADApp").resolves();
      await AadAppClient.updateAadAppRedirectUri(
        ctx,
        "updateAadAppRedirectUri",
        objectId,
        redirectUris
      );
    });

    it("Happy Path: App Studio", async () => {
      TokenProvider.init(ctx, TokenAudience.AppStudio);
      const objectId = faker.datatype.uuid();
      const redirectUris = ["redirectUri"];

      sinon.stub(AppStudio, "updateAADApp").resolves();
      await AadAppClient.updateAadAppRedirectUri(
        ctx,
        "updateAadAppRedirectUri",
        objectId,
        redirectUris
      );
    });

    it("System Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const redirectUris = ["redirectUri"];

      const error = {
        response: {
          status: 500,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        await AadAppClient.updateAadAppRedirectUri(
          ctx,
          "updateAadAppRedirectUri",
          objectId,
          redirectUris
        );
      } catch (error) {
        chai.assert.isTrue(error instanceof SystemError);
        chai.assert.equal(error.message, UpdateRedirectUriError.message());
      }
    });

    it("User Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const redirectUris = ["redirectUri"];

      const error = {
        response: {
          status: 404,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        await AadAppClient.updateAadAppRedirectUri(
          ctx,
          "updateAadAppRedirectUri",
          objectId,
          redirectUris
        );
      } catch (error) {
        chai.assert.isTrue(error instanceof UserError);
        chai.assert.equal(error.message, UpdateRedirectUriError.message());
      }
    });
  });

  describe("updateAadAppIdUri", () => {
    it("Happy Path: Graph", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const applicationIdUri = "applicationIdUri";

      sinon.stub(GraphClient, "updateAADApp").resolves();
      await AadAppClient.updateAadAppIdUri(ctx, "updateAadAppIdUri", objectId, applicationIdUri);
    });

    it("Happy Path: App Studio", async () => {
      TokenProvider.init(ctx, TokenAudience.AppStudio);
      const objectId = faker.datatype.uuid();
      const applicationIdUri = "applicationIdUri";

      sinon.stub(AppStudio, "updateAADApp").resolves();
      await AadAppClient.updateAadAppIdUri(ctx, "updateAadAppIdUri", objectId, applicationIdUri);
    });

    it("System Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const applicationIdUri = "applicationIdUri";

      const error = {
        response: {
          status: 500,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        await AadAppClient.updateAadAppIdUri(ctx, "updateAadAppIdUri", objectId, applicationIdUri);
      } catch (error) {
        chai.assert.isTrue(error instanceof SystemError);
        chai.assert.equal(error.message, UpdateAppIdUriError.message());
      }
    });

    it("User Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const applicationIdUri = "applicationIdUri";

      const error = {
        response: {
          status: 404,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        await AadAppClient.updateAadAppIdUri(ctx, "updateAadAppIdUri", objectId, applicationIdUri);
      } catch (error) {
        chai.assert.isTrue(error instanceof UserError);
        chai.assert.equal(error.message, UpdateAppIdUriError.message());
      }
    });
  });

  describe("updateAadAppPermission", () => {
    it("Happy Path: Graph", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const permissions: RequiredResourceAccess[] = [{}];

      sinon.stub(GraphClient, "updateAADApp").resolves();
      await AadAppClient.updateAadAppPermission(
        ctx,
        "updateAadAppPermission",
        objectId,
        permissions
      );
    });

    it("Happy Path: AppStudio", async () => {
      TokenProvider.init(ctx, TokenAudience.AppStudio);
      const objectId = faker.datatype.uuid();
      const permissions: RequiredResourceAccess[] = [{}];

      sinon.stub(AppStudio, "updateAADApp").resolves();
      await AadAppClient.updateAadAppPermission(
        ctx,
        "updateAadAppPermission",
        objectId,
        permissions
      );
    });

    it("System Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const permissions: RequiredResourceAccess[] = [{}];

      const error = {
        response: {
          status: 500,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        await AadAppClient.updateAadAppPermission(
          ctx,
          "updateAadAppPermission",
          objectId,
          permissions
        );
      } catch (error) {
        chai.assert.isTrue(error instanceof SystemError);
        chai.assert.equal(error.message, UpdatePermissionError.message());
      }
    });

    it("User Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const permissions: RequiredResourceAccess[] = [{}];

      const error = {
        response: {
          status: 404,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        await AadAppClient.updateAadAppPermission(
          ctx,
          "updateAadAppPermission",
          objectId,
          permissions
        );
      } catch (error) {
        chai.assert.isTrue(error instanceof UserError);
        chai.assert.equal(error.message, UpdatePermissionError.message());
      }
    });
  });

  describe("getAadApp", async () => {
    it("Happy Path: Graph", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const clientId = faker.datatype.uuid();
      const oauth2PermissionScopeId = faker.datatype.uuid();
      const secret = "secret";
      const displayName = "getAadApp";

      sinon.stub(GraphClient, "getAadApp").resolves({
        id: objectId,
        appId: clientId,
        displayName: displayName,
        api: {
          requestedAccessTokenVersion: 0,
          oauth2PermissionScopes: [
            {
              id: oauth2PermissionScopeId,
              adminConsentDescription: "adminConsentDescription",
              adminConsentDisplayName: "adminConsentDisplayName",
              isEnabled: true,
              type: "type",
              userConsentDescription: "userConsentDescription",
              userConsentDisplayName: "userConsentDescription",
              value: "value",
            },
          ],
          preAuthorizedApplications: [],
        },
      });

      const getResult = await AadAppClient.getAadApp(ctx, "getAadApp", objectId, true, secret);
      chai.assert.equal(getResult.objectId, objectId);
      chai.assert.equal(getResult.clientId, clientId);
    });

    it("Happy Path: App Studio", async () => {
      TokenProvider.init(ctx, TokenAudience.AppStudio);
      const objectId = faker.datatype.uuid();
      const clientId = faker.datatype.uuid();
      const oauth2PermissionScopeId = faker.datatype.uuid();
      const secret = "secret";
      const displayName = "getAadApp";

      sinon.stub(AppStudio, "getAadApp").resolves({
        id: objectId,
        appId: clientId,
        displayName: displayName,
        api: {
          requestedAccessTokenVersion: 0,
          oauth2PermissionScopes: [
            {
              id: oauth2PermissionScopeId,
              adminConsentDescription: "adminConsentDescription",
              adminConsentDisplayName: "adminConsentDisplayName",
              isEnabled: true,
              type: "type",
              userConsentDescription: "userConsentDescription",
              userConsentDisplayName: "userConsentDescription",
              value: "value",
            },
          ],
          preAuthorizedApplications: [],
        },
      });

      const getResult = await AadAppClient.getAadApp(ctx, "getAadApp", objectId, true, secret);
      chai.assert.equal(getResult.objectId, objectId);
      chai.assert.equal(getResult.clientId, clientId);
    });

    it("System Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const secret = "secret";

      const error = {
        response: {
          status: 500,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        const getResult = await AadAppClient.getAadApp(ctx, "getAadApp", objectId, true, secret);
      } catch (error) {
        chai.assert.isTrue(error instanceof SystemError);
        chai.assert.equal(error.message, GetAppError.message());
      }
    });

    it("User Error", async () => {
      TokenProvider.init(ctx, TokenAudience.Graph);
      const objectId = faker.datatype.uuid();
      const secret = "secret";

      const error = {
        response: {
          status: 404,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        const getResult = await AadAppClient.getAadApp(ctx, "getAadApp", objectId, true, secret);
      } catch (error) {
        chai.assert.isTrue(error instanceof UserError);
        chai.assert.equal(error.message, GetAppError.message());
      }
    });
  });

  describe("checkPermission", async () => {
    it("Happy Path", async () => {
      sinon.stub(GraphClient, "checkPermission").resolves(true);
      const checkPermissionResult = await AadAppClient.checkPermission(
        ctx,
        "checkPermission",
        faker.datatype.uuid(),
        faker.datatype.uuid()
      );
      chai.assert.equal(checkPermissionResult, true);
    });

    it("User Error", async () => {
      const error = {
        response: {
          status: 404,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        const checkPermissionResult = await AadAppClient.checkPermission(
          ctx,
          "checkPermission",
          faker.datatype.uuid(),
          faker.datatype.uuid()
        );
      } catch (error) {
        chai.assert.isTrue(error instanceof UserError);
      }
    });

    it("System Error", async () => {
      const error = {
        response: {
          status: 500,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        const checkPermissionResult = await AadAppClient.checkPermission(
          ctx,
          "checkPermission",
          faker.datatype.uuid(),
          faker.datatype.uuid()
        );
      } catch (error) {
        chai.assert.isTrue(error instanceof SystemError);
      }
    });
  });

  describe("grantPermission", async () => {
    it("Happy Path", async () => {
      sinon.stub(GraphClient, "grantPermission").resolves();
      const grantPermissionResult = await AadAppClient.grantPermission(
        ctx,
        "checkPermission",
        faker.datatype.uuid(),
        faker.datatype.uuid()
      );
    });

    it("User Error", async () => {
      const error = {
        response: {
          status: 404,
          message: "errorMessage",
        },
      };
      sinon.stub(AadAppClient, "retryHanlder").throws(error);
      try {
        const grantPermissionResult = await AadAppClient.grantPermission(
          ctx,
          "grantPermission",
          faker.datatype.uuid(),
          faker.datatype.uuid()
        );
      } catch (error) {
        chai.assert.isTrue(error instanceof UserError);
      }
    });

    it("System Error", async () => {
      const error = {
        response: {
          status: 500,
          message: "errorMessage",
        },
      };
      sinon.stub(GraphClient, "grantPermission").throws(error);
      try {
        const grantPermissionResult = await AadAppClient.grantPermission(
          ctx,
          "grantPermission",
          faker.datatype.uuid(),
          faker.datatype.uuid()
        );
      } catch (error) {
        chai.assert.isTrue(error instanceof SystemError);
      }
    });
  });
});
