// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

/**
 * @author yefuwang@microsoft.com
 */

import {
  err,
  FxError,
  IProgressHandler,
  ok,
  Platform,
  Result,
  SystemError,
} from "@microsoft/teamsfx-api";
import mockedEnv, { RestoreFn } from "mocked-env";
import Container from "typedi";
import { assert, vi } from "vitest";
import { SummaryConstant } from "../../../src/component/configManager/constant";
import { DriverDefinition } from "../../../src/component/configManager/interface";
import { Lifecycle } from "../../../src/component/configManager/lifecycle";
import { DriverContext } from "../../../src/component/driver/interface/commonArgs";
import { ExecutionResult, StepDriver } from "../../../src/component/driver/interface/stepDriver";
import { envUtil } from "../../../src/component/utils/envUtil";
import { MockedAzureAccountProvider, MockedM365Provider } from "../../core/utils";
import {
  MockedLogProvider,
  MockedTelemetryReporter,
  MockedUserInteraction,
} from "../../plugins/solution/util";

const mockedDriverContext: DriverContext = {
  m365TokenProvider: new MockedM365Provider(),
  azureAccountProvider: new MockedAzureAccountProvider(),
  ui: new MockedUserInteraction(),
  progressBar: undefined,
  logProvider: new MockedLogProvider(),
  telemetryReporter: new MockedTelemetryReporter(),
  projectPath: "",
  platform: Platform.VSCode,
};

class DriverA implements StepDriver {
  progressTitle = "mocked progress title";

  async execute(args: unknown, ctx: DriverContext): Promise<ExecutionResult> {
    return {
      result: ok(new Map([["OUTPUT_A", "VALUE_A"]])),
      summaries: [],
    };
  }
}

class DriverAWithSummary extends DriverA {
  async execute(args: unknown, ctx: DriverContext): Promise<ExecutionResult> {
    return {
      result: ok(new Map([["OUTPUT_A", "VALUE_A"]])),
      summaries: ["Environment variable OUTPUT_A set in env/.env file"],
    };
  }
}

class DriverB implements StepDriver {
  progressTitle = "mocked progress title";

  async execute(args: unknown, ctx: DriverContext): Promise<ExecutionResult> {
    return {
      result: ok(new Map([["OUTPUT_B", "VALUE_B"]])),
      summaries: [],
    };
  }
}

class DriverBWithSummary extends DriverB {
  async execute(args: unknown, ctx: DriverContext): Promise<ExecutionResult> {
    return {
      result: ok(new Map([["OUTPUT_B", "VALUE_B"]])),
      summaries: ["Environment variable OUTPUT_B set in env/.env file"],
    };
  }
}

class DriverThatCapitalize implements StepDriver {
  async execute(args: { INPUT_A: string }, ctx: DriverContext): Promise<ExecutionResult> {
    return {
      result: ok(new Map([["OUTPUT", args.INPUT_A.toUpperCase()]])),
      summaries: [],
    };
  }
}

class DriverThatCapitalizeWithSummary extends DriverThatCapitalize {
  async execute(args: { INPUT_A: string }, ctx: DriverContext): Promise<ExecutionResult> {
    return {
      result: ok(new Map([["OUTPUT", args.INPUT_A.toUpperCase()]])),
      summaries: ["Environment variable OUTPUT set in env/.env file"],
    };
  }
}

class DriverThatLowercase implements StepDriver {
  async execute(args: { INPUT_A: string }, ctx: DriverContext): Promise<ExecutionResult> {
    return {
      result: ok(new Map([["OUTPUT_C", args.INPUT_A.toLowerCase()]])),
      summaries: [],
    };
  }
}

class DriverThatHasNestedArgs implements StepDriver {
  async execute(args: { key: [{ key1: string }] }, ctx: DriverContext): Promise<ExecutionResult> {
    return {
      result: ok(new Map([["OUTPUT_D", args.key.map((e) => e.key1).join(",")]])),
      summaries: [],
    };
  }
}

class DriverThatReturnsErrorWithSummary implements StepDriver {
  async execute(args: unknown, context: DriverContext): Promise<ExecutionResult> {
    const fxError: FxError = {
      name: "fakeError",
      message: "fake message",
      source: "xxx",
      timestamp: new Date(),
    };
    return { result: err(fxError), summaries: [] };
  }
}

const mockedError = new SystemError("mockedSource", "mockedError", "mockedMessage");

class DriverThatUsesEnvField implements StepDriver {
  progressTitle = "mocked progress title";

  async execute(args: unknown, context: DriverContext): Promise<ExecutionResult> {
    if (process.env["ENV_VAR1"]) {
      return {
        result: ok(new Map([["OUTPUT_E", process.env["ENV_VAR1"]]])),
        summaries: [],
      };
    } else {
      return { result: err(mockedError), summaries: [] };
    }
  }
}

