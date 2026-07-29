const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { setupGeneratedPlans } = require("./index.cjs");
const { writeGeneratedPlans } = require("./write-generated-plans.cjs");

const sourceText = `
version: 1
cases:
  - id: remote
    scenarioId: SCN-REMOTE
    steps: [scaffold]
steps:
  scaffold:
    type: scaffold
    with:
      template: weather-agent
      answers: []
`;

const twoCaseSourceText = sourceText.replace(
  "    steps: [scaffold]\nsteps:",
  `    steps: [scaffold]
  - id: local
    scenarioId: SCN-LOCAL
    steps: [scaffold]
steps:`,
);

function compileStep({ caseId }) {
  return {
    ok: true,
    value: [
      {
        step_id: `step_${caseId}`,
        agent: "assertion",
        tool: "",
        parameters: {},
        description: "Compiled plan step",
        depends_on: [],
        tags: [],
      },
    ],
  };
}

function ignoreDiff() {}

test("VCB-33: setup reports additions before writing manifest-owned plans", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const manualPlanPath = path.join(plansDirectory, "manual.json");
  await fs.writeFile(manualPlanPath, '{"manual":true}\n', "utf8");

  const diffs = [];
  const result = await setupGeneratedPlans({
    compileStep,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
    onDiff(diff) {
      diffs.push(diff);
      return fs
        .access(path.join(plansDirectory, "weather-agent--remote.json"))
        .then(
          () => assert.fail("generated plan was written before its diff"),
          (error) => assert.equal(error.code, "ENOENT"),
        );
    },
  });

  assert.equal(result.ok, true);
  assert.equal(diffs.length, 1);
  assert.match(diffs[0], /--- \/dev\/null/);
  assert.match(diffs[0], /\+\+\+ b\/weather-agent--remote\.json/);
  assert.match(diffs[0], /\+  "plan_metadata": \{/);

  const generatedText = await fs.readFile(
    path.join(plansDirectory, "weather-agent--remote.json"),
    "utf8",
  );
  assert.equal(
    generatedText,
    `${JSON.stringify(result.value.planDescriptors[0].plan, null, 2)}\n`,
  );
  assert.equal(await fs.readFile(manualPlanPath, "utf8"), '{"manual":true}\n');
  assert.deepEqual(
    JSON.parse(
      await fs.readFile(
        path.join(plansDirectory, ".vscuse-generated-plans"),
        "utf8",
      ),
    ),
    { version: 1, files: ["weather-agent--remote.json"] },
  );
});

test("VCB-33: setup prints its diff by default and reports an unchanged rerun", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const output = [];
  const outputStream = {
    write(text) {
      output.push(text);
    },
  };

  const initial = await setupGeneratedPlans({
    compileStep,
    output: outputStream,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });
  const unchanged = await setupGeneratedPlans({
    compileStep,
    output: outputStream,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });

  assert.equal(initial.ok, true);
  assert.equal(unchanged.ok, true);
  assert.match(output[0], /\+\+\+ b\/weather-agent--remote\.json/);
  assert.equal(output[1], "No generated plan changes.\n");
  assert.equal(unchanged.value.diff, "");
});

test("VCB-33: an empty first setup performs no writes", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const mutations = { link: 0, rm: 0, writeFile: 0 };
  const trackingFileSystem = {
    link(...args) {
      mutations.link += 1;
      return fs.link(...args);
    },
    readFile: fs.readFile.bind(fs),
    rename: fs.rename.bind(fs),
    rm(...args) {
      mutations.rm += 1;
      return fs.rm(...args);
    },
    stat: fs.stat.bind(fs),
    writeFile(...args) {
      mutations.writeFile += 1;
      return fs.writeFile(...args);
    },
  };

  const result = await setupGeneratedPlans({
    fileSystem: trackingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [],
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.diff, "");
  assert.deepEqual(mutations, { link: 0, rm: 0, writeFile: 0 });
  assert.deepEqual(await fs.readdir(plansDirectory), []);
});

