// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert } from "chai";
import { ChildProcess, SpawnOptions } from "child_process";
import path from "path";
import { pathToFileURL } from "url";
import {
  launchScenarioArtifacts,
  resolveScenarioArtifactLaunchCommand,
  ScenarioReviewDependencies,
} from "../../scripts/scenario-tooling/scenarioReview";

async function capturedError(operation: () => Promise<void>): Promise<Error | undefined> {
  try {
    await operation();
    return undefined;
  } catch (error) {
    return error instanceof Error ? error : new Error("Unknown test error");
  }
}

describe("scenario artifact review launcher", () => {
  it("MSA-17: maps each platform to a shell-free opener with an encoded file URL", async () => {
    const artifactPath = path.resolve("review folder", "scenario & # %.html");
    const expectedUrl = pathToFileURL(artifactPath).href;

    for (const [platform, expectedCommand, expectedArguments] of [
      ["win32", "rundll32.exe", ["url.dll,FileProtocolHandler", expectedUrl]],
      ["darwin", "open", [expectedUrl]],
      ["linux", "xdg-open", [expectedUrl]],
    ] as const) {
      const resolved = resolveScenarioArtifactLaunchCommand(artifactPath, platform);
      assert.equal(resolved.command, expectedCommand);
      assert.deepEqual(resolved.arguments, expectedArguments);
    }

    let observedArguments: string[] = [];
    let observedOptions: SpawnOptions | undefined;
    const dependencies: ScenarioReviewDependencies = {
      platform: "linux",
      spawn: (_command, arguments_, options) => {
        observedArguments = arguments_;
        observedOptions = options;
        const child = new ChildProcess();
        queueMicrotask(() => child.emit("close", 0, null));
        return child;
      },
    };

    await launchScenarioArtifacts([artifactPath], dependencies);

    assert.deepEqual(observedArguments, [expectedUrl]);
    assert.equal(observedOptions?.shell, false);
  });

  it("MSA-17: rejects opener process errors, nonzero exits, and signals", async () => {
    const failures: Array<{
      emit(child: ChildProcess): void;
      expected: string;
    }> = [
      {
        emit: (child) => child.emit("error", new Error("opener missing")),
        expected: "opener missing",
      },
      {
        emit: (child) => child.emit("close", 7, null),
        expected: "exit code 7",
      },
      {
        emit: (child) => child.emit("close", null, "SIGTERM"),
        expected: "signal SIGTERM",
      },
    ];

    for (const failure of failures) {
      const dependencies: ScenarioReviewDependencies = {
        platform: "linux",
        spawn: () => {
          const child = new ChildProcess();
          queueMicrotask(() => failure.emit(child));
          return child;
        },
      };
      const error = await capturedError(() =>
        launchScenarioArtifacts([path.resolve("scenario.html")], dependencies)
      );

      assert.instanceOf(error, Error);
      assert.include(error?.message, failure.expected);
    }
  });
});
