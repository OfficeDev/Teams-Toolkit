import { expect } from "vitest";
import * as versionUtil from "../../src/utils/versionUtil";

describe("versionUtil", () => {
  describe("Compare Version", () => {
    it("same version", () => {
      expect(versionUtil.compare("2.6.0", "2.6.0")).equals(0);
    });

    it("Compare Pre Version", () => {
      expect(versionUtil.compare("2.6.0-alpha.1", "2.6.0")).equals(-1);
      expect(versionUtil.compare("2.6.0", "2.6.0-alpha.1")).equals(1);
      expect(versionUtil.compare("2.6.0-alpha.1", "2.6.0-alpha.1")).equals(0);
    });

    it("Compare Empty Version", () => {
      expect(versionUtil.compare("", "")).equals(0);
      expect(versionUtil.compare("2.6.0", "")).equals(0);
      expect(versionUtil.compare("", "2.6.0")).equals(0);
    });

    it("Prerelease version", () => {
      expect(versionUtil.isPrereleaseVersion("4.1.2023050400")).be.true;
      expect(versionUtil.isPrereleaseVersion("4.1.2")).be.false;
      expect(versionUtil.isPrereleaseVersion("5.0.2")).be.false;
    });
  });
});
