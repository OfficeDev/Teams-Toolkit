// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  FxError,
  Inputs,
  InputsWithProjectPath,
  Result,
  TeamsAppInputs,
  Tools,
  err,
  ok,
} from "@microsoft/teamsfx-api";
import {
  MosServiceScope,
  ResourceServiceType,
  getResourceServiceEndpoint,
} from "../common/constants";
import { teamsappMgr } from "../component/driver/teamsApp/teamsappMgr";
import { PackageService } from "../component/m365/packageService";
import { envUtil } from "../component/utils/envUtil";
import { UserCancelError, assembleError } from "../error";
import { AddAuthActionInputs, AddPluginInputs, AddSkillInputs, UninstallInputs } from "../question";
import { FxCore } from "./FxCore";
import {
  WorkerInspectionResult,
  WorkerMutationResult,
  WorkerOperationOptions,
  WorkerProjectOptions,
  WorkerValidationResult,
  addWorkerAgent,
  inspectWorkerAgents,
  removeWorkerAgent,
  validateWorkerAgents,
} from "./workerAgents";

export type {
  WorkerDiagnostic,
  WorkerDiagnosticCode,
  WorkerDiagnosticSeverity,
  WorkerInspectionItem,
  WorkerInspectionResult,
  WorkerMutationResult,
  WorkerOperationOptions,
  WorkerProjectOptions,
  WorkerReferenceInput,
  WorkerReferenceType,
  WorkerValidationResult,
} from "./workerAgents";

/** Execution controls shared by every first-class fx-core client operation. */
export interface FxCoreExecutionOptions {
  /**
   * Cooperatively cancels the operation. The signal is checked before each
   * lifecycle step and is forwarded to network calls that support cancellation.
   */
  signal?: AbortSignal;
}

export interface FxCoreProvisionResult {
  outputs: Record<string, string>;
}

export interface FxCorePackageResult {
  packagePath: string;
}

export interface FxCorePublishResult {
  packagePath: string;
}

export type FxCoreValidationSeverity = "error" | "warning" | "info";

export interface FxCoreValidationIssue {
  severity: FxCoreValidationSeverity;
  message: string;
  path?: string;
  code?: string;
  helpUrl?: string;
}

export interface FxCoreValidationResult {
  valid: boolean;
  issues: FxCoreValidationIssue[];
}

export interface FxCoreUninstallResult {
  removed: string[];
}

export type FxCoreLaunchInfoInputs =
  { titleId: string; manifestId?: never } | { manifestId: string; titleId?: never };

export type FxCoreLaunchInfoResult = Record<string, unknown>;

export type FxCoreProvisionInputs = InputsWithProjectPath & { env: string };

/** Inputs for adding an OpenAPI or MCP action to an existing project. */
export type FxCoreAddPluginInputs = AddPluginInputs &
  InputsWithProjectPath & {
    "manifest-path": string;
    "api-plugin-type": "api-spec" | "mcp";
  };

/** Inputs for creating or importing an agent skill. */
export type FxCoreAddSkillInputs = AddSkillInputs &
  InputsWithProjectPath & {
    "manifest-path": string;
    "expose-to-copilot"?: "yes" | "no";
  };

/** Inputs for adding an authentication configuration to a plugin. */
export type FxCoreAddAuthActionInputs = AddAuthActionInputs &
  InputsWithProjectPath & {
    "plugin-manifest-path": string;
    "auth-name": string;
  };

/**
 * Stable, typed lifecycle boundary for in-process consumers.
 *
 * Unlike the legacy CLI-oriented FxCore methods, invalid application packages
 * are successful domain outcomes from validate(), with valid set to false.
 */
