// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { hooks, NextFunction } from "@feathersjs/hooks/lib";
import { Func, FxError, Inputs, ok, Platform, Result } from "@microsoft/teamsfx-api";
import mockFs from "mock-fs";
import * as path from "path";
import { setTools } from "../../../src/common/globalVars";
import { VideoFilterAppBlockerMW } from "../../../src/core/middleware/videoFilterAppBlocker";
import { CoreHookContext } from "../../../src/core/types";
import { VideoFilterAppRemoteNotSupportedError } from "../../../src/error/common";
import { MockTools } from "../utils";
import { assert } from "vitest";

describe("Middleware - VideoFilterAppBlockerMW", () => {
  function createMock(): {
    nextMiddlewareCalled: boolean;
    inputs: Inputs;
    instance: { myMethod: (inputs: Inputs) => Promise<Result<boolean, FxError>> };
  } {
    setTools(new MockTools());
    class MyClass {
      async myMethod(inputs: Inputs): Promise<Result<boolean, FxError>> {
        return ok(true);
      }
    }
    const instance = new MyClass();

    const result = {
      nextMiddlewareCalled: false,
      inputs: { platform: Platform.VSCode, projectPath: mockProjectRoot },
      instance,
    };
    const TestMW = async (ctx: CoreHookContext, next: NextFunction) => {
      result.nextMiddlewareCalled = true;
      await next();
    };
    hooks(MyClass, {
      myMethod: [VideoFilterAppBlockerMW, TestMW],
    });
    return result;
  }

  const mockProjectRoot = "video-filter";

  afterEach(function () {
    mockFs.restore();
  });

  it("blocks video filter project", async () => {
    const mock = createMock();
    mockFs({
      [path.join(mockProjectRoot, "appPackage", "manifest.json")]: JSON.stringify({
        meetingExtensionDefinition: { videoFiltersConfigurationUrl: "https://a.b.c" },
      }),
    });

    const result = await mock.instance.myMethod(mock.inputs);

    assert.isTrue(result.isErr());
    assert.equal(result._unsafeUnwrapErr().name, VideoFilterAppRemoteNotSupportedError.name);
    assert.isFalse(mock.nextMiddlewareCalled);
  });

  it("ignores non-video project", async () => {
    const mock = createMock();
    mockFs({
      [path.join(mockProjectRoot, "appPackage", "manifest.json")]: JSON.stringify({
        meetingExtensionDefinition: {},
      }),
    });

    const result = await mock.instance.myMethod(mock.inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(result._unsafeUnwrap());
    assert.isTrue(mock.nextMiddlewareCalled);
  });

  it("ignores project with incorrect manifest", async () => {
    const mock = createMock();
    mockFs({
      [path.join(mockProjectRoot, "appPackage", "manifest.json")]: "invalid json",
    });

    const result = await mock.instance.myMethod(mock.inputs);

    assert.isTrue(result.isOk());
    assert.isTrue(result._unsafeUnwrap());
    assert.isTrue(mock.nextMiddlewareCalled);
  });

  describe("user task", () => {
    it("blocks build package", async () => {
      setTools(new MockTools());
      class MyClass {
        async executeUserTask(
          func: Func,
          inputs: Inputs,
          ctx?: CoreHookContext
        ): Promise<Result<any, FxError>> {
          return ok(true);
        }
      }
      let nextMiddlewareCalled = false;
      const instance = new MyClass();
      const inputs = { platform: Platform.VSCode, projectPath: mockProjectRoot };
      const TestMW = async (ctx: CoreHookContext, next: NextFunction) => {
        nextMiddlewareCalled = true;
        await next();
      };
      hooks(MyClass, {
        executeUserTask: [VideoFilterAppBlockerMW, TestMW],
      });
      mockFs({
        [path.join(mockProjectRoot, "appPackage", "manifest.json")]: "invalid json",
      });

      const func = {
        namespace: "fx-solution-azure",
        method: "validateManifest",
      };
      const result = await instance.executeUserTask(func, inputs);

      assert.isTrue(result.isOk());
      assert.isTrue(result._unsafeUnwrap());
      assert.isTrue(nextMiddlewareCalled);
    });
    it("doesn't block edit manifest", async () => {
      setTools(new MockTools());
      class MyClass {
        async executeUserTask(
          func: Func,
          inputs: Inputs,
          ctx?: CoreHookContext
        ): Promise<Result<any, FxError>> {
          return ok(true);
        }
      }
      let nextMiddlewareCalled = false;
      const instance = new MyClass();
      const inputs = { platform: Platform.VSCode, projectPath: mockProjectRoot };
      const TestMW = async (ctx: CoreHookContext, next: NextFunction) => {
        nextMiddlewareCalled = true;
        await next();
      };
      hooks(MyClass, {
        executeUserTask: [VideoFilterAppBlockerMW, TestMW],
      });
      mockFs({
        [path.join(mockProjectRoot, "appPackage", "manifest.json")]: "invalid json",
      });

      const func = {
        namespace: "fx-solution-azure/fx-resource-appstudio",
        method: "getManifestTemplatePath",
      };
      const result = await instance.executeUserTask(func, inputs);

      assert.isTrue(result.isOk());
      assert.isTrue(result._unsafeUnwrap());
      assert.isTrue(nextMiddlewareCalled);
    });
  });
});
