// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { expect } from "chai";
import { spawn } from "child_process";
import * as fs from "fs-extra";
import { describe, it } from "mocha";
import * as path from "path";
import {
  cleanUpLocalProject,
  getTestFolder,
  getUniqueAppName,
} from "../commonUtils";
import { Capability } from "../../utils/constants";

interface CliResult {
  success: boolean;
  stdout: string;
  stderr: string;
}

const workspaceCliPath = path.resolve(__dirname, "../../../../cli/cli.js");
const cliTimeoutMs = 2 * 60 * 1000;
const testSecret = "e2e-test-secret-value";

const bearerOpenApi = `openapi: 3.0.0
info:
  title: Bearer E2E API
  version: 1.0.0
servers:
  - url: https://bearer-e2e.example.com/api
components:
  securitySchemes:
    repairBearer:
      type: http
      scheme: bearer
paths:
  /repairs:
    get:
      operationId: getRepairs
      security:
        - repairBearer: []
      responses:
        "200":
          description: Success
`;

const oauthOpenApi = `openapi: 3.0.0
info:
  title: OAuth E2E API
  version: 1.0.0
servers:
  - url: https://oauth-e2e.example.com/api
components:
  securitySchemes:
    repairOAuth:
      type: oauth2
      flows:
        authorizationCode:
          authorizationUrl: https://identity.example.com/authorize
          tokenUrl: https://identity.example.com/token
          scopes:
            repairs.read: Read repairs
paths:
  /repairs:
    get:
      operationId: getRepairs
      security:
        - repairOAuth: [repairs.read]
      responses:
        "200":
          description: Success
`;

function runCli(args: string[], cwd: string): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workspaceCliPath, ...args], {
      cwd,
      env: { ...process.env, TEMPLATE_VERSION: "local" },
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, cliTimeoutMs);
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (timedOut) {
        reject(new Error("Workspace CLI command timed out"));
      } else {
        resolve({ success: exitCode === 0, stdout, stderr });
      }
    });
  });
}

async function createDeclarativeAgent(
  testFolder: string,
  appName: string,
): Promise<string> {
  const result = await runCli(
    [
      "new",
      "--interactive",
      "false",
      "--telemetry",
      "false",
      "--app-name",
      appName,
      "--capability",
      Capability.DeclarativeAgent,
    ],
    testFolder,
  );
  expect(result.success, `scaffold failed: ${result.stdout}\n${result.stderr}`)
    .to.be.true;
  return path.join(testFolder, appName);
}

async function addOpenApiAction(
  projectPath: string,
  openApiPath: string,
  credentialArgs: string[],
): Promise<void> {
  const result = await runCli(
    [
      "add",
      "action",
      "--api-plugin-type",
      "api-spec",
      "--openapi-spec-type",
      "open-file",
      "--openapi-spec-location",
      openApiPath,
      "--api-operation",
      "GET /repairs",
      "--manifest-file",
      path.join(projectPath, "appPackage", "manifest.json"),
      "--folder",
      projectPath,
      "--interactive",
      "false",
      "--telemetry",
      "false",
      ...credentialArgs,
    ],
    projectPath,
  );
  expect(
    result.success,
    `add action failed: ${result.stdout}\n${result.stderr}`,
  ).to.be.true;
  expect(`${result.stdout}\n${result.stderr}`).to.not.include(testSecret);
}

async function expectEnvironmentValue(
  projectPath: string,
  environmentName: "dev" | "local",
  regularValue: string | undefined,
  secretName: string,
): Promise<void> {
  const regularPath = path.join(projectPath, "env", `.env.${environmentName}`);
  const userPath = path.join(
    projectPath,
    "env",
    `.env.${environmentName}.user`,
  );
  const regularContent = await fs.readFile(regularPath, "utf8");
  const userContent = await fs.readFile(userPath, "utf8");
  if (regularValue) {
    expect(regularContent).to.include(regularValue);
  }
  expect(regularContent).to.not.include(testSecret);
  expect(userContent).to.match(new RegExp(`^${secretName}=crypto_.+`, "m"));
  expect(userContent).to.not.include(testSecret);
}

describe("Declarative agent add-action credentials", function () {
  this.timeout(5 * 60 * 1000);

  it("adds an OpenAPI bearer action with an environment-backed credential", async function () {
    const testFolder = getTestFolder();
    const appName = getUniqueAppName();
    const projectPath = path.join(testFolder, appName);

    try {
      await createDeclarativeAgent(testFolder, appName);
      const openApiPath = path.join(projectPath, "bearer-openapi.yaml");
      await fs.writeFile(openApiPath, bearerOpenApi, "utf8");

      await addOpenApiAction(projectPath, openApiPath, [
        "--api-key",
        testSecret,
      ]);

      const yamlContent = await fs.readFile(
        path.join(projectPath, "m365agents.yml"),
        "utf8",
      );
      expect(yamlContent).to.include("uses: apiKey/register");
      expect(yamlContent).to.include(
        "primaryClientSecret: ${{SECRET_REPAIRBEARER_API_KEY}}",
      );
      expect(yamlContent).to.not.include(testSecret);
      for (const environmentName of ["dev", "local"] as const) {
        await expectEnvironmentValue(
          projectPath,
          environmentName,
          undefined,
          "SECRET_REPAIRBEARER_API_KEY",
        );
      }
    } finally {
      await cleanUpLocalProject(projectPath);
    }
  });

  it("adds an OpenAPI OAuth action with environment-backed credentials", async function () {
    const testFolder = getTestFolder();
    const appName = getUniqueAppName();
    const projectPath = path.join(testFolder, appName);

    try {
      await createDeclarativeAgent(testFolder, appName);
      const openApiPath = path.join(projectPath, "oauth-openapi.yaml");
      await fs.writeFile(openApiPath, oauthOpenApi, "utf8");

      await addOpenApiAction(projectPath, openApiPath, [
        "--openapi-auth-client-id",
        "e2e-client-id",
        "--openapi-auth-client-secret",
        testSecret,
        "--openapi-auth-scopes",
        "repairs.read",
      ]);

      const yamlContent = await fs.readFile(
        path.join(projectPath, "m365agents.yml"),
        "utf8",
      );
      expect(yamlContent).to.include("uses: oauth/register");
      expect(yamlContent).to.include("clientId: ${{REPAIROAUTH_CLIENT_ID}}");
      expect(yamlContent).to.include(
        "clientSecret: ${{SECRET_REPAIROAUTH_CLIENT_SECRET}}",
      );
      expect(yamlContent).to.include("scope: ${{REPAIROAUTH_SCOPE}}");
      expect(yamlContent).to.not.include(testSecret);
      for (const environmentName of ["dev", "local"] as const) {
        await expectEnvironmentValue(
          projectPath,
          environmentName,
          "REPAIROAUTH_CLIENT_ID=e2e-client-id",
          "SECRET_REPAIROAUTH_CLIENT_SECRET",
        );
        const regularContent = await fs.readFile(
          path.join(projectPath, "env", `.env.${environmentName}`),
          "utf8",
        );
        expect(regularContent).to.include("REPAIROAUTH_SCOPE=repairs.read");
      }
    } finally {
      await cleanUpLocalProject(projectPath);
    }
  });
});