export interface IFxCoreClient {
  addWorkerAgent(
    options: WorkerOperationOptions,
    context?: FxCoreExecutionOptions
  ): Promise<Result<WorkerMutationResult, FxError>>;
  removeWorkerAgent(
    options: WorkerOperationOptions,
    context?: FxCoreExecutionOptions
  ): Promise<Result<WorkerMutationResult, FxError>>;
  inspectWorkerAgents(
    options: WorkerProjectOptions,
    context?: FxCoreExecutionOptions
  ): Promise<Result<WorkerInspectionResult, FxError>>;
  validateWorkerAgents(
    options: WorkerProjectOptions,
    context?: FxCoreExecutionOptions
  ): Promise<Result<WorkerValidationResult, FxError>>;
  addPlugin(
    inputs: FxCoreAddPluginInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<undefined, FxError>>;
  addSkill(
    inputs: FxCoreAddSkillInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<undefined, FxError>>;
  addAuthAction(
    inputs: FxCoreAddAuthActionInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<undefined, FxError>>;
  provision(
    inputs: FxCoreProvisionInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCoreProvisionResult, FxError>>;
  package(
    inputs: TeamsAppInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCorePackageResult, FxError>>;
  publish(
    inputs: TeamsAppInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCorePublishResult, FxError>>;
  validate(
    inputs: TeamsAppInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCoreValidationResult, FxError>>;
  getLaunchInfo(
    inputs: FxCoreLaunchInfoInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCoreLaunchInfoResult, FxError>>;
  uninstall(
    inputs: UninstallInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCoreUninstallResult, FxError>>;
}

/** Default implementation of the stable in-process lifecycle boundary. */
export class FxCoreClient implements IFxCoreClient {
  private readonly core: FxCore;

  public constructor(private readonly tools: Tools) {
    this.core = new FxCore(tools);
  }

  public async addWorkerAgent(
    options: WorkerOperationOptions,
    context?: FxCoreExecutionOptions
  ): Promise<Result<WorkerMutationResult, FxError>> {
    return addWorkerAgent(options, context);
  }

  public async removeWorkerAgent(
    options: WorkerOperationOptions,
    context?: FxCoreExecutionOptions
  ): Promise<Result<WorkerMutationResult, FxError>> {
    return removeWorkerAgent(options, context);
  }

  public async inspectWorkerAgents(
    options: WorkerProjectOptions,
    context?: FxCoreExecutionOptions
  ): Promise<Result<WorkerInspectionResult, FxError>> {
    return inspectWorkerAgents(options, context);
  }

  public async validateWorkerAgents(
    options: WorkerProjectOptions,
    context?: FxCoreExecutionOptions
  ): Promise<Result<WorkerValidationResult, FxError>> {
    return validateWorkerAgents(options, context);
  }

  public async addPlugin(
    inputs: FxCoreAddPluginInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<undefined, FxError>> {
    return this.runAdd(inputs, options, (clientInputs) => this.core.addPlugin(clientInputs));
  }

  public async addSkill(
    inputs: FxCoreAddSkillInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<undefined, FxError>> {
    return this.runAdd(inputs, options, (clientInputs) => this.core.addSkill(clientInputs));
  }

  public async addAuthAction(
    inputs: FxCoreAddAuthActionInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<undefined, FxError>> {
    return this.runAdd(inputs, options, (clientInputs) => this.core.addAuthAction(clientInputs));
  }

  public async provision(
    inputs: FxCoreProvisionInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCoreProvisionResult, FxError>> {
    const cancelled = this.cancelled<FxCoreProvisionResult>(options?.signal);
    if (cancelled) return cancelled;
    const clientInputs = this.withSignal(inputs, options?.signal);
    const result = await this.core.provisionResources(clientInputs);
    if (result.isErr()) return err(result.error);
    const afterOperation = this.cancelled<FxCoreProvisionResult>(options?.signal);
    if (afterOperation) return afterOperation;
    const envResult = await envUtil.readEnv(inputs.projectPath, inputs.env, false, false);
    if (envResult.isErr()) return err(envResult.error);
    return ok({ outputs: envResult.value });
  }

  public async package(
    inputs: TeamsAppInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCorePackageResult, FxError>> {
    const cancelled = this.cancelled<FxCorePackageResult>(options?.signal);
    if (cancelled) return cancelled;
    const clientInputs = this.withSignal(inputs, options?.signal);
    const result = await this.core.packageTeamsAppCLIV3(clientInputs);
    if (result.isErr()) return err(result.error);
    const afterOperation = this.cancelled<FxCorePackageResult>(options?.signal);
    if (afterOperation) return afterOperation;
    return ok({ packagePath: clientInputs["output-package-file"] as string });
  }

  public async publish(
    inputs: TeamsAppInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCorePublishResult, FxError>> {
    const cancelled = this.cancelled<FxCorePublishResult>(options?.signal);
    if (cancelled) return cancelled;
    const clientInputs = this.withSignal(inputs, options?.signal);
    const result = await this.core.publishTeamsAppCLIV3(clientInputs);
    if (result.isErr()) return err(result.error);
    const afterOperation = this.cancelled<FxCorePublishResult>(options?.signal);
    if (afterOperation) return afterOperation;
    return ok({ packagePath: clientInputs["package-file"] as string });
  }

  public async validate(
    inputs: TeamsAppInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCoreValidationResult, FxError>> {
    const cancelled = this.cancelled<FxCoreValidationResult>(options?.signal);
    if (cancelled) return cancelled;
    const clientInputs = this.withSignal(inputs, options?.signal);
    const result = await teamsappMgr.validateTeamsAppForClient(clientInputs);
    if (result.isErr()) return err(result.error);
    const issues: FxCoreValidationIssue[] = [
      ...result.value.errors.map((issue) => ({
        severity: "error" as const,
        message: issue.content || issue.title,
        path: issue.filePath || undefined,
        code: issue.code || issue.id,
        helpUrl: issue.helpUrl,
      })),
      ...result.value.warnings.map((issue) => ({
        severity: "warning" as const,
        message: issue.content || issue.title,
        path: issue.filePath || undefined,
        code: issue.code || issue.id,
        helpUrl: issue.helpUrl,
      })),
      ...result.value.notes.map((issue) => ({
        severity: "info" as const,
        message: issue.content || issue.title,
        code: issue.id,
      })),
    ];
    return ok({ valid: result.value.errors.length === 0, issues });
  }

  public async getLaunchInfo(
    inputs: FxCoreLaunchInfoInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCoreLaunchInfoResult, FxError>> {
    const cancelled = this.cancelled<FxCoreLaunchInfoResult>(options?.signal);
    if (cancelled) return cancelled;
    const tokenResult = await this.tools.tokenProvider.m365TokenProvider.getAccessToken({
      scopes: MosServiceScope(),
    });
    if (tokenResult.isErr()) return err(tokenResult.error);
    const service = new PackageService(
      getResourceServiceEndpoint(ResourceServiceType.MOS3),
      this.tools.logProvider
    );
    try {
      const launchInfo =
        inputs.titleId !== undefined
          ? await service.getLaunchInfoByTitleId(tokenResult.value, inputs.titleId, options?.signal)
          : await service.getLaunchInfoByManifestId(
              tokenResult.value,
              inputs.manifestId,
              options?.signal
            );
      if (options?.signal?.aborted) {
        return err(new UserCancelError("FxCoreClient"));
      }
      return ok(launchInfo as FxCoreLaunchInfoResult);
    } catch (error) {
      if (options?.signal?.aborted) {
        return err(new UserCancelError("FxCoreClient"));
      }
      return err(assembleError(error as Error, "FxCoreClient"));
    }
  }

  public async uninstall(
    inputs: UninstallInputs,
    options?: FxCoreExecutionOptions
  ): Promise<Result<FxCoreUninstallResult, FxError>> {
    const cancelled = this.cancelled<FxCoreUninstallResult>(options?.signal);
    if (cancelled) return cancelled;
    const clientInputs = this.withSignal(inputs, options?.signal);
    const result = await this.core.uninstall(clientInputs);
    if (result.isErr()) return err(result.error);
    const afterOperation = this.cancelled<FxCoreUninstallResult>(options?.signal);
    if (afterOperation) return afterOperation;
    return ok({ removed: [...(inputs.options ?? [])] });
  }

  private withSignal<T extends Record<string, unknown>>(inputs: T, signal?: AbortSignal): T {
    return { ...inputs, abortSignal: signal };
  }

  private async runAdd<TInputs extends Inputs, TResult>(
    inputs: TInputs,
    options: FxCoreExecutionOptions | undefined,
    operation: (clientInputs: TInputs) => Promise<Result<TResult, FxError>>
  ): Promise<Result<undefined, FxError>> {
    const cancelled = this.cancelled<undefined>(options?.signal);
    if (cancelled) return cancelled;
    const result = await operation(this.withSignal(inputs, options?.signal));
    if (result.isErr()) return err(result.error);
    return ok(undefined);
  }

  private cancelled<T>(signal?: AbortSignal): Result<T, FxError> | undefined {
    return signal?.aborted ? err(new UserCancelError("FxCoreClient")) : undefined;
  }
}
