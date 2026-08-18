// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  DeclarativeCopilotCapabilityName,
  DeclarativeCopilotManifestSchema,
  Inputs,
  Platform,
  SystemError,
  TeamsAppManifest,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import axios from "axios";
import fs from "fs-extra";
import mockedEnv from "mocked-env";
import * as os from "os";
import * as path from "path";
import { FxCore } from "../../src";
import { featureFlagManager } from "../../src/common/featureFlags";
import { setTools } from "../../src/common/globalVars";
import { copilotGptManifestUtils } from "../../src/component/driver/teamsApp/utils/CopilotGptManifestUtils";
import { manifestUtils } from "../../src/component/driver/teamsApp/utils/ManifestUtils";
import "../../src/component/feature/sso";
import { UserCancelError } from "../../src/error/common";
import { QuestionNames } from "../../src/question";
import { KnowledgeSearchTypeOptions, KnowledgeSourceOptions } from "../../src/question/constants";
import { validationUtils } from "../../src/ui/validationUtils";
import { MockTools, MockUserInteraction, randomAppName } from "./utils";
import { assert, vi } from "vitest";

const tools = new MockTools();

async function mockV3Project(): Promise<string> {
  const appName = randomAppName();
  const projectPath = path.join(os.tmpdir(), appName);
  // await fs.move(path.join(__dirname, "../sampleV3"), path.join(os.tmpdir(), appName));
  await fs.copy(path.join(__dirname, "../samples/sampleV3/"), path.join(projectPath));
  await fs.writeJson(path.join(projectPath, "appPackage", "test1.json"), {
    actions: [{}],
    capabilities: [],
  });
  return appName;
}

async function mockCliUninstallProject(): Promise<string> {
  const appName = randomAppName();
  const projectPath = path.join(os.tmpdir(), appName);
  await fs.copy(path.join(__dirname, "../samples/uninstall/"), path.join(projectPath));
  return appName;
}

async function deleteTestProject(appName: string) {
  await fs.remove(path.join(os.tmpdir(), appName));
}

