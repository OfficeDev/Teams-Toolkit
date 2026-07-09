// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  DeployEmptyFolderError,
  CheckDeploymentStatusTimeoutError,
  GetPublishingCredentialsError,
  DeployZipPackageError,
  ZipFileError,
  CacheFileInUse,
} from "../../../src";
import { UserError } from "@microsoft/teamsfx-api";
import { chai } from "vitest";

describe("DeployEmptyFolderError", () => {
  it("should create a new DeployEmptyFolderError with the correct message", () => {
    const folderPath = "/path/to/folder";
    const error = new DeployEmptyFolderError(folderPath);
    chai.expect(error).to.be.instanceOf(UserError);
    chai.expect(error.source).to.equal("azureDeploy");
    chai
      .expect(error.message)
      .to.equal(
        `Unable to locate any files in the distribution folder: '${folderPath}'. Make sure the folder includes all necessary files.`
      );
    chai
      .expect(error.displayMessage)
      .to.equal(
        `Unable to locate any files in the distribution folder: '${folderPath}'. Make sure the folder includes all necessary files.`
      );
  });
});

describe("CheckDeploymentStatusTimeoutError", () => {
  it("should create a new CheckDeploymentStatusTimeoutError with the correct message", () => {
    const error = new CheckDeploymentStatusTimeoutError();
    chai.expect(error).to.be.instanceOf(UserError);
    chai.expect(error.source).to.equal("azureDeploy");
    chai
      .expect(error.message)
      .to.equal(
        "Unable to check deployment status because the process timed out. Check your internet connection and try again. If the issue persists, review the deployment logs (Deployment -> Deployment center -> Logs) in Azure portal to identify any issues that may have occurred."
      );
    chai
      .expect(error.displayMessage)
      .to.equal(
        "Unable to check deployment status because the process timed out. Check your internet connection and try again. If the issue persists, review the deployment logs (Deployment -> Deployment center -> Logs) in Azure portal to identify any issues that may have occurred."
      );
  });
});

describe("GetPublishingCredentialsError", () => {
  it("should create a new GetPublishingCredentialsError with the correct message and help link", () => {
    const appName = "my-app";
    const resourceGroup = "my-resource-group";
    const error = new Error("Something went wrong.");
    const helpLink = "https://example.com/help";
    const userError = new GetPublishingCredentialsError(appName, resourceGroup, error, helpLink);
    chai.expect(userError).to.be.instanceOf(UserError);
    chai.expect(userError.source).to.equal("azureDeploy");
    // error stack will be contained in the error message
    chai.expect(userError.message).to.contains("deployError");
    chai
      .expect(userError.displayMessage)
      .to.equal(
        "Unable to obtain publishing credentials of app 'my-app' in resource group 'my-resource-group'. Refer to the [Output panel](command:fx-extension.showOutputChannel) for more details."
      );
    chai.expect(userError.helpLink).to.equal(helpLink);
  });

  it("should create a new GetPublishingCredentialsError with the correct message and no help link", () => {
    const appName = "my-app";
    const resourceGroup = "my-resource-group";
    const error = new Error("Something went wrong.");
    const userError = new GetPublishingCredentialsError(appName, resourceGroup, error);
    chai.expect(userError).to.be.instanceOf(UserError);
    chai.expect(userError.source).to.equal("azureDeploy");
    chai.expect(userError.message).to.contains("deployError");
    chai
      .expect(userError.displayMessage)
      .to.equal(
        "Unable to obtain publishing credentials of app 'my-app' in resource group 'my-resource-group'. Refer to the [Output panel](command:fx-extension.showOutputChannel) for more details."
      );
    chai.expect(userError.helpLink).to.be.undefined;
  });
});

describe("DeployZipPackageError", () => {
  it("should create a new DeployZipPackageError with the correct message", () => {
    const error = new DeployZipPackageError("endpoint", new Error("zipPath error"));
    chai.expect(error).to.be.instanceOf(UserError);
    chai.expect(error.source).to.equal("azureDeploy");
    chai.expect(error.message).to.contains("deployError");
    chai
      .expect(error.displayMessage)
      .to.equal(
        "Unable to deploy zip package to endpoint: 'endpoint'. Refer to the [Output panel](command:fx-extension.showOutputChannel) for more details and try again."
      );
  });
});

describe("ZipFileError", () => {
  it("should create a new ZipFileError with the correct message", () => {
    const error = new ZipFileError(new Error("zipPath error"));
    chai.expect(error).to.be.instanceOf(UserError);
    chai.expect(error.source).to.equal("azureDeploy");
  });
});

describe("CacheFileInUse", () => {
  it("should create a new CacheFileInUse with the correct message", () => {
    const path = "/path/to/the/zip/file.zip";
    const error = new CacheFileInUse(path, new Error("zipPath error"));
    chai.expect(error).to.be.instanceOf(UserError);
    chai.expect(error.source).to.equal("azureDeploy");
    chai
      .expect(error.message)
      .to.equal(
        `Unable to clear the distribution zip file in ${path} as it may be currently in use. Close any apps using the file and try again.`
      );
  });
});
