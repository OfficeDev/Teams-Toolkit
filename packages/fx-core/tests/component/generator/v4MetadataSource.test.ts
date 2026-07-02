// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import templateConfig from "../../../src/common/templates-config.json";
import { resolveV4MetadataSource } from "../../../src/component/generator/v4MetadataSource";
import * as bundledFloor from "../../../src/v4/distribution/bundledFloor";
import * as templateArtifacts from "../../../src/v4/distribution/templateArtifacts";
import { assert } from "vitest";

describe("resolveV4MetadataSource", () => {
  it("resolves the staged metadata artifact through the shared artifact resolver", async () => {
    const bundled = bundledFloor.loadBundledTemplateArtifacts();
    const port = templateArtifacts.createTemplateArtifactPort(
      {
        templatesV4TagListURL: templateConfig.templatesV4TagListURL,
        templateDownloadBaseURL: templateConfig.templateDownloadBaseURL,
      },
      bundled
    );
    const expected = await templateArtifacts.resolveTemplateArtifactSnapshot({
      range: templateConfig.v4.range,
      bundled: templateConfig.v4.bundled,
      requiredKind: "metadata",
      port,
    });

    const result = await resolveV4MetadataSource();

    assert.isTrue(result.isOk());
    assert.isTrue(expected.isOk());
    if (result.isOk() && expected.isOk()) {
      assert.equal(result.value.version, expected.value.version);
      assert.equal(result.value.origin, expected.value.origin);
      assert.deepEqual(result.value.artifacts.metadata, expected.value.artifacts.metadata);
      const bytes = await result.value.bytes("metadata");
      assert.isTrue(bytes.isOk());
    }
  });
});
