// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { AadManifestHelper } from "../../../../src/component/driver/aad/utility/aadManifestHelper";
import { AadManifestErrorMessage } from "../../../../src/component/driver/aad/error/aadManifestError";
import { AADManifest } from "../../../../src/component/driver/aad/interface/AADManifest";
import { MockTools } from "../../../core/utils";
import { setTools, TOOLS } from "../../../../src/common/globalVars";
import { ok } from "@microsoft/teamsfx-api";
import fs from "fs-extra";
import { chai, vi } from "vitest";

describe("Microsoft Entra manifest helper Test", () => {
  const tools = new MockTools();
  setTools(tools);

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  it("manifestToApplication", async () => {
    const aadApp = AadManifestHelper.manifestToApplication(fakeAadManifest);
    chai.expect(aadApp).to.deep.equal(fakeAadApp);
  });

  it("manifestToApplication should return original manifest if it already using new schema", async () => {
    const aadApp = AadManifestHelper.manifestToApplication(fakeAadApp);
    chai.expect(aadApp).to.deep.equal(fakeAadApp);
  });

  it("manifestToApplication with no reply url", () => {
    const manifest = JSON.parse(JSON.stringify(fakeAadManifest));
    delete manifest.replyUrlsWithType;
    console.log(JSON.stringify(manifest));

    const expectedAadApp = JSON.parse(JSON.stringify(fakeAadApp));
    expectedAadApp.web.redirectUris = undefined;
    expectedAadApp.spa.redirectUris = undefined;
    expectedAadApp.publicClient.redirectUris = undefined;
    console.log(JSON.stringify(expectedAadApp));

    const aadApp = AadManifestHelper.manifestToApplication(manifest);
    chai.expect(aadApp).to.deep.equal(expectedAadApp);
  });

  it("applicationToManifest", async () => {
    const aadManifest = AadManifestHelper.applicationToManifest(fakeAadApp);
    chai.expect(aadManifest).to.deep.equal(fakeAadManifest);
  });

  it("validateManifest with no warning", async () => {
    const warning = AadManifestHelper.validateManifest(fakeAadManifest);
    chai.expect(warning).to.be.empty;
  });

  it("validateManifest with invalid manifest", async () => {
    const warning = AadManifestHelper.validateManifest(invalidAadManifest);
    chai.expect(warning).contain(AadManifestErrorMessage.NameIsMissing);
    chai.expect(warning).contain(AadManifestErrorMessage.SignInAudienceIsMissing);
    chai.expect(warning).contain(AadManifestErrorMessage.PreAuthorizedApplicationsIsMissing);
    chai.expect(warning).contain(AadManifestErrorMessage.Oauth2PermissionsIsMissing);
    chai.expect(warning).contain(AadManifestErrorMessage.AccessTokenAcceptedVersionIs1);
    chai.expect(warning).contain(AadManifestErrorMessage.OptionalClaimsMissingIdtypClaim.trimEnd());
  });

  it("validateManifest with no warning with new schema", async () => {
    const warning = AadManifestHelper.validateManifest(fakeAadApp);
    chai.expect(warning).to.be.empty;
  });

  it("validasteManifest invalid manifest with new schema", async () => {
    const warning = AadManifestHelper.validateManifest(invalidAadManifestWithNewSChema as any);
    chai.expect(warning).contain(AadManifestErrorMessage.NameIsMissing);
    chai.expect(warning).contain(AadManifestErrorMessage.SignInAudienceIsMissing);
    chai.expect(warning).contain(AadManifestErrorMessage.RequiredResourceAccessIsMissing);
    chai.expect(warning).contain(AadManifestErrorMessage.PreAuthorizedApplicationsIsMissing);
    chai.expect(warning).contain(AadManifestErrorMessage.Oauth2PermissionsIsMissing);
    chai.expect(warning).contain(AadManifestErrorMessage.AccessTokenAcceptedVersionIs1);
    chai.expect(warning).contain(AadManifestErrorMessage.OptionalClaimsMissingIdtypClaim.trimEnd());
  });

  it("validateManifest with no accessToken property", async () => {
    const invalidAadManifest = JSON.parse(JSON.stringify(fakeAadManifest));
    delete invalidAadManifest.optionalClaims.accessToken;
    const warning = AadManifestHelper.validateManifest(invalidAadManifest);
    chai.expect(warning).contain(AadManifestErrorMessage.OptionalClaimsMissingIdtypClaim.trimEnd());
  });

  it("showWarningIfManifestIsOutdated should work if user confirm", async () => {
    vi.spyOn(TOOLS.ui, "showMessage").mockResolvedValue(ok("Upgrade"));
    vi.spyOn(fs, "readJson").mockResolvedValue(fakeAadManifest);
    const convertManifestToNewSchemaAndOverrideStub = vi
      .spyOn(AadManifestHelper, "convertManifestToNewSchemaAndOverride")
      .mockResolvedValue();
    await AadManifestHelper.showWarningIfManifestIsOutdated("fake-path", "fake-project-path");
  });

  it("showWarningIfManifestIsOutdated should work if user cancel", async () => {
    vi.spyOn(TOOLS.ui, "showMessage").mockResolvedValue(ok(""));
    vi.spyOn(fs, "readJson").mockResolvedValue(fakeAadManifest);
    const convertManifestToNewSchemaAndOverrideStub = vi
      .spyOn(AadManifestHelper, "convertManifestToNewSchemaAndOverride")
      .mockResolvedValue();
    await AadManifestHelper.showWarningIfManifestIsOutdated("fake-path", "fake-project-path");
  });

  it("processRequiredResourceAccessInManifest with id", async () => {
    const manifestWithId: any = {
      requiredResourceAccess: [
        {
          resourceAppId: "00000003-0000-0000-c000-000000000000",
          resourceAccess: [
            {
              id: "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
              type: "Scope",
            },
          ],
        },
        {
          resourceAppId: "00000003-0000-0ff1-ce00-000000000000",
          resourceAccess: [
            {
              id: "d13f72ca-a275-4b96-b789-48ebcc4da984",
              type: "Role",
            },
          ],
        },
      ],
    };

    AadManifestHelper.processRequiredResourceAccessInManifest(manifestWithId);
    chai
      .expect(manifestWithId.requiredResourceAccess[0].resourceAppId)
      .equal("00000003-0000-0000-c000-000000000000");
    chai
      .expect(manifestWithId.requiredResourceAccess[0].resourceAccess[0].id)
      .equal("e1fe6dd8-ba31-4d61-89e7-88639da4683d");
    chai
      .expect(manifestWithId.requiredResourceAccess[1].resourceAppId)
      .equal("00000003-0000-0ff1-ce00-000000000000");
    chai
      .expect(manifestWithId.requiredResourceAccess[1].resourceAccess[0].id)
      .equal("d13f72ca-a275-4b96-b789-48ebcc4da984");
  });

  it("processRequiredResourceAccessInManifest with string", async () => {
    const manifestWithString: any = {
      requiredResourceAccess: [
        {
          resourceAppId: "Microsoft Graph",
          resourceAccess: [
            {
              id: "User.Read",
              type: "Scope",
            },
          ],
        },
        {
          resourceAppId: "Office 365 SharePoint Online",
          resourceAccess: [
            {
              id: "Sites.Read.All",
              type: "Role",
            },
          ],
        },
      ],
    };
    AadManifestHelper.processRequiredResourceAccessInManifest(manifestWithString);
    chai
      .expect(manifestWithString.requiredResourceAccess[0].resourceAppId)
      .equal("00000003-0000-0000-c000-000000000000");
    chai
      .expect(manifestWithString.requiredResourceAccess[0].resourceAccess[0].id)
      .equal("e1fe6dd8-ba31-4d61-89e7-88639da4683d");
    chai
      .expect(manifestWithString.requiredResourceAccess[1].resourceAppId)
      .equal("00000003-0000-0ff1-ce00-000000000000");
    chai
      .expect(manifestWithString.requiredResourceAccess[1].resourceAccess[0].id)
      .equal("d13f72ca-a275-4b96-b789-48ebcc4da984");
  });

  it("processRequiredResourceAccessInManifest with invalid string", async () => {
    const manifestWithInvalidSting: any = {
      requiredResourceAccess: [
        {
          resourceAppId: "Invalid Id",
          resourceAccess: [
            {
              id: "User.Read",
              type: "Scope",
            },
          ],
        },
      ],
    };

    chai
      .expect(() => {
        AadManifestHelper.processRequiredResourceAccessInManifest(manifestWithInvalidSting);
      })
      .to.throw("Unknown resourceAppId Invalid Id");
  });

  it("processRequiredResourceAccessInManifest with no resourceAppId", async () => {
    const manifestWithInvalidSting: any = {
      requiredResourceAccess: [
        {
          resourceAccess: [
            {
              id: "User.Read",
              type: "Scope",
            },
          ],
        },
      ],
    };

    chai
      .expect(() => {
        AadManifestHelper.processRequiredResourceAccessInManifest(manifestWithInvalidSting);
      })
      .to.throw("Some item(s) in requiredResourceAccess misses resourceAppId property.");
  });

  it("processRequiredResourceAccessInManifest with no resourceAccess id", async () => {
    const manifestWithInvalidSting: any = {
      requiredResourceAccess: [
        {
          resourceAppId: "Microsoft Graph",
          resourceAccess: [
            {
              type: "Scope",
            },
          ],
        },
      ],
    };

    chai
      .expect(() => {
        AadManifestHelper.processRequiredResourceAccessInManifest(manifestWithInvalidSting);
      })
      .to.throw("Some item(s) in resourceAccess misses id property.");
  });

  it("processRequiredResourceAccessInManifest with no requiredResourceAccess", async () => {
    const manifest: any = {};

    chai
      .expect(() => {
        AadManifestHelper.processRequiredResourceAccessInManifest(manifest);
      })
      .to.not.throw();
  });

  it("processRequiredResourceAccessInManifest with no resourceAccess", async () => {
    const manifest: any = {
      requiredResourceAccess: [
        {
          resourceAppId: "00000003-0000-0000-c000-000000000000",
        },
      ],
    };

    chai
      .expect(() => {
        AadManifestHelper.processRequiredResourceAccessInManifest(manifest);
      })
      .to.not.throw();
  });

  it("processRequiredResourceAccessInManifest with non-exist resource app id", async () => {
    let manifest: any = {
      requiredResourceAccess: [
        {
          resourceAppId: "00000000-0000-0000-0000-000000000000", // Non-exist resource app id
          resourceAccess: [
            {
              id: "User.Read",
              type: "Scope",
            },
          ],
        },
      ],
    };

    chai
      .expect(() => {
        AadManifestHelper.processRequiredResourceAccessInManifest(manifest);
      })
      .to.throw(
        "Unknown resourceAccess id: User.Read, try to use permission id instead of resourceAccess id."
      );

    manifest = {
      requiredResourceAccess: [
        {
          resourceAppId: "00000000-0000-0000-0000-000000000000", // Non-exist resource app id
          resourceAccess: [
            {
              id: "Sites.Read.All",
              type: "Role",
            },
          ],
        },
      ],
    };

    chai
      .expect(() => {
        AadManifestHelper.processRequiredResourceAccessInManifest(manifest);
      })
      .to.throw(
        "Unknown resourceAccess id: Sites.Read.All, try to use permission id instead of resourceAccess id."
      );
  });

  it("processRequiredResourceAccessInManifest with non-array required resource access/resource access", async () => {
    let manifest: any = {
      requiredResourceAccess: {
        resourceAppId: "Microsoft Graph",
        resourceAccess: [
          {
            id: "User.Read",
            type: "Scope",
          },
        ],
      },
    };

    chai
      .expect(() => {
        AadManifestHelper.processRequiredResourceAccessInManifest(manifest);
      })
      .to.throw("requiredResourceAccess should be an array.");

    manifest = {
      requiredResourceAccess: [
        {
          resourceAppId: "Microsoft Graph",
          resourceAccess: {
            id: "Sites.Read.All",
            type: "Role",
          },
        },
      ],
    };

    chai
      .expect(() => {
        AadManifestHelper.processRequiredResourceAccessInManifest(manifest);
      })
      .to.throw("resourceAccess should be an array.");
  });
});

