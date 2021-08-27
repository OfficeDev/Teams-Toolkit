import {
  v2,
  Inputs,
  FxError,
  Result,
  err,
  Void,
	returnSystemError,
} from "@microsoft/teamsfx-api";
import { SolutionError } from "../constants";
import Container from "typedi";
import { ResourcePluginsV2 } from "../ResourcePluginContainer";

export async function createPackage(ctx: v2.Context, inputs: Inputs): Promise<Result<Void, FxError>> {
	const appStudioPlugin = Container.get<v2.ResourcePlugin>(ResourcePluginsV2.AppStudioPlugin);
	if (!appStudioPlugin?.package) {
		return err(returnSystemError(new Error("package() not implemented"), "Solution", SolutionError.InternelError));
	}
	return appStudioPlugin.package(ctx, inputs);
}