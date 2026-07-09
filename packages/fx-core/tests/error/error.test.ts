// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks } from "@feathersjs/hooks/lib";
import {
  err,
  FxError,
  Inputs,
  ok,
  Platform,
  Result,
  SystemError,
  UserError,
} from "@microsoft/teamsfx-api";
import { convertError, ErrorHandlerMW } from "../../src/core/middleware/errorHandler";
import {
  assembleError,
  FilePermissionError,
  InternalError,
  InvalidActionInputError,
  matchDnsError,
  NeedRedoError,
  UnhandledError,
  UnhandledUserError,
  UserCancelError,
} from "../../src/error/common";
import { BaseComponentInnerError } from "../../src/component/error/componentError";
import { InvalidYamlSchemaError } from "../../src/error/yml";
import { getDefaultString, getLocalizedString } from "../../src/common/localizeUtils";
import {
  CopilotDisabledError,
  FindProcessError,
  NodejsNotLtsError,
  PortsConflictError,
  SideloadingDisabledError,
  VxTestAppInvalidInstallOptionsError,
  VxTestAppValidationError,
} from "../../src/error/depCheck";
import {
  DeveloperPortalAPIFailedSystemError,
  DeveloperPortalAPIFailedUserError,
} from "../../src/error/teamsApp";
import { ScriptExecutionError } from "../../src/error/script";
import { maskSecret } from "../../src/common/stringUtils";
import { assert } from "vitest";

describe("Middleware - ErrorHandlerMW", () => {
  const inputs: Inputs = { platform: Platform.VSCode };
  it("return FxError", async () => {
    class MyClass {
      async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
        return err(new UserCancelError());
      }
    }
    hooks(MyClass, {
      myMethod: [ErrorHandlerMW],
    });
    const my = new MyClass();
    const res = await my.myMethod(inputs);
    assert.isTrue(res.isErr() && res.error instanceof UserCancelError);
  });

  it("return ok", async () => {
    class MyClass {
      async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
        return ok("hello");
      }
    }
    hooks(MyClass, {
      myMethod: [ErrorHandlerMW],
    });
    const my = new MyClass();
    const res = await my.myMethod(inputs);
    assert.isTrue(res.isOk() && res.value === "hello");
    const res2 = await my.myMethod(inputs);
    assert.isTrue(res2.isOk() && res2.value === "hello");
  });

  it("throw known error", async () => {
    class MyClass {
      async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
        throw new UserCancelError();
      }
    }

    hooks(MyClass, {
      myMethod: [ErrorHandlerMW],
    });
    const my = new MyClass();
    const res = await my.myMethod(inputs);
    assert.isTrue(res.isErr() && res.error instanceof UserCancelError);
  });

  it("throw unknown error", async () => {
    class MyClass {
      async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
        throw "unknown";
      }
    }
    hooks(MyClass, {
      myMethod: [ErrorHandlerMW],
    });
    const my = new MyClass();
    const res = await my.myMethod(inputs);
    assert.isTrue(res.isErr() && res.error instanceof UnhandledError);
  });

  it("convert system error to user error: The client 'xxx@xxx.com' with object id 'xxx' does not have authorization to perform action", async () => {
    const msg =
      "The client 'xxx@xxx.com' with object id 'xxx' does not have authorization to perform action '<REDACTED: user-file-path>' over scope '<REDACTED: user-file-path>' or the scope is invalid. If access was recently granted, please refresh your credentials.";
    class MyClass {
      async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
        throw new Error(msg);
      }
    }
    hooks(MyClass, {
      myMethod: [ErrorHandlerMW],
    });
    const my = new MyClass();
    const res = await my.myMethod(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      const error = res.error;
      assert.isTrue(error instanceof UserError);
    }
  });
  it("convert system error to user error: no space left on device", async () => {
    const msg = "xxx no space left on device.";
    class MyClass {
      async myMethod(inputs: Inputs): Promise<Result<any, FxError>> {
        throw new Error(msg);
      }
    }
    hooks(MyClass, {
      myMethod: [ErrorHandlerMW],
    });
    const my = new MyClass();
    const res = await my.myMethod(inputs);
    assert.isTrue(res.isErr());
    if (res.isErr()) {
      const error = res.error;
      assert.isTrue(error instanceof UserError);
    }
  });
});

