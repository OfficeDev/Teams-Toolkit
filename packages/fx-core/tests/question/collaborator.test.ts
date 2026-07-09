// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  Inputs,
  MultiSelectQuestion,
  Platform,
  StringArrayValidation,
  TextInputQuestion,
  UserError,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import { CollaborationConstants, CollaborationUtil } from "../../src/core/collaborator";
import {
  envQuestionCondition,
  grantPermissionQuestionNode,
  listCollaboratorQuestionNode,
} from "../../src/question/collaborator";
import { QuestionNames } from "../../src/question/constants";
import { assert, vi } from "vitest";

describe("Collaboration Question Node Tests", () => {
  const sandbox = vi;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("grantPermissionQuestionNode", () => {
    it("should return question node with correct structure", () => {
      const node = grantPermissionQuestionNode();

      // Check root node structure
      assert.equal(node.data.type, "group");
      assert.isDefined(node.children);
      assert.lengthOf(node.children!, 1);

      // Check root child node
      const rootChild = node.children![0];
      assert.isDefined(rootChild.condition);
      assert.isDefined(rootChild.data);
      assert.equal(rootChild.cliOptionDisabled, "self");
      assert.equal(rootChild.inputsDisabled, "self");
      assert.isDefined(rootChild.children);
      assert.lengthOf(rootChild.children!, 3); // Teams app, AAD app, and email input

      // Check that the condition function works correctly
      const conditionFn = rootChild.condition as (inputs: Inputs) => boolean;
      assert.isTrue(conditionFn({ platform: Platform.VSCode }));
      assert.isTrue(conditionFn({ platform: Platform.CLI }));

      // Check Teams app manifest node
      const teamsAppNode = rootChild.children![0];
      assert.isDefined(teamsAppNode.condition);
      assert.deepEqual(teamsAppNode.condition, {
        contains: CollaborationConstants.TeamsAppQuestionId,
      });

      // Check AAD app manifest node
      const aadAppNode = rootChild.children![1];
      assert.isDefined(aadAppNode.condition);
      assert.deepEqual(aadAppNode.condition, {
        contains: CollaborationConstants.AadAppQuestionId,
      });

      // Check email input node
      const emailNode = rootChild.children![2];
      assert.isDefined(emailNode.data);
      const emailQuestion = emailNode.data as TextInputQuestion;
      assert.include(emailQuestion.title!, "Add owner to");
    });

    it("should require at least one app type selection", () => {
      const node = grantPermissionQuestionNode();
      if (!node.children) return;
      const appTypeQuestion = node.children[0].data as MultiSelectQuestion;
      const validation = appTypeQuestion.validation as StringArrayValidation;

      assert.isDefined(validation);
      assert.equal(validation.minItems, 1);
    });
  });

  describe("listCollaboratorQuestionNode", () => {
    it("should return question node with correct structure", () => {
      const node = listCollaboratorQuestionNode();

      // Check root node structure
      assert.equal(node.data.type, "group");
      assert.isDefined(node.children);
      assert.lengthOf(node.children!, 1);

      // Check root child node
      const rootChild = node.children![0];
      assert.isDefined(rootChild.condition);
      assert.isDefined(rootChild.data);
      assert.equal(rootChild.cliOptionDisabled, "self");
      assert.equal(rootChild.inputsDisabled, "self");
      assert.isDefined(rootChild.children);
      assert.lengthOf(rootChild.children!, 2); // Teams app and AAD app, no email input

      // Check that the condition function works correctly
      const conditionFn = rootChild.condition as (inputs: Inputs) => boolean;
      assert.isTrue(conditionFn({ platform: Platform.VSCode }));
      assert.isTrue(conditionFn({ platform: Platform.CLI }));

      // Check Teams app manifest node
      const teamsAppNode = rootChild.children![0];
      assert.isDefined(teamsAppNode.condition);
      assert.deepEqual(teamsAppNode.condition, {
        contains: CollaborationConstants.TeamsAppQuestionId,
      });

      // Check AAD app manifest node
      const aadAppNode = rootChild.children![1];
      assert.isDefined(aadAppNode.condition);
      assert.deepEqual(aadAppNode.condition, {
        contains: CollaborationConstants.AadAppQuestionId,
      });
    });

    it("should include agent option", () => {
      const node = listCollaboratorQuestionNode();
      const appTypeQuestion = node.children![0].data as MultiSelectQuestion;

      assert.isDefined(appTypeQuestion.staticOptions);
      const options = appTypeQuestion.staticOptions as { id: string }[];
      assert.lengthOf(options, 3);
      assert.isTrue(options.some((o) => o.id === CollaborationConstants.AgentOptionId));
    });

    it("should require at least one app type selection", () => {
      const node = listCollaboratorQuestionNode();
      if (!node.children) return;
      const appTypeQuestion = node.children[0].data as MultiSelectQuestion;
      const validation = appTypeQuestion.validation as StringArrayValidation;

      assert.isDefined(validation);
      assert.equal(validation.minItems, 1);
    });
  });

  describe("envQuestionCondition", () => {
    let inputs: Inputs;

    beforeEach(() => {
      inputs = {
        platform: Platform.VSCode,
        [CollaborationConstants.AppType]: [],
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return false when required manifest paths are missing", async () => {
      // Set app types but no manifest paths
      inputs[CollaborationConstants.AppType] = [
        CollaborationConstants.TeamsAppQuestionId,
        CollaborationConstants.AadAppQuestionId,
      ];

      const result = await envQuestionCondition(inputs);
      assert.isFalse(result);
    });

    it("should return false when Teams manifest ID doesn't require env vars", async () => {
      // Setup for Teams app only
      inputs[CollaborationConstants.AppType] = [CollaborationConstants.TeamsAppQuestionId];
      inputs[QuestionNames.TeamsAppManifestFilePath] = "path/to/manifest.json";

      const loadManifestStub = vi.spyOn(CollaborationUtil, "loadManifestId");
      loadManifestStub.mockResolvedValue(ok("static-id"));

      const requireEnvStub = vi.spyOn(CollaborationUtil, "requireEnvQuestion");
      requireEnvStub.mockReturnValue(false);

      const result = await envQuestionCondition(inputs);
      assert.isFalse(result);
      assert.isTrue(loadManifestStub.mock.calls.length === 1);
      assert.isTrue(requireEnvStub.mock.calls.length === 1);
    });

    it("should return true when Teams manifest ID requires env vars", async () => {
      // Setup for Teams app that requires env vars
      inputs[CollaborationConstants.AppType] = [CollaborationConstants.TeamsAppQuestionId];
      inputs[QuestionNames.TeamsAppManifestFilePath] = "path/to/manifest.json";

      const loadManifestStub = vi.spyOn(CollaborationUtil, "loadManifestId");
      loadManifestStub.mockResolvedValue(ok("${{TEAMS_APP_ID}}"));

      const requireEnvStub = vi.spyOn(CollaborationUtil, "requireEnvQuestion");
      requireEnvStub.mockReturnValue(true);

      const result = await envQuestionCondition(inputs);
      assert.isTrue(result);
      assert.isTrue(loadManifestStub.mock.calls.length === 1);
      assert.isTrue(requireEnvStub.mock.calls.length === 1);
    });

    it("should return false when Teams manifest ID loading fails", async () => {
      // Setup for Teams app with failed manifest loading
      inputs[CollaborationConstants.AppType] = [CollaborationConstants.TeamsAppQuestionId];
      inputs[QuestionNames.TeamsAppManifestFilePath] = "path/to/manifest.json";

      const loadManifestStub = vi.spyOn(CollaborationUtil, "loadManifestId");
      loadManifestStub.mockResolvedValue(
        err(
          new UserError({
            name: "FailedToLoadManifestId",
            message: "Failed to load manifest ID",
          })
        )
      );

      const result = await envQuestionCondition(inputs);
      assert.isFalse(result);
      assert.isTrue(loadManifestStub.mock.calls.length === 1);
    });

    it("should return true when AAD manifest ID requires env vars", async () => {
      // Setup for AAD app that requires env vars
      inputs[CollaborationConstants.AppType] = [CollaborationConstants.AadAppQuestionId];
      inputs[QuestionNames.AadAppManifestFilePath] = "path/to/aad.manifest.json";

      const loadManifestStub = vi.spyOn(CollaborationUtil, "loadManifestId");
      loadManifestStub.mockResolvedValue(ok("${{AAD_APP_ID}}"));

      const requireEnvStub = vi.spyOn(CollaborationUtil, "requireEnvQuestion");
      requireEnvStub.mockReturnValue(true);

      const result = await envQuestionCondition(inputs);
      assert.isTrue(result);
      assert.isTrue(loadManifestStub.mock.calls.length === 1);
      assert.isTrue(requireEnvStub.mock.calls.length === 1);
    });

    it("should return false when AAD manifest ID loading fails", async () => {
      // Setup for AAD app with failed manifest loading
      inputs[CollaborationConstants.AppType] = [CollaborationConstants.AadAppQuestionId];
      inputs[QuestionNames.AadAppManifestFilePath] = "path/to/aad.manifest.json";

      const loadManifestStub = vi.spyOn(CollaborationUtil, "loadManifestId");
      loadManifestStub.mockResolvedValue(
        err(
          new UserError({
            name: "FailedToLoadManifestId",
            message: "Failed to load manifest ID",
          })
        )
      );

      const result = await envQuestionCondition(inputs);
      assert.isFalse(result);
      assert.isTrue(loadManifestStub.mock.calls.length === 1);
    });

    it("should check both manifest types when both app types are selected", async () => {
      // Setup for both app types
      inputs[CollaborationConstants.AppType] = [
        CollaborationConstants.TeamsAppQuestionId,
        CollaborationConstants.AadAppQuestionId,
      ];
      inputs[QuestionNames.TeamsAppManifestFilePath] = "path/to/manifest.json";
      inputs[QuestionNames.AadAppManifestFilePath] = "path/to/aad.manifest.json";

      const loadManifestStub = vi.spyOn(CollaborationUtil, "loadManifestId");
      // First call for Teams app returns false for requiring env
      loadManifestStub.mockResolvedValueOnce(ok("static-id"));
      // Second call for AAD app returns true for requiring env
      loadManifestStub.mockResolvedValueOnce(ok("${{AAD_APP_ID}}"));

      const requireEnvStub = vi.spyOn(CollaborationUtil, "requireEnvQuestion");
      requireEnvStub.mockReturnValueOnce(false);
      requireEnvStub.mockReturnValueOnce(true);

      const result = await envQuestionCondition(inputs);
      assert.isTrue(result);
      assert.isTrue(loadManifestStub.mock.calls.length === 2);
      assert.isTrue(requireEnvStub.mock.calls.length === 2);
    });
  });
});
