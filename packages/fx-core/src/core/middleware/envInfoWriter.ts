// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import { NextFunction, Middleware } from "@feathersjs/hooks";
import { Inputs, StaticPlatforms } from "@microsoft/teamsfx-api";
import { CoreHookContext, FxCore } from "..";
import { PluginNames } from "../../plugins/solution/fx-solution/constants";
import { environmentManager } from "../environment";

/**
 * This middleware will help to persist environment profile if necessary.
 */
export function EnvInfoWriterMW(skip = false): Middleware {
  return async (ctx: CoreHookContext, next: NextFunction) => {
    try {
      await next();
    } finally {
      if (skip) {
        return;
      }

      const lastArg = ctx.arguments[ctx.arguments.length - 1];
      const inputs: Inputs = lastArg === ctx ? ctx.arguments[ctx.arguments.length - 2] : lastArg;
      if (
        !inputs.projectPath ||
        inputs.ignoreConfigPersist === true ||
        inputs.ignoreEnvInfo === true ||
        StaticPlatforms.includes(inputs.platform)
      )
        return;

      const solutionContext = ctx.solutionContext;
      if (solutionContext === undefined) return;

      // DO NOT persist local debug plugin config.
      if (solutionContext.envInfo.profile.has(PluginNames.LDEBUG)) {
        solutionContext.envInfo.profile.delete(PluginNames.LDEBUG);
      }

      const envProfilePath = await environmentManager.writeEnvProfile(
        solutionContext.envInfo.profile,
        inputs.projectPath,
        solutionContext.envInfo?.envName,
        solutionContext.cryptoProvider
      );

      if (envProfilePath.isOk()) {
        const core = ctx.self as FxCore;
        core.tools.logProvider.debug(`[core] persist env profile: ${envProfilePath.value}`);
      }
    }
  };
}