test("VCB-33: setup discovers YAML sources in deterministic filename order", async (context) => {
  const rootDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(rootDirectory, { force: true, recursive: true }));
  const casesDirectory = path.join(rootDirectory, "cases");
  const plansDirectory = path.join(rootDirectory, "plans");
  await fs.mkdir(casesDirectory);
  await fs.mkdir(plansDirectory);
  await fs.writeFile(
    path.join(casesDirectory, "z-remote.yml"),
    sourceText,
    "utf8",
  );
  await fs.writeFile(
    path.join(casesDirectory, "a-local.yaml"),
    sourceText.replace("id: remote", "id: local"),
    "utf8",
  );
  await fs.writeFile(
    path.join(casesDirectory, "README.md"),
    "not a case bundle",
    "utf8",
  );

  const result = await setupGeneratedPlans({
    casesDirectory,
    compileStep,
    output: { write() {} },
    plansDirectory,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.value.planDescriptors.map(({ caseId }) => caseId),
    ["local", "remote"],
  );
  assert.deepEqual(result.value.files, [
    "weather-agent--local.json",
    "weather-agent--remote.json",
  ]);
});

test("VCB-33: source discovery ignores nested YAML files", async (context) => {
  const rootDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(rootDirectory, { force: true, recursive: true }));
  const casesDirectory = path.join(rootDirectory, "cases");
  const plansDirectory = path.join(rootDirectory, "plans");
  await fs.mkdir(path.join(casesDirectory, "nested"), { recursive: true });
  await fs.mkdir(plansDirectory);
  await fs.writeFile(path.join(casesDirectory, "top.yml"), sourceText, "utf8");
  await fs.writeFile(
    path.join(casesDirectory, "nested", "ignored.yml"),
    "not: a valid case bundle",
    "utf8",
  );

  const result = await setupGeneratedPlans({
    casesDirectory,
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.files, ["weather-agent--remote.json"]);
});

test("VCB-33: generated output ordering does not depend on host locale", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const originalLocaleCompare = String.prototype.localeCompare;
  String.prototype.localeCompare = () => {
    throw new Error("locale-dependent comparison is not allowed");
  };

  try {
    const result = await setupGeneratedPlans({
      compileStep,
      onDiff: ignoreDiff,
      plansDirectory,
      sources: [
        { sourcePath: "cases/weather.yml", sourceText: twoCaseSourceText },
      ],
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.value.files, [
      "weather-agent--local.json",
      "weather-agent--remote.json",
    ]);
  } finally {
    String.prototype.localeCompare = originalLocaleCompare;
  }
});

test("VCB-33: source discovery failure leaves plans untouched", async (context) => {
  const rootDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(rootDirectory, { force: true, recursive: true }));
  const plansDirectory = path.join(rootDirectory, "plans");
  await fs.mkdir(plansDirectory);
  let compileCalls = 0;
  let outputCalls = 0;

  const result = await setupGeneratedPlans({
    casesDirectory: path.join(rootDirectory, "missing-cases"),
    compileStep() {
      compileCalls += 1;
      return { ok: true, value: [] };
    },
    output: {
      write() {
        outputCalls += 1;
      },
    },
    plansDirectory,
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_SOURCE_IO");
  assert.equal(compileCalls, 0);
  assert.equal(outputCalls, 0);
  assert.deepEqual(await fs.readdir(plansDirectory), []);
});

test("VCB-33: setup reports changes and removals, then performs a no-op rerun", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));

  const initial = await setupGeneratedPlans({
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [
      { sourcePath: "cases/weather.yml", sourceText: twoCaseSourceText },
    ],
  });
  assert.equal(initial.ok, true);

  const changedDiffs = [];
  const changedCompileStep = (input) => {
    const result = compileStep(input);
    result.value[0].description = "Changed compiled step";
    return result;
  };
  const changed = await setupGeneratedPlans({
    compileStep: changedCompileStep,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
    onDiff: (diff) => changedDiffs.push(diff),
  });

  assert.equal(changed.ok, true);
  assert.match(changedDiffs[0], /--- a\/weather-agent--local\.json/);
  assert.match(changedDiffs[0], /\+\+\+ \/dev\/null/);
  assert.match(changedDiffs[0], /--- a\/weather-agent--remote\.json/);
  assert.match(changedDiffs[0], /\+\+\+ b\/weather-agent--remote\.json/);
  assert.match(
    changedDiffs[0],
    /\+      "description": "Changed compiled step"/,
  );
  await assert.rejects(
    fs.access(path.join(plansDirectory, "weather-agent--local.json")),
    (error) => error.code === "ENOENT",
  );

  const mutations = { rename: 0, rm: 0, writeFile: 0 };
  const trackingFileSystem = {
    link: fs.link.bind(fs),
    readFile: fs.readFile.bind(fs),
    stat: fs.stat.bind(fs),
    rename(...args) {
      mutations.rename += 1;
      return fs.rename(...args);
    },
    rm(...args) {
      mutations.rm += 1;
      return fs.rm(...args);
    },
    writeFile(...args) {
      mutations.writeFile += 1;
      return fs.writeFile(...args);
    },
  };
  const noOpDiffs = [];
  const noOp = await setupGeneratedPlans({
    compileStep: changedCompileStep,
    fileSystem: trackingFileSystem,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
    onDiff: (diff) => noOpDiffs.push(diff),
  });

  assert.equal(noOp.ok, true);
  assert.deepEqual(noOpDiffs, [""]);
  assert.deepEqual(mutations, { rename: 0, rm: 0, writeFile: 0 });
});

