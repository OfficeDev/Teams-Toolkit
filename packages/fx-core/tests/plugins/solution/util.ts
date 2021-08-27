import { TokenCredentialsBase } from "@azure/ms-rest-nodeauth";
import { TokenResponse } from "adal-node";
import { TokenCredential } from "@azure/core-http";
import {
  v2,
  FxError,
  ok,
  PluginContext,
  Result,
  Void,
  Plugin,
  CryptoProvider,
  LogProvider,
  ProjectSettings,
  TelemetryReporter,
  UserInteraction,
  Colors,
  LogLevel,
  InputTextConfig,
  InputTextResult,
  IProgressHandler,
  MultiSelectConfig,
  MultiSelectResult,
  RunnableTask,
  SelectFileConfig,
  SelectFileResult,
  SelectFilesConfig,
  SelectFilesResult,
  SelectFolderConfig,
  SelectFolderResult,
  SingleSelectConfig,
  SingleSelectResult,
  TaskConfig,
  AzureAccountProvider,
  SubscriptionInfo,
  AppStudioTokenProvider,
} from "@microsoft/teamsfx-api";

export const validManifest = {
  $schema:
    "https://developer.microsoft.com/en-us/json-schemas/teams/v1.9/MicrosoftTeams.schema.json",
  manifestVersion: "1.9",
  version: "1.0.0",
  id: "{appid}",
  packageName: "com.microsoft.teams.extension",
  developer: {
    name: "Teams App, Inc.",
    websiteUrl: "{baseUrl}",
    privacyUrl: "{baseUrl}/index.html#/privacy",
    termsOfUseUrl: "{baseUrl}/index.html#/termsofuse",
  },
  icons: {
    color: "color.png",
    outline: "outline.png",
  },
  name: {
    short: "MyApp",
    full: "This field is not used",
  },
  description: {
    short: "Short description of {appName}.",
    full: "Full description of {appName}.",
  },
  accentColor: "#FFFFFF",
  bots: [],
  composeExtensions: [],
  configurableTabs: [],
  staticTabs: [],
  permissions: ["identity", "messageTeamMembers"],
  validDomains: [],
  webApplicationInfo: {
    id: "{appClientId}",
    resource: "{webApplicationInfoResource}",
  },
};

export function mockPublishThatAlwaysSucceed(plugin: Plugin) {
  plugin.publish = async function (_ctx: PluginContext): Promise<Result<any, FxError>> {
    return ok(Void);
  };
}

export const mockedFehostScaffoldArmResult = {
  Modules: {
    frontendHostingProvision: {
      Content: "Mocked frontend hosting provision module content",
    },
  },
  Orchestration: {
    ParameterTemplate: {
      Content: "Mocked frontend hosting parameter content",
      ParameterJson: { FrontendParameter: "FrontendParameterValue" },
    },
    VariableTemplate: {
      Content: "Mocked frontend hosting variable content",
    },
    ModuleTemplate: {
      Content:
        "Mocked frontend hosting module content. Module path: {{PluginOutput.fx-resource-frontend-hosting.Modules.frontendHostingProvision.Path}}. Variable: {{PluginOutput.fx-resource-simple-auth.Outputs.endpoint}}",
      Outputs: {
        endpoint: "Mocked frontend hosting endpoint",
      },
    },
    OutputTemplate: {
      Content: "Mocked frontend hosting output content",
    },
  },
};

export const mockedSimpleAuthScaffoldArmResult = {
  Modules: {
    simpleAuthProvision: {
      Content: "Mocked simple auth provision module content",
    },
  },
  Orchestration: {
    ParameterTemplate: {
      Content: "Mocked simple auth parameter content",
      ParameterJson: { SimpleAuthParameter: "SimpleAuthParameterValue" },
    },
    VariableTemplate: {
      Content: "Mocked simple auth variable content",
    },
    ModuleTemplate: {
      Content:
        "Mocked simple auth module content. Module path: {{PluginOutput.fx-resource-simple-auth.Modules.simpleAuthProvision.Path}}. Variable: {{PluginOutput.fx-resource-frontend-hosting.Outputs.endpoint}}",
      Outputs: {
        endpoint: "Mocked simple auth endpoint",
      },
    },
    OutputTemplate: {
      Content: "Mocked simple auth output content",
    },
  },
};

export const mockedAadScaffoldArmResult = {
  Orchestration: {},
};

export class MockedLogProvider implements LogProvider {
  async info(message: { content: string; color: Colors }[] | string | any): Promise<boolean> {
    return true;
  }
  async log(logLevel: LogLevel, message: string): Promise<boolean> {
    return true;
  }
  async trace(message: string): Promise<boolean> {
    return true;
  }
  async debug(message: string): Promise<boolean> {
    return true;
  }

  async warning(message: string): Promise<boolean> {
    return true;
  }
  async error(message: string): Promise<boolean> {
    return true;
  }
  async fatal(message: string): Promise<boolean> {
    return true;
  }
}

