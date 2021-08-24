// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import "mocha";
import * as chai from "chai";
import * as sinon from "sinon";
import { PluginContext } from "@microsoft/teamsfx-api";
import chaiAsPromised from "chai-as-promised";
import fs from "fs-extra";
import { TestHelper } from "../helper";
import { FrontendPlugin } from "../../../../../src";
import path from "path";

chai.use(chaiAsPromised);

describe("FrontendMigrateV1Project", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("happy path", async () => {
    const plugin = new FrontendPlugin();
    sinon.stub(fs, "ensureDir").callsFake(async () => {});
    sinon.stub<any, any>(fs, "readdir").callsFake(async (path: string) => {
      return [".archive", "appPackage", "node_modules", "src", "README.md"];
    });
    const copiedFiles: string[] = [];
    sinon
      .stub<any, any>(fs, "copy")
      .callsFake(async (src: string, dest: string, options?: fs.CopyOptions) => {
        copiedFiles.push(dest);
      });

    const pluginContext: PluginContext = TestHelper.getFakePluginContext();

    await plugin.executeUserTask(
      { method: "migrateV1Project", namespace: "fx-resource-frontend-hosting" },
      pluginContext
    );
    chai.assert.deepEqual(copiedFiles, [path.join(pluginContext.root, "tabs", "src")]);
  });
});
