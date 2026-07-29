const { randomUUID } = require("node:crypto");
const defaultFileSystem = require("node:fs/promises");
const path = require("node:path");

const { createDiagnostic } = require("./diagnostics.cjs");
const { renderPlanDiffs } = require("./render-plan-diff.cjs");

const manifestFileName = ".vscuse-generated-plans";
const lockFileName = ".vscuse-generated-plans.lock";

function compareOrdinal(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function serializePlan(plan) {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

function isSafePlanFileName(fileName) {
  const baseName =
    typeof fileName === "string" && fileName.endsWith(".json")
      ? fileName.slice(0, -".json".length)
      : "";
  return (
    typeof fileName === "string" &&
    /^[a-z0-9][a-z0-9-]*\.json$/.test(fileName) &&
    !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/.test(baseName) &&
    path.basename(fileName) === fileName &&
    !fileName.includes("\\")
  );
}

function operationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function outputDiagnostic(code, plansDirectory, message) {
  return createDiagnostic(code, plansDirectory, "$", message);
}

async function readOptionalFile(fileSystem, filePath) {
  try {
    return await fileSystem.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function parseManifest(text, plansDirectory) {
  if (text === undefined) {
    return { ok: true, value: [] };
  }

  try {
    const manifest = JSON.parse(text);
    if (
      manifest === null ||
      manifest.version !== 1 ||
      !Array.isArray(manifest.files) ||
      manifest.files.some((fileName) => !isSafePlanFileName(fileName)) ||
      new Set(manifest.files).size !== manifest.files.length
    ) {
      throw new Error("invalid manifest shape");
    }
    return { ok: true, value: [...manifest.files].sort() };
  } catch {
    return {
      ok: false,
      diagnostics: [
        outputDiagnostic(
          "VCB_OUTPUT_MANIFEST_INVALID",
          plansDirectory,
          "The generated-plan manifest is invalid.",
        ),
      ],
    };
  }
}

function createSiblingPath(targetPath, extension) {
  return path.join(
    path.dirname(targetPath),
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.${extension}`,
  );
}

async function removeFiles(fileSystem, filePaths) {
  const results = await Promise.allSettled(
    filePaths.map((filePath) => fileSystem.rm(filePath, { force: true })),
  );
  return results.filter(({ status }) => status === "rejected");
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function readOptionalStat(fileSystem, filePath) {
  try {
    return await fileSystem.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function readOptionalSnapshot(fileSystem, filePath) {
  const identity = await readOptionalStat(fileSystem, filePath);
  if (identity === undefined) {
    return { identity: undefined, text: undefined };
  }
  const text = await readOptionalFile(fileSystem, filePath);
  const finalIdentity = await readOptionalStat(fileSystem, filePath);
  if (
    finalIdentity === undefined ||
    !sameFileIdentity(identity, finalIdentity)
  ) {
    throw operationError(
      "VCB_OUTPUT_CONCURRENT_CHANGE",
      "Generated-plan output changed while reading its snapshot.",
    );
  }
  return { identity: finalIdentity, text };
}

function sameSnapshot(left, right) {
  if (left.text !== right.text) {
    return false;
  }
  if (left.identity === undefined || right.identity === undefined) {
    return left.identity === right.identity;
  }
  return sameFileIdentity(left.identity, right.identity);
}

async function applyOperations(fileSystem, operations) {
  const states = operations.map((operation) => ({
    ...operation,
    backupPath: createSiblingPath(operation.targetPath, "bak"),
    backedUp: false,
    installedIdentity: undefined,
    temporaryPath:
      operation.newText === undefined
        ? undefined
        : createSiblingPath(operation.targetPath, "tmp"),
  }));

  try {
    for (const state of states) {
      if (state.temporaryPath !== undefined) {
        await fileSystem.writeFile(state.temporaryPath, state.newText, {
          encoding: "utf8",
          flag: "wx",
        });
      }
    }
  } catch (error) {
    await removeFiles(
      fileSystem,
      states.flatMap(({ temporaryPath }) =>
        temporaryPath === undefined ? [] : [temporaryPath],
      ),
    );
    throw error;
  }

  const committed = [];
  try {
    for (const state of states) {
      committed.push(state);
      if (state.oldText !== undefined) {
        await fileSystem.rename(state.targetPath, state.backupPath);
        state.backedUp = true;
        const backupSnapshot = await readOptionalSnapshot(
          fileSystem,
          state.backupPath,
        );
        if (
          backupSnapshot.text !== state.oldText ||
          state.oldIdentity === undefined ||
          backupSnapshot.identity === undefined ||
          !sameFileIdentity(backupSnapshot.identity, state.oldIdentity)
        ) {
          throw operationError(
            "VCB_OUTPUT_CONCURRENT_CHANGE",
            "Generated-plan output changed during commit.",
          );
        }
      }
      if (state.temporaryPath !== undefined) {
        const temporaryStat = await fileSystem.stat(state.temporaryPath);
        await fileSystem.link(state.temporaryPath, state.targetPath);
        state.installedIdentity = temporaryStat;
        const targetStat = await fileSystem.stat(state.targetPath);
        if (!sameFileIdentity(temporaryStat, targetStat)) {
          throw operationError(
            "VCB_OUTPUT_CONCURRENT_CHANGE",
            "Generated-plan target changed after installation.",
          );
        }
      }
    }
    for (const state of states) {
      if (state.installedIdentity !== undefined) {
        const targetStat = await readOptionalStat(fileSystem, state.targetPath);
        if (
          targetStat === undefined ||
          !sameFileIdentity(state.installedIdentity, targetStat)
        ) {
          throw operationError(
            "VCB_OUTPUT_CONCURRENT_CHANGE",
            "Generated-plan target changed before commit completed.",
          );
        }
      }
    }
  } catch (error) {
    let rollbackFailed = false;
    const preservedBackups = new Set();
    for (const state of committed.reverse()) {
      if (state.installedIdentity !== undefined) {
        try {
          const targetStat = await readOptionalStat(
            fileSystem,
            state.targetPath,
          );
          if (
            targetStat !== undefined &&
            sameFileIdentity(state.installedIdentity, targetStat)
          ) {
            await fileSystem.rm(state.targetPath, { force: true });
          }
        } catch {
          rollbackFailed = true;
        }
      }
      if (state.backedUp) {
        try {
          const targetStat = await readOptionalStat(
            fileSystem,
            state.targetPath,
          );
          if (targetStat === undefined) {
            await fileSystem.rename(state.backupPath, state.targetPath);
          } else {
            preservedBackups.add(state.backupPath);
          }
        } catch {
          rollbackFailed = true;
          preservedBackups.add(state.backupPath);
        }
      }
    }
    await removeFiles(
      fileSystem,
      states.flatMap(({ backupPath, temporaryPath }) =>
        [backupPath, temporaryPath].filter(
          (filePath) =>
            filePath !== undefined && !preservedBackups.has(filePath),
        ),
      ),
    );
    if (rollbackFailed) {
      throw operationError(
        "VCB_OUTPUT_ROLLBACK",
        "Generated-plan rollback failed.",
      );
    }
    throw error;
  }

  const cleanupFailures = await removeFiles(
    fileSystem,
    states.flatMap(({ backupPath, temporaryPath }) =>
      temporaryPath === undefined ? [backupPath] : [backupPath, temporaryPath],
    ),
  );
  if (cleanupFailures.length > 0) {
    throw operationError(
      "VCB_OUTPUT_CLEANUP",
      "Generated plans were committed but temporary files could not be removed.",
    );
  }
}

async function writeGeneratedPlans({
  fileSystem = defaultFileSystem,
  onDiff = () => {},
  planDescriptors,
  plansDirectory,
}) {
  try {
    const candidates = new Map();
    for (const descriptor of planDescriptors) {
      if (!isSafePlanFileName(descriptor.fileName)) {
        return {
          ok: false,
          diagnostics: [
            outputDiagnostic(
              "VCB_OUTPUT_PATH_INVALID",
              plansDirectory,
              "A generated plan filename is invalid.",
            ),
          ],
        };
      }
      if (candidates.has(descriptor.fileName)) {
        return {
          ok: false,
          diagnostics: [
            outputDiagnostic(
              "VCB_OUTPUT_PATH_COLLISION",
              plansDirectory,
              "Generated plan filenames collide.",
            ),
          ],
        };
      }
      candidates.set(descriptor.fileName, {
        descriptor,
        text: serializePlan(descriptor.plan),
      });
    }

    const manifestPath = path.join(plansDirectory, manifestFileName);
    const oldManifestSnapshot = await readOptionalSnapshot(
      fileSystem,
      manifestPath,
    );
    const oldManifestText = oldManifestSnapshot.text;
    const manifestResult = parseManifest(oldManifestText, plansDirectory);
    if (!manifestResult.ok) {
      return manifestResult;
    }

    const ownedFiles = new Set(manifestResult.value);
    const changes = [];
    const targetSnapshots = new Map();
    for (const [fileName, candidate] of [...candidates].sort(
      ([left], [right]) => compareOrdinal(left, right),
    )) {
      const targetPath = path.join(plansDirectory, fileName);
      const oldSnapshot = await readOptionalSnapshot(fileSystem, targetPath);
      const oldText = oldSnapshot.text;
      targetSnapshots.set(fileName, oldSnapshot);
      if (oldText !== undefined && !ownedFiles.has(fileName)) {
        return {
          ok: false,
          diagnostics: [
            outputDiagnostic(
              "VCB_OUTPUT_MANUAL_COLLISION",
              plansDirectory,
              "A generated plan conflicts with a manually authored plan.",
            ),
          ],
        };
      }
      if (oldText !== candidate.text) {
        changes.push({
          fileName,
          newText: candidate.text,
          oldIdentity: oldSnapshot.identity,
          oldText,
        });
      }
    }

    for (const fileName of [...ownedFiles].sort()) {
      if (!candidates.has(fileName)) {
        const oldSnapshot = await readOptionalSnapshot(
          fileSystem,
          path.join(plansDirectory, fileName),
        );
        const oldText = oldSnapshot.text;
        targetSnapshots.set(fileName, oldSnapshot);
        if (oldText !== undefined) {
          changes.push({
            fileName,
            newText: undefined,
            oldIdentity: oldSnapshot.identity,
            oldText,
          });
        }
      }
    }
    changes.sort((left, right) =>
      compareOrdinal(left.fileName, right.fileName),
    );

    const diff = renderPlanDiffs(changes);
    await onDiff(diff);

    const files = [...candidates.keys()].sort();
    const manifestText = `${JSON.stringify({ version: 1, files }, null, 2)}\n`;
    const operations = changes.map((change) => ({
      newText: change.newText,
      oldIdentity: change.oldIdentity,
      oldText: change.oldText,
      targetPath: path.join(plansDirectory, change.fileName),
    }));
    if (
      manifestText !== oldManifestText &&
      !(oldManifestText === undefined && files.length === 0)
    ) {
      operations.push({
        newText: manifestText,
        oldIdentity: oldManifestSnapshot.identity,
        oldText: oldManifestText,
        targetPath: manifestPath,
      });
    }
    if (operations.length > 0) {
      const lockPath = path.join(plansDirectory, lockFileName);
      await fileSystem.writeFile(lockPath, "", {
        encoding: "utf8",
        flag: "wx",
      });
      let transactionError;
      try {
        const currentManifestSnapshot = await readOptionalSnapshot(
          fileSystem,
          manifestPath,
        );
        let snapshotsMatch = sameSnapshot(
          currentManifestSnapshot,
          oldManifestSnapshot,
        );
        for (const [fileName, oldSnapshot] of targetSnapshots) {
          const currentSnapshot = await readOptionalSnapshot(
            fileSystem,
            path.join(plansDirectory, fileName),
          );
          snapshotsMatch &&= sameSnapshot(currentSnapshot, oldSnapshot);
        }
        if (!snapshotsMatch) {
          throw operationError(
            "VCB_OUTPUT_CONCURRENT_CHANGE",
            "Generated-plan output changed during setup.",
          );
        }
        await applyOperations(fileSystem, operations);
      } catch (error) {
        transactionError = error;
        throw error;
      } finally {
        try {
          await fileSystem.rm(lockPath, { force: true });
        } catch (error) {
          if (transactionError === undefined) {
            throw operationError(
              "VCB_OUTPUT_CLEANUP",
              "Generated plans were committed but the setup lock could not be removed.",
            );
          }
        }
      }
    }

    return {
      ok: true,
      value: { diff, files, planDescriptors },
    };
  } catch (error) {
    return {
      ok: false,
      diagnostics: [
        outputDiagnostic(
          error.code === "VCB_OUTPUT_ROLLBACK"
            ? "VCB_OUTPUT_ROLLBACK"
            : error.code === "VCB_OUTPUT_CLEANUP"
              ? "VCB_OUTPUT_CLEANUP"
              : error.code === "VCB_OUTPUT_CONCURRENT_CHANGE" ||
                  error.code === "EEXIST"
                ? "VCB_OUTPUT_CONCURRENT_CHANGE"
                : "VCB_OUTPUT_IO",
          plansDirectory,
          error.code === "VCB_OUTPUT_ROLLBACK"
            ? "Generated-plan rollback failed; prior content was preserved in a sibling backup."
            : error.code === "VCB_OUTPUT_CLEANUP"
              ? "Generated plans were committed, but temporary files could not be removed."
              : error.code === "VCB_OUTPUT_CONCURRENT_CHANGE" ||
                  error.code === "EEXIST"
                ? "Generated-plan output changed during setup."
                : "Generated plans could not be updated.",
        ),
      ],
    };
  }
}

module.exports = { writeGeneratedPlans };