test("VCB-33: compilation failure leaves generated output unchanged", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const initial = await setupGeneratedPlans({
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });
  assert.equal(initial.ok, true);

  const snapshot = new Map();
  for (const fileName of await fs.readdir(plansDirectory)) {
    snapshot.set(
      fileName,
      await fs.readFile(path.join(plansDirectory, fileName), "utf8"),
    );
  }
  let diffCalls = 0;
  const result = await setupGeneratedPlans({
    compileStep,
    plansDirectory,
    sources: [
      { sourcePath: "cases/weather.yml", sourceText: twoCaseSourceText },
      {
        sourcePath: "cases/invalid.yml",
        sourceText: sourceText.replace("version: 1", "version: 2"),
      },
    ],
    onDiff: () => {
      diffCalls += 1;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(diffCalls, 0);
  assert.deepEqual((await fs.readdir(plansDirectory)).sort(), [
    ".vscuse-generated-plans",
    "weather-agent--remote.json",
  ]);
  for (const [fileName, text] of snapshot) {
    assert.equal(
      await fs.readFile(path.join(plansDirectory, fileName), "utf8"),
      text,
    );
  }
});

test("VCB-33: a manual plan collision fails before diff or disk mutation", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const manualPlanPath = path.join(
    plansDirectory,
    "weather-agent--remote.json",
  );
  await fs.writeFile(manualPlanPath, '{"owner":"manual"}\n', "utf8");
  let diffCalls = 0;

  const result = await setupGeneratedPlans({
    compileStep,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
    onDiff: () => {
      diffCalls += 1;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_MANUAL_COLLISION");
  assert.equal(diffCalls, 0);
  assert.equal(
    await fs.readFile(manualPlanPath, "utf8"),
    '{"owner":"manual"}\n',
  );
  await assert.rejects(
    fs.access(path.join(plansDirectory, ".vscuse-generated-plans")),
    (error) => error.code === "ENOENT",
  );
});

test("VCB-33: malformed ownership manifests fail without disk mutation", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const manifestPath = path.join(plansDirectory, ".vscuse-generated-plans");
  const malformedManifest = '{"version":1,"files":["../manual.json"]}\n';
  await fs.writeFile(manifestPath, malformedManifest, "utf8");

  const result = await setupGeneratedPlans({
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_MANIFEST_INVALID");
  assert.equal(await fs.readFile(manifestPath, "utf8"), malformedManifest);
});

test("VCB-33: unsafe descriptor filenames fail before disk mutation", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));

  for (const fileName of [
    "../outside.json",
    path.resolve("outside.json"),
    "owner.json:stream.json",
    "con.json",
    "prn.json",
    "aux.json",
    "nul.json",
    "com1.json",
    "lpt1.json",
  ]) {
    const result = await writeGeneratedPlans({
      onDiff: ignoreDiff,
      planDescriptors: [{ fileName, plan: {} }],
      plansDirectory,
    });

    assert.equal(result.ok, false, fileName);
    assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_PATH_INVALID");
    assert.deepEqual(await fs.readdir(plansDirectory), []);
  }
});

test("VCB-33: concurrent plan changes after diff are preserved", async (context) => {
  for (const concurrentTarget of ["existing", "absent"]) {
    const plansDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), "vscuse-generated-plans-"),
    );
    context.after(() =>
      fs.rm(plansDirectory, { force: true, recursive: true }),
    );
    const initial = await setupGeneratedPlans({
      compileStep,
      onDiff: ignoreDiff,
      plansDirectory,
      sources: [{ sourcePath: "cases/weather.yml", sourceText }],
    });
    assert.equal(initial.ok, true);
    const remotePath = path.join(plansDirectory, "weather-agent--remote.json");
    const localPath = path.join(plansDirectory, "weather-agent--local.json");
    const priorRemoteText = await fs.readFile(remotePath, "utf8");
    const concurrentText = `{"owner":"concurrent-${concurrentTarget}"}\n`;

    const result = await setupGeneratedPlans({
      compileStep: (input) => {
        const compiled = compileStep(input);
        compiled.value[0].description = "Changed compiled step";
        return compiled;
      },
      onDiff: async () => {
        await fs.writeFile(
          concurrentTarget === "existing" ? remotePath : localPath,
          concurrentText,
          "utf8",
        );
      },
      plansDirectory,
      sources: [
        {
          sourcePath: "cases/weather.yml",
          sourceText:
            concurrentTarget === "existing" ? sourceText : twoCaseSourceText,
        },
      ],
    });

    assert.equal(result.ok, false, concurrentTarget);
    assert.equal(
      result.diagnostics[0].code,
      "VCB_OUTPUT_CONCURRENT_CHANGE",
      concurrentTarget,
    );
    assert.equal(
      await fs.readFile(
        concurrentTarget === "existing" ? remotePath : localPath,
        "utf8",
      ),
      concurrentText,
      concurrentTarget,
    );
    if (concurrentTarget === "absent") {
      assert.equal(await fs.readFile(remotePath, "utf8"), priorRemoteText);
    }
  }
});

