// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import AdmZip from "adm-zip";
import fs from "fs-extra";
import { expect, vi } from "vitest";
import { Constants } from "../../../../src/component/driver/teamsApp/constants";
import { copyAppPackageToSPFxDriver } from "../../../../src/component/driver/teamsApp/copyAppPackageToSPFx";
import { AppStudioError } from "../../../../src/component/driver/teamsApp/errors";
import { copyAppPackageToSPFxArgs } from "../../../../src/component/driver/teamsApp/interfaces/CopyAppPackageToSPFxArgs";

describe("teamsApp/copyAppPackageToSPFx", async () => {
  const driver = new copyAppPackageToSPFxDriver();
  const args: copyAppPackageToSPFxArgs = {
    appPackagePath: "./teamsApp/a.zip",
    spfxFolder: "./SPFx",
  };
  const mockedDriverContext: any = { projectPath: "C://TeamsApp" };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should successfully copy app package for SPFx", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(true);
    vi.spyOn(fs, "copyFile").mockResolvedValue();
    vi.spyOn(fs, "writeFile").mockResolvedValue();
    vi.spyOn(fs, "readdir").mockResolvedValue(["color.png", "outline.png"] as any);
    vi.spyOn(copyAppPackageToSPFxDriver.prototype, "getIcons").mockResolvedValue({
      color: Buffer.from("color.png"),
      outline: Buffer.from("outline.png"),
    });

    const result = await driver.execute(args, mockedDriverContext);
    expect(result.result.isOk()).to.be.true;
    expect(result.summaries.length).to.eq(2);
  });

  it("fail to copy app package for SPFx - FileNotFoundError", async () => {
    vi.spyOn(fs, "pathExists").mockResolvedValue(false);

    const result = await driver.execute(args, mockedDriverContext);
    expect(result.result.isErr()).to.be.true;
    expect((result.result as any).error.name).to.be.equal(AppStudioError.FileNotFoundError.name);
  });

  it("should successfully get icons", async () => {
    const zip = new AdmZip();
    zip.addFile(
      Constants.MANIFEST_FILE,
      Buffer.from(JSON.stringify({ icons: { color: "color.png", outline: "outline.png" } }))
    );
    zip.addFile("./resources/color.png", Buffer.from(""));
    zip.addFile("./resources/outline.png", Buffer.from(""));
    vi.spyOn(fs, "readFile").mockResolvedValue(zip.toBuffer());
    expect(await driver.getIcons(args.appPackagePath)).to.deep.equal({
      color: Buffer.from(""),
      outline: Buffer.from(""),
    });
  });

  it("fail to get icons - FileNotFoundError", async () => {
    vi.spyOn(fs, "readFile").mockResolvedValue(undefined);
    await expect(driver.getIcons(args.appPackagePath)).rejects.toThrow();
  });
});
