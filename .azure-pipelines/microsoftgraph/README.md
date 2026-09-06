# npm publishing through ESRP

This pipeline moves npm distribution out of GitHub Actions while keeping
versioning, building, and packing in `.github/workflows/cd.yml`.

## Azure DevOps pipeline definition

The production Azure DevOps definition must:

- Use `.azure-pipelines/microsoftgraph/esrp-publish.yml` as its YAML path.
- Be named `Publish npm packages through ESRP`.
- Allow YAML CI triggers; do not override/disable the tag trigger in the Azure
  DevOps UI.
- Be authorized to use `ATK ESRP Connection` and the 1ES template repository.

The former `smoke-test.yml` path no longer exists. Update the existing test
definition or create the production definition before merging; otherwise
`npm-packages-*` tag pushes cannot start this pipeline.

## Flow

1. Run `cd.yml` with `publishnpm=true`.
2. GitHub builds and packs the selected public workspace packages. Each tarball
   contains the lane's npm dist-tag in `publishConfig.tag`.
3. GitHub creates a prerelease and pushes `npm-packages-<run-id>`.
4. The tag push triggers `esrp-publish.yml` through the Azure DevOps GitHub service
   connection.
5. Azure DevOps downloads every `.tgz` release asset and invokes
   `EsrpRelease@12` with `contentsource: Folder`.

GitHub does not publish directly to npm; ESRP is the only npm publisher.
If the selected workspace contains no new public package versions, the pack step
succeeds as a no-op and no GitHub release/tag or Azure DevOps run is created.

## ESRP authentication

`ATK ESRP Connection` uses a federated credential to let the ESRP-onboarded
managed identity authenticate without storing a secret, so the task must set:

```yaml
usemanagedidentity: true
```

Do not set `authcertname` for this path. The ESRP integration guide requires an
authentication certificate and Entra application SNI pinning only when using App
Registration authentication; it explicitly says Managed Identity users can skip
those steps. `signcertname` identifies the Key Vault request-signing certificate
that `EsrpRelease@12` fetches and uses while submitting the payload to ESRP.
Packages must not be manually signed, unpacked, or repacked before this task.

## Real npm publication test

`esrp-publish.yml` uses:

```yaml
contenttype: 'npm'
```

This is not a dry run. `EsrpRelease@12` is auto-approved and publishes every
`.tgz` under `folderlocation` immediately. npm versions are immutable.

To publish a constrained preview set, dispatch `cd.yml` from a feature branch:

| Input | Value |
|---|---|
| `preid` | `preview` |
| `pkgs` | `vscode` |
| `publishnpm` | `true` |
| `SkipBranchCheck` | `true` |
| `skipmarkdowncheck` | `true` |
| `skipdockerbuild` | `true` |
| `goproduct`, `vsrelease`, `vstemplate`, `run_test_cases` | `false` |

Expected results:

- GitHub creates preview `.tgz` files with `publishConfig.tag=beta`.
- GitHub does not publish to npm; ESRP is the only npm publishing path.
- The VSIX may be built and uploaded as a workflow artifact, but it is not
  published because VS Code publication is stable-only.
- Azure DevOps downloads and validates every tarball.
- ESRP publishes the packages to npm with the `beta` dist-tag.

## Production pipeline

The Azure DevOps pipeline uses the 1ES Official template and marks the npm job as
a production `releaseJob`. The ESRP task itself is auto-approved; this pipeline
intentionally has no separate environment approval gate.

Every downloaded tarball is revalidated immediately before ESRP execution.
The npm package collaborators and package-publishing 2FA configuration must
remain compliant with the ESRP npm onboarding requirements.

`EsrpRelease@12` publishes immediately and has no manual approval gate of its
own. `publishnpm` defaults to true; set it to false only for a CD run that
intentionally skips npm release.

Published npm versions are immutable. Incorrect dist-tags must be corrected
through the ESRP Release UI, and unpublishing requires the approved ESRP process.
