// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  ConditionFunc,
  DynamicOptions,
  FxError,
  Inputs,
  OptionItem,
  SingleSelectQuestion,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import { assert, describe, it, vi } from "vitest";
import * as teamsDevPortalClientModule from "../../src/client/teamsDevPortalClient";
import { TOOLS, setTools } from "../../src/common/globalVars";
import * as shareUtils from "../../src/component/driver/share/utils";
import { AppUser } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/appUser";
import * as collaborator from "../../src/core/collaborator";
import { InputValidationError } from "../../src/error/common";
import { QuestionNames } from "../../src/question/constants";
import {
  ShareOperationOption,
  ShareOperationOptions,
  ShareScopeOption,
  removeSharedAccessNode,
  selectUsersToRemoveSharedAccess,
  shareNode,
} from "../../src/question/share";
import { MockTools } from "../core/utils";

describe("shareNode", () => {
  const sandbox = vi;
  setTools(new MockTools());
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shareNode should return IQTreeNode with correct children", () => {
    const result = shareNode();

    // Verify the main node structure
    assert.isObject(result);
    assert.property(result, "data");
    assert.property(result, "children");
    assert.isArray(result.children);
    assert.lengthOf(result.children!, 2);

    // Verify the data is share operation question
    const shareOperationQuestion = result.data as SingleSelectQuestion;
    assert.property(shareOperationQuestion, "name");
    assert.equal(shareOperationQuestion.name, QuestionNames.ShareOperation);
    assert.property(shareOperationQuestion, "type");
    assert.equal(shareOperationQuestion.type, "singleSelect");

    // Verify share scope options is the first child
    const shareScopeNode = result.children![0];
    assert.isObject(shareScopeNode);
    // Check the condition - it should be an object with the equals property
    assert.property(shareScopeNode, "condition");
    const condition = shareScopeNode.condition as any;
    assert.equal(condition.equals, ShareOperationOptions.shareWithUsers().id);
  });

  it("shareOperation question should have correct options", () => {
    const result = shareNode();
    const shareOperationQuestion = result.data as SingleSelectQuestion;

    assert.isArray(shareOperationQuestion.staticOptions);
    assert.lengthOf(shareOperationQuestion.staticOptions, 2);

    const [shareWithUsers, removeShareAccess] =
      shareOperationQuestion.staticOptions as OptionItem[];
    assert.equal(shareWithUsers.id, ShareOperationOption.ShareWithUsers);
    assert.equal(removeShareAccess.id, ShareOperationOption.RemoveShareAccessFromUsers);
  });

  it("shareScope should have correct options", () => {
    const result = shareNode();
    const shareScopeNode = result.children![0];
    const shareScopeQuestion = shareScopeNode.data as SingleSelectQuestion;

    assert.property(shareScopeQuestion, "name");
    assert.equal(shareScopeQuestion.name, QuestionNames.ShareScope);
    assert.property(shareScopeQuestion, "type");
    assert.equal(shareScopeQuestion.type, "singleSelect");
    assert.isArray(shareScopeQuestion.staticOptions);
    assert.lengthOf(shareScopeQuestion.staticOptions, 2);

    // Check scope options
    const [shareTenant, shareUsers] = shareScopeQuestion.staticOptions as OptionItem[];
    assert.equal(shareTenant.id, ShareScopeOption.ShareAppWithTenantUsers);
    assert.equal(shareUsers.id, ShareScopeOption.ShareAppWithSpecificUsers);
  });

  it("email input should be shown when ShareScope is specific users or owners", () => {
    const result = shareNode();
    const shareScopeNode = result.children![0];
    assert.isArray(shareScopeNode.children);
    const emailInputNode = shareScopeNode.children![0];

    // Test condition function
    assert.property(emailInputNode, "condition");
    assert.isFunction(emailInputNode.condition);

    // Create test inputs
    const inputsSpecificUsers = {
      [QuestionNames.ShareScope]: ShareScopeOption.ShareAppWithSpecificUsers,
    };
    const inputsTenant = { [QuestionNames.ShareScope]: ShareScopeOption.ShareAppWithTenantUsers };

    // Call the condition function with different inputs
    const conditionFunc = emailInputNode.condition as ConditionFunc;
    assert.isTrue(conditionFunc(inputsSpecificUsers as unknown as Inputs));
    assert.isFalse(conditionFunc(inputsTenant as unknown as Inputs));
  });

  it("email input should be shown when ShareOperation is RemoveShareAccessFromUsers", () => {
    const result = shareNode();
    assert.isArray(result.children);
    const emailInputNode = result.children![1];

    // Test condition function
    assert.property(emailInputNode, "condition");
    assert.isFunction(emailInputNode.condition);

    // Create test inputs
    const inputsRemoveAccess = {
      [QuestionNames.ShareOperation]: ShareOperationOption.RemoveShareAccessFromUsers,
    };
    const inputsShare = { [QuestionNames.ShareOperation]: ShareOperationOption.ShareWithUsers };

    // Call the condition function with different inputs
    const conditionFunc = emailInputNode.condition as ConditionFunc;
    assert.isTrue(conditionFunc(inputsRemoveAccess as unknown as Inputs));
    assert.isFalse(conditionFunc(inputsShare as unknown as Inputs));
  });
});