class DriverThatUsesWriteToEnvironmentFileField implements StepDriver {
  async run(args: unknown, context: DriverContext): Promise<Result<Map<string, string>, FxError>> {
    throw new Error(`not implemented`);
  }

  async execute(
    args: unknown,
    context: DriverContext,
    outputVarNames: Map<string, string>
  ): Promise<ExecutionResult> {
    const ret = [...outputVarNames.values()].map(
      (value) => [value, value.toLocaleLowerCase()] as const
    );
    return { result: ok(new Map([...ret])), summaries: [] };
  }
}

describe("v3 lifecyle", () => {
  describe("when driver name not found", () => {
    before(() => {
      vi.spyOn(Container, "has").mockReturnValue(false);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("should return error", async () => {
      const driverDefs: DriverDefinition[] = [];
      driverDefs.push({
        name: "xxx",
        uses: "xxx",
        with: {},
      });

      const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");

      const { result: execResult, summaries } = await lifecycle.execute(mockedDriverContext);
      assert(
        execResult.isErr() &&
          execResult.error.kind === "Failure" &&
          execResult.error.error.name === "InvalidYmlActionNameError"
      );

      assert(summaries.length === 0, "summary list should be empty");
    });
  });

  describe("when run/execute with multiple drivers", () => {
    before(() => {
      vi.spyOn(Container, "has").mockImplementation((token: unknown) => {
        const name = String(token);
        return name.includes("DriverA") || name.includes("DriverB");
      });
      vi.spyOn(Container, "get").mockImplementation((token: unknown) => {
        const name = String(token);
        if (name.includes("DriverA")) {
          return new DriverA();
        }
        if (name.includes("DriverB")) {
          return new DriverB();
        }
        return undefined as unknown as object;
      });
    });

    after(() => {
      mockedDriverContext.progressBar = undefined;
      vi.restoreAllMocks();
    });

    it("should return combined output", async () => {
      const driverDefs: DriverDefinition[] = [];
      driverDefs.push({
        name: "xxx",
        uses: "DriverA",
        with: {},
      });
      driverDefs.push({
        name: "xxx",
        uses: "DriverB",
        with: {},
      });

      const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
      const nextStub = vi.fn();
      mockedDriverContext.progressBar = {
        next: nextStub,
      } as unknown as IProgressHandler;

      const { result: execResult, summaries } = await lifecycle.execute(mockedDriverContext);
      assert(
        execResult.isOk() &&
          execResult.value.size === 2 &&
          execResult.value.get("OUTPUT_A") === "VALUE_A" &&
          execResult.value.get("OUTPUT_B") === "VALUE_B"
      );

      assert(
        summaries.length === 2 && summaries[0].length === 0 && summaries[1].length === 0,
        "summary list should have 2 empty items, since DriverA and DriverB doesn't implement execute()"
      );

      assert.isTrue(nextStub.mock.calls.length === 2);
    });
  });

  describe("when run/execute with valid placeholders", async () => {
    let restoreFn: RestoreFn | undefined = undefined;

    before(() => {
      restoreFn = mockedEnv({
        SOME_ENV_VAR: "xxx",
      });
      vi.spyOn(Container, "has").mockImplementation((token: unknown) => {
        return String(token).includes("DriverThatCapitalize");
      });
      vi.spyOn(Container, "get").mockImplementation((token: unknown) => {
        if (String(token).includes("DriverThatCapitalize")) {
          return new DriverThatCapitalize();
        }
        return undefined as unknown as object;
      });
    });

    after(() => {
      if (restoreFn) {
        restoreFn();
      }
      vi.restoreAllMocks();
    });

    it("should replace all placeholders", async () => {
      const driverDefs: DriverDefinition[] = [];
      driverDefs.push({
        uses: "DriverThatCapitalize",
        with: { INPUT_A: "hello ${{ SOME_ENV_VAR }}" },
      });

      const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");

      const { result: execResult, summaries } = await lifecycle.execute(mockedDriverContext);
      assert(execResult.isOk() && execResult.value.get("OUTPUT") === "HELLO XXX");
      assert(summaries.length === 1 && summaries[0].length === 0);

      assert((driverDefs[0].with as any).INPUT_A === "hello xxx");
    });
  });

  describe("when dealing with multiple valid placeholders", async () => {
    let restoreFn: RestoreFn | undefined = undefined;

    before(() => {
      restoreFn = mockedEnv({
        SOME_ENV_VAR: "xxx",
        OTHER_ENV_VAR: "yyy",
      });
      vi.spyOn(Container, "has").mockImplementation((token: unknown) => {
        const name = String(token);
        return (
          name.includes("DriverThatCapitalize") ||
          name.includes("DriverThatLowercase") ||
          name.includes("DriverThatHasNestedArgs") ||
          name.includes("DriverThatUsesEnvField")
        );
      });
      vi.spyOn(Container, "get").mockImplementation((token: unknown) => {
        const name = String(token);
        if (name.includes("DriverThatCapitalize")) {
          return new DriverThatCapitalize();
        }
        if (name.includes("DriverThatLowercase")) {
          return new DriverThatLowercase();
        }
        if (name.includes("DriverThatHasNestedArgs")) {
          return new DriverThatHasNestedArgs();
        }
        if (name.includes("DriverThatUsesEnvField")) {
          return new DriverThatUsesEnvField();
        }
        return undefined as unknown as object;
      });
    });

    after(() => {
      if (restoreFn) {
        restoreFn();
      }
      vi.restoreAllMocks();
    });

    it("should replace all placeholders for a single driver", async () => {
      let driverDefs: DriverDefinition[] = [];
      driverDefs.push({
        uses: "DriverThatCapitalize",
        with: { INPUT_A: "hello ${{ SOME_ENV_VAR }} and ${{OTHER_ENV_VAR}}" },
      });

      let lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");

      driverDefs = [];
      driverDefs.push({
        uses: "DriverThatCapitalize",
        with: { INPUT_A: "hello ${{ SOME_ENV_VAR }} and ${{OTHER_ENV_VAR}}" },
      });

      lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
      const { result: execResult, summaries } = await lifecycle.execute(mockedDriverContext);
      assert(execResult.isOk() && execResult.value.get("OUTPUT") === "HELLO XXX AND YYY");
      assert(summaries.length === 1 && summaries[0].length === 0);
    });

    it("should replace all placeholders for every driver", async () => {
      let driverDefs: DriverDefinition[] = [];
      driverDefs.push({
        uses: "DriverThatCapitalize",
        with: { INPUT_A: "hello ${{ SOME_ENV_VAR }}" },
      });
      driverDefs.push({
        uses: "DriverThatLowercase",
        with: { INPUT_A: "Hello ${{OTHER_ENV_VAR}}" },
      });

      let lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");

      driverDefs = [];
      driverDefs.push({
        uses: "DriverThatCapitalize",
        with: { INPUT_A: "hello ${{ SOME_ENV_VAR }}" },
      });
      driverDefs.push({
        uses: "DriverThatLowercase",
        with: { INPUT_A: "Hello ${{OTHER_ENV_VAR}}" },
      });

      lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
      const { result: execResult, summaries } = await lifecycle.execute(mockedDriverContext);
      assert(
        execResult.isOk() &&
          execResult.value.get("OUTPUT") === "HELLO XXX" &&
          execResult.value.get("OUTPUT_C") === "hello yyy"
      );

      assert(summaries.length === 2 && summaries[0].length === 0 && summaries[1].length === 0);
    });

    it("should replace all placeholders for every driver with nested args", async () => {
      let driverDefs: DriverDefinition[] = [];
      driverDefs.push({
        uses: "DriverThatHasNestedArgs",
        with: {
          key: [{ key1: "hello ${{ SOME_ENV_VAR }}" }, { key1: "hello ${{ OTHER_ENV_VAR }}" }],
        },
      });

      let lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");

      driverDefs = [];
      driverDefs.push({
        uses: "DriverThatHasNestedArgs",
        with: {
          key: [{ key1: "hello ${{ SOME_ENV_VAR }}" }, { key1: "hello ${{ OTHER_ENV_VAR }}" }],
        },
      });

      lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
      const { result: execResult, summaries } = await lifecycle.execute(mockedDriverContext);
      assert(execResult.isOk() && execResult.value.get("OUTPUT_D") === "hello xxx,hello yyy");
      assert(summaries.length === 1 && summaries[0].length === 0);
    });

    describe("execute()", async () => {
      it("should resolve inter-driver dependency", async () => {
        const driverDefs: DriverDefinition[] = [];
        driverDefs.push({
          uses: "DriverThatCapitalize",
          with: { INPUT_A: "hello ${{ SOME_ENV_VAR }}" },
        });
        // OUTPUT is a placeholder for the output of the previous driver
        driverDefs.push({
          uses: "DriverThatLowercase",
          with: { INPUT_A: "Hello ${{OUTPUT}}" },
        });

        const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
        const { result, summaries } = await lifecycle.execute(mockedDriverContext);
        assert(
          result.isOk() &&
            result.value.get("OUTPUT") === "HELLO XXX" &&
            result.value.get("OUTPUT_C") === "hello hello xxx"
        );

        assert(summaries.length === 2 && summaries[0].length === 0 && summaries[1].length === 0);
      });

      it("should resolve placeholders in env field", async () => {
        const driverDefs: DriverDefinition[] = [];
        driverDefs.push({
          uses: "DriverThatUsesEnvField",
          with: {},
          env: {
            ENV_VAR1: "hello ${{ SOME_ENV_VAR }}",
          },
        });

        const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
        const { result, summaries } = await lifecycle.execute(mockedDriverContext);
        assert(result.isOk() && result.value.get("OUTPUT_E") === "hello xxx");
        assert(summaries.length === 1 && summaries[0].length === 0);
      });
    });
  });

  describe("when dealing with unresolved placeholders", async () => {
    let restoreFn: RestoreFn | undefined = undefined;

    before(() => {
      vi.spyOn(Container, "has").mockImplementation((token: unknown) => {
        const name = String(token);
        return (
          name.includes("DriverThatCapitalize") ||
          name.includes("DriverThatLowercase") ||
          name.includes("DriverThatUsesEnvField")
        );
      });
      vi.spyOn(Container, "get").mockImplementation((token: unknown) => {
        const name = String(token);
        if (name.includes("DriverThatCapitalize")) {
          return new DriverThatCapitalize();
        }
        if (name.includes("DriverThatLowercase")) {
          return new DriverThatLowercase();
        }
        if (name.includes("DriverThatUsesEnvField")) {
          return new DriverThatUsesEnvField();
        }
        return undefined as unknown as object;
      });
    });

    after(() => {
      mockedDriverContext.progressBar = undefined;
      vi.restoreAllMocks();
      if (restoreFn) {
        restoreFn();
      }
    });

    restoreFn = mockedEnv({
      AZURE_OPENAI_DEPLOYMENT_NAME: "gpt-4o",
    });

    it("should return unresolved placeholders", async () => {
      const driverDefs: DriverDefinition[] = [];
      driverDefs.push({
        uses: "DriverThatCapitalize",
        with: { INPUT_A: "hello ${{ SOME_ENV_VAR }} ${{AAA}} ${{BBB}}" },
      });
      driverDefs.push({
        uses: "DriverThatLowercase",
        with: { INPUT_A: "${{CCC}} Hello ${{OTHER_ENV_VAR}}" },
      });

      const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");

      const unresolved = lifecycle.resolvePlaceholders();
      assert(
        unresolved.length === 5 &&
          unresolved.some((x) => x === "SOME_ENV_VAR") &&
          unresolved.some((x) => x === "AAA") &&
          unresolved.some((x) => x === "BBB") &&
          unresolved.some((x) => x === "CCC") &&
          unresolved.some((x) => x === "OTHER_ENV_VAR")
      );

      const { result: execResult, summaries } = await lifecycle.execute(mockedDriverContext);
      assert(
        execResult.isErr() &&
          execResult.error.kind === "PartialSuccess" &&
          execResult.error.reason.kind === "UnresolvedPlaceholders" &&
          execResult.error.reason.unresolvedPlaceHolders.length === 3 &&
          execResult.error.reason.unresolvedPlaceHolders.some((x) => x === "SOME_ENV_VAR") &&
          execResult.error.reason.unresolvedPlaceHolders.some((x) => x === "AAA") &&
          execResult.error.reason.unresolvedPlaceHolders.some((x) => x === "BBB") &&
          execResult.error.reason.failedDriver.uses === "DriverThatCapitalize",
        "execute() should fail at first driver because of unresolved placeholders and stop execution"
      );

      assert(
        summaries.length === 1 &&
          summaries[0].length === 1 &&
          summaries[0][0].includes("Unresolved placeholders")
      );
    });

    it("should return unresolved placeholders with nested argument", async () => {
      const driverDefs: DriverDefinition[] = [];
      driverDefs.push({
        uses: "DriverThatCapitalize",
        with: { INPUT_A: ["hello ${{ SOME_ENV_VAR }} ${{AAA}} ${{BBB}}"] },
      });
      driverDefs.push({
        uses: "DriverThatLowercase",
        with: { INPUT_A: { a: "${{CCC}} Hello ${{OTHER_ENV_VAR}}" } },
      });

      const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");

      const unresolved = lifecycle.resolvePlaceholders();
      assert(
        unresolved.length === 5 &&
          unresolved.some((x) => x === "SOME_ENV_VAR") &&
          unresolved.some((x) => x === "AAA") &&
          unresolved.some((x) => x === "BBB") &&
          unresolved.some((x) => x === "CCC") &&
          unresolved.some((x) => x === "OTHER_ENV_VAR")
      );

      const { result: execResult, summaries } = await lifecycle.execute(mockedDriverContext);
      // execute() will fail at first driver because of unresolved placeholders and stops
      assert(
        execResult.isErr() &&
          execResult.error.kind === "PartialSuccess" &&
          execResult.error.reason.kind === "UnresolvedPlaceholders" &&
          execResult.error.reason.unresolvedPlaceHolders.length === 3 &&
          execResult.error.reason.unresolvedPlaceHolders.some((x) => x === "SOME_ENV_VAR") &&
          execResult.error.reason.unresolvedPlaceHolders.some((x) => x === "AAA") &&
          execResult.error.reason.unresolvedPlaceHolders.some((x) => x === "BBB") &&
          execResult.error.reason.failedDriver.uses === "DriverThatCapitalize"
      );

      assert(
        summaries.length === 1 &&
          summaries[0].length === 1 &&
          summaries[0][0].includes("Unresolved placeholders")
      );
    });

    it("should escape OpenAI related env keys", async () => {
      const driverDefs: DriverDefinition[] = [];
      driverDefs.push({
        uses: "file/createOrUpdateEnvironmentFile",
        with: {
          target: ".env",
          envs: {
            OPENAI_API_KEY: "${{SECRET_OPENAI_API_KEY}}",
            AZURE_OPENAI_DEPLOYMENT_NAME: "${{AZURE_OPENAI_DEPLOYMENT_NAME}}",
          },
        },
      });

      const lifecycle = new Lifecycle("deploy", driverDefs, "1.0.0");

      const unresolved = lifecycle.resolvePlaceholders();
      assert.equal(unresolved.length, 0);
    });

    describe("execute()", async () => {
      it("should return unresolved placeholders in env field", async () => {
        const driverDefs: DriverDefinition[] = [];
        driverDefs.push({
          uses: "DriverThatUsesEnvField",
          with: {},
          env: {
            ENV_VAR1: "hello ${{ SOME_ENV_VAR }}",
          },
        });

        const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
        const nextStub = vi.fn();
        mockedDriverContext.progressBar = {
          next: nextStub,
        } as unknown as IProgressHandler;
        const { result, summaries } = await lifecycle.execute(mockedDriverContext);
        assert(
          result.isErr() &&
            result.error.kind === "PartialSuccess" &&
            result.error.reason.kind === "UnresolvedPlaceholders" &&
            result.error.reason.unresolvedPlaceHolders.some((x) => x === "SOME_ENV_VAR") &&
            result.error.reason.failedDriver.uses === "DriverThatUsesEnvField"
        );

        assert(
          summaries.length === 1 &&
            summaries[0].length === 1 &&
            summaries[0][0].includes("Unresolved placeholders")
        );

        assert.isTrue(nextStub.mock.calls.length === 1);
      });
    });
  });
});

describe("Summary", () => {
  const restoreFn = mockedEnv({});

  before(() => {
    vi.spyOn(Container, "has").mockImplementation((token: unknown) => {
      const name = String(token);
      return (
        name.includes("DriverAWithSummary") ||
        name.includes("DriverBWithSummary") ||
        name.includes("DriverThatCapitalizeWithSummary") ||
        name.includes("DriverThatReturnsErrorWithSummary")
      );
    });

    vi.spyOn(Container, "get").mockImplementation((token: unknown) => {
      const name = String(token);
      if (name.includes("DriverAWithSummary")) {
        return new DriverAWithSummary();
      }
      if (name.includes("DriverBWithSummary")) {
        return new DriverBWithSummary();
      }
      if (name.includes("DriverThatCapitalizeWithSummary")) {
        return new DriverThatCapitalizeWithSummary();
      }
      if (name.includes("DriverThatReturnsErrorWithSummary")) {
        return new DriverThatReturnsErrorWithSummary();
      }
      return undefined as unknown as object;
    });
  });

  after(() => {
    vi.restoreAllMocks();
    if (restoreFn) {
      restoreFn();
    }
  });

  it("should be returned if all drivers' execute() return ok", async () => {
    const driverDefs: DriverDefinition[] = [];
    driverDefs.push({
      uses: "DriverAWithSummary",
      with: {},
    });
    driverDefs.push({
      uses: "DriverBWithSummary",
      with: {},
    });

    const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
    const { result, summaries } = await lifecycle.execute(mockedDriverContext);

    assert(
      result.isOk() &&
        result.value.get("OUTPUT_A") === "VALUE_A" &&
        result.value.get("OUTPUT_B") === "VALUE_B"
    );

    assert(
      summaries.length === 2 &&
        summaries[0].length === 1 &&
        summaries[0][0] ===
          `${SummaryConstant.Succeeded} Environment variable OUTPUT_A set in env/.env file` &&
        summaries[1].length === 1 &&
        summaries[1][0] ===
          `${SummaryConstant.Succeeded} Environment variable OUTPUT_B set in env/.env file`
    );
  });

  it("should contain error summary if any driver's execute() returns error", async () => {
    const driverDefs: DriverDefinition[] = [];
    driverDefs.push({
      uses: "DriverAWithSummary",
      with: {},
    });
    driverDefs.push({
      uses: "DriverBWithSummary",
      with: {},
    });
    driverDefs.push({
      uses: "DriverThatReturnsErrorWithSummary",
      with: {},
    });

    const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
    const { result, summaries } = await lifecycle.execute(mockedDriverContext);

    assert(
      result.isErr() &&
        result.error.kind === "PartialSuccess" &&
        result.error.reason.kind === "DriverError" &&
        result.error.reason.failedDriver.uses === "DriverThatReturnsErrorWithSummary" &&
        result.error.reason.error.name === "fakeError" &&
        result.error.env.size === 2 &&
        result.error.env.get("OUTPUT_A") === "VALUE_A" &&
        result.error.env.get("OUTPUT_B") === "VALUE_B"
    );

    assert(
      summaries.length === 3 &&
        summaries[0].length === 1 &&
        summaries[0][0] ===
          `${SummaryConstant.Succeeded} Environment variable OUTPUT_A set in env/.env file` &&
        summaries[1].length === 1 &&
        summaries[1][0] ===
          `${SummaryConstant.Succeeded} Environment variable OUTPUT_B set in env/.env file` &&
        summaries[2].length === 1 &&
        summaries[2][0].includes(`${SummaryConstant.Failed} fake message`)
    );
  });

  it("should contain error summary if there are unresolved placeholders", async () => {
    const driverDefs: DriverDefinition[] = [];
    driverDefs.push({
      uses: "DriverAWithSummary",
      with: {},
    });
    driverDefs.push({
      uses: "DriverBWithSummary",
      with: {
        BBB: "${{ AAA }} ${{ CCC }}",
      },
    });
    driverDefs.push({
      uses: "DriverThatReturnsErrorWithSummary",
      with: {},
    });

    const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
    const { result, summaries } = await lifecycle.execute(mockedDriverContext);

    assert(
      result.isErr() &&
        result.error.kind === "PartialSuccess" &&
        result.error.reason.kind === "UnresolvedPlaceholders" &&
        result.error.reason.failedDriver.uses === "DriverBWithSummary" &&
        result.error.env.size === 1 &&
        result.error.env.get("OUTPUT_A") === "VALUE_A" &&
        result.error.reason.unresolvedPlaceHolders.some((x) => x === "AAA")
    );

    assert(
      summaries.length === 2 &&
        summaries[0].length === 1 &&
        summaries[0][0] ===
          `${SummaryConstant.Succeeded} Environment variable OUTPUT_A set in env/.env file` &&
        summaries[1].length === 1 &&
        summaries[1][0] === `${SummaryConstant.Failed} Unresolved placeholders: AAA,CCC`,
      `Summary should only contain 2 items, because of execution stops at DriverBWithSummary`
    );
  });
});

describe("writeToEnvironmentFile", () => {
  const restoreFn = mockedEnv({});

  before(() => {
    vi.spyOn(Container, "has").mockImplementation((token: unknown) => {
      return String(token).includes("DriverThatUsesWriteToEnvironmentFileField");
    });

    vi.spyOn(Container, "get").mockImplementation((token: unknown) => {
      if (String(token).includes("DriverThatUsesWriteToEnvironmentFileField")) {
        return new DriverThatUsesWriteToEnvironmentFileField();
      }
      return undefined as unknown as object;
    });
  });

  after(() => {
    vi.restoreAllMocks();
    if (restoreFn) {
      restoreFn();
    }
  });

  it("should work", async () => {
    const driverDefs: DriverDefinition[] = [];
    driverDefs.push({
      uses: "DriverThatUsesWriteToEnvironmentFileField",
      with: {},
      writeToEnvironmentFile: {
        key1: "AAA",
        key2: "BBB",
      },
    });

    const lifecycle = new Lifecycle("configureApp", driverDefs, "1.0.0");
    const { result } = await lifecycle.execute(mockedDriverContext);

    assert(
      result.isOk() &&
        result.value.size === 2 &&
        result.value.has("AAA") &&
        result.value.get("AAA") === "aaa" &&
        result.value.has("BBB") &&
        result.value.get("BBB") === "bbb"
    );
  });
});

describe("env flush to disk between actions", () => {
  let restoreFn: RestoreFn | undefined = undefined;
  const driverAInstance = new DriverA();
  const driverBInstance = new DriverB();

  before(() => {
    restoreFn = mockedEnv({ TEAMSFX_ENV: "local" });
    vi.spyOn(Container, "has").mockImplementation((token: unknown) => {
      const name = String(token);
      return name.includes("DriverA") || name.includes("DriverB");
    });
    vi.spyOn(Container, "get").mockImplementation((token: unknown) => {
      const name = String(token);
      if (name.includes("DriverA")) {
        return driverAInstance;
      }
      if (name.includes("DriverB")) {
        return driverBInstance;
      }
      return undefined as unknown as object;
    });
  });

  after(() => {
    vi.restoreAllMocks();
    if (restoreFn) {
      restoreFn();
    }
  });

  it("should flush env to disk after each driver execution", async () => {
    const writeEnvCalls: Array<{ env: string; envs: Record<string, string> }> = [];
    vi.spyOn(envUtil, "writeEnv").mockImplementation(async (_projectPath, env, envs) => {
      writeEnvCalls.push({ env, envs: { ...envs } });
      return ok(undefined);
    });

    const driverDefs: DriverDefinition[] = [];
    driverDefs.push({ uses: "DriverA", with: {} });
    driverDefs.push({ uses: "DriverB", with: {} });

    const ctx: DriverContext = {
      ...mockedDriverContext,
      projectPath: "/fake/project",
    };

    const lifecycle = new Lifecycle("provision", driverDefs, "1.0.0");
    const { result } = await lifecycle.execute(ctx);

    assert(result.isOk(), "lifecycle should succeed");
    // writeEnv should be called once per driver that produced output
    assert.equal(writeEnvCalls.length, 2, "writeEnv should be called after each driver");
    // After DriverA runs, its output should be flushed
    assert.equal(writeEnvCalls[0].env, "local");
    assert.equal(writeEnvCalls[0].envs["OUTPUT_A"], "VALUE_A");
    // After DriverB runs, both outputs should be present
    assert.equal(writeEnvCalls[1].env, "local");
    assert.equal(writeEnvCalls[1].envs["OUTPUT_A"], "VALUE_A");
    assert.equal(writeEnvCalls[1].envs["OUTPUT_B"], "VALUE_B");
  });
});

// Additional coverage for the per-step env flush guard branches:
//   if (result.value.size > 0 && ctx.projectPath && process.env.TEAMSFX_ENV) { ... }
// and for the writeEnv error path / warning logging.
describe("env flush to disk between actions - edge cases", () => {
  let restoreFn: RestoreFn | undefined = undefined;

  // Driver that returns success with an empty env map; flush must NOT happen.
  class DriverEmptyOk implements StepDriver {
    progressTitle = "mocked progress title";
    async execute(): Promise<ExecutionResult> {
      return { result: ok(new Map<string, string>()), summaries: [] };
    }
  }

  // Driver that returns an error; flush must NOT happen for this driver.
  class DriverErr implements StepDriver {
    progressTitle = "mocked progress title";
    async execute(): Promise<ExecutionResult> {
      return { result: err(mockedError), summaries: [] };
    }
  }

  const driverAInstance = new DriverA();
  const driverEmptyInstance = new DriverEmptyOk();
  const driverErrInstance = new DriverErr();

  beforeEach(() => {
    vi.spyOn(Container, "has").mockImplementation((token: unknown) => {
      const name = String(token);
      return (
        name.includes("DriverA") || name.includes("DriverEmptyOk") || name.includes("DriverErr")
      );
    });
    vi.spyOn(Container, "get").mockImplementation((token: unknown) => {
      const name = String(token);
      if (name.includes("DriverA")) {
        return driverAInstance;
      }
      if (name.includes("DriverEmptyOk")) {
        return driverEmptyInstance;
      }
      if (name.includes("DriverErr")) {
        return driverErrInstance;
      }
      return undefined as unknown as object;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (restoreFn) {
      restoreFn();
      restoreFn = undefined;
    }
  });

  it("should not flush when driver returns empty env map", async () => {
    restoreFn = mockedEnv({ TEAMSFX_ENV: "local" });
    const writeEnvSpy = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));

    const lifecycle = new Lifecycle("provision", [{ uses: "DriverEmptyOk", with: {} }], "1.0.0");
    const { result } = await lifecycle.execute({
      ...mockedDriverContext,
      projectPath: "/fake/project",
    });

    assert(result.isOk(), "lifecycle should succeed");
    assert.equal(
      writeEnvSpy.mock.calls.length,
      0,
      "writeEnv should not be called for empty output"
    );
  });

  it("should not flush when ctx.projectPath is empty", async () => {
    restoreFn = mockedEnv({ TEAMSFX_ENV: "local" });
    const writeEnvSpy = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));

    const lifecycle = new Lifecycle("provision", [{ uses: "DriverA", with: {} }], "1.0.0");
    const { result } = await lifecycle.execute({
      ...mockedDriverContext,
      projectPath: "",
    });

    assert(result.isOk(), "lifecycle should succeed");
    assert.equal(
      writeEnvSpy.mock.calls.length,
      0,
      "writeEnv should not be called when projectPath is empty"
    );
  });

  it("should not flush when TEAMSFX_ENV is not set", async () => {
    restoreFn = mockedEnv({ TEAMSFX_ENV: undefined });
    const writeEnvSpy = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));

    const lifecycle = new Lifecycle("provision", [{ uses: "DriverA", with: {} }], "1.0.0");
    const { result } = await lifecycle.execute({
      ...mockedDriverContext,
      projectPath: "/fake/project",
    });

    assert(result.isOk(), "lifecycle should succeed");
    assert.equal(
      writeEnvSpy.mock.calls.length,
      0,
      "writeEnv should not be called when TEAMSFX_ENV is not set"
    );
  });

  it("should log a warning but continue when writeEnv returns an error", async () => {
    restoreFn = mockedEnv({ TEAMSFX_ENV: "local" });
    const writeEnvSpy = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(err(mockedError));
    const logProvider = new MockedLogProvider();
    const warningSpy = vi.spyOn(logProvider, "warning");

    const lifecycle = new Lifecycle("provision", [{ uses: "DriverA", with: {} }], "1.0.0");
    const { result } = await lifecycle.execute({
      ...mockedDriverContext,
      projectPath: "/fake/project",
      logProvider,
    });

    assert(result.isOk(), "lifecycle should still succeed when flush fails");
    assert.equal(writeEnvSpy.mock.calls.length, 1, "writeEnv should be attempted once");
    assert.equal(warningSpy.mock.calls.length, 1, "warning should be logged exactly once");
    const warningMsg = String(warningSpy.mock.calls[0][0]);
    assert(
      warningMsg.includes("Failed to flush env output to disk"),
      `warning message should describe the flush failure, got: ${warningMsg}`
    );
    assert(
      warningMsg.includes("mockedMessage"),
      `warning message should include underlying error message, got: ${warningMsg}`
    );
  });

  it("should log a fallback warning when writeEnv returns an error without message", async () => {
    restoreFn = mockedEnv({ TEAMSFX_ENV: "local" });
    // Simulate the defensive `error?.message ?? String(error)` branch by returning a
    // non-Error-shaped value as the error.
    const oddError = "string-error" as unknown as FxError;
    const writeEnvSpy = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(err(oddError));
    const logProvider = new MockedLogProvider();
    const warningSpy = vi.spyOn(logProvider, "warning");

    const lifecycle = new Lifecycle("provision", [{ uses: "DriverA", with: {} }], "1.0.0");
    const { result } = await lifecycle.execute({
      ...mockedDriverContext,
      projectPath: "/fake/project",
      logProvider,
    });

    assert(result.isOk());
    assert.equal(writeEnvSpy.mock.calls.length, 1);
    assert.equal(warningSpy.mock.calls.length, 1);
    const warningMsg = String(warningSpy.mock.calls[0][0]);
    assert(
      warningMsg.includes("string-error"),
      `warning message should fall back to String(error), got: ${warningMsg}`
    );
  });

  it("should not flush after a driver that returns an error", async () => {
    restoreFn = mockedEnv({ TEAMSFX_ENV: "local" });
    const writeEnvSpy = vi.spyOn(envUtil, "writeEnv").mockResolvedValue(ok(undefined));

    // DriverA succeeds (and flushes once), then DriverErr fails (no flush for it).
    const lifecycle = new Lifecycle(
      "provision",
      [
        { uses: "DriverA", with: {} },
        { uses: "DriverErr", with: {} },
      ],
      "1.0.0"
    );
    const { result } = await lifecycle.execute({
      ...mockedDriverContext,
      projectPath: "/fake/project",
    });

    assert(result.isErr(), "lifecycle should fail because of DriverErr");
    assert.equal(
      writeEnvSpy.mock.calls.length,
      1,
      "writeEnv should only be called once (for the successful DriverA)"
    );
    assert.equal(writeEnvSpy.mock.calls[0][1], "local");
    const flushedEnvs = writeEnvSpy.mock.calls[0][2] as Record<string, string>;
    assert.equal(flushedEnvs["OUTPUT_A"], "VALUE_A");
  });
});