describe("convertError", () => {
  it("EPERM: operation not permitted (Error)", () => {
    const error = new Error(`EPERM: operation not permitted, open '<REDACTED: user-file-path>'`);
    const converted = convertError(error);
    assert.isTrue(converted instanceof UserError);
  });
  it("EPERM: operation not permitted (SystemError)", () => {
    const error = new SystemError(
      "test",
      "Error",
      `EPERM: operation not permitted, open '<REDACTED: user-file-path>'`
    );
    const converted = convertError(error);
    assert.isTrue(converted instanceof UserError);
  });
});

describe("Errors", () => {
  it("FilePermissionError", () => {
    const error = new Error(`EPERM: operation not permitted, open '<REDACTED: user-file-path>'`);
    const converted = new FilePermissionError(error);
    assert.isTrue(converted instanceof UserError);
  });
  it("UnhandledError", () => {
    const error = new Error("test");
    const error1 = new UnhandledError(error);
    assert.isTrue(error1 instanceof SystemError);
    const error2 = new UnhandledError(error, "source");
    assert.isTrue(error2 instanceof SystemError);
    error.message = "";
    const error3 = new UnhandledError(error, "source");
    assert.isTrue(error3 instanceof SystemError);
  });
  it("UnhandledUserError", () => {
    const error = new Error("test");
    const error1 = new UnhandledUserError(error);
    assert.isTrue(error1 instanceof UserError);
    const error2 = new UnhandledUserError(error, "source");
    assert.isTrue(error2 instanceof UserError);
    error.message = "";
    const error3 = new UnhandledUserError(error, "source");
    assert.isTrue(error3 instanceof UserError);
  });
  it("InvalidYamlSchemaError", async () => {
    const e1 = new InvalidYamlSchemaError(".", ".");
    const e2 = new InvalidYamlSchemaError(".");
    assert.isTrue(e1 instanceof InvalidYamlSchemaError);
    assert.isTrue(e2 instanceof InvalidYamlSchemaError);
  });
  it("InvalidActionInputError", async () => {
    const e1 = new InvalidActionInputError(".", []);
    const e2 = new InvalidActionInputError(".", [], "https://aka.ms/teamsfx-actions");
    assert.isTrue(e1 instanceof InvalidActionInputError);
    assert.isTrue(e2 instanceof InvalidActionInputError);
  });
});

describe("BaseComponentInnerError", () => {
  it("unknownError", () => {
    const error = new Error("test");
    const error1 = BaseComponentInnerError.unknownError("test", error);
    assert.isTrue(error1.toFxError() instanceof SystemError);
  });
});

describe("assembleError", function () {
  const myMessage = "message1";
  const mySource = "source1";
  it("error is string", () => {
    const fxError = assembleError(myMessage);
    assert.isTrue(fxError instanceof UnhandledError);
    assert.isTrue(fxError.name === "UnhandledError");
    assert.isTrue(fxError.source === "unknown");
    assert.isTrue(fxError.stack && fxError.stack.includes("error.test.ts"));
  });

  it("error is Error", () => {
    const raw = new Error(myMessage);
    (raw as any).code = "EEXIST";
    const fxError = assembleError(raw);
    assert.isTrue(fxError instanceof InternalError);
    assert.isTrue(fxError.source === "unknown");
    assert.isTrue(fxError.stack && fxError.stack.includes("error.test.ts"));
    assert.deepEqual(fxError.categories, ["internal", "EEXIST"]);
    assert.equal(fxError.message, myMessage);
    assert.equal((fxError as UserError).displayMessage, myMessage);
  });

  it("error is Error with errno code and empty message falls back to code", () => {
    const raw = new Error();
    (raw as any).code = "ECONNRESET";
    const fxError = assembleError(raw);
    assert.isTrue(fxError instanceof InternalError);
    assert.equal(fxError.message, "ECONNRESET");
    assert.equal((fxError as UserError).displayMessage, "ECONNRESET");
    assert.deepEqual(fxError.categories, ["internal", "ECONNRESET"]);
  });

  it("error is Error with ERR_ code and empty message falls back to code", () => {
    const raw = new Error("");
    (raw as any).code = "ERR_TLS_CERT_ALTNAME_INVALID";
    const fxError = assembleError(raw);
    assert.isTrue(fxError instanceof InternalError);
    assert.equal(fxError.message, "ERR_TLS_CERT_ALTNAME_INVALID");
    assert.equal((fxError as UserError).displayMessage, "ERR_TLS_CERT_ALTNAME_INVALID");
  });

  it("InternalError falls back to default message when both message and code are empty", () => {
    const raw = new Error();
    (raw as any).code = "ETIMEDOUT";
    // Force empty message to test fallback
    raw.message = "";
    (raw as any).code = undefined;
    const fxError = new InternalError(raw, "test-source");
    assert.equal(fxError.message, "Unknown internal error");
    assert.equal((fxError as UserError).displayMessage, "Unknown internal error");
    assert.equal(fxError.source, "test-source");
  });

  it("error is Error with source", () => {
    const raw = new Error(myMessage);
    const fxError = assembleError(raw, mySource);
    assert.isTrue(fxError instanceof UnhandledError);
    assert.isTrue(fxError.source === mySource);
    assert.isTrue(fxError.stack && fxError.stack.includes("error.test.ts"));
  });
  it("error has other type", () => {
    const raw = [1, 2, 3];
    const fxError = assembleError(raw);
    assert.isTrue(fxError instanceof UnhandledError);
    assert.isTrue(fxError.message.includes(JSON.stringify(raw, Object.getOwnPropertyNames(raw))));
    assert.isTrue(fxError.stack && fxError.stack.includes("error.test.ts"));
  });
});

