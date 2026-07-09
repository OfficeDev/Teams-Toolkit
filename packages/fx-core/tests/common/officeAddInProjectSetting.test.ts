import mockFs from "mock-fs";
import { chai, vi } from "vitest";
import * as projectSettingsHelper from "../../src/common/projectSettingsHelper";
import { OfficeManifestType } from "../../src/common/projectSettingsHelper";

describe("validateIsOfficeAddInProject", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockFs.restore();
  });

  it("should return true if manifest list is not empty", () => {
    vi.spyOn(projectSettingsHelper, "fetchManifestList").mockImplementation(
      (workspace: string, type: OfficeManifestType) => {
        if (type == OfficeManifestType.XmlAddIn) {
          return ["manifest.xml"];
        } else {
          return [];
        }
      }
    );
    mockFs({
      "/test/manifest.xml": "",
    });
    chai.expect(projectSettingsHelper.isValidOfficeAddInProject("/test")).to.be.true;
  });

  it("should return false if no manifest file", () => {
    vi.spyOn(projectSettingsHelper, "fetchManifestList").mockReturnValue([]);
    mockFs({
      "/test/useless.xml": "",
    });
    chai.expect(projectSettingsHelper.isValidOfficeAddInProject("/test")).to.be.false;
  });

  it("should return false if fetchManifestList throws an error", () => {
    vi.spyOn(projectSettingsHelper, "fetchManifestList").mockImplementation(() => {
      throw new Error("Error fetching manifest list");
    });
    chai.expect(projectSettingsHelper.isValidOfficeAddInProject("")).to.be.false;
  });

  it("should return false if both manifest.xml and manifest.json exist", () => {
    vi.spyOn(projectSettingsHelper, "fetchManifestList").mockImplementation(
      (workspace: string, type: OfficeManifestType) => {
        if (type == OfficeManifestType.XmlAddIn) {
          return ["manifest.xml"];
        } else if (type == OfficeManifestType.MetaOsAddIn) {
          return ["manifest.json"];
        } else {
          return [];
        }
      }
    );
    mockFs({
      "/test/manifest.xml": "",
      "/test/manifest.json": "",
    });
    chai.expect(projectSettingsHelper.isValidOfficeAddInProject("/test")).to.be.false;
  });
});

describe("fetchManifestList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockFs.restore();
  });

  it("should return undefined if workspacePath is not provided", () => {
    chai.expect(projectSettingsHelper.fetchManifestList()).to.be.undefined;
  });

  it("should return manifest.xml if type is OfficeManifestType.XmlAddIn", () => {
    mockFs({
      "/test/manifest.xml": "",
    });
    chai
      .expect(
        projectSettingsHelper.fetchManifestList(
          "/test",
          projectSettingsHelper.OfficeManifestType.XmlAddIn
        )
      )
      .to.deep.equal(["manifest.xml"]);
  });

  it("should return manifest.json if type is OfficeManifestType.MetaOsAddIn", () => {
    mockFs({
      "/test/manifest.json": "",
    });
    chai
      .expect(
        projectSettingsHelper.fetchManifestList(
          "/test",
          projectSettingsHelper.OfficeManifestType.MetaOsAddIn
        )
      )
      .to.deep.equal(["manifest.json"]);
  });

  it("should return false if both manifest.xml and manifest.json exist but type is OfficeManifestType.XmlAddIn", () => {
    mockFs({
      "/test/manifest.xml": "",
      "/test/manifest.json": "",
    });
    chai
      .expect(
        projectSettingsHelper.fetchManifestList(
          "/test",
          projectSettingsHelper.OfficeManifestType.XmlAddIn
        )
      )
      .to.deep.equal(["manifest.xml"]);
  });

  it("should return true if manifest.json exist and type is OfficeManifestType.MetaOsAddIn", () => {
    mockFs({
      "/test/manifest.xml": "",
      "/test/manifest.json": "",
    });
    chai
      .expect(
        projectSettingsHelper.fetchManifestList(
          "/test",
          projectSettingsHelper.OfficeManifestType.MetaOsAddIn
        )
      )
      .to.deep.equal(["manifest.json"]);
  });

  it("should return true when no src folder exists", () => {
    mockFs({
      "/test/manifest.xml": "",
    });
    chai.expect(projectSettingsHelper.isManifestOnlyOfficeAddinProject("/test")).to.be.true;
  });
});
