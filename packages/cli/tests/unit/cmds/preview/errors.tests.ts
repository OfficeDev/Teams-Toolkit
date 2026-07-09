// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { Browser } from "../../../../src/cmds/preview/constants";
import * as errors from "../../../../src/cmds/preview/errors";
import { chai } from "vitest";

describe("errors", () => {
  describe("WorkSpaceNotSupported", () => {
    it("should have correct source and name", () => {
      const e = errors.WorkspaceNotSupported("");
      chai.expect(e.source).eq("TeamsfxCLI");
      chai.expect(e.name).eq("WorkspaceNotSupported");
    });
  });

  describe("ExclusiveLocalRemoteOptions", () => {
    it("should have correct source and name", () => {
      const e = errors.ExclusiveLocalRemoteOptions();
      chai.expect(e.source).eq("TeamsfxCLI");
      chai.expect(e.name).eq("ExclusiveLocalRemoteOptions");
    });
  });

  describe("RequiredPathNotExists", () => {
    it("should have correct source and name", () => {
      const e = errors.RequiredPathNotExists("");
      chai.expect(e.source).eq("TeamsfxCLI");
      chai.expect(e.name).eq("RequiredPathNotExists");
    });
  });

  it("create errors", () => {
    let actualError = undefined;
    try {
      errors.WorkspaceNotSupported("test");
      errors.ExclusiveLocalRemoteOptions();
      errors.RequiredPathNotExists("test");
      errors.TaskFailed("test");
      errors.PreviewCommandFailed([]);
      errors.TeamsAppIdNotExists();
      errors.PortsAlreadyInUse([1]);
      errors.PreviewWithoutProvision();
      errors.MissingProgrammingLanguageSetting();
      errors.OpeningBrowserFailed(Browser.default);
      errors.NoUrlForSPFxRemotePreview();
      errors.InvalidSharePointSiteURL(new Error("test"));
      errors.DependencyCheckerFailed();
      errors.PrerequisitesValidationNodejsError("test", "test");
      errors.PrerequisitesValidationM365AccountError("test", "test");
      errors.NpmInstallFailed();
      errors.CannotDetectRunCommand();
    } catch (error) {
      actualError = error;
    }

    chai.expect(actualError).to.be.undefined;
  });
});