describe("addKnowledge", async () => {
  beforeEach(async () => {
    setTools(tools);
    await fs.writeJson("fakeAgentManifest.json", {
      actions: [{}],
      capabilities: [],
    });
  });

  afterEach(async () => {
    if (await fs.pathExists("fakeAgentManifest.json")) {
      await fs.unlink("fakeAgentManifest.json");
    }
    vi.restoreAllMocks();
  });

  it("happy path: add Web Content(search all)", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
        capabilities: [
          {
            name: DeclarativeCopilotCapabilityName.WebSearch,
            sites: [
              {
                url: "https://fakeUrl.com",
              },
            ],
          },
        ],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("happy path: add Web Content(search by url)", async () => {
    const appName = await mockV3Project();
    const searchUrl = "https://fakeUrl.com";
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.url(),
      webSearchUrl: searchUrl,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("happy path: add Web Content(append by url)", async () => {
    const appName = await mockV3Project();
    const searchUrl = "https://fakeUrl.com";
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.url(),
      webSearchUrl: searchUrl,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
        capabilities: [
          {
            name: DeclarativeCopilotCapabilityName.WebSearch,
          },
        ],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("happy path: add Web Content(from VS)", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VS,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(MockUserInteraction.prototype, "showMessage").mockResolvedValue(ok("Add"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("add embedded files", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(true);
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      projectPath: path.join(os.tmpdir(), appName),
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.embeddedKnowledge().id,
      [QuestionNames.EmbeddedKnowledgeFiles]: ["test:txt"],
      [QuestionNames.ManifestPath]: "manifest.json",
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };
    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok(""));
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    const core = new FxCore(tools);
    vi.spyOn(copilotGptManifestUtils, "addEmbeddedKnowledgeFiles").mockResolvedValue(ok(undefined));
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("happy path: add OneDrive & Sharepoint(search all)", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.oneDriveSharePoint().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allOneDriveSharepoint().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("happy path: add OneDrive & Sharepoint(create by url)", async () => {
    const appName = await mockV3Project();
    const searchUrl = "https://fakeUrl.com";
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.oneDriveSharePoint().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.url().id,
      oneDriveSharePointURL: searchUrl,
      oneDriveSharePointItem: [
        {
          url: searchUrl,
        },
      ],
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("happy path: add OneDrive & Sharepoint(create by id)", async () => {
    const appName = await mockV3Project();
    const searchUrl = "https://fakeUrl.com";
    const siteId = "fakeSiteId";
    const webId = "fakeWebId";
    const listId = "fakeListId";
    const uniqueId = "fakeUniqueId";
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.oneDriveSharePoint().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.url().id,
      oneDriveSharePointURL: searchUrl,
      oneDriveSharePointItem: [
        {
          siteId: siteId,
          webId: webId,
          listId: listId,
          uniqueId: uniqueId,
        },
      ],
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("error path: add OneDrive & Sharepoint(create by id)", async () => {
    const appName = await mockV3Project();
    const searchUrl = "https://fakeUrl.com";
    const siteId = "fakeSiteId";
    const webId = "fakeWebId";
    const listId = "fakeListId";
    const uniqueId = "fakeUniqueId";
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.oneDriveSharePoint().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.url().id,
      oneDriveSharePointURL: searchUrl,
      oneDriveSharePointItem: [
        {
          siteId: siteId,
          webId: webId,
          listId: listId,
          uniqueId: uniqueId,
        },
      ],
      projectPath: path.join(os.tmpdir(), appName),
    };

    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      err(
        new SystemError({
          source: "test",
          name: "GetGraphTokenFailed",
          message: "Failed to get Graph token",
          displayMessage: "Failed to get Graph token",
        })
      )
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isErr());
  });

  it("error path2: add OneDrive & Sharepoint(create by id)", async () => {
    const appName = await mockV3Project();
    const searchUrl = "https://fakeUrl.com";
    const siteId = "fakeSiteId";
    const webId = "fakeWebId";
    const listId = "fakeListId";
    const uniqueId = "fakeUniqueId";
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.oneDriveSharePoint().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.url().id,
      oneDriveSharePointURL: searchUrl,
      oneDriveSharePointItem: [
        {
          siteId: siteId,
          webId: webId,
          listId: listId,
          uniqueId: uniqueId,
        },
      ],
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(MockUserInteraction.prototype, "showMessage").mockResolvedValue(ok("Add"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        capabilities: [
          {
            name: DeclarativeCopilotCapabilityName.OneDriveAndSharePoint,
            items_by_sharepoint_ids: [{}],
          },
        ],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("error path3: add OneDrive & Sharepoint(create by id)", async () => {
    const appName = await mockV3Project();
    const searchUrl = "https://fakeUrl.com";
    const siteId = "fakeSiteId";
    const webId = "fakeWebId";
    const listId = "fakeListId";
    const uniqueId = "fakeUniqueId";
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.oneDriveSharePoint().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.url().id,
      oneDriveSharePointURL: searchUrl,
      oneDriveSharePointItem: [
        {
          url: searchUrl,
          siteId: siteId,
          webId: webId,
          listId: listId,
          uniqueId: uniqueId,
        },
      ],
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(MockUserInteraction.prototype, "showMessage").mockResolvedValue(ok("Add"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        capabilities: [
          {
            name: DeclarativeCopilotCapabilityName.OneDriveAndSharePoint,
            items_by_url: [
              {
                url: searchUrl,
              },
            ],
          },
        ],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("error path: add Web Content capability", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };
    vi.spyOn(MockUserInteraction.prototype, "showMessage").mockResolvedValue(ok("Add"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(copilotGptManifestUtils, "addWebSearchCapability").mockResolvedValue(
      err(new UserError("test", "test", "test"))
    );
    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("error path: add OneDrive & Sharepoint capability", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.oneDriveSharePoint().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allOneDriveSharepoint().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };
    vi.spyOn(MockUserInteraction.prototype, "showMessage").mockResolvedValue(ok("Add"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(copilotGptManifestUtils, "addOneDriveSharePointCapability").mockResolvedValue(
      err(new UserError("test", "test", "test"))
    );
    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("error path: undefined projectPath", async () => {
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: undefined,
    };
    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isErr());
  });

  it("error path: no agent file path", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          id: "knowledege_1",
          file: "",
        },
      ],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(MockUserInteraction.prototype, "showMessage").mockResolvedValue(ok("Add"));

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isErr());
  });

  it("error path: wrong agent file path", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotExtensions = {
      declarativeCopilots: [
        {
          id: "knowledege_1",
          file: "fakePath",
        },
      ],
    };

    const readAppManifestStub = vi.spyOn(manifestUtils, "_readAppManifest");
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    readAppManifestStub.mockResolvedValueOnce(ok(manifest));
    readAppManifestStub.mockResolvedValueOnce(err(new UserError("test", "test", "test")));

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isErr());
  });

  it("error path: comfirm error", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(MockUserInteraction.prototype, "showMessage").mockResolvedValue(
      err(new UserError("test", "test", "test"))
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isErr());
  });

  it("error path: user cancelled confirmation error", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: "fake knowledge source",
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(MockUserInteraction.prototype, "showMessage").mockResolvedValue(ok("Add"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isErr());
  });

  it("error path: unsupported knowledge source error", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(MockUserInteraction.prototype, "showMessage").mockResolvedValue(ok("Cancel"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isErr());
  });

  it("error path: manifest result error(FxCore)", async () => {
    const appName = await mockV3Project();
    const inputsList: Inputs[] = [
      {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: os.tmpdir(),
        [QuestionNames.ManifestPath]: "manifest.json",
        [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
        projectPath: path.join(os.tmpdir(), appName),
      },
      {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: os.tmpdir(),
        [QuestionNames.ManifestPath]: "manifest.json",
        [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.oneDriveSharePoint().id,
        projectPath: path.join(os.tmpdir(), appName),
      },
      {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: os.tmpdir(),
        [QuestionNames.ManifestPath]: "manifest.json",
        [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.graphConnector().id,
        projectPath: path.join(os.tmpdir(), appName),
      },
    ];
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(MockUserInteraction.prototype, "showMessage").mockResolvedValue(ok("Add"));
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      err(new UserError("test", "test", "test"))
    );

    const core = new FxCore(tools);
    for (const inputs of inputsList) {
      const result = await core.addKnowledge(inputs);
      assert.isTrue(result.isOk());
    }
  });

  it("add embedded files", async () => {
    const restore = mockedEnv({
      TEAMSFX_BUILDER_API: "true",
    });
    try {
      const appName = await mockV3Project();
      const inputs: Inputs = {
        platform: Platform.VSCode,
        [QuestionNames.Folder]: os.tmpdir(),
        projectPath: path.join(os.tmpdir(), appName),
        [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.embeddedKnowledge().id,
        [QuestionNames.EmbeddedKnowledgeFiles]: ["test:txt"],
        [QuestionNames.ManifestPath]: "manifest.json",
      };
      const core = new FxCore(tools);
      vi.spyOn(copilotGptManifestUtils, "addEmbeddedKnowledgeFiles").mockResolvedValue(
        ok(undefined)
      );
      const result = await core.addKnowledge(inputs);
      assert.isFalse(result.isOk());
    } finally {
      restore();
    }
  });

  it("happy path: get ODSP item details", async () => {
    const fakeInstance = axios.create();
    vi.spyOn(axios, "create").mockReturnValue(fakeInstance);
    const axiosGetStub = vi.spyOn(fakeInstance, "get");
    axiosGetStub.mockResolvedValueOnce({
      status: 200,
      data: {
        id: "fakeId",
        name: "fakeName",
      },
    });
    const core = new FxCore(tools);
    const result = await core.getODSPItemDetails("fake siteId", "fake itemId");
    assert.isTrue(result.isOk());
  });

  it("happy path2: get ODSP item details", async () => {
    const fakeInstance = axios.create();
    vi.spyOn(axios, "create").mockReturnValue(fakeInstance);
    const axiosGetStub = vi.spyOn(fakeInstance, "get");
    axiosGetStub.mockResolvedValueOnce({
      status: 200,
      data: {
        id: "fakeId",
        name: "fakeName",
      },
    });
    const core = new FxCore(tools);
    const result = await core.getODSPItemDetails("fake siteId");
    assert.isTrue(result.isOk());
  });

  it("happy path3: get ODSP item details", async () => {
    const fakeInstance = axios.create();
    vi.spyOn(axios, "create").mockReturnValue(fakeInstance);
    const axiosGetStub = vi.spyOn(fakeInstance, "get");
    axiosGetStub.mockResolvedValueOnce({
      status: 200,
      data: {
        id: "fakeId",
        name: "fakeName",
      },
    });
    const core = new FxCore(tools);
    const result = await core.getODSPItemDetails("fake siteId");
    assert.isTrue(result.isOk());
  });

  it("happy path4: get ODSP item details", async () => {
    const fakeInstance = axios.create();
    vi.spyOn(axios, "create").mockReturnValue(fakeInstance);
    const axiosGetStub = vi.spyOn(fakeInstance, "get");
    axiosGetStub.mockResolvedValueOnce({
      status: 200,
      data: {
        id: "fakeId",
        webUrl: "https://fakeUrl.com/fakeName",
      },
    });
    const core = new FxCore(tools);
    const result = await core.getODSPItemDetails("fake siteId");
    assert.isTrue(result.isOk());
  });

  it("error path: get ODSP item details", async () => {
    const core = new FxCore(tools);
    const result = await core.getODSPItemDetails("fake siteId", "fake itemId");
    assert.isTrue(result.isErr());
  });

  it("happy path: add embedded knowledge", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.embeddedKnowledge().id,
      [QuestionNames.EmbeddedKnowledgeFiles]: "fake files",
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(copilotGptManifestUtils, "addEmbeddedKnowledgeFiles").mockResolvedValue(ok(undefined));
    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("happy path: add GC knowledge(GCInput)", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.graphConnector().id,
      [QuestionNames.GCInput]: "fake inputs",
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(copilotGptManifestUtils, "addGCCapability").mockResolvedValue(
      ok({
        name: "fakeName",
        description: "fakeDesc",
      })
    );
    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("happy path: add GC knowledge(GCList)", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.graphConnector().id,
      [QuestionNames.GCList]: "fake lists",
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(copilotGptManifestUtils, "addGCCapability").mockResolvedValue(
      ok({
        name: "fakeName",
        description: "fakeDesc",
      })
    );
    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("error path: add GC knowledge", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.graphConnector().id,
      [QuestionNames.GCList]: "fake lists",
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    vi.spyOn(copilotGptManifestUtils, "addGCCapability").mockResolvedValue(
      err(new UserError("test", "test", "test"))
    );
    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("happy path: add OneDrive & Sharepoint(search all)", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.oneDriveSharePoint().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allOneDriveSharepoint().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("Add"));
    uxStub.mockResolvedValueOnce(ok("View agent manifest"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isOk());
  });

  it("add embedded files disabled", async () => {
    vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      projectPath: path.join(os.tmpdir(), appName),
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.embeddedKnowledge().id,
      [QuestionNames.EmbeddedKnowledgeFiles]: ["test:txt"],
      [QuestionNames.ManifestPath]: "manifest.json",
    };
    const core = new FxCore(tools);
    vi.spyOn(copilotGptManifestUtils, "addEmbeddedKnowledgeFiles").mockResolvedValue(ok(undefined));
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isErr());
  });

  it("error path: add Web Content(cancel double confirm)", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("")); // Return empty string instead of "Add" to trigger UserCancelError
    uxStub.mockResolvedValueOnce(err(new UserCancelError("User cancelled")));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
        capabilities: [
          {
            name: DeclarativeCopilotCapabilityName.WebSearch,
            sites: [
              {
                url: "https://fakeUrl.com",
              },
            ],
          },
        ],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isErr());
  });

  it("error path: add Web Content(double confirm error)", async () => {
    const appName = await mockV3Project();
    const inputs: Inputs = {
      platform: Platform.VSCode,
      [QuestionNames.Folder]: os.tmpdir(),
      [QuestionNames.ManifestPath]: "manifest.json",
      [QuestionNames.KnowledgeSource]: KnowledgeSourceOptions.webSearch().id,
      [QuestionNames.SearchType]: KnowledgeSearchTypeOptions.allWeb().id,
      projectPath: path.join(os.tmpdir(), appName),
    };
    const manifest = new TeamsAppManifest();
    manifest.copilotAgents = {
      declarativeAgents: [
        {
          id: "knowledege_1",
          file: "test1.json",
        },
      ],
    };

    const uxStub = vi.spyOn(MockUserInteraction.prototype, "showMessage");
    uxStub.mockResolvedValueOnce(ok("")); // Return empty string instead of "Add" to trigger UserCancelError
    uxStub.mockResolvedValueOnce(ok("Not Cancel"));
    vi.spyOn(validationUtils, "validateInputs").mockResolvedValue(undefined);
    vi.spyOn(manifestUtils, "_readAppManifest").mockResolvedValue(ok(manifest));
    vi.spyOn(copilotGptManifestUtils, "getManifestPath").mockResolvedValue(
      ok("fakeAgentManifest.json")
    );
    vi.spyOn(copilotGptManifestUtils, "readCopilotGptManifestFile").mockResolvedValue(
      ok({
        actions: [{}],
        capabilities: [
          {
            name: DeclarativeCopilotCapabilityName.WebSearch,
            sites: [
              {
                url: "https://fakeUrl.com",
              },
            ],
          },
        ],
      } as DeclarativeCopilotManifestSchema)
    );

    const core = new FxCore(tools);
    const result = await core.addKnowledge(inputs);
    assert.isTrue(result.isErr());
  });
});
