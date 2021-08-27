// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

export enum TelemetryEvent {
  //TODO: define CLI telemetry event
  AccountLoginStart = "login-start",
  AccountLogin = "login",

  CreateProjectStart = "create-project-start",
  CreateProject = "create-project",

  DownloadSampleStart = "download-sample-start",
  DownloadSample = "download-sample",

  UpdateProjectStart = "add-resource-start",
  UpdateProject = "add-resource",

  AddCapStart = "add-capability-start",
  AddCap = "add-capability",

  ValidateManifestStart = "validate-manifest-start",
  ValidateManifest = "validate-manifest",

  BuildStart = "build-start",
  Build = "build",

  ProvisionStart = "provision-start",
  Provision = "provision",

  DeployStart = "deploy-start",
  Deploy = "deploy",

  PublishStart = "publish-start",
  Publish = "publish",

  InitStart = "init-start",
  Init = "init",

  PreviewStart = "preview-start",
  Preview = "preview",
  PreviewNpmInstallStart = "preview-npm-install-start",
  PreviewNpmInstall = "preview-npm-install",
  PreviewGulpCert = "preview-gulp-cert",
  PreviewGulpCertStart = "preview-gulp-cert-start",
  PreviewServiceStart = "preview-service-start",
  PreviewService = "preview-service",
  PreviewSideloadingStart = "preview-sideloading-start",
  PreviewSideloading = "preview-sideloading",
  PreviewSPFxOpenBrowserStart = "preview-spfx-open-browser-start",
  PreviewSPFxOpenBrowser = "preview-spfx-open-browser",

  ConfigGet = "config-get",
  ConfigSet = "config-set",

  CheckPermissionStart = "check-permission-start",
  CheckPermission = "check-permission",

  GrantPermissionStart = "grant-permission-start",
  GrantPermission = "grant-permission",
}

export enum TelemetryProperty {
  Component = "component",
  ProjectId = "project-id",
  CorrelationId = "correlation-id",
  AppId = "appid",
  UserId = "hashed-userid",
  AccountType = "account-type",
  Success = "success",
  ErrorType = "error-type",
  ErrorCode = "error-code",
  ErrorMessage = "error-message",
  SampleName = "sample-name",
  Capabilities = "capabilities",
  Resources = "resources",
  Internal = "internal",
  InternalAlias = "internal-alias",
  PreviewAppId = "preview-appid",
  PreviewType = "preview-type",
  PreviewBrowser = "preview-browser",
  PreviewNpmInstallName = "preview-npm-install-name",
  PreviewGulpCertName = "preview-gulp-cert-name",
  PreviewNpmInstallExitCode = "preview-npm-install-exit-code",
  PreviewNpmInstallNodeVersion = "preview-npm-install-node-version",
  PreviewNpmInstallNpmVersion = "preview-npm-install-npm-version",
  PreviewNpmInstallErrorMessage = "preview-npm-install-error-message",
  PreviewServiceName = "preview-service-name",
  PreviewOSArch = "preview-os-arch",
  PreviewOSRelease = "preview-os-release",
  ListAllCollaborator = "list-all-collaborator",
  FeatureFlags = "feature-flags",
}

export enum TelemetrySuccess {
  Yes = "yes",
  No = "no",
}

export enum TelemetryErrorType {
  UserError = "user",
  SystemError = "system",
}

export enum TelemetryAccountType {
  Azure = "azure",
  M365 = "m365",
}

export const TelemetryComponentType = "cli";
