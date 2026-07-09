// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  InputsWithProjectPath,
  Platform,
  SystemError,
  UserError,
  ok,
} from "@microsoft/teamsfx-api";
import mockedEnv, { RestoreFn } from "mocked-env";
import { getLocalizedString } from "../../src/common/localizeUtils";
import { deployUtils } from "../../src/component/deployUtils";
import { createDriverContext } from "../../src/component/driver/util/utils";
import { expandEnvironmentVariable } from "../../src/component/utils/common";
import { TeamsFxTelemetryReporter } from "../../src/component/utils/teamsFxTelemetryReporter";
import { setTools } from "../../src/common/globalVars";
import { MockTools } from "../core/utils";
import { MockedTelemetryReporter } from "../plugins/solution/util";
import { resolveString } from "../../src/component/configManager/lifecycle";
import { assert, chai, vi } from "vitest";

describe("resetEnvInfoWhenSwitchM365", () => {
  const sandbox = vi;
  const tools = new MockTools();
  setTools(tools);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("askForDeployConsentV3 confirm", async () => {
    process.env.TEAMSFX_ENV = "dev";
    const inputs: InputsWithProjectPath = {
      projectPath: ".",
      platform: Platform.VSCode,
    };
    const ctx = createDriverContext(inputs);
    vi.spyOn(ctx.ui!, "showMessage").mockResolvedValue(
      ok(getLocalizedString("core.option.deploy"))
    );
    const res = await deployUtils.askForDeployConsentV3(ctx);
    assert.isTrue(res.isOk());
  });
  it("askForDeployConsentV3 cancel", async () => {
    process.env.TEAMSFX_ENV = "dev";
    const inputs: InputsWithProjectPath = {
      projectPath: ".",
      platform: Platform.VSCode,
    };
    const ctx = createDriverContext(inputs);
    vi.spyOn(ctx.ui!, "showMessage").mockResolvedValue(ok(undefined));
    const res = await deployUtils.askForDeployConsentV3(ctx);
    assert.isTrue(res.isErr());
  });
});

describe("expandEnvironmentVariable", () => {
  const template = "ENV_A value:${{ENV_A}}" + "ENV_B value:${{ENV_B}}";

  let envRestore: RestoreFn | undefined;

  afterEach(() => {
    if (envRestore) {
      envRestore();
      envRestore = undefined;
    }
  });

  it("should expand all environment variables", () => {
    envRestore = mockedEnv({
      ENV_A: "A",
      ENV_B: "B",
    });

    const result = expandEnvironmentVariable(template);

    chai.expect(result).to.equal("ENV_A value:A" + "ENV_B value:B");
  });

  it("should not expand placeholder when specified environment variable not exist", () => {
    envRestore = mockedEnv({
      ENV_A: "A",
    });

    const result = expandEnvironmentVariable(template);

    chai.expect(result).to.equal("ENV_A value:A" + "ENV_B value:${{ENV_B}}");
  });

  it("should not modify original string", () => {
    envRestore = mockedEnv({
      ENV_A: "A",
      ENV_B: "B",
    });

    expandEnvironmentVariable(template);

    chai.expect(template).to.equal("ENV_A value:${{ENV_A}}" + "ENV_B value:${{ENV_B}}");
  });

  it("should do nothing with non valid placeholder", () => {
    const template = "placeholder:${{}}";

    const result = expandEnvironmentVariable(template);

    chai.expect(result).to.equal("placeholder:${{}}");
  });

  it("should allow leading and trailing whitespaces in environment variable name", () => {
    const template = "placeholder: ${{ ENV_A }}";

    envRestore = mockedEnv({
      ENV_A: "A",
    });

    const result = expandEnvironmentVariable(template);

    chai.expect(result).to.equal("placeholder: A");
  });

  it("should allow leading empty string for app name suffix", () => {
    const template = "myapp${{ APP_NAME_SUFFIX }}";
    envRestore = mockedEnv({
      APP_NAME_SUFFIX: "",
    });
    const result = expandEnvironmentVariable(template);
    chai.expect(result).to.equal("myapp");
  });
  it("should replace for none-empty app name suffix", () => {
    const template = "myapp${{ APP_NAME_SUFFIX }}";
    envRestore = mockedEnv({
      APP_NAME_SUFFIX: "abc",
    });
    const result = expandEnvironmentVariable(template);
    chai.expect(result).to.equal("myappabc");
  });
  it("resolveString for empty APP_NAME_SUFFIX", () => {
    const template = "myapp${{ APP_NAME_SUFFIX }}";
    envRestore = mockedEnv({
      APP_NAME_SUFFIX: "",
    });
    const resolved: string[] = [];
    const unresolved: string[] = [];
    resolveString(template, resolved, unresolved);
    chai.expect(resolved.length).to.equal(1);
  });
  it("resolveString for undefined APP_NAME_SUFFIX", () => {
    const template = "myapp${{ APP_NAME_SUFFIX }}";
    envRestore = mockedEnv({
      APP_NAME_SUFFIX: undefined,
    });
    const resolved: string[] = [];
    const unresolved: string[] = [];
    resolveString(template, resolved, unresolved);
    chai.expect(unresolved.length).to.equal(1);
  });
  it("resolveString for none empty APP_NAME_SUFFIX", () => {
    const template = "myapp${{ APP_NAME_SUFFIX }}";
    envRestore = mockedEnv({
      APP_NAME_SUFFIX: "abc",
    });
    const resolved: string[] = [];
    const unresolved: string[] = [];
    const result = resolveString(template, resolved, unresolved);
    chai.expect(result).to.equal("myappabc");
    chai.expect(resolved.length).to.equal(1);
  });

  it("support input envs", () => {
    const template = "myapp${{ APP_NAME_SUFFIX }}";
    const result = expandEnvironmentVariable(template, { APP_NAME_SUFFIX: "abc" });
    chai.expect(result).to.equal("myappabc");
  });
});

