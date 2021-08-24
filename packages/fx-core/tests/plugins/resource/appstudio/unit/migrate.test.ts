// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import "mocha";
import * as chai from "chai";
import { AppStudioPlugin } from "../../../../../src/plugins/resource/appstudio";
import {
  ConfigMap,
  PluginContext,
  TeamsAppManifest,
  Platform,
  AppPackageFolderName,
} from "@microsoft/teamsfx-api";
import * as uuid from "uuid";
import fs, { PathLike } from "fs-extra";
import sinon from "sinon";
import { HostTypeOptionAzure } from "../../../../../src/plugins/solution/fx-solution/question";
import {
  CONFIGURABLE_TABS_TPL,
  REMOTE_MANIFEST,
  STATIC_TABS_TPL,
  V1_MANIFEST,
} from "../../../../../src/plugins/resource/appstudio/constants";
import path from "path";
import { ArchiveFolderName } from "@microsoft/teamsfx-api";

describe("Migrate", () => {
  let plugin: AppStudioPlugin;
  let ctx: PluginContext;
  const sandbox = sinon.createSandbox();
  const fileContent: Map<string, any> = new Map();

  const manifestFile = path.resolve(__dirname, "../resources/valid.manifest.json");
  const manifestStr = fs.readFileSync(manifestFile);

  const targetManifestFile = path.resolve(__dirname, "../resources/migrate.manifest.json");
  const targetManifest = fs.readJsonSync(targetManifestFile);

  beforeEach(async () => {
    plugin = new AppStudioPlugin();

    ctx = {
      root: "./tests/plugins/resource/appstudio/resources",
      configOfOtherPlugins: new Map(),
      config: new ConfigMap(),
      answers: { platform: Platform.VSCode },
      projectSettings: undefined,
    };

    sandbox.stub(fs, "writeFile").callsFake(async (filePath: number | PathLike, data: any) => {
      fileContent.set(path.normalize(filePath.toString()), data);
    });

    sandbox.stub(fs, "readFile").callsFake(async (filePath: number | PathLike) => {
      return fileContent.get(path.normalize(filePath.toString()));
    });

    sandbox.stub(fs, "writeJSON").callsFake(async (filePath: PathLike, obj: any) => {
      fileContent.set(path.normalize(filePath.toString()), JSON.stringify(obj));
    });
    // Uses stub<any, any> to circumvent type check. Beacuse sinon fails to mock my target overload of readJson.
    sandbox
      .stub<any, any>(fs, "copy")
      .callsFake(async (originPath: PathLike, filePath: PathLike) => {
        const content = fileContent.get(originPath.toString());
        fileContent.set(path.normalize(filePath.toString()), content ?? filePath.toString());
      });

    sandbox
      .stub<any, any>(fs, "copyFile")
      .callsFake(async (originPath: PathLike, filePath: PathLike) => {
        const content = fileContent.get(originPath.toString());
        fileContent.set(path.normalize(filePath.toString()), content ?? filePath.toString());
      });

    sandbox
      .stub(fs, "move")
      .callsFake(async (originPath: PathLike, filePath: PathLike, options: fs.MoveOptions) => {
        const content = fileContent.get(path.normalize(originPath.toString()));
        fileContent.set(path.normalize(filePath.toString()), content);
        fileContent.delete(path.normalize(originPath.toString()));
      });

    sandbox.stub(fs, "readJson").callsFake(async (filePath: string) => {
      const content = fileContent.get(path.normalize(filePath));
      if (!content) {
        throw new Error(`File '${filePath}' is not found.`);
      }
      return JSON.parse(content);
    });

    sandbox.stub(fs, "ensureDir").callsFake(async (filePath: string) => {});

    sandbox.stub(fs, "stat").callsFake(async (filePath: PathLike) => {
      if (fileContent.has(path.normalize(filePath.toString()))) {
        return new fs.Stats();
      }
      throw new Error("Cannot find file");
    });
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should generate manifest from an existing manifest.json file", async () => {
    fileContent.clear();
    sandbox.stub<any, any>(fs, "readdir").callsFake(async (filePath: fs.PathLike) => {
      return [V1_MANIFEST, "color.png"];
    });

    fileContent.set(
      path.normalize(`${ctx.root}/${ArchiveFolderName}/${AppPackageFolderName}/${V1_MANIFEST}`),
      manifestStr
    );
    fileContent.set(
      path.normalize(`${ctx.root}/${ArchiveFolderName}/${AppPackageFolderName}/color.png`),
      "color"
    );

    ctx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
        capabilities: ["Tab"],
        migrateFromV1: true,
      },
    };

    const result = await plugin.migrateV1Project(ctx);
    chai.expect(result.isOk()).equals(true);

    const manifest: TeamsAppManifest = JSON.parse(
      fileContent.get(path.normalize(`${ctx.root}/${AppPackageFolderName}/${REMOTE_MANIFEST}`))
    );
    chai.expect(manifest).to.deep.equal(targetManifest);

    chai.expect(fileContent.has(path.normalize(`${ctx.root}/${AppPackageFolderName}/color.png`))).to
      .be.true;
    chai.expect(fileContent.has(path.normalize(`${ctx.root}/${AppPackageFolderName}/outline.png`)))
      .to.be.false;
  });

  it("should generate new manifest", async () => {
    fileContent.clear();
    sandbox.stub<any, any>(fs, "readdir").callsFake(async (filePath: fs.PathLike) => {
      return [];
    });

    ctx.projectSettings = {
      appName: "my app",
      projectId: uuid.v4(),
      solutionSettings: {
        hostType: HostTypeOptionAzure.id,
        name: "azure",
        version: "1.0",
        capabilities: ["Tab"],
        migrateFromV1: true,
      },
    };

    const result = await plugin.migrateV1Project(ctx);
    chai.expect(result.isOk()).equals(true);

    const manifest: TeamsAppManifest = JSON.parse(
      fileContent.get(path.normalize(`${ctx.root}/${AppPackageFolderName}/${REMOTE_MANIFEST}`))
    );
    chai.expect(manifest.staticTabs).to.deep.equal(STATIC_TABS_TPL);
    chai.expect(manifest.configurableTabs).to.deep.equal(CONFIGURABLE_TABS_TPL);
    chai
      .expect(manifest.bots, "Bots should be empty, because only tab is chosen")
      .to.deep.equal([]);
    chai
      .expect(
        manifest.composeExtensions,
        "ComposeExtensions should be empty, because only tab is chosen"
      )
      .to.deep.equal([]);

    chai
      .expect(
        manifest.webApplicationInfo,
        "webApplicationInfo should be empty, because migrate from v1"
      )
      .to.deep.equal(undefined);

    chai.expect(fileContent.has(path.normalize(`${ctx.root}/${AppPackageFolderName}/color.png`))).to
      .be.true;
    chai.expect(fileContent.has(path.normalize(`${ctx.root}/${AppPackageFolderName}/outline.png`)))
      .to.be.true;
  });
});
