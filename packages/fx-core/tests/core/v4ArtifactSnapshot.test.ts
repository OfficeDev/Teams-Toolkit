// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { assert, vi } from "vitest";
import { ok } from "neverthrow";
import templateConfig from "../../src/common/templates-config.json";
import { defaultTryLimits } from "../../src/component/generator/constant";
import type {
  BundledTemplateArtifacts,
  TemplateArtifactKind,
  TemplateArtifactPort,
  TemplateArtifactSnapshot,
} from "../../src/v4";

const mocks = vi.hoisted(() => ({
  createTemplateArtifactPort: vi.fn(),
  loadBundledTemplateArtifacts: vi.fn(),
  resolveTemplateArtifactSnapshot: vi.fn(),
}));

vi.mock("../../src/v4", () => ({
  createTemplateArtifactPort: mocks.createTemplateArtifactPort,
  loadBundledTemplateArtifacts: mocks.loadBundledTemplateArtifacts,
  resolveTemplateArtifactSnapshot: mocks.resolveTemplateArtifactSnapshot,
}));

import { resolveV4TemplateArtifactSnapshot } from "../../src/core/v4ArtifactSnapshot";

describe("resolveV4TemplateArtifactSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a production artifact port from template config and delegates snapshot resolution", async () => {
    const bundled = bundledArtifacts("6.10.5");
    const port = artifactPort(bundled);
    const snapshot = artifactSnapshot("6.11.0", bundled);
    mocks.loadBundledTemplateArtifacts.mockReturnValue(bundled);
    mocks.createTemplateArtifactPort.mockReturnValue(port);
    mocks.resolveTemplateArtifactSnapshot.mockResolvedValue(ok(snapshot));

    const result = await resolveV4TemplateArtifactSnapshot("metadata");

    assert.isTrue(result.isOk());
    assert.strictEqual(result._unsafeUnwrap(), snapshot);
    assert.deepEqual(mocks.createTemplateArtifactPort.mock.calls[0][0], {
      templatesV4TagListURL: templateConfig.templatesV4TagListURL,
      templateDownloadBaseURL: templateConfig.templateDownloadBaseURL,
      tryLimits: defaultTryLimits,
    });
    assert.strictEqual(mocks.createTemplateArtifactPort.mock.calls[0][1], bundled);
    assert.deepEqual(mocks.resolveTemplateArtifactSnapshot.mock.calls[0][0], {
      range: templateConfig.v4.range,
      bundled: templateConfig.v4.bundled,
      requiredKind: "metadata",
      port,
    });
  });
});

function artifactSnapshot(
  version: string,
  bundled: BundledTemplateArtifacts
): TemplateArtifactSnapshot {
  return {
    version,
    origin: "online",
    artifacts: bundled.artifacts,
    bytes: () => Promise.resolve(ok(Buffer.from("artifact"))),
  };
}

function artifactPort(bundled: BundledTemplateArtifacts): TemplateArtifactPort {
  return {
    env: () => undefined,
    tagList: () => Promise.resolve([]),
    download: () => Promise.resolve(Buffer.from("artifact")),
    cache: {
      get: () => undefined,
      put: () => undefined,
      keys: () => [],
      delete: () => undefined,
    },
    bundled,
  };
}

function bundledArtifacts(version: string): BundledTemplateArtifacts {
  const artifacts = {
    "create-selector": artifactRef("create-selector", "create-selector.json", version),
    "modify-selector": artifactRef("modify-selector", "modify-selector.json", version),
    metadata: artifactRef("metadata", "templates-metadata.zip", version),
    templates: artifactRef("templates", "templates.zip", version),
  };
  return {
    version,
    artifacts,
    locations: {
      "create-selector": `bundled://${version}/create-selector.json`,
      "modify-selector": `bundled://${version}/modify-selector.json`,
      metadata: `bundled://${version}/templates-metadata.zip`,
      templates: `bundled://${version}/templates.zip`,
    },
  };
}

function artifactRef(kind: TemplateArtifactKind, file: string, version: string): CachedArtifactRef {
  return { kind, file, digest: `sha256:${kind}-${version}` };
}

type CachedArtifactRef = BundledTemplateArtifacts["artifacts"][TemplateArtifactKind];
