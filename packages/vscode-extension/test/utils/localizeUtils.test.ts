import fs from "fs-extra";
import VsCodeLogInstance from "../../src/commonlib/log";
import * as globalVariables from "../../src/globalVariables";
import { vi, expect } from "vitest";
import { mockValue } from "../mocks/vitestMockUtils";
import {
  _resetCollections,
  loadLocalizedStrings,
  parseLocale,
} from "../../src/utils/localizeUtils";

describe("localizeUtils", () => {
  afterEach(() => {
    _resetCollections();
    vi.restoreAllMocks();
  });

  describe("loadLocalizedStrings", () => {
    it("should log error if no default string collection", () => {
      vi.spyOn(fs, "pathExistsSync").mockImplementation((directory: string) => {
        if (directory.includes("package.nls.json")) {
          return false;
        }
        return true;
      });
      vi.spyOn(fs, "readJsonSync").mockReturnValue({});
      mockValue(globalVariables, "context", { extensionPath: "" });
      const vscodeLogStub = vi.spyOn(VsCodeLogInstance, "error");
      _resetCollections();

      loadLocalizedStrings();

      expect(vscodeLogStub.calledOnce).to.be.true;
    });

    it("should log error if no string file found for current locale", () => {
      mockValue(navigator, "language", undefined);
      mockValue(process, "env", { VSCODE_NLS_CONFIG: '{ "locale": "zh-cn" }' });
      vi.spyOn(fs, "pathExistsSync").mockImplementation((directory: string) => {
        if (directory.includes("package.nls.json")) {
          return true;
        }
        return false;
      });
      vi.spyOn(fs, "readJsonSync").mockReturnValue({});
      mockValue(globalVariables, "context", { extensionPath: "" });
      const vscodeLogStub = vi.spyOn(VsCodeLogInstance, "error");
      _resetCollections();

      loadLocalizedStrings();

      expect(vscodeLogStub.calledOnce).to.be.true;
    });
  });

  describe("parseLocale", () => {
    it("should return current locale", () => {
      mockValue(navigator, "language", undefined);
      mockValue(process, "env", { VSCODE_NLS_CONFIG: '{ "locale": "zh-cn" }' });
      const locale = parseLocale();

      expect(locale).to.equal("zh-cn");
    });
  });
});
