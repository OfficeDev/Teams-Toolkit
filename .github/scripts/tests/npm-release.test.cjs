const assert = require("node:assert/strict");
const { test } = require("node:test");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "../../..");
const cd = fs.readFileSync(path.join(root, ".github/workflows/cd.yml"), "utf8").replaceAll("\r\n", "\n");
const ado = fs.readFileSync(path.join(root, ".azure-pipelines/microsoftgraph/esrp-publish.yml"), "utf8").replaceAll("\r\n", "\n");
const packer = path.join(root, ".github/scripts/pack-npm-packages.sh");
const lane = cd.split("      - name: Validate npm release lane\n")[1]
  .split("        run: |\n")[1].split("\n      - name:")[0]
  .replace(/^          /gm, "");
const download = ado.split("              - pwsh: |\n")[1]
  .split("\n                env:")[0].replace(/^                  /gm, "");

function run(command, args, env, cwd) {
  const result = spawnSync(command, args, {
    cwd, env: { ...process.env, ...env }, encoding: "utf8", timeout: 30000,
  });
  if (result.error) throw result.error;
  return result;
}

function scratch(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atk-npm-release-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("release lanes reject invalid contexts and map only explicit stable to latest", (t) => {
  const dir = scratch(t);
  const output = path.join(dir, "output").replaceAll("\\", "/");
  for (const [ref, preid, expected] of [
    ["refs/heads/dev", "alpha", "alpha"],
    ["refs/heads/feature", "preview", "beta"],
    ["refs/heads/release/6.16", "rc", "rc"],
    ["refs/heads/feature", "stable", "latest"],
    ["refs/heads/feature", "alpha", null],
    ["refs/heads/feature", "typo", null],
    ["refs/heads/dev", "stable", null],
  ]) {
    fs.writeFileSync(output, "");
    const result = run("bash", ["-c", lane], {
      GITHUB_REF: ref, RELEASE_PREID: preid, GITHUB_OUTPUT: output,
    }, dir);
    assert.equal(result.status, expected ? 0 : 1, result.stderr);
    assert.equal(fs.readFileSync(output, "utf8").trim(), expected ? `tag=${expected}` : "");
  }
  assert.ok(cd.indexOf("Validate npm release lane") < cd.indexOf("version alpha npm packages"));
  assert.ok(cd.includes("Validate npm release lane\n        if: ${{ inputs.publishnpm }}"));
});

test("published stable packages are skipped before prerelease checks; registry errors fail closed", (t) => {
  const dir = scratch(t);
  fs.writeFileSync(path.join(dir, "package.json"), '{"name":"root","private":true}');
  const mocks = `
pnpm() { printf '%s\\n' '[{"name":"example","version":"1.0.0","path":"unused"}]'; }
npm() {
  case "$REGISTRY_RESULT" in
    published) echo 1.0.0; return 0 ;;
    missing) echo 'npm error code E404' >&2; return 1 ;;
    *) echo 'npm error code E401' >&2; return 1 ;;
  esac
}
export -f pnpm npm
bash "$PACKER" "$OUTPUT" alpha
`;
  for (const [value, status, message] of [
    ["published", 0, "already on registry"],
    ["missing", 1, "is stable but would be published"],
    ["error", 1, "unable to determine"],
  ]) {
    const result = run("bash", ["-c", mocks], {
      PACKER: packer.replaceAll("\\", "/"),
      OUTPUT: path.join(dir, "out").replaceAll("\\", "/"), REGISTRY_RESULT: value,
    }, dir);
    assert.equal(result.status, status, result.stderr);
    assert.ok((result.stdout + result.stderr).includes(message));
  }
});

test("handoff tag is unique per attempt and completion manifest is uploaded last", (t) => {
  const dir = scratch(t);
  fs.mkdirSync(path.join(dir, "npm-packages"));
  fs.writeFileSync(path.join(dir, "npm-packages/a.tgz"), "package");
  const code = cd.split("node - <<'NODE'\n")[1].split("\n          NODE")[0]
    .replace(/^          /gm, "");
  const tag = "npm-packages-123-2";
  const result = run(process.execPath, ["-e", code], {
    GITHUB_WORKSPACE: dir, RELEASE_TAG: tag,
  }, dir);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "npm-packages/npm-release-manifest.json")));
  assert.deepEqual(manifest, {
    schemaVersion: 1, tag,
    packages: [{ name: "a.tgz", size: 7, sha256: crypto.createHash("sha256").update("package").digest("hex") }],
  });
  assert.ok(cd.includes("tag: npm-packages-${{ github.run_id }}-${{ github.run_attempt }}"));
  assert.ok(cd.includes("allowUpdates: false"));
  assert.ok(cd.indexOf("Complete npm package handoff") > cd.indexOf("attach packed npm packages"));
  assert.ok(cd.includes('gh release upload "$RELEASE_TAG"'));
});