const invalidAadManifest: AADManifest = {
  id: "",
  appId: "",
  name: "",
  accessTokenAcceptedVersion: 1,
  signInAudience: "",
  optionalClaims: {
    idToken: [],
    accessToken: [],
    saml2Token: [],
  },
  requiredResourceAccess: [],
  oauth2Permissions: [],
  preAuthorizedApplications: [],
  identifierUris: [],
  replyUrlsWithType: [],
  addIns: [],
  appRoles: [],
  informationalUrls: {},
  keyCredentials: [],
  knownClientApplications: [],
  oauth2AllowIdTokenImplicitFlow: false,
  oauth2AllowImplicitFlow: false,
  tags: [],
};

const invalidAadManifestWithNewSChema = {
  id: "",
  appId: "",
  displayName: "",
  api: {
    requestedAccessTokenVersion: 1,
    knownClientApplications: [],
    oauth2PermissionScopes: [],
    preAuthorizedApplications: [],
  },
  signInAudience: "",
  optionalClaims: {
    idToken: [],
    accessToken: [],
    saml2Token: [],
  },
  identifierUris: [],
  web: {
    redirectUris: [],
    implicitGrantSettings: {
      enableAccessTokenIssuance: false,
      enableIdTokenIssuance: false,
    },
  },
  addIns: [],
  appRoles: [],
  info: {
    marketingUrl: "",
    privacyStatementUrl: "",
    supportUrl: "",
    termsOfServiceUrl: "",
  },
  keyCredentials: [],
  tags: [],
  publicClient: {
    redirectUris: [],
  },
  spa: {
    redirectUris: [],
  },
};

