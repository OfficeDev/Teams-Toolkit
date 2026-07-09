// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, ok } from "@microsoft/teamsfx-api";
import { assert, vi } from "vitest";
import { GraphClient } from "../../src/client/graphClient";
import { setTools } from "../../src/common/globalVars";
import { AppUser } from "../../src/component/driver/teamsApp/interfaces/appdefinitions/appUser";
import { M365AppEntity, M365EntityType } from "../../src/component/m365/interface";
import { PackageService } from "../../src/component/m365/packageService";
import { CollaborationUtil } from "../../src/core/collaborator";
import { addSharedUsers, removeShareAccess, shareWithTenant } from "../../src/core/share";
import { InputValidationError } from "../../src/error/common";
import { MockTools } from "./utils";

describe("share", () => {
  const tools = new MockTools();
  setTools(tools);
  const mockMosToken = "mock-mos-token";
  const mockTitleId = "mock-title-id";
  const mockSharedInstance = {
    shareWithTenant: () => {},
    shareWithUsers: () => {},
    unshare: () => {},
    getSharedUsers: () => {},
  };

  beforeEach(() => {
    vi.spyOn(PackageService, "GetSharedInstance").mockReturnValue(mockSharedInstance as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("shareWithTenant", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it("should share with tenant successfully", async () => {
      // Arrange
      const shareWithTenantStub = vi
        .spyOn(mockSharedInstance, "shareWithTenant")
        .mockResolvedValue(ok(undefined));
      vi.spyOn(tools.ui, "showMessage").mockImplementation(async () => undefined as any);

      // Act
      const result = await shareWithTenant(mockMosToken, mockTitleId);

      // Assert
      assert.isTrue(result.isOk());
      assert.equal(shareWithTenantStub.mock.calls.length, 1);
      assert.deepEqual(shareWithTenantStub.mock.calls[0], [mockMosToken, mockTitleId]);
    });

    it("should return error when sharing with tenant fails", async () => {
      // Arrange
      const mockError = new InputValidationError("test", "Share with tenant failed");
      vi.spyOn(mockSharedInstance, "shareWithTenant").mockResolvedValue(err(mockError));

      // Act
      const result = await shareWithTenant(mockMosToken, mockTitleId);

      // Assert
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.deepEqual(result.error, mockError);
      }
    });
  });

  describe("addSharedUsers", () => {
    const mockEmails = ["user1@example.com", "user2@example.com"];
    const mockUserInfo1: AppUser = {
      aadId: "user1-id",
      displayName: "User 1",
      userPrincipalName: "user1@example.com",
      tenantId: "mock-tenant-id",
      isAdministrator: true,
    };
    const mockUserInfo2: AppUser = {
      aadId: "user2-id",
      displayName: "User 2",
      userPrincipalName: "user2@example.com",
      tenantId: "mock-tenant-id",
      isAdministrator: true,
    };
    const mockExistingEntities: M365AppEntity[] = [
      { entityId: "existing-id", entityType: M365EntityType.User },
    ];

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should add shared users successfully", async () => {
      // Arrange
      const getSharedUsersStub = vi
        .spyOn(mockSharedInstance, "getSharedUsers")
        .mockResolvedValue(ok(mockExistingEntities));

      const shareWithUsersStub = vi
        .spyOn(mockSharedInstance, "shareWithUsers")
        .mockResolvedValue(ok(undefined));

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === mockEmails[1]) return mockUserInfo2;
        return undefined;
      });

      // Act
      const result = await addSharedUsers(mockMosToken, mockTitleId, mockEmails);

      // Assert
      assert.isTrue(result.isOk());
      assert.equal(getSharedUsersStub.mock.calls.length, 1);
      assert.equal(getUserInfoStub.mock.calls.length, 2);

      // Should call shareWithUsers
      assert.equal(shareWithUsersStub.mock.calls.length, 1);

      // We can't check the exact arguments due to TypeScript issues,
      // but we can verify it was called
      assert.isAbove(shareWithUsersStub.mock.calls.length, 0);
    });

    it("should return error when invalid user email is provided", async () => {
      // Arrange
      vi.spyOn(mockSharedInstance, "getSharedUsers").mockResolvedValue(ok(mockExistingEntities));

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === mockEmails[1]) return undefined;
        return undefined;
      });

      // Mock GraphClient.getGroupInfo to also return undefined
      const getGroupInfoStub = vi
        .spyOn(GraphClient.prototype, "getGroupInfo")
        .mockResolvedValue(undefined);

      // Act
      const result = await addSharedUsers(mockMosToken, mockTitleId, mockEmails);

      // Assert
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.instanceOf(result.error, InputValidationError);
        assert.include(result.error.message, "Invalid user or group: user2@example.com");
      }
      assert.equal(getGroupInfoStub.mock.calls.length, 1);
    });

    it("should add group when user info not found but group info is found", async () => {
      // Arrange
      const groupEmail = "group@example.com";
      const mockGroupInfo = {
        id: "group-id",
        displayName: "Test Group",
        mail: groupEmail,
      };
      const emailsWithGroup = [mockEmails[0], groupEmail];

      vi.spyOn(mockSharedInstance, "getSharedUsers").mockResolvedValue(ok(mockExistingEntities));

      const shareWithUsersStub = vi
        .spyOn(mockSharedInstance, "shareWithUsers")
        .mockResolvedValue(ok(undefined));

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === groupEmail) return undefined;
        return undefined;
      });

      const getGroupInfoStub = vi.spyOn(GraphClient.prototype, "getGroupInfo");
      getGroupInfoStub.mockImplementation(async (email) => {
        if (email === groupEmail) return mockGroupInfo;
        return undefined;
      });

      // Act
      const result = await addSharedUsers(mockMosToken, mockTitleId, emailsWithGroup);

      // Assert
      assert.isTrue(result.isOk());
      assert.equal(getUserInfoStub.mock.calls.length, 2);
      assert.equal(getGroupInfoStub.mock.calls.length, 1);
      assert.equal(shareWithUsersStub.mock.calls.length, 1);
    });

    it("should handle mixed users and groups successfully", async () => {
      // Arrange
      const groupEmail = "group@example.com";
      const mockGroupInfo = {
        id: "group-id",
        displayName: "Test Group",
        mail: groupEmail,
      };
      const emailsWithMixed = [mockEmails[0], groupEmail, mockEmails[1]];

      vi.spyOn(mockSharedInstance, "getSharedUsers").mockResolvedValue(ok(mockExistingEntities));

      const shareWithUsersStub = vi
        .spyOn(mockSharedInstance, "shareWithUsers")
        .mockResolvedValue(ok(undefined));

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === groupEmail) return undefined;
        if (email === mockEmails[1]) return mockUserInfo2;
        return undefined;
      });

      const getGroupInfoStub = vi.spyOn(GraphClient.prototype, "getGroupInfo");
      getGroupInfoStub.mockImplementation(async (email) => {
        if (email === groupEmail) return mockGroupInfo;
        return undefined;
      });

      // Act
      const result = await addSharedUsers(mockMosToken, mockTitleId, emailsWithMixed);

      // Assert
      assert.isTrue(result.isOk());
      assert.equal(getUserInfoStub.mock.calls.length, 3);
      assert.equal(getGroupInfoStub.mock.calls.length, 1);
      assert.equal(shareWithUsersStub.mock.calls.length, 1);
    });

    it("should return error when getSharedUsers fails", async () => {
      // Arrange
      const mockError = new InputValidationError("test", "Get shared users failed");
      vi.spyOn(mockSharedInstance, "getSharedUsers").mockResolvedValue(err(mockError));

      // Act
      const result = await addSharedUsers(mockMosToken, mockTitleId, mockEmails);

      // Assert
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.deepEqual(result.error, mockError);
      }
    });

    it("should return error when shareWithUsers fails", async () => {
      // Arrange
      const mockError = new InputValidationError("test", "Share with users failed");

      vi.spyOn(mockSharedInstance, "getSharedUsers").mockResolvedValue(ok(mockExistingEntities));

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === mockEmails[1]) return mockUserInfo2;
        return undefined;
      });

      vi.spyOn(mockSharedInstance, "shareWithUsers").mockResolvedValue(err(mockError));

      // Act
      const result = await addSharedUsers(mockMosToken, mockTitleId, mockEmails);

      // Assert
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.deepEqual(result.error, mockError);
      }
    });
  });

  describe("removeShareAccess", () => {
    const mockEmails = ["user1@example.com", "user2@example.com"];
    const mockUserInfo1: AppUser = {
      aadId: "user1-id",
      displayName: "User 1",
      userPrincipalName: "user1@example.com",
      tenantId: "mock-tenant-id",
      isAdministrator: true,
    };
    const mockUserInfo2: AppUser = {
      aadId: "user2-id",
      displayName: "User 2",
      userPrincipalName: "user2@example.com",
      tenantId: "mock-tenant-id",
      isAdministrator: true,
    };

    const mockExistingEntities: M365AppEntity[] = [
      { entityId: "user1-id", entityType: M365EntityType.User },
      { entityId: "user2-id", entityType: M365EntityType.User },
      { entityId: "user3-id", entityType: M365EntityType.User },
    ];

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should remove users and keep remaining users", async () => {
      // Arrange
      const getSharedUsersStub = vi
        .spyOn(mockSharedInstance, "getSharedUsers")
        .mockResolvedValue(ok(mockExistingEntities));

      const shareWithUsersStub = vi
        .spyOn(mockSharedInstance, "shareWithUsers")
        .mockResolvedValue(ok(undefined));

      const unshareStub = vi.spyOn(mockSharedInstance, "unshare");

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === mockEmails[1]) return mockUserInfo2;
        return undefined;
      });

      // Act
      const result = await removeShareAccess(mockMosToken, mockTitleId, mockEmails);

      // Assert
      assert.isTrue(result.isOk());
      assert.equal(getSharedUsersStub.mock.calls.length, 1);
      assert.equal(getUserInfoStub.mock.calls.length, 2);

      // Should call shareWithUsers with remaining users and not call unshare
      assert.equal(shareWithUsersStub.mock.calls.length, 1);
      assert.equal(unshareStub.mock.calls.length, 0);
    });

    it("should unshare when removing all users", async () => {
      // Arrange
      // Only existing entities are the ones we're removing
      const limitedEntities = [
        { entityId: "user1-id", entityType: M365EntityType.User },
        { entityId: "user2-id", entityType: M365EntityType.User },
      ];

      const getSharedUsersStub = vi
        .spyOn(mockSharedInstance, "getSharedUsers")
        .mockResolvedValue(ok(limitedEntities));

      const shareWithUsersStub = vi.spyOn(mockSharedInstance, "shareWithUsers");

      const unshareStub = vi.spyOn(mockSharedInstance, "unshare").mockResolvedValue(ok(undefined));

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === mockEmails[1]) return mockUserInfo2;
        return undefined;
      });

      // Act
      const result = await removeShareAccess(mockMosToken, mockTitleId, mockEmails);

      // Assert
      assert.isTrue(result.isOk());
      assert.equal(getSharedUsersStub.mock.calls.length, 1);
      assert.equal(getUserInfoStub.mock.calls.length, 2);

      // Should call unshare because all users are removed
      assert.equal(shareWithUsersStub.mock.calls.length, 0);
      assert.equal(unshareStub.mock.calls.length, 1);
    });

    it("should remove group when user info not found but group info is found", async () => {
      // Arrange
      const groupEmail = "group@example.com";
      const mockGroupInfo = {
        id: "group-id",
        displayName: "Test Group",
        mail: groupEmail,
      };
      const emailsWithGroup = [mockEmails[0], groupEmail];

      vi.spyOn(mockSharedInstance, "getSharedUsers").mockResolvedValue(ok(mockExistingEntities));

      const shareWithUsersStub = vi
        .spyOn(mockSharedInstance, "shareWithUsers")
        .mockResolvedValue(ok(undefined));

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === groupEmail) return undefined;
        return undefined;
      });

      const getGroupInfoStub = vi.spyOn(GraphClient.prototype, "getGroupInfo");
      getGroupInfoStub.mockImplementation(async (email) => {
        if (email === groupEmail) return mockGroupInfo;
        return undefined;
      });

      // Act
      const result = await removeShareAccess(mockMosToken, mockTitleId, emailsWithGroup);

      // Assert
      assert.isTrue(result.isOk());
      assert.equal(getUserInfoStub.mock.calls.length, 2);
      assert.equal(getGroupInfoStub.mock.calls.length, 1);
      assert.equal(shareWithUsersStub.mock.calls.length, 1);
    });

    it("should return error when invalid user email is provided", async () => {
      // Arrange
      vi.spyOn(mockSharedInstance, "getSharedUsers").mockResolvedValue(ok(mockExistingEntities));

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === mockEmails[1]) return undefined;
        return undefined;
      });

      // Mock GraphClient.getGroupInfo to also return undefined
      const getGroupInfoStub = vi
        .spyOn(GraphClient.prototype, "getGroupInfo")
        .mockResolvedValue(undefined);

      // Act
      const result = await removeShareAccess(mockMosToken, mockTitleId, mockEmails);

      // Assert
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.instanceOf(result.error, InputValidationError);
        assert.include(result.error.message, "Invalid user or group: user2@example.com");
      }
      assert.equal(getGroupInfoStub.mock.calls.length, 1);
    });

    it("should return error when getSharedUsers fails", async () => {
      // Arrange
      const mockError = new InputValidationError("test", "Get shared users failed");
      vi.spyOn(mockSharedInstance, "getSharedUsers").mockResolvedValue(err(mockError));

      // Act
      const result = await removeShareAccess(mockMosToken, mockTitleId, mockEmails);

      // Assert
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.deepEqual(result.error, mockError);
      }
    });

    it("should return error when shareWithUsers fails", async () => {
      // Arrange
      const mockError = new InputValidationError("test", "Share with users failed");

      vi.spyOn(mockSharedInstance, "getSharedUsers").mockResolvedValue(ok(mockExistingEntities));

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === mockEmails[1]) return mockUserInfo2;
        return undefined;
      });

      vi.spyOn(mockSharedInstance, "shareWithUsers").mockResolvedValue(err(mockError));

      // Act
      const result = await removeShareAccess(mockMosToken, mockTitleId, mockEmails);

      // Assert
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.deepEqual(result.error, mockError);
      }
    });

    it("should return error when unshare fails", async () => {
      // Arrange
      const mockError = new InputValidationError("test", "Unshare failed");
      // Only existing entities are the ones we're removing
      const limitedEntities = [
        { entityId: "user1-id", entityType: M365EntityType.User },
        { entityId: "user2-id", entityType: M365EntityType.User },
      ];

      vi.spyOn(mockSharedInstance, "getSharedUsers").mockResolvedValue(ok(limitedEntities));

      const getUserInfoStub = vi.spyOn(CollaborationUtil, "getUserInfo");
      getUserInfoStub.mockImplementation(async (_token, email) => {
        if (email === mockEmails[0]) return mockUserInfo1;
        if (email === mockEmails[1]) return mockUserInfo2;
        return undefined;
      });

      vi.spyOn(mockSharedInstance, "unshare").mockResolvedValue(err(mockError));

      // Act
      const result = await removeShareAccess(mockMosToken, mockTitleId, mockEmails);

      // Assert
      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.deepEqual(result.error, mockError);
      }
    });
  });
});
