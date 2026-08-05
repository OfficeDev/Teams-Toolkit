// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { HookContext, Middleware, NextFunction } from "@feathersjs/hooks";
import { Context, Tools } from "@microsoft/teamsfx-api";

export let TOOLS: Tools;
export let Locale: string | undefined;
export function setTools(tools: Tools): void {
  TOOLS = tools;
}
export function setLocale(locale?: string): void {
  Locale = locale;
}

class GlobalVars {
  isVS?: boolean = false;
  teamsAppId = "";
  m365TenantId = "";
  trackingId?: string;
  ymlFilePath?: string;
  envFilePath?: string;

  //properties for error telemetry
  stage = "";
  source: ExternalSource = "";
  component = "";
  method = "";
}
export const globalVars = new GlobalVars();

export interface ErrorContextOption {
  component?: string;
  source?: ExternalSource;
  stage?: string;
  method?: string;
  reset?: boolean;
}

export function ErrorContextMW(option: ErrorContextOption): Middleware {
  return async (ctx: HookContext, next: NextFunction) => {
    option.method = ctx.method;
    setErrorContext(option);
    await next();
    if (option.reset) {
      resetErrorContext();
    }
  };
}

export function resetErrorContext(): void {
  globalVars.stage = "";
  globalVars.source = "";
  globalVars.component = "";
  globalVars.method = "";
}

export function setErrorContext(option: ErrorContextOption): void {
  if (option.reset) {
    resetErrorContext();
  }
  globalVars.component = option.component || globalVars.component;
  globalVars.source = option.source || globalVars.source;
  globalVars.stage = option.stage || globalVars.stage;
  globalVars.method = option.method || globalVars.method;
}

export type ExternalSource =
  "Graph" | "Azure" | "Teams" | "TeamsGraph" | "BotFx" | "SPFx" | "DevTools" | "M365" | "";

export function createContext(): Context {
  const context: Context = {
    userInteraction: TOOLS.ui,
    logProvider: TOOLS.logProvider,
    telemetryReporter: TOOLS.telemetryReporter,
    tokenProvider: TOOLS.tokenProvider,
  };
  return context;
}

export const AadSet: Set<string> = new Set<string>();