describe("matchDnsError", function () {
  it("match", () => {
    const res = matchDnsError("getaddrinfo EAI_AGAIN dev.teams.microsoft.com");
    assert.equal(
      res,
      getLocalizedString("error.common.NetworkError.EAI_AGAIN", "dev.teams.microsoft.com")
    );
  });

  it("match", () => {
    const res = matchDnsError("ABC dev.teams.microsoft.com");
    assert.equal(res, undefined);
  });

  it("undefined", () => {
    const res = matchDnsError();
    assert.equal(res, undefined);
  });
});

describe("PortsConflictError", function () {
  it("happy", () => {
    const err = new PortsConflictError([8801, 8802], [8801]);
    assert.deepEqual(err.telemetryProperties, {
      ports: [8801, 8802].join(", "),
      "occupied-ports": [8801].join(", "),
    });
  });
});

describe("SideloadingDisabledError", function () {
  it("happy", () => {
    const err = new SideloadingDisabledError("src");
    assert.deepEqual(err.source, "src");
  });
});

describe("CopilotDisabledError", function () {
  it("happy", () => {
    const err = new CopilotDisabledError("src");
    assert.deepEqual(err.source, "src");
  });
});

describe("NodejsNotLtsError", function () {
  it("happy", () => {
    const err = new NodejsNotLtsError("nodejs-v18", "src");
    assert.deepEqual(err.source, "src");
  });
});

describe("VxTestAppInvalidInstallOptionsError", function () {
  it("happy", () => {
    const err = new VxTestAppInvalidInstallOptionsError("src");
    assert.deepEqual(err.source, "src");
  });
});

describe("VxTestAppValidationError", function () {
  it("happy", () => {
    const err = new VxTestAppValidationError("src");
    assert.deepEqual(err.source, "src");
  });
});

describe("DeveloperPortalAPIFailed error", function () {
  it("system error", () => {
    const error = new DeveloperPortalAPIFailedSystemError(
      new Error("test"),
      "correlationId",
      "apiName",
      "extraData"
    );
    assert.isTrue(error instanceof SystemError);
    assert.isTrue(!!error.displayMessage);
  });

  it("user error", () => {
    const error = new DeveloperPortalAPIFailedUserError(
      new Error("test"),
      "correlationId",
      "apiName",
      "extraData"
    );
    assert.isTrue(error instanceof UserError);
    assert.isTrue(!!error.displayMessage);
    assert.isFalse(!!error.helpLink);
  });

  describe("FindProcessError", function () {
    it("happy", () => {
      const err = new FindProcessError(new Error(), "test");
      assert.deepEqual(err.source, "test");
    });
    it("happy no source", () => {
      const err = new FindProcessError(new Error());
      assert.deepEqual(err.source, "core");
    });
  });

  describe("ScriptExecutionError", () => {
    it("empty message", () => {
      const err = new ScriptExecutionError(new Error(""), "test");
      const maskedScript = maskSecret("test", { replace: "***" });
      const maskedError = "";
      const message = getDefaultString(
        "error.script.ScriptExecutionError",
        maskedScript,
        maskedError
      );
      assert.equal(err.message, message);
    });
    it("none empty message", () => {
      const err = new ScriptExecutionError(new Error("test"), "test");
      const maskedScript = maskSecret("test", { replace: "***" });
      const maskedError = "test";
      const message = getDefaultString(
        "error.script.ScriptExecutionError",
        maskedScript,
        maskedError
      );
      assert.equal(err.message, message);
    });
  });

  describe("NeedRedoError", function () {
    it("happy", () => {
      const err = new NeedRedoError("test");
      assert.deepEqual(err.source, "test");
    });
  });
});