export class MockedTelemetryReporter implements TelemetryReporter {
  sendTelemetryEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ): void {
    return;
  }
  sendTelemetryErrorEvent(
    eventName: string,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number },
    errorProps?: string[]
  ): void {
    return;
  }
  sendTelemetryException(
    error: Error,
    properties?: { [key: string]: string },
    measurements?: { [key: string]: number }
  ): void {
    return;
  }
}

export class MockedCryptoProvider implements CryptoProvider {
  encrypt(plaintext: string): Result<string, FxError> {
    return ok("");
  }
  decrypt(ciphertext: string): Result<string, FxError> {
    return ok("");
  }
}

export class MockedUserInteraction implements UserInteraction {
  async selectOption(config: SingleSelectConfig): Promise<Result<SingleSelectResult, FxError>> {
    return ok({ type: "success" });
  }

  async selectOptions(config: MultiSelectConfig): Promise<Result<MultiSelectResult, FxError>> {
    return ok({ type: "success" });
  }

  async inputText(config: InputTextConfig): Promise<Result<InputTextResult, FxError>> {
    return ok({ type: "success" });
  }

  async selectFile(config: SelectFileConfig): Promise<Result<SelectFileResult, FxError>> {
    return ok({ type: "success" });
  }

  async selectFiles(config: SelectFilesConfig): Promise<Result<SelectFilesResult, FxError>> {
    return ok({ type: "success" });
  }

  async selectFolder(config: SelectFolderConfig): Promise<Result<SelectFolderResult, FxError>> {
    return ok({ type: "success" });
  }

  async openUrl(link: string): Promise<Result<boolean, FxError>> {
    return ok(true);
  }

  async showMessage(
    level: "info" | "warn" | "error",
    message: string | { content: string; color: Colors }[],
    modal: boolean,
    ...items: string[]
  ): Promise<Result<string, FxError>> {
    return ok("");
  }

  createProgressBar(title: string, totalSteps: number): IProgressHandler {
    return {
      start: async (detail?: string) => {
        return;
      },
      end: async (success: boolean) => {
        return;
      },
      next: async (detail?: string) => {
        return;
      },
    };
  }

  async runWithProgress<T>(
    task: RunnableTask<T>,
    config: TaskConfig,
    ...args: any
  ): Promise<Result<T, FxError>> {
    return task.run(...args);
  }
}

export class MockedV2Context implements v2.Context {
  userInteraction: UserInteraction;
  logProvider: LogProvider;
  telemetryReporter: TelemetryReporter;
  cryptoProvider: CryptoProvider;
  projectSetting: ProjectSettings;

  constructor(settings: ProjectSettings) {
    this.userInteraction = new MockedUserInteraction();
    this.logProvider = new MockedLogProvider();
    this.telemetryReporter = new MockedTelemetryReporter();
    this.cryptoProvider = new MockedCryptoProvider();
    this.projectSetting = settings;
  }
}

class MockedTokenCredentials extends TokenCredentialsBase {
  public async getToken(): Promise<TokenResponse> {
    return {
      tokenType: "Bearer",
      expiresIn: Date.now(),
      expiresOn: new Date(),
      resource: "mock",
      accessToken: "mock",
    };
  }
}

export class MockedAppStudioProvider implements AppStudioTokenProvider {
  async getAccessToken(showDialog?: boolean): Promise<string> {
    return "fakeToken";
  }
  async getJsonObject(showDialog?: boolean): Promise<Record<string, unknown>> {
    return {};
  }
  async signout(): Promise<boolean> {
    return true;
  }
  async setStatusChangeMap(
    name: string,
    statusChange: (
      status: string,
      token?: string,
      accountInfo?: Record<string, unknown>
    ) => Promise<void>,
    immediateCall?: boolean
  ): Promise<boolean> {
    return true;
  }
  async removeStatusChangeMap(name: string): Promise<boolean> {
    return true;
  }
}

export class MockedAzureAccountProvider implements AzureAccountProvider {
  async getAccountCredentialAsync(
    showDialog?: boolean,
    tenantId?: string
  ): Promise<TokenCredentialsBase> {
    return new MockedTokenCredentials("mock", "mock");
  }

  async getIdentityCredentialAsync(showDialog?: boolean): Promise<TokenCredential | undefined> {
    return undefined;
  }

  async signout(): Promise<boolean> {
    return true;
  }
  async setStatusChangeMap(
    name: string,
    statusChange: (
      status: string,
      token?: string,
      accountInfo?: Record<string, unknown>
    ) => Promise<void>,
    immediateCall?: boolean
  ): Promise<boolean> {
    return true;
  }
  async removeStatusChangeMap(name: string): Promise<boolean> {
    return true;
  }
  async getJsonObject(showDialog?: boolean): Promise<Record<string, unknown>> {
    return {};
  }
  async listSubscriptions(): Promise<SubscriptionInfo[]> {
    return [];
  }
  async setSubscription(subscriptionId: string): Promise<void> {}
  getAccountInfo(): Record<string, string> {
    return {};
  }
  async getSelectedSubscription(triggerUI?: boolean): Promise<SubscriptionInfo> {
    return {
      subscriptionId: "",
      subscriptionName: "",
      tenantId: "",
    };
  }
}
