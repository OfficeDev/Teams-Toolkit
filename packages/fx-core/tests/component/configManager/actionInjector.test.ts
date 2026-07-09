import { Utils } from "@microsoft/m365-spec-parser";
import fs from "fs-extra";
import { assert, vi } from "vitest";
import { ActionInjector } from "../../../src/component/configManager/actionInjector";
import {
  InjectAPIKeyActionFailedError,
  InjectOAuthActionFailedError,
} from "../../../src/error/common";

describe("ActionInjector", () => {
  function countOccurrences(str: string, substring: string): number {
    let count = 0;
    let pos = str.indexOf(substring);

    while (pos !== -1) {
      count++;
      pos = str.indexOf(substring, pos + 1);
    }

    return count;
  }
  describe("injectCreateOAuthAction", () => {
    const sampleAuthAction = {
      uses: "oauth/register",
      with: {
        name: "testAuth",
        appId: "${{TEAMS_APP_ID}}",
        apiSpecPath: "path/to/spec",
        flow: "authorizationCode",
      },
      writeToEnvironmentFile: {
        configurationId: "TEST_AUTH_CONFIGURATION_ID",
      },
    };
    let writeStub: any;

    beforeEach(() => {
      writeStub = vi.spyOn(fs, "writeFile").mockResolvedValue();
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("generateAuthAction should return correct result for microsoft entra", () => {
      const actionName = "oauth/register";
      const authName = "testAuth";
      const teamsAppIdEnvName = "TEAMS_APP_ID";
      const specRelativePath = "path/to/spec";
      const envName = "TEST_AUTH_CONFIGURATION_ID";
      const flow = "authorizationCode";
      const isMicrosoftEntra = true;

      const result = ActionInjector.generateAuthAction(
        actionName,
        authName,
        teamsAppIdEnvName,
        specRelativePath,
        envName,
        flow,
        isMicrosoftEntra
      );

      assert.deepEqual(result, {
        uses: actionName,
        with: {
          name: `${authName}`,
          appId: `\${{${teamsAppIdEnvName}}}`,
          apiSpecPath: specRelativePath,
          flow: flow,
          identityProvider: "MicrosoftEntra",
        },
        writeToEnvironmentFile: {
          applicationIdUri: "TESTAUTH_APPLICATION_ID_URI",
          configurationId: envName,
        },
      });
    });

    it("generateAuthAction should return correct result for oauth with pkce", () => {
      const actionName = "oauth/register";
      const authName = "testAuth";
      const teamsAppIdEnvName = "TEAMS_APP_ID";
      const specRelativePath = "path/to/spec";
      const envName = "TEST_AUTH_CONFIGURATION_ID";
      const flow = "authorizationCode";
      const isMicrosoftEntra = false;

      const result = ActionInjector.generateAuthAction(
        actionName,
        authName,
        teamsAppIdEnvName,
        specRelativePath,
        envName,
        flow,
        isMicrosoftEntra,
        true
      );

      assert.deepEqual(result, {
        uses: actionName,
        with: {
          name: `${authName}`,
          appId: `\${{${teamsAppIdEnvName}}}`,
          apiSpecPath: specRelativePath,
          flow: flow,
          isPKCEEnabled: true,
        },
        writeToEnvironmentFile: {
          configurationId: envName,
        },
      });
    });

    it("should inject OAuth action successfully if no existing env names for configuration id exists", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = false;

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              # Teams app name
              name: test
            # Write the information of created resources into environment file for
            # the specified environment variable(s).
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: apiKey/register
          - uses: oauth/register
          - uses: oauth/register
            with:
              name: oauthName
          - uses: teamsApp/create
            with:
              name: oAuth2AuthCode
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue("TEST_AUTH_CONFIGURATION_ID");
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");
      vi.spyOn(ActionInjector, "generateAuthAction").mockReturnValue(sampleAuthAction);

      const result = await ActionInjector.injectCreateOAuthAction(
        ymlPath,
        authName,
        specRelativePath,
        forceToAddNew,
        false
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: "TEST_AUTH_CONFIGURATION_ID",
        registrationIdEnvName: "TEST_AUTH_CONFIGURATION_ID",
      });
      assert.isTrue(writeStub.mock.calls[0][1].includes("oauth/register"));
      assert.isTrue(writeStub.mock.calls[0][1].includes("oauthName"));
    });

    it("should inject OAuth action successfully if configuration id set in input", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = false;

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              # Teams app name
              name: test
            # Write the information of created resources into environment file for
            # the specified environment variable(s).
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: apiKey/register
          - uses: oauth/register
          - uses: oauth/register
            with:
              name: oauthName
          - uses: teamsApp/create
            with:
              name: oAuth2AuthCode
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue("TEST_AUTH_CONFIGURATION_ID");
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");
      vi.spyOn(ActionInjector, "generateAuthAction").mockReturnValue(sampleAuthAction);

      const result = await ActionInjector.injectCreateOAuthAction(
        ymlPath,
        authName,
        specRelativePath,
        forceToAddNew,
        false,
        false,
        "INPUT_REGISTRATION_ID"
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: "TEST_AUTH_CONFIGURATION_ID",
        registrationIdEnvName: "INPUT_REGISTRATION_ID",
      });
      assert.isTrue(writeStub.mock.calls[0][1].includes("oauth/register"));
      assert.isTrue(writeStub.mock.calls[0][1].includes("oauthName"));
    });

    it("should inject OAuth action successfully if no existing env names for configuration id exists with pkce enabled", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = false;

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              # Teams app name
              name: test
            # Write the information of created resources into environment file for
            # the specified environment variable(s).
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue("TEST_AUTH_CONFIGURATION_ID");
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");
      vi.spyOn(ActionInjector, "generateAuthAction").mockReturnValue({
        uses: "oauth/register",
        with: {
          name: "testAuth",
          appId: "${{TEAMS_APP_ID}}",
          apiSpecPath: "path/to/spec",
          flow: "authorizationCode",
          isPKCEEnabled: true,
        },
        writeToEnvironmentFile: {
          configurationId: "TEST_AUTH_CONFIGURATION_ID",
        },
      });

      const result = await ActionInjector.injectCreateOAuthAction(
        ymlPath,
        authName,
        specRelativePath,
        forceToAddNew,
        false,
        true
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: "TEST_AUTH_CONFIGURATION_ID",
        registrationIdEnvName: "TEST_AUTH_CONFIGURATION_ID",
      });
      assert.isTrue(writeStub.mock.calls[0][1].includes("oauth/register"));
      assert.isTrue(writeStub.mock.calls[0][1].includes("isPKCEEnabled"));
    });

    it("should throw InjectOAuthActionFailedError if provision node is missing", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = false;

      const ymlContent = `
        otherNode:
          - uses: teamsApp/create
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "generateAuthAction").mockReturnValue(sampleAuthAction);

      try {
        await ActionInjector.injectCreateOAuthAction(
          ymlPath,
          authName,
          specRelativePath,
          forceToAddNew,
          false
        );
        assert.fail("Expected InjectOAuthActionFailedError to be thrown");
      } catch (error) {
        assert.instanceOf(error, InjectOAuthActionFailedError);
      }
    });

    it("should throw InjectOAuthActionFailedError if teamsApp/create action is missing", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = false;

      const ymlContent = `
        provision:
          - uses: otherAction
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "hasActionWithName").mockReturnValue(false);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue(undefined);
      vi.spyOn(ActionInjector, "generateAuthAction").mockReturnValue(sampleAuthAction);

      try {
        await ActionInjector.injectCreateOAuthAction(
          ymlPath,
          authName,
          specRelativePath,
          forceToAddNew,
          false
        );
        assert.fail("Expected InjectOAuthActionFailedError to be thrown");
      } catch (error) {
        assert.instanceOf(error, InjectOAuthActionFailedError);
      }
    });

    it("should handle existing OAuth action if env names for configuration id exists", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = true;

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              # Teams app name
              name: test
            # Write the information of created resources into environment file for
            # the specified environment variable(s).
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: oauth/register
            with:
              name: oAuth2AuthCode
              appId: appId
              apiSpecPath: ./appPackage/apiSpecificationFile/openapi_3.yaml
              flow: authorizationCode
            writeToEnvironmentFile:
              configurationId: OAUTH2AUTHCODE_CONFIGURATION_ID
          - uses: apiKey/register
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue(
        "OAUTH2AUTHCODE_CONFIGURATION_ID"
      );
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");
      vi.spyOn(ActionInjector, "generateAuthAction").mockReturnValue(sampleAuthAction);

      const result = await ActionInjector.injectCreateOAuthAction(
        ymlPath,
        authName,
        specRelativePath,
        forceToAddNew,
        false
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: "OAUTH2AUTHCODE_CONFIGURATION_ID",
        registrationIdEnvName: "OAUTH2AUTHCODE_CONFIGURATION_ID1",
      });
      assert.isTrue(writeStub.mock.calls[0][1].includes("apiKey/register"));

      assert.equal(countOccurrences(writeStub.mock.calls[0][1], "oauth/register"), 2);
    });

    it("should check for authName and specPath in existing OAuth actions", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              # Teams app name
              name: test
            # Write the information of created resources into environment file for
            # the specified environment variable(s).
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: oauth/register
            with:
              name: ${authName}
              appId: appId
              apiSpecPath: ./appPackage/apiSpecificationFile/openapi_3.yaml
              flow: authorizationCode
            writeToEnvironmentFile:
              configurationId: OAUTH2AUTHCODE_CONFIGURATION_ID
          - uses: oauth/register
            with:
              name: authName
              appId: appId
              apiSpecPath: ${specRelativePath}
              flow: authorizationCode
            writeToEnvironmentFile:
              configurationId: OAUTH2AUTHCODE_CONFIGURATION_ID1
          - uses: oauth/register
            with:
              apiSpecPath: ${specRelativePath}
          - uses: oauth/register
            with:
              name: ${authName}
          - uses: apiKey/register
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue(
        "OAUTH2AUTHCODE_CONFIGURATION_ID"
      );
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");
      vi.spyOn(ActionInjector, "generateAuthAction").mockReturnValue(sampleAuthAction);

      const result = await ActionInjector.injectCreateOAuthAction(
        ymlPath,
        authName,
        specRelativePath,
        false,
        false
      );

      assert.isTrue(writeStub.mock.calls[0][1].includes("apiKey/register"));
      assert.equal(countOccurrences(writeStub.mock.calls[0][1], "oauth/register"), 5);
    });

    it("should skip if same authName and specPath exists in existing OAuth actions", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              # Teams app name
              name: test
            # Write the information of created resources into environment file for
            # the specified environment variable(s).
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: oauth/register
            with:
              name: ${authName}
              appId: appId
              apiSpecPath: ${specRelativePath}
              flow: authorizationCode
            writeToEnvironmentFile:
              configurationId: OAUTH2AUTHCODE_CONFIGURATION_ID
          - uses: apiKey/register
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue(
        "OAUTH2AUTHCODE_CONFIGURATION_ID"
      );
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");
      vi.spyOn(ActionInjector, "generateAuthAction").mockReturnValue(sampleAuthAction);

      const result = await ActionInjector.injectCreateOAuthAction(
        ymlPath,
        authName,
        specRelativePath,
        false,
        false
      );

      assert.isTrue(writeStub.mock.calls.length === 0);
    });
  });

  describe("injectCreateAPIKeyAction", () => {
    const sampleAPIKeyAction = {
      uses: "apiKey/register",
      with: {
        name: "testAuth",
        appId: "${{TEAMS_APP_ID}}",
        apiSpecPath: "path/to/spec",
      },
      writeToEnvironmentFile: {
        registrationId: "TEST_AUTH_CONFIGURATION_ID",
      },
    };
    let writeStub: any;

    beforeEach(() => {
      writeStub = vi.spyOn(fs, "writeFile").mockResolvedValue();
      vi.spyOn(ActionInjector, "generateAuthAction").mockReturnValue(sampleAPIKeyAction);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should inject APIKey action successfully if no existing env names for configuration id exists", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = false;

      const ymlContent = `
      provision:
        - uses: teamsApp/create
          with:
            # Teams app name
            name: test
          # Write the information of created resources into environment file for
          # the specified environment variable(s).
          writeToEnvironmentFile:
            teamsAppId: TEAMS_APP_ID
        - uses: oauth/register
    `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "hasActionWithName").mockReturnValue(false);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue("TEST_AUTH_CONFIGURATION_ID");
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateAPIKeyAction(
        ymlPath,
        authName,
        specRelativePath,
        forceToAddNew
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: "TEST_AUTH_CONFIGURATION_ID",
        registrationIdEnvName: "TEST_AUTH_CONFIGURATION_ID",
      });
      assert.isTrue(writeStub.mock.calls[0][1].includes("apiKey/register"));
    });

    it("should inject APIKey action successfully if registrtion id set in input", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = false;

      const ymlContent = `
      provision:
        - uses: teamsApp/create
          with:
            # Teams app name
            name: test
          # Write the information of created resources into environment file for
          # the specified environment variable(s).
          writeToEnvironmentFile:
            teamsAppId: TEAMS_APP_ID
        - uses: oauth/register
    `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "hasActionWithName").mockReturnValue(false);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue("TEST_AUTH_CONFIGURATION_ID");
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateAPIKeyAction(
        ymlPath,
        authName,
        specRelativePath,
        forceToAddNew,
        "INPUT_REGISTRATION_ID"
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: "TEST_AUTH_CONFIGURATION_ID",
        registrationIdEnvName: "INPUT_REGISTRATION_ID",
      });
      assert.isTrue(writeStub.mock.calls[0][1].includes("apiKey/register"));
    });

    it("should throw InjectAPIKeyActionFailedError if provision node is missing", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = false;

      const ymlContent = `
        otherNode:
          - uses: teamsApp/create
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);

      try {
        await ActionInjector.injectCreateAPIKeyAction(
          ymlPath,
          authName,
          specRelativePath,
          forceToAddNew
        );
        assert.fail("Expected InjectAPIKeyActionFailedError to be thrown");
      } catch (error) {
        assert.instanceOf(error, InjectAPIKeyActionFailedError);
      }
    });

    it("should throw InjectAPIKeyActionFailedError if teamsApp/create action is missing", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = false;

      const ymlContent = `
        provision:
          - uses: otherAction
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "hasActionWithName").mockReturnValue(false);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue(undefined);

      try {
        await ActionInjector.injectCreateAPIKeyAction(
          ymlPath,
          authName,
          specRelativePath,
          forceToAddNew
        );
        assert.fail("Expected InjectAPIKeyActionFailedError to be thrown");
      } catch (error) {
        assert.instanceOf(error, InjectAPIKeyActionFailedError);
      }
    });

    it("should handle existing OAuth action if env names for configuration id exists", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";
      const forceToAddNew = true;

      const ymlContent = `
          provision:
            - uses: teamsApp/create
              with:
                # Teams app name
                name: test
              # Write the information of created resources into environment file for
              # the specified environment variable(s).
              writeToEnvironmentFile:
                teamsAppId: TEAMS_APP_ID
            - uses: apiKey/register
              with:
                name: bearerAuth
                appId: appId
                apiSpecPath: ./appPackage/apiSpecificationFile/openapi_1.yaml
              writeToEnvironmentFile:
                registrationId: BEARERAUTH_REGISTRATION_ID
        `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue("BEARERAUTH_REGISTRATION_ID");
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateAPIKeyAction(
        ymlPath,
        authName,
        specRelativePath,
        forceToAddNew
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: "BEARERAUTH_REGISTRATION_ID",
        registrationIdEnvName: "BEARERAUTH_REGISTRATION_ID1",
      });

      assert.equal(countOccurrences(writeStub.mock.calls[0][1], "apiKey/register"), 2);
    });

    it("should check for authName and specPath in existing OAuth actions", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              # Teams app name
              name: test
            # Write the information of created resources into environment file for
            # the specified environment variable(s).
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: apiKey/register
            with:
              name: ${authName}
              appId: appId
              apiSpecPath: ./appPackage/apiSpecificationFile/openapi_3.yaml
              flow: authorizationCode
            writeToEnvironmentFile:
              configurationId: OAUTH2AUTHCODE_CONFIGURATION_ID
          - uses: apiKey/register
            with:
              name: authName
              appId: appId
              apiSpecPath: ${specRelativePath}
              flow: authorizationCode
            writeToEnvironmentFile:
              configurationId: OAUTH2AUTHCODE_CONFIGURATION_ID1
          - uses: apiKey/register
            with:
              apiSpecPath: ${specRelativePath}
          - uses: apiKey/register
            with:
              name: ${authName}
          - uses: oauth/register
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue(
        "OAUTH2AUTHCODE_CONFIGURATION_ID"
      );
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateAPIKeyAction(
        ymlPath,
        authName,
        specRelativePath,
        false
      );

      assert.isTrue(writeStub.mock.calls[0][1].includes("oauth/register"));
      assert.equal(countOccurrences(writeStub.mock.calls[0][1], "apiKey/register"), 5);
    });

    it("should skip if same authName and specPath exists in existing OAuth actions", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testAuth";
      const specRelativePath = "path/to/spec";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              # Teams app name
              name: test
            # Write the information of created resources into environment file for
            # the specified environment variable(s).
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: apiKey/register
            with:
              name: ${authName}
              appId: appId
              apiSpecPath: ${specRelativePath}
              flow: authorizationCode
            writeToEnvironmentFile:
              configurationId: OAUTH2AUTHCODE_CONFIGURATION_ID
          - uses: oauth/register
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(Utils, "getSafeRegistrationIdEnvName").mockReturnValue(
        "OAUTH2AUTHCODE_CONFIGURATION_ID"
      );
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateAPIKeyAction(
        ymlPath,
        authName,
        specRelativePath,
        false
      );

      assert.isTrue(writeStub.mock.calls.length === 0);
    });
  });

  describe("injectCreateOAuthActionForMCP", () => {
    let writeStub: any;

    beforeEach(() => {
      writeStub = vi.spyOn(fs, "writeFile").mockResolvedValue();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should inject OAuth action for MCP with oauth authType successfully", async () => {
      const ymlPath = "path/to/yml";
      const authType = "oauth";
      const authName = "testMCPAuth";
      const registrationId = "MCP_OAUTH_REGISTRATION_ID";
      const mcpServerUrl = "https://mcp.example.com";
      const authorizationUrl = "https://auth.example.com/oauth/authorize";
      const tokenUrl = "https://auth.example.com/oauth/token";
      const refreshUrl = "https://auth.example.com/oauth/refresh";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              name: test
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: apiKey/register
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateOAuthActionForMCP(
        ymlPath,
        authType,
        authName,
        registrationId,
        mcpServerUrl,
        authorizationUrl,
        tokenUrl,
        refreshUrl
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: registrationId,
        registrationIdEnvName: registrationId,
      });

      const writtenContent = writeStub.mock.calls[0][1];
      assert.isTrue(writtenContent.includes("oauth/register"));
      assert.isTrue(writtenContent.includes(authName));
      assert.isTrue(writtenContent.includes(registrationId));
      assert.isTrue(writtenContent.includes(mcpServerUrl));
      assert.isTrue(writtenContent.includes(authorizationUrl));
      assert.isTrue(writtenContent.includes(tokenUrl));
      assert.isTrue(writtenContent.includes("identityProvider: Custom"));
    });

    it("should inject OAuth action for MCP with Microsoft Entra authType successfully", async () => {
      const ymlPath = "path/to/yml";
      const authType = "microsoftEntra";
      const authName = "testMCPEntraAuth";
      const registrationId = "MCP_ENTRA_REGISTRATION_ID";
      const mcpServerUrl = "https://mcp.example.com";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              name: test
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: apiKey/register
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateOAuthActionForMCP(
        ymlPath,
        authType,
        authName,
        registrationId,
        mcpServerUrl
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: registrationId,
        registrationIdEnvName: registrationId,
      });

      const writtenContent = writeStub.mock.calls[0][1];
      assert.isTrue(writtenContent.includes("oauth/register"));
      assert.isTrue(writtenContent.includes(authName));
      assert.isTrue(writtenContent.includes(registrationId));
      assert.isTrue(writtenContent.includes(mcpServerUrl));
      assert.isTrue(writtenContent.includes("identityProvider: MicrosoftEntra"));
      assert.isFalse(writtenContent.includes("authorizationUrl"));
      assert.isFalse(writtenContent.includes("tokenUrl"));
    });

    it("should handle oauth authType with optional refreshUrl as undefined", async () => {
      const ymlPath = "path/to/yml";
      const authType = "oauth";
      const authName = "testMCPAuth";
      const registrationId = "MCP_OAUTH_REGISTRATION_ID";
      const mcpServerUrl = "https://mcp.example.com";
      const authorizationUrl = "https://auth.example.com/oauth/authorize";
      const tokenUrl = "https://auth.example.com/oauth/token";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              name: test
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateOAuthActionForMCP(
        ymlPath,
        authType,
        authName,
        registrationId,
        mcpServerUrl,
        authorizationUrl,
        tokenUrl
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: registrationId,
        registrationIdEnvName: registrationId,
      });

      const writtenContent = writeStub.mock.calls[0][1];
      assert.isTrue(writtenContent.includes(authorizationUrl));
      assert.isTrue(writtenContent.includes(tokenUrl));
      assert.isFalse(writtenContent.includes("refreshUrl"));
    });

    it("should return undefined if auth action with same registration ID already exists", async () => {
      const ymlPath = "path/to/yml";
      const authType = "oauth";
      const authName = "testMCPAuth";
      const registrationId = "EXISTING_REGISTRATION_ID";
      const mcpServerUrl = "https://mcp.example.com";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              name: test
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: oauth/register
            with:
              name: existingAuth
            writeToEnvironmentFile:
              configurationId: ${registrationId}
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateOAuthActionForMCP(
        ymlPath,
        authType,
        authName,
        registrationId,
        mcpServerUrl
      );

      assert.isUndefined(result);
      assert.isTrue(writeStub.mock.calls.length === 0);
    });

    it("should throw InjectOAuthActionFailedError if provision node is missing", async () => {
      const ymlPath = "path/to/yml";
      const authType = "oauth";
      const authName = "testMCPAuth";
      const registrationId = "MCP_OAUTH_REGISTRATION_ID";
      const mcpServerUrl = "https://mcp.example.com";

      const ymlContent = `
        otherNode:
          - uses: teamsApp/create
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);

      try {
        await ActionInjector.injectCreateOAuthActionForMCP(
          ymlPath,
          authType,
          authName,
          registrationId,
          mcpServerUrl
        );
        assert.fail("Expected InjectOAuthActionFailedError to be thrown");
      } catch (error) {
        assert.instanceOf(error, InjectOAuthActionFailedError);
      }
    });

    it("should throw InjectOAuthActionFailedError if teamsApp/create action is missing", async () => {
      const ymlPath = "path/to/yml";
      const authType = "oauth";
      const authName = "testMCPAuth";
      const registrationId = "MCP_OAUTH_REGISTRATION_ID";
      const mcpServerUrl = "https://mcp.example.com";

      const ymlContent = `
        provision:
          - uses: otherAction
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue(undefined);

      try {
        await ActionInjector.injectCreateOAuthActionForMCP(
          ymlPath,
          authType,
          authName,
          registrationId,
          mcpServerUrl
        );
        assert.fail("Expected InjectOAuthActionFailedError to be thrown");
      } catch (error) {
        assert.instanceOf(error, InjectOAuthActionFailedError);
      }
    });

    it("should insert action after teamsApp/create action", async () => {
      const ymlPath = "path/to/yml";
      const authType = "oauth";
      const authName = "testMCPAuth";
      const registrationId = "MCP_OAUTH_REGISTRATION_ID";
      const mcpServerUrl = "https://mcp.example.com";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              name: test
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: existingAction1
          - uses: existingAction2
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateOAuthActionForMCP(
        ymlPath,
        authType,
        authName,
        registrationId,
        mcpServerUrl
      );

      assert.isNotNull(result);

      const writtenContent = writeStub.mock.calls[0][1];
      const teamsAppCreateIndex = writtenContent.indexOf("teamsApp/create");
      const oauthRegisterIndex = writtenContent.indexOf("oauth/register");
      const existingAction1Index = writtenContent.indexOf("existingAction1");

      // OAuth action should be inserted after teamsApp/create but before existing actions
      assert.isTrue(teamsAppCreateIndex < oauthRegisterIndex);
      assert.isTrue(oauthRegisterIndex < existingAction1Index);
    });

    it("should filter out items without 'uses' property", async () => {
      const ymlPath = "path/to/yml";
      const authType = "oauth";
      const authName = "testMCPAuth";
      const registrationId = "MCP_OAUTH_REGISTRATION_ID";
      const mcpServerUrl = "https://mcp.example.com";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              name: test
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - invalidItem: withoutUses
          - uses: validAction
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateOAuthActionForMCP(
        ymlPath,
        authType,
        authName,
        registrationId,
        mcpServerUrl
      );

      assert.isNotNull(result);

      const writtenContent = writeStub.mock.calls[0][1];
      assert.isTrue(writtenContent.includes("teamsApp/create"));
      assert.isTrue(writtenContent.includes("oauth/register"));
      assert.isTrue(writtenContent.includes("validAction"));
      assert.isFalse(writtenContent.includes("invalidItem"));
    });

    it("should emit credential env refs for oauth when credentialEnvNames provided", async () => {
      const ymlPath = "path/to/yml";
      const ymlContent = `
        provision:
          - uses: teamsApp/create
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      await ActionInjector.injectCreateOAuthActionForMCP(
        ymlPath,
        "oauth",
        "testMCPAuth",
        "MCP_OAUTH_REGISTRATION_ID",
        "https://mcp.example.com",
        "https://auth.example.com/oauth/authorize",
        "https://auth.example.com/oauth/token",
        undefined,
        {
          clientIdEnvName: "MCP_DA_OAUTH_CLIENT_ID_SERVER1",
          clientSecretEnvName: "SECRET_MCP_DA_OAUTH_CLIENT_SECRET_SERVER1",
          scopeEnvName: "MCP_DA_OAUTH_SCOPE_SERVER1",
        }
      );

      const writtenContent: string = writeStub.mock.calls[0][1];
      assert.isTrue(writtenContent.includes("${{MCP_DA_OAUTH_CLIENT_ID_SERVER1}}"));
      assert.isTrue(writtenContent.includes("${{SECRET_MCP_DA_OAUTH_CLIENT_SECRET_SERVER1}}"));
      assert.isTrue(writtenContent.includes("${{MCP_DA_OAUTH_SCOPE_SERVER1}}"));
    });

    it("should emit only client-id env ref for entra-sso when credentialEnvNames provided", async () => {
      const ymlPath = "path/to/yml";
      const ymlContent = `
        provision:
          - uses: teamsApp/create
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      await ActionInjector.injectCreateOAuthActionForMCP(
        ymlPath,
        "entra-sso",
        "testEntraAuth",
        "MCP_ENTRA_REGISTRATION_ID",
        "https://mcp.example.com",
        undefined,
        undefined,
        undefined,
        {
          clientIdEnvName: "MCP_DA_OAUTH_CLIENT_ID_SERVER1",
        }
      );

      const writtenContent: string = writeStub.mock.calls[0][1];
      assert.isTrue(writtenContent.includes("${{MCP_DA_OAUTH_CLIENT_ID_SERVER1}}"));
      assert.isFalse(writtenContent.includes("clientSecret"));
      assert.isFalse(writtenContent.includes("scope:"));
    });
  });

  describe("injectCreateDcrActionForMCP", () => {
    let writeStub: any;

    beforeEach(() => {
      writeStub = vi.spyOn(fs, "writeFile").mockResolvedValue();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should inject dcr/register action successfully", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testDcrAuth";
      const registrationId = "MCP_DA_AUTH_ID_APIGITHUBC";
      const mcpServerUrl = "https://api.githubcopilot.com/mcp/";
      const wellKnownUrl = "https://auth.example.com/.well-known/oauth-authorization-server";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            with:
              name: test
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      const result = await ActionInjector.injectCreateDcrActionForMCP(
        ymlPath,
        authName,
        registrationId,
        mcpServerUrl,
        wellKnownUrl
      );

      assert.deepEqual(result, {
        defaultRegistrationIdEnvName: registrationId,
        registrationIdEnvName: registrationId,
      });

      const writtenContent = writeStub.mock.calls[0][1];
      assert.isTrue(writtenContent.includes("dcr/register"));
      assert.isTrue(writtenContent.includes(authName));
      assert.isTrue(writtenContent.includes(registrationId));
      assert.isTrue(writtenContent.includes(mcpServerUrl));
      assert.isTrue(writtenContent.includes(wellKnownUrl));
      assert.isTrue(writtenContent.includes("applicableToApps: AnyApp"));
      assert.isTrue(writtenContent.includes("targetAudience: HomeTenant"));
    });

    it("should be idempotent when configurationId already present", async () => {
      const ymlPath = "path/to/yml";
      const authName = "testDcrAuth";
      const registrationId = "MCP_DA_AUTH_ID_APIGITHUBC";
      const mcpServerUrl = "https://api.githubcopilot.com/mcp/";
      const wellKnownUrl = "https://auth.example.com/.well-known/oauth-authorization-server";

      const ymlContent = `
        provision:
          - uses: teamsApp/create
            writeToEnvironmentFile:
              teamsAppId: TEAMS_APP_ID
          - uses: dcr/register
            with:
              name: testDcrAuth
            writeToEnvironmentFile:
              configurationId: MCP_DA_AUTH_ID_APIGITHUBC
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);

      const result = await ActionInjector.injectCreateDcrActionForMCP(
        ymlPath,
        authName,
        registrationId,
        mcpServerUrl,
        wellKnownUrl
      );

      assert.isUndefined(result);
      assert.equal(writeStub.mock.calls.length, 0);
    });

    it("should throw InjectOAuthActionFailedError when provision node is missing", async () => {
      const ymlPath = "path/to/yml";
      const ymlContent = "deploy:\n  - uses: noop\n";

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);

      try {
        await ActionInjector.injectCreateDcrActionForMCP(
          ymlPath,
          "name",
          "REG_ID",
          "https://mcp.example.com",
          "https://auth.example.com/.well-known/oauth-authorization-server"
        );
        assert.fail("Expected error not thrown");
      } catch (e) {
        assert.equal((e as Error).name, "InjectOAuthActionFailedError");
      }
    });

    it("should throw InjectOAuthActionFailedError when teamsApp/create env name is missing", async () => {
      const ymlPath = "path/to/yml";
      const ymlContent = `
        provision:
          - uses: someOther/action
      `;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue(undefined);

      try {
        await ActionInjector.injectCreateDcrActionForMCP(
          ymlPath,
          "name",
          "REG_ID",
          "https://mcp.example.com",
          "https://auth.example.com/.well-known/oauth-authorization-server"
        );
        assert.fail("Expected error not thrown");
      } catch (e) {
        assert.equal((e as Error).name, "InjectOAuthActionFailedError");
      }
    });

    it("should bump yaml-schema version from v1.12 to v1.13 when injecting dcr/register", async () => {
      const ymlPath = "path/to/yml";
      const ymlContent = `# yaml-language-server: $schema=https://aka.ms/teams-toolkit/v1.12/yaml.schema.json
version: v1.12
provision:
  - uses: teamsApp/create
    writeToEnvironmentFile:
      teamsAppId: TEAMS_APP_ID
`;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      await ActionInjector.injectCreateDcrActionForMCP(
        ymlPath,
        "name",
        "REG_ID",
        "https://mcp.example.com",
        "https://auth.example.com/.well-known/oauth-authorization-server"
      );

      const writtenContent: string = writeStub.mock.calls[0][1];
      assert.isTrue(writtenContent.includes("version: v1.13"));
      assert.isFalse(/^version: v1\.12$/m.test(writtenContent));
    });

    it("should leave yaml-schema version untouched when already >= v1.13", async () => {
      const ymlPath = "path/to/yml";
      const ymlContent = `version: v1.14
provision:
  - uses: teamsApp/create
    writeToEnvironmentFile:
      teamsAppId: TEAMS_APP_ID
`;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      await ActionInjector.injectCreateDcrActionForMCP(
        ymlPath,
        "name",
        "REG_ID",
        "https://mcp.example.com",
        "https://auth.example.com/.well-known/oauth-authorization-server"
      );

      const writtenContent: string = writeStub.mock.calls[0][1];
      assert.isTrue(writtenContent.includes("version: v1.14"));
      assert.isFalse(writtenContent.includes("version: v1.13"));
    });

    it("should leave an unparseable yaml-schema version untouched", async () => {
      const ymlPath = "path/to/yml";
      const ymlContent = `version: notAVersion
provision:
  - uses: teamsApp/create
    writeToEnvironmentFile:
      teamsAppId: TEAMS_APP_ID
`;

      vi.spyOn(fs, "readFile").mockResolvedValue(ymlContent as any);
      vi.spyOn(ActionInjector, "getTeamsAppIdEnvName").mockReturnValue("TEAMS_APP_ID");

      await ActionInjector.injectCreateDcrActionForMCP(
        ymlPath,
        "name",
        "REG_ID",
        "https://mcp.example.com",
        "https://auth.example.com/.well-known/oauth-authorization-server"
      );

      const writtenContent: string = writeStub.mock.calls[0][1];
      assert.isTrue(writtenContent.includes("version: notAVersion"));
      assert.isTrue(writtenContent.includes("dcr/register"));
    });
  });
});
