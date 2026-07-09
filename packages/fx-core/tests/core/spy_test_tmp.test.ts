import { expect, vi } from "vitest";
import * as generatorUtils from "../../src/component/generator/utils";
describe("spy test", () => {
  it("can spy on fetchZipFromUrl", async () => {
    const spy = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue({});
    expect(spy.mock.calls.length).toBe(0);
    vi.restoreAllMocks();
  });
  it("can verify vi.spyOn works on generatorUtils", async () => {
    const spy = vi.spyOn(generatorUtils, "fetchZipFromUrl").mockResolvedValue({} as any);
    await generatorUtils.fetchZipFromUrl(); // Call the function to trigger the spy
    expect(spy).toHaveBeenCalled(); // Verify that the spy was called
    vi.restoreAllMocks();
  });
});