const fakeAadApp = {
  id: "fake-id",
  appId: "fake-app-id",
  disabledByMicrosoftStatus: null,
  displayName: "fake-display-name",
  description: null,
  groupMembershipClaims: null,
  identifierUris: ["api://xxx.z13.web.core.windows.net/botid-uuid"],
  isFallbackPublicClient: null,
  notes: null,
  signInAudience: "AzureADMyOrg",
  tags: [],
  tokenEncryptionKeyId: null,
  addIns: [],
  api: {
    acceptMappedClaims: null,
    knownClientApplications: [],
    requestedAccessTokenVersion: 2,
    oauth2PermissionScopes: [
      {
        adminConsentDescription: "Allows Teams to call the app's web APIs as the current user.",
        adminConsentDisplayName: "Teams can access app's web APIs",
        id: "5344c933-4245-425e-9d63-1a9b2a1bbb28",
        isEnabled: true,
        type: "User",
        userConsentDescription:
          "Enable Teams to call this app's web APIs with the same rights that you have",
        userConsentDisplayName: "Teams can access app's web APIs and make requests on your behalf",
        value: "access_as_user",
      },
    ],
    preAuthorizedApplications: [
      {
        appId: "1fec8e78-bce4-4aaf-ab1b-5451cc387264",
        delegatedPermissionIds: ["5344c933-4245-425e-9d63-1a9b2a1bbb28"],
      },
      {
        appId: "5e3ce6c0-2b1f-4285-8d4b-75ee78787346",
        delegatedPermissionIds: ["5344c933-4245-425e-9d63-1a9b2a1bbb28"],
      },
    ],
  },
  appRoles: [
    {
      allowedMemberTypes: ["User"],
      description: "test",
      displayName: "test",
      id: "4439cc9c-44b9-47dd-b162-acea94fd9ff3",
      isEnabled: true,
      value: "test",
    },
  ],
  info: {
    marketingUrl: null,
    privacyStatementUrl: null,
    supportUrl: null,
    termsOfServiceUrl: null,
  },
  keyCredentials: [],
  optionalClaims: {
    accessToken: [
      {
        additionalProperties: [],
        essential: false,
        name: "idtyp",
        source: null,
      },
    ],
    idToken: [],
    saml2Token: [],
  },
  parentalControlSettings: {
    countriesBlockedForMinors: [],
    legalAgeGroupRule: "Allow",
  },
  requiredResourceAccess: [
    {
      resourceAppId: "00000003-0000-0000-c000-000000000000",
      resourceAccess: [
        {
          id: "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
          type: "Scope",
        },
      ],
    },
  ],
  web: {
    homePageUrl: null,
    logoutUrl: null,
    redirectUris: [
      "https://xxx.ngrok.io/api/messages",
      "https://xxx.azurewebsites.net/auth-end.html",
      "https://xxx.z13.web.core.windows.net/auth-end.html",
    ],
    implicitGrantSettings: {
      enableAccessTokenIssuance: false,
      enableIdTokenIssuance: false,
    },
  },
  spa: {
    redirectUris: ["https://xxx.test.com"],
  },
  publicClient: {
    redirectUris: ["https://test.com"],
  },
};