test("VCB-33: same-content replacements after diff are preserved", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const initial = await setupGeneratedPlans({
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });
  assert.equal(initial.ok, true);
  const targetPath = path.join(plansDirectory, "weather-agent--remote.json");
  const unchangedText = await fs.readFile(targetPath, "utf8");
  let replacementIdentity;

  const result = await setupGeneratedPlans({
    compileStep: (input) => {
      const compiled = compileStep(input);
      compiled.value[0].description = "Changed compiled step";
      return compiled;
    },
    onDiff: async () => {
      await fs.rm(targetPath);
      await fs.writeFile(targetPath, unchangedText, "utf8");
      replacementIdentity = await fs.stat(targetPath);
    },
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_CONCURRENT_CHANGE");
  const finalIdentity = await fs.stat(targetPath);
  assert.equal(finalIdentity.dev, replacementIdentity.dev);
  assert.equal(finalIdentity.ino, replacementIdentity.ino);
  assert.equal(await fs.readFile(targetPath, "utf8"), unchangedText);
});

test("VCB-33: concurrent changes during commit are preserved", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const initial = await setupGeneratedPlans({
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });
  assert.equal(initial.ok, true);
  const targetPath = path.join(plansDirectory, "weather-agent--remote.json");
  const concurrentText = '{"owner":"during-commit"}\n';
  const racingFileSystem = {
    link: fs.link.bind(fs),
    readFile: fs.readFile.bind(fs),
    rm: fs.rm.bind(fs),
    stat: fs.stat.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    async rename(sourcePath, destinationPath) {
      if (sourcePath === targetPath) {
        await fs.writeFile(sourcePath, concurrentText, "utf8");
      }
      return fs.rename(sourcePath, destinationPath);
    },
  };

  const result = await setupGeneratedPlans({
    compileStep: (input) => {
      const compiled = compileStep(input);
      compiled.value[0].description = "Changed compiled step";
      return compiled;
    },
    fileSystem: racingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_CONCURRENT_CHANGE");
  assert.equal(await fs.readFile(targetPath, "utf8"), concurrentText);
});

test("VCB-33: targets replaced after linking are not claimed", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const targetPath = path.join(plansDirectory, "weather-agent--remote.json");
  const concurrentText = '{"owner":"after-link"}\n';
  const racingFileSystem = {
    readFile: fs.readFile.bind(fs),
    rename: fs.rename.bind(fs),
    rm: fs.rm.bind(fs),
    stat: fs.stat.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    async link(sourcePath, destinationPath) {
      await fs.link(sourcePath, destinationPath);
      if (destinationPath === targetPath) {
        await fs.rm(destinationPath);
        await fs.writeFile(destinationPath, concurrentText, "utf8");
      }
    },
  };

  const result = await setupGeneratedPlans({
    compileStep,
    fileSystem: racingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_CONCURRENT_CHANGE");
  assert.equal(await fs.readFile(targetPath, "utf8"), concurrentText);
  await assert.rejects(
    fs.access(path.join(plansDirectory, ".vscuse-generated-plans")),
    (error) => error.code === "ENOENT",
  );
});

test("VCB-33: targets replaced during ownership commit are preserved", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const targetPath = path.join(plansDirectory, "weather-agent--remote.json");
  const concurrentText = '{"owner":"ownership-commit"}\n';
  const racingFileSystem = {
    readFile: fs.readFile.bind(fs),
    rename: fs.rename.bind(fs),
    rm: fs.rm.bind(fs),
    stat: fs.stat.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    async link(sourcePath, destinationPath) {
      await fs.link(sourcePath, destinationPath);
      if (path.basename(destinationPath) === ".vscuse-generated-plans") {
        await fs.rm(targetPath);
        await fs.writeFile(targetPath, concurrentText, "utf8");
      }
    },
  };

  const result = await setupGeneratedPlans({
    compileStep,
    fileSystem: racingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_CONCURRENT_CHANGE");
  assert.equal(await fs.readFile(targetPath, "utf8"), concurrentText);
  await assert.rejects(
    fs.access(path.join(plansDirectory, ".vscuse-generated-plans")),
    (error) => error.code === "ENOENT",
  );
});

test("VCB-33: staging failure leaves every generated target unchanged", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const initial = await setupGeneratedPlans({
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });
  assert.equal(initial.ok, true);

  const snapshot = new Map();
  for (const fileName of await fs.readdir(plansDirectory)) {
    snapshot.set(
      fileName,
      await fs.readFile(path.join(plansDirectory, fileName), "utf8"),
    );
  }
  let writeCalls = 0;
  const failingFileSystem = {
    link: fs.link.bind(fs),
    readFile: fs.readFile.bind(fs),
    rename: fs.rename.bind(fs),
    rm: fs.rm.bind(fs),
    stat: fs.stat.bind(fs),
    writeFile(...args) {
      writeCalls += 1;
      if (writeCalls === 2) {
        return Promise.reject(
          Object.assign(new Error("injected"), { code: "EIO" }),
        );
      }
      return fs.writeFile(...args);
    },
  };

  const result = await setupGeneratedPlans({
    compileStep,
    fileSystem: failingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [
      { sourcePath: "cases/weather.yml", sourceText: twoCaseSourceText },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_IO");
  assert.deepEqual(
    (await fs.readdir(plansDirectory)).sort(),
    [...snapshot.keys()].sort(),
  );
  for (const [fileName, text] of snapshot) {
    assert.equal(
      await fs.readFile(path.join(plansDirectory, fileName), "utf8"),
      text,
    );
  }
});

test("VCB-33: post-link stat failure removes the unowned target", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const targetPath = path.join(plansDirectory, "weather-agent--remote.json");
  let targetLinked = false;
  let failedTargetStat = false;
  const failingFileSystem = {
    async link(sourcePath, destinationPath) {
      await fs.link(sourcePath, destinationPath);
      if (destinationPath === targetPath) {
        targetLinked = true;
      }
    },
    readFile: fs.readFile.bind(fs),
    rename: fs.rename.bind(fs),
    rm: fs.rm.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    stat(filePath) {
      if (filePath === targetPath && targetLinked && !failedTargetStat) {
        failedTargetStat = true;
        return Promise.reject(
          Object.assign(new Error("injected stat"), { code: "EIO" }),
        );
      }
      return fs.stat(filePath);
    },
  };

  const result = await setupGeneratedPlans({
    compileStep,
    fileSystem: failingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_IO");
  assert.deepEqual(await fs.readdir(plansDirectory), []);
});

test("VCB-33: post-link stat failure restores an existing target", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const initial = await setupGeneratedPlans({
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });
  assert.equal(initial.ok, true);
  const targetPath = path.join(plansDirectory, "weather-agent--remote.json");
  const priorText = await fs.readFile(targetPath, "utf8");
  let targetLinked = false;
  let failedTargetStat = false;
  const failingFileSystem = {
    async link(sourcePath, destinationPath) {
      await fs.link(sourcePath, destinationPath);
      if (destinationPath === targetPath) {
        targetLinked = true;
      }
    },
    readFile: fs.readFile.bind(fs),
    rename: fs.rename.bind(fs),
    rm: fs.rm.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    stat(filePath) {
      if (filePath === targetPath && targetLinked && !failedTargetStat) {
        failedTargetStat = true;
        return Promise.reject(
          Object.assign(new Error("injected stat"), { code: "EIO" }),
        );
      }
      return fs.stat(filePath);
    },
  };

  const result = await setupGeneratedPlans({
    compileStep: (input) => {
      const compiled = compileStep(input);
      compiled.value[0].description = "Changed compiled step";
      return compiled;
    },
    fileSystem: failingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_IO");
  assert.equal(await fs.readFile(targetPath, "utf8"), priorText);
});

test("VCB-33: committed output reports cleanup failures", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const failingFileSystem = {
    link: fs.link.bind(fs),
    readFile: fs.readFile.bind(fs),
    rename: fs.rename.bind(fs),
    stat: fs.stat.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    rm(filePath, options) {
      if (filePath.endsWith(".tmp")) {
        return Promise.reject(
          Object.assign(new Error("injected cleanup"), { code: "EIO" }),
        );
      }
      return fs.rm(filePath, options);
    },
  };

  const result = await setupGeneratedPlans({
    compileStep,
    fileSystem: failingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_CLEANUP");
  assert.equal(
    JSON.parse(
      await fs.readFile(
        path.join(plansDirectory, ".vscuse-generated-plans"),
        "utf8",
      ),
    ).files[0],
    "weather-agent--remote.json",
  );
  assert.equal(
    (await fs.readdir(plansDirectory)).some((fileName) =>
      fileName.endsWith(".tmp"),
    ),
    true,
  );
});

test("VCB-33: committed output reports lock cleanup failures", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const failingFileSystem = {
    link: fs.link.bind(fs),
    readFile: fs.readFile.bind(fs),
    rename: fs.rename.bind(fs),
    stat: fs.stat.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    rm(filePath, options) {
      if (path.basename(filePath) === ".vscuse-generated-plans.lock") {
        return Promise.reject(
          Object.assign(new Error("injected lock cleanup"), { code: "EIO" }),
        );
      }
      return fs.rm(filePath, options);
    },
  };

  const result = await setupGeneratedPlans({
    compileStep,
    fileSystem: failingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_CLEANUP");
  assert.equal(
    JSON.parse(
      await fs.readFile(
        path.join(plansDirectory, ".vscuse-generated-plans"),
        "utf8",
      ),
    ).files[0],
    "weather-agent--remote.json",
  );
});

test("VCB-33: commit failure rolls back every generated target", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const initial = await setupGeneratedPlans({
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });
  assert.equal(initial.ok, true);

  const snapshot = new Map();
  for (const fileName of await fs.readdir(plansDirectory)) {
    snapshot.set(
      fileName,
      await fs.readFile(path.join(plansDirectory, fileName), "utf8"),
    );
  }
  const failingFileSystem = {
    link: fs.link.bind(fs),
    readFile: fs.readFile.bind(fs),
    rm: fs.rm.bind(fs),
    stat: fs.stat.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    rename(sourcePath, destinationPath) {
      if (path.basename(sourcePath) === ".vscuse-generated-plans") {
        return Promise.reject(
          Object.assign(new Error("injected"), { code: "EIO" }),
        );
      }
      return fs.rename(sourcePath, destinationPath);
    },
  };

  const result = await setupGeneratedPlans({
    compileStep: (input) => {
      const compiled = compileStep(input);
      compiled.value[0].description = "Changed compiled step";
      return compiled;
    },
    fileSystem: failingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [
      { sourcePath: "cases/weather.yml", sourceText: twoCaseSourceText },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_IO");
  assert.deepEqual(
    (await fs.readdir(plansDirectory)).sort(),
    [...snapshot.keys()].sort(),
  );
  for (const [fileName, text] of snapshot) {
    assert.equal(
      await fs.readFile(path.join(plansDirectory, fileName), "utf8"),
      text,
    );
  }
});

test("VCB-33: failed rollback preserves the prior plan backup", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const initial = await setupGeneratedPlans({
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });
  assert.equal(initial.ok, true);
  const priorPlanText = await fs.readFile(
    path.join(plansDirectory, "weather-agent--remote.json"),
    "utf8",
  );

  const failingFileSystem = {
    link: fs.link.bind(fs),
    readFile: fs.readFile.bind(fs),
    rm: fs.rm.bind(fs),
    stat: fs.stat.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    rename(sourcePath, destinationPath) {
      if (
        path.basename(sourcePath) === ".vscuse-generated-plans" ||
        sourcePath.endsWith(".bak")
      ) {
        return Promise.reject(
          Object.assign(new Error("injected"), { code: "EIO" }),
        );
      }
      return fs.rename(sourcePath, destinationPath);
    },
  };

  const result = await setupGeneratedPlans({
    compileStep: (input) => {
      const compiled = compileStep(input);
      compiled.value[0].description = "Changed compiled step";
      return compiled;
    },
    fileSystem: failingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [
      { sourcePath: "cases/weather.yml", sourceText: twoCaseSourceText },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_ROLLBACK");
  const backupNames = (await fs.readdir(plansDirectory)).filter((fileName) =>
    fileName.endsWith(".bak"),
  );
  assert.equal(backupNames.length, 1);
  assert.equal(
    await fs.readFile(path.join(plansDirectory, backupNames[0]), "utf8"),
    priorPlanText,
  );
});

test("VCB-33: lock cleanup failure does not mask rollback failure", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  const initial = await setupGeneratedPlans({
    compileStep,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [{ sourcePath: "cases/weather.yml", sourceText }],
  });
  assert.equal(initial.ok, true);

  const failingFileSystem = {
    link: fs.link.bind(fs),
    readFile: fs.readFile.bind(fs),
    stat: fs.stat.bind(fs),
    writeFile: fs.writeFile.bind(fs),
    rename(sourcePath, destinationPath) {
      if (
        path.basename(sourcePath) === ".vscuse-generated-plans" ||
        sourcePath.endsWith(".bak")
      ) {
        return Promise.reject(
          Object.assign(new Error("injected rename"), { code: "EIO" }),
        );
      }
      return fs.rename(sourcePath, destinationPath);
    },
    rm(filePath, options) {
      if (path.basename(filePath) === ".vscuse-generated-plans.lock") {
        return Promise.reject(
          Object.assign(new Error("injected lock cleanup"), { code: "EIO" }),
        );
      }
      return fs.rm(filePath, options);
    },
  };

  const result = await setupGeneratedPlans({
    compileStep: (input) => {
      const compiled = compileStep(input);
      compiled.value[0].description = "Changed compiled step";
      return compiled;
    },
    fileSystem: failingFileSystem,
    onDiff: ignoreDiff,
    plansDirectory,
    sources: [
      { sourcePath: "cases/weather.yml", sourceText: twoCaseSourceText },
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_ROLLBACK");
});

test("VCB-33: cross-source output collisions fail before writing", async (context) => {
  const plansDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), "vscuse-generated-plans-"),
  );
  context.after(() => fs.rm(plansDirectory, { force: true, recursive: true }));
  let diffCalls = 0;

  const result = await setupGeneratedPlans({
    compileStep,
    plansDirectory,
    sources: [
      { sourcePath: "cases/first.yml", sourceText },
      { sourcePath: "cases/second.yml", sourceText },
    ],
    onDiff: () => {
      diffCalls += 1;
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, "VCB_OUTPUT_PATH_COLLISION");
  assert.equal(diffCalls, 0);
  assert.deepEqual(await fs.readdir(plansDirectory), []);
});