describe("selectUsersToRemoveSharedAccess", () => {
  const sandbox = vi;
  setTools(new MockTools());

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return a MultiSelectQuestion with correct properties", () => {
    const question = selectUsersToRemoveSharedAccess();

    // Verify basic properties
    assert.equal(question.name, QuestionNames.RemoveUsers);
    assert.equal(question.type, "multiSelect");
    assert.isArray(question.staticOptions);
    assert.isEmpty(question.staticOptions);
    assert.property(question, "dynamicOptions");
    assert.isFunction(question.dynamicOptions);
    assert.isTrue(question.skipValidation);
  });

  it("should throw error when projectPath is not defined", async () => {
    const question = selectUsersToRemoveSharedAccess();
    const dynamicOptions = question.dynamicOptions as DynamicOptions;

    try {
      await dynamicOptions({} as unknown as Inputs);
      assert.fail("Expected function to throw");
    } catch (error) {
      assert.equal((error as Error).message, "Project path is not defined");
    }
  });

  it("should throw error when token provider returns error", async () => {
    const question = selectUsersToRemoveSharedAccess();
    const dynamicOptions = question.dynamicOptions as DynamicOptions;
    const mockError = new InputValidationError("test", "Token error");

    // Mock token provider to return error
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      err(mockError as FxError)
    );

    try {
      await dynamicOptions({ projectPath: "path/to/project" } as unknown as Inputs);
      assert.fail("Expected function to throw");
    } catch (error) {
      assert.equal(error, mockError);
    }
  });

  it("should throw error when parseShareAppActionYamlConfig returns error", async () => {
    const question = selectUsersToRemoveSharedAccess();
    const dynamicOptions = question.dynamicOptions as DynamicOptions;
    const mockError = new InputValidationError("test", "Config error");

    // Mock token provider to return success
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("token")
    );

    // Mock parseShareAppActionYamlConfig to return error
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
      err(mockError as FxError)
    );

    try {
      await dynamicOptions({ projectPath: "path/to/project" } as unknown as Inputs);
      assert.fail("Expected function to throw");
    } catch (error) {
      assert.equal(error, mockError);
    }
  });

  it("should throw error when app has no users", async () => {
    const question = selectUsersToRemoveSharedAccess();
    const dynamicOptions = question.dynamicOptions as DynamicOptions;

    // Mock token provider
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("token")
    );

    // Mock parseShareAppActionYamlConfig
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
      ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
    );

    // Mock teamsDevPortalClient instance
    vi.spyOn(teamsDevPortalClientModule.teamsDevPortalClient, "getApp").mockResolvedValue({
      userList: [],
    } as any);

    try {
      await dynamicOptions({ projectPath: "path/to/project" } as unknown as Inputs);
      assert.fail("Expected function to throw");
    } catch (error) {
      assert.equal((error as Error).message, "No owner found in the app");
    }
  });

  it("should throw error when getCurrentUserInfo returns error", async () => {
    const question = selectUsersToRemoveSharedAccess();
    const dynamicOptions = question.dynamicOptions as DynamicOptions;
    const mockError = new InputValidationError("test", "Current user info error");

    // Mock token provider
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("token")
    );

    // Mock parseShareAppActionYamlConfig
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
      ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
    );

    // Mock teamsDevPortalClient instance
    vi.spyOn(teamsDevPortalClientModule.teamsDevPortalClient, "getApp").mockResolvedValue({
      userList: [{ aadId: "user1", displayName: "User 1", userPrincipalName: "user1@example.com" }],
    } as any);

    // Mock getCurrentUserInfo to return error
    vi.spyOn(collaborator.CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
      err(mockError as FxError)
    );

    try {
      await dynamicOptions({ projectPath: "path/to/project" } as unknown as Inputs);
      assert.fail("Expected function to throw");
    } catch (error) {
      assert.equal(error, mockError);
    }
  });

  it("should return correct options excluding current user", async () => {
    const question = selectUsersToRemoveSharedAccess();
    const dynamicOptions = question.dynamicOptions as DynamicOptions;

    // Mock token provider
    vi.spyOn(TOOLS.tokenProvider.m365TokenProvider, "getAccessToken").mockResolvedValue(
      ok("token")
    );

    // Mock parseShareAppActionYamlConfig
    vi.spyOn(shareUtils, "parseShareAppActionYamlConfig").mockResolvedValueOnce(
      ok({ teamsappId: "mockAppId", titleId: "mockTitleId", appId: "mockAppId" })
    );

    // Mock app users including current user
    const mockUsers = [
      {
        aadId: "currentUser",
        displayName: "Current User",
        userPrincipalName: "current@example.com",
      },
      { aadId: "user1", displayName: "User 1", userPrincipalName: "user1@example.com" },
      { aadId: "user2", displayName: "User 2", userPrincipalName: "user2@example.com" },
    ];

    // Mock teamsDevPortalClient instance
    vi.spyOn(teamsDevPortalClientModule.teamsDevPortalClient, "getApp").mockResolvedValue({
      userList: mockUsers,
    } as any);

    // Mock getCurrentUserInfo to return current user
    vi.spyOn(collaborator.CollaborationUtil, "getCurrentUserInfo").mockResolvedValue(
      ok({
        aadId: "currentUser",
        displayName: "Current User",
        userPrincipalName: "current@example.com",
        tenantId: "mock-tenant-id",
        isAdministrator: false,
      } as AppUser)
    );

    const options = await dynamicOptions({ projectPath: "path/to/project" } as unknown as Inputs);

    // Should only include user1 and user2, not current user
    assert.isArray(options);
    assert.lengthOf(options, 2);

    // Check first user
    assert.equal((options[0] as OptionItem).id, "user1@example.com");
    assert.equal((options[0] as OptionItem).label, "User 1");
    assert.equal((options[0] as OptionItem).description, "user1@example.com");

    // Check second user
    assert.equal((options[1] as OptionItem).id, "user2@example.com");
    assert.equal((options[1] as OptionItem).label, "User 2");
    assert.equal((options[1] as OptionItem).description, "user2@example.com");
  });
});

describe("parseShareAppActionYamlConfig", () => {
  it("should surface parser error when config file is missing", async () => {
    try {
      await shareUtils.parseShareAppActionYamlConfig("path/to/project");
      assert.fail("Expected function to throw");
    } catch (error) {
      assert.include((error as Error).message, "Missing required file");
    }
  });
});

describe("removeSharedAccessNode", () => {
  it("should contain group root with selectUsersToRemoveSharedAccess as child", () => {
    const node = removeSharedAccessNode();

    assert.equal((node.data as { type: string }).type, "group");
    assert.isArray(node.children);
    assert.lengthOf(node.children!, 1);
    const childQuestion = node.children![0].data;
    assert.equal((childQuestion as { name: string }).name, QuestionNames.RemoveUsers);
    assert.equal((childQuestion as { type: string }).type, "multiSelect");
  });
});