test("AzDO waits for completion and rejects mismatched or unsafe handoffs", (t) => {
  const dir = scratch(t);
  const mocks = `
$ErrorActionPreference = 'Stop'
$script:polls = 0
$script:sleeps = 0
function Start-Sleep { param($Seconds) $script:sleeps++ }
function Invoke-RestMethod {
  param($Uri, $Headers, $TimeoutSec)
  if ($Uri -eq 'https://example.test/manifest') {
    return (Get-Content $env:TEST_MANIFEST -Raw | ConvertFrom-Json)
  }
  $script:polls++
  $assets = @([pscustomobject]@{name='a.tgz';size=7;browser_download_url='https://example.test/package'})
  if ($script:polls -gt 1) {
    $assets += [pscustomobject]@{name='npm-release-manifest.json';browser_download_url='https://example.test/manifest'}
  }
  if ($env:TEST_CASE -eq 'extra') { $assets += [pscustomobject]@{name='b.tgz';size=7} }
  return [pscustomobject]@{assets=$assets}
}
function Invoke-WebRequest {
  param($Uri, $OutFile, $TimeoutSec)
  [IO.File]::WriteAllText($OutFile, 'package')
}
`;
  assert.ok(ado.includes("GITHUB_RELEASE_TAG: ${{ parameters.githubReleaseTag }}"));
  assert.ok(!download.includes("${{ parameters.githubReleaseTag }}"));
  for (const scenario of ["valid", "hash", "extra", "missing", "duplicate", "unsafe"]) {
    const out = path.join(dir, scenario);
    const entry = { name: scenario === "missing" ? "b.tgz" : "a.tgz", size: 7,
      sha256: scenario === "hash" ? "0".repeat(64) : crypto.createHash("sha256").update("package").digest("hex") };
    const manifest = { schemaVersion: 1, tag: "npm-packages-123-2",
      packages: scenario === "duplicate" ? [entry, entry] : [entry] };
    const file = path.join(dir, "manifest.json");
    fs.writeFileSync(file, JSON.stringify(manifest));
    const script = path.join(dir, "validate.ps1");
    fs.writeFileSync(script, mocks + download
      .replaceAll("$(githubRepo)", "OfficeDev/microsoft-365-agents-toolkit")
      .replaceAll("$(npmPackagesDir)", out.replaceAll("'", "''")) +
      '\nif ($script:sleeps -ne 1) { throw "Did not wait for manifest" }\n');
    const result = run("pwsh", ["-NoProfile", "-File", script], {
      GITHUB_RELEASE_TAG: scenario === "unsafe" ? "npm-packages-1-1'; throw 'injected" : manifest.tag,
      TEST_MANIFEST: file, TEST_CASE: scenario,
    }, dir);
    assert.equal(result.status, scenario === "valid" ? 0 : 1, result.stdout + result.stderr);
    if (scenario === "unsafe") assert.ok(!fs.existsSync(out));
    if (scenario === "valid") assert.equal(fs.readFileSync(path.join(out, "a.tgz"), "utf8"), "package");
  }
});