const fakeAadManifest = {
  id: "fake-id",
  appId: "fake-app-id",
  acceptMappedClaims: null,
  accessTokenAcceptedVersion: 2,
  addIns: [],
  allowPublicClient: null,
  appRoles: [
    {
      allowedMemberTypes: ["User"],
      description: "test",
      displayName: "test",
      id: "4439cc9c-44b9-47dd-b162-acea94fd9ff3",
      isEnabled: true,
      value: "test",
    },
  ],
  description: null,
  disabledByMicrosoftStatus: null,
  groupMembershipClaims: null,
  identifierUris: ["api://xxx.z13.web.core.windows.net/botid-uuid"],
  informationalUrls: {
    termsOfService: null,
    support: null,
    privacy: null,
    marketing: null,
  },
  keyCredentials: [],
  knownClientApplications: [],
  logoutUrl: null,
  name: "fake-display-name",
  notes: null,
  oauth2AllowIdTokenImplicitFlow: false,
  oauth2AllowImplicitFlow: false,
  oauth2Permissions: [
    {
      adminConsentDescription: "Allows Teams to call the app's web APIs as the current user.",
      adminConsentDisplayName: "Teams can access app's web APIs",
      id: "5344c933-4245-425e-9d63-1a9b2a1bbb28",
      isEnabled: true,
      type: "User",
      userConsentDescription:
        "Enable Teams to call this app's web APIs with the same rights that you have",
      userConsentDisplayName: "Teams can access app's web APIs and make requests on your behalf",
      value: "access_as_user",
    },
  ],
  optionalClaims: {
    accessToken: [
      {
        additionalProperties: [],
        essential: false,
        name: "idtyp",
        source: null,
      },
    ],
    idToken: [],
    saml2Token: [],
  },
  parentalControlSettings: {
    countriesBlockedForMinors: [],
    legalAgeGroupRule: "Allow",
  },
  preAuthorizedApplications: [
    {
      appId: "1fec8e78-bce4-4aaf-ab1b-5451cc387264",
      permissionIds: ["5344c933-4245-425e-9d63-1a9b2a1bbb28"],
    },
    {
      appId: "5e3ce6c0-2b1f-4285-8d4b-75ee78787346",
      permissionIds: ["5344c933-4245-425e-9d63-1a9b2a1bbb28"],
    },
  ],
  replyUrlsWithType: [
    {
      type: "Spa",
      url: "https://xxx.test.com",
    },
    {
      type: "Web",
      url: "https://xxx.ngrok.io/api/messages",
    },
    {
      type: "Web",
      url: "https://xxx.azurewebsites.net/auth-end.html",
    },
    {
      type: "Web",
      url: "https://xxx.z13.web.core.windows.net/auth-end.html",
    },
    {
      type: "InstalledClient",
      url: "https://test.com",
    },
  ],
  requiredResourceAccess: [
    {
      resourceAppId: "00000003-0000-0000-c000-000000000000",
      resourceAccess: [
        {
          id: "e1fe6dd8-ba31-4d61-89e7-88639da4683d",
          type: "Scope",
        },
      ],
    },
  ],
  signInUrl: null,
  signInAudience: "AzureADMyOrg",
  tags: [],
  tokenEncryptionKeyId: null,
};
