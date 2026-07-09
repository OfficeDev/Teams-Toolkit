// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { err, ok, UserError } from "@microsoft/teamsfx-api";
import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";
import { featureFlagManager, FeatureFlags } from "../../src/common/featureFlags";
import { setTools } from "../../src/common/globalVars";
import { FxCore } from "../../src/core/FxCore";
import * as openPluginExporter from "../../src/component/generator/openPlugin/exporter";
import * as openPluginImporter from "../../src/component/generator/openPlugin/importer";
import { MockTools } from "./utils";

describe("FxCore.openPlugin", () => {
  let core: FxCore;

  beforeEach(() => {
    setTools(new MockTools());
    core = new FxCore(new MockTools());
    vi.spyOn(featureFlagManager, "getBooleanValue").mockImplementation(
      (flag) => flag.name === FeatureFlags.OpenPluginImportExport.name
    );
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("importOpenPlugin", () => {
    it("returns UserError when feature flag is disabled", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      const res = await core.importOpenPlugin({ platform: "cli", path: "x" } as any);
      assert.isTrue(res.isErr());
      if (res.isErr()) assert.equal(res.error.name, "FeatureFlagDisabled");
    });

    it("returns MissingRequiredInput when --path is absent", async () => {
      const res = await core.importOpenPlugin({ platform: "cli" } as any);
      assert.isTrue(res.isErr());
      if (res.isErr()) assert.equal(res.error.name, "MissingRequiredInput");
    });

    it("returns InvalidDefaultAuthType for an unknown auth type", async () => {
      const res = await core.importOpenPlugin({
        platform: "cli",
        path: "/tmp",
        "default-auth-type": "Bogus",
      } as any);
      assert.isTrue(res.isErr());
      if (res.isErr()) assert.equal(res.error.name, "InvalidDefaultAuthType");
    });

    it("delegates to importer.importOpenPlugin on the success path", async () => {
      const stub = vi
        .spyOn(openPluginImporter, "importOpenPlugin")
        .mockResolvedValue(ok({ projectPath: "/tmp/out", warnings: ["w"] }));
      const res = await core.importOpenPlugin({
        platform: "cli",
        path: "/tmp/in",
        output: "/tmp/out",
        "privacy-url": "https://x/p",
        "terms-url": "https://x/t",
      } as any);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value.projectPath, "/tmp/out");
        assert.equal(res.value.warnings?.[0].type, "openPluginImport");
        assert.equal(res.value.warnings?.[0].content, "w");
      }
      expect(stub).toHaveBeenCalledOnce();
      const arg = stub.mock.calls[0][0];
      assert.equal(arg.path, "/tmp/in");
      assert.equal(arg.privacyUrl, "https://x/p");
      assert.equal(arg.termsUrl, "https://x/t");
    });

    it("propagates importer errors", async () => {
      vi.spyOn(openPluginImporter, "importOpenPlugin").mockResolvedValue(
        err(new UserError("OpenPluginImport", "Boom", "boom"))
      );
      const res = await core.importOpenPlugin({
        platform: "cli",
        path: "/tmp/in",
      } as any);
      assert.isTrue(res.isErr());
    });
  });

  describe("exportOpenPlugin", () => {
    it("returns UserError when feature flag is disabled", async () => {
      vi.spyOn(featureFlagManager, "getBooleanValue").mockReturnValue(false);
      const res = await core.exportOpenPlugin({ platform: "cli", path: "x" } as any);
      assert.isTrue(res.isErr());
      if (res.isErr()) assert.equal(res.error.name, "FeatureFlagDisabled");
    });

    it("returns MissingRequiredInput when --path is absent", async () => {
      const res = await core.exportOpenPlugin({ platform: "cli" } as any);
      assert.isTrue(res.isErr());
      if (res.isErr()) assert.equal(res.error.name, "MissingRequiredInput");
    });

    it("returns InvalidManifestKind for an unknown kind", async () => {
      const res = await core.exportOpenPlugin({
        platform: "cli",
        path: "/tmp",
        "manifest-kind": "bogus",
      } as any);
      assert.isTrue(res.isErr());
      if (res.isErr()) assert.equal(res.error.name, "InvalidManifestKind");
    });

    it("delegates to exporter.exportOpenPlugin on the success path", async () => {
      const stub = vi
        .spyOn(openPluginExporter, "exportOpenPlugin")
        .mockResolvedValue(ok({ outputPath: "/tmp/out", warnings: ["w"] }));
      const res = await core.exportOpenPlugin({
        platform: "cli",
        path: "/tmp/proj",
        output: "/tmp/out",
        "manifest-kind": "claude-plugin",
      } as any);
      assert.isTrue(res.isOk());
      if (res.isOk()) {
        assert.equal(res.value.outputPath, "/tmp/out");
        assert.equal(res.value.warnings[0].type, "openPluginExport");
      }
      expect(stub).toHaveBeenCalledOnce();
      const arg = stub.mock.calls[0][0];
      assert.equal(arg.path, "/tmp/proj");
      assert.equal(arg.manifestKind, "claude-plugin");
    });

    it("propagates exporter errors", async () => {
      vi.spyOn(openPluginExporter, "exportOpenPlugin").mockResolvedValue(
        err(new UserError("OpenPluginExport", "Boom", "boom"))
      );
      const res = await core.exportOpenPlugin({
        platform: "cli",
        path: "/tmp/proj",
      } as any);
      assert.isTrue(res.isErr());
    });
  });
});