describe("TeamsFxTelemetryReporter", () => {
  const mockedTelemetryReporter = new MockedTelemetryReporter();
  const teamsFxTelemetryReporter = new TeamsFxTelemetryReporter(mockedTelemetryReporter);
  let reporterCalled: boolean;

  beforeEach(() => {
    reporterCalled = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    chai.expect(reporterCalled).to.be.true; // Because TeamsFxTelemetryReport ignores all exceptions which include test failures, please check your test case to find actual errors.
  });

  describe("sendStartEvent", () => {
    it("should append -start to event name", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation((eventName) => {
        chai.expect(eventName).to.equal("test-start");
        reporterCalled = true;
      });

      teamsFxTelemetryReporter.sendStartEvent({ eventName: "test" });
    });

    it("should set component property if component name exists", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation(
        (eventName, properties) => {
          chai.expect(properties).has.property("component", "test");
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendStartEvent({ eventName: "test", componentName: "test" });
    });

    it("should not set component property if component name does not exist", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation(
        (eventName, properties) => {
          chai.expect(properties).to.be.undefined;
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendStartEvent({ eventName: "test" });
    });

    it("should not overwrite user provided component property", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation(
        (eventName, properties) => {
          chai.expect(properties).has.property("component", "mycomponent");
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendStartEvent({
        eventName: "test",
        componentName: "test",
        properties: {
          component: "mycomponent",
        },
      });
    });

    it("should pass measurements to telemetry reporter", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation(
        (eventName, properties, measurements) => {
          chai.expect(measurements).has.property("duration", 100);
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendEndEvent({
        eventName: "test",
        measurements: {
          duration: 100,
        },
      });
    });
  });

  describe("sendEndEvent", () => {
    it("should call sentTelemetryEvent when not provide FxError", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation(
        (eventName, properties, measurements) => {
          chai.expect(eventName).to.equal("test");
          chai.expect(properties).has.property("success", "yes");
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendEndEvent({
        eventName: "test",
      });
    });

    it("should call sendTelemetryErrorEvent when provide FxError ", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryErrorEvent").mockImplementation(
        (eventName, properties, measurements) => {
          chai.expect(eventName).to.equal("test");
          chai.expect(properties).include({
            success: "no",
            "error-code": "source.name",
            "error-type": "user",
          });
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendEndEvent(
        {
          eventName: "test",
        },
        new UserError("source", "name", "message")
      );
    });

    it("should not overwrite provided properties", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryErrorEvent").mockImplementation(
        (eventName, properties, measurements) => {
          chai.expect(eventName).to.equal("test");
          chai.expect(properties).include({
            success: "no",
            "error-code": "my error code",
            "error-type": "user",
            "my-property": "value",
          });
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendEndEvent(
        {
          eventName: "test",
          properties: {
            "error-code": "my error code",
            "my-property": "value",
          },
        },
        new UserError("source", "name", "message")
      );
    });

    it("should merge provided errorProps", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryErrorEvent").mockImplementation(
        (eventName, properties, measurements, errorProps) => {
          chai.expect(errorProps).include("test");
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendEndEvent(
        {
          eventName: "test",
          errorProps: ["test"],
        },
        new UserError("source", "name", "message")
      );
    });

    it("should set error type to system error when FxError is SystemError", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryErrorEvent").mockImplementation(
        (eventName, properties, measurements, errorProps) => {
          chai.expect(properties).has.property("error-type", "system");
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendEndEvent(
        {
          eventName: "test",
        },
        new SystemError("source", "name", "message")
      );
    });

    it("should set error type to user error when FxError is UserError", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryErrorEvent").mockImplementation(
        (eventName, properties, measurements, errorProps) => {
          chai.expect(properties).has.property("error-type", "user");
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendEndEvent(
        {
          eventName: "test",
        },
        new UserError("source", "name", "message")
      );
    });

    it("should set component property if component name exists", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation(
        (eventName, properties) => {
          chai.expect(properties).has.property("component", "test");
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendEndEvent({ eventName: "test", componentName: "test" });
    });

    it("should not set component property if component name does not exist", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation(
        (eventName, properties) => {
          chai.expect(properties).not.has.property("component");
          reporterCalled = true;
        }
      );

      teamsFxTelemetryReporter.sendEndEvent({ eventName: "test" });
    });
  });

  describe("defulatConfig", () => {
    it("should merge default event name if exist", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation((eventName) => {
        chai.expect(eventName).to.equal("base-event-name-test");
        reporterCalled = true;
      });

      const defaultConfig = {
        baseEventName: "base-event-name-",
      };
      const teamsFxTelemetryReporter = new TeamsFxTelemetryReporter(
        mockedTelemetryReporter,
        defaultConfig
      );
      teamsFxTelemetryReporter.sendEndEvent({ eventName: "test" });
    });

    it("should merge default component name if config does not have one", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation(
        (eventName, properties) => {
          chai.expect(properties).has.property("component", "testcomponent");
          reporterCalled = true;
        }
      );

      const defaultConfig = {
        componentName: "testcomponent",
      };
      const teamsFxTelemetryReporter = new TeamsFxTelemetryReporter(
        mockedTelemetryReporter,
        defaultConfig
      );
      teamsFxTelemetryReporter.sendEndEvent({ eventName: "test" });
    });

    it("should not merge default component name if config already have component name", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation(
        (eventName, properties) => {
          chai.expect(properties).has.property("component", "mycomponent");
          reporterCalled = true;
        }
      );

      const defaultConfig = {
        componentName: "testcomponent",
      };
      const teamsFxTelemetryReporter = new TeamsFxTelemetryReporter(
        mockedTelemetryReporter,
        defaultConfig
      );
      teamsFxTelemetryReporter.sendEndEvent({ eventName: "test", componentName: "mycomponent" });
    });

    it("should not modify original config object when merge", () => {
      vi.spyOn(mockedTelemetryReporter, "sendTelemetryEvent").mockImplementation(
        (eventName, properties) => {
          chai.expect(properties).has.property("component", "testcomponent");
          reporterCalled = true;
        }
      );

      const defaultConfig = {
        componentName: "testcomponent",
      };
      const config = {
        eventName: "test",
      };
      const teamsFxTelemetryReporter = new TeamsFxTelemetryReporter(
        mockedTelemetryReporter,
        defaultConfig
      );
      teamsFxTelemetryReporter.sendEndEvent(config);

      chai.expect(config).not.has.property("component");
    });
  });
});
