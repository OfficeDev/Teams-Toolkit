import { FxError, LogProvider, Result, ok, err, returnSystemError } from "@microsoft/teamsfx-api";
import { PluginDisplayName } from "../../../../common/constants";
import { SolutionError } from "../constants";

export type Thunk<R> = () => Promise<Result<R, FxError>>;

export type NamedThunk<R> = { pluginName: string; taskName: string; thunk: Thunk<R> };

export async function executeConcurrently<R>(
  namedThunks: NamedThunk<R>[],
  logger: LogProvider
): Promise<Result<{ name: string; result: R }[], FxError>> {
  const results = await Promise.all(
    namedThunks.map(async (namedThunk) => {
      logger.info(`Running ${namedThunk.pluginName} concurrently`);
      return namedThunk.thunk();
    })
  );

  if (logger) {
    logger.info(`${`[${PluginDisplayName.Solution}] Execute Task summary`.padEnd(64, "-")}`);
  }

  let failed = false;
  const ret = [];
  const errors = [];
  for (let i = 0; i < results.length; ++i) {
    const name = `${namedThunks[i].pluginName}-${namedThunks[i].taskName}`;
    const result = results[i];
    logger.info(`${name.padEnd(60, ".")} ${result.isOk() ? "[ok]" : "[failed]"}`);
    if (result.isErr()) {
      failed = true;
      errors.push(result.error);
    } else {
      ret.push({ name, result: result.value });
    }
  }
  if (logger)
    logger?.info(
      `${`[${PluginDisplayName.Solution}] Task overall result`.padEnd(60, ".")}${
        failed ? "[failed]" : "[ok]"
      }`
    );

  if (failed) {
    return err(
      returnSystemError(
        new Error(
          `Failed to run tasks concurrently due to ${JSON.stringify(
            errors.map((e) => `${e.name}:${e.message}`)
          )}`
        ),
        "Solution",
        SolutionError.InternelError
      )
    );
  }
  return ok(ret);
}
