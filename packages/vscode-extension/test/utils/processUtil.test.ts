import { vi, assert } from "vitest";
import { processUtil, timeoutPromise } from "../../src/utils/processUtil";
import { processAdapter } from "../../src/common/npmPackageDeps";

describe("ProcessUtil", () => {
  describe("killProcess", () => {
    it("error", async () => {
      const killStub = vi.spyOn(processAdapter, "killTree");
      killStub.mockImplementation((_pid: number, _signal: string, cb: (err?: Error) => void) => {
        cb(new Error());
      });
      try {
        await processUtil.killProcess(-1, 5000, false);
        assert.fail("Expected promise to reject, but it resolved.");
      } catch (error) {
        assert.isTrue(error instanceof Error);
      }
    });
    it("happy", async () => {
      const killStub = vi.spyOn(processAdapter, "killTree");
      killStub.mockImplementation((_pid: number, _signal: string, cb: () => void) => {
        cb();
      });
      await processUtil.killProcess(-1);
      assert.isTrue(killStub.calledOnce);
    });
  });

  describe("getProcessIdsByPort", () => {
    it("should return PIDs from netstat output on Windows", async () => {
      const execStub = vi.spyOn(processAdapter, "execWithOptions") as ReturnType<typeof vi.spyOn>;
      const platformStub = vi.spyOn(processAdapter, "platform").mockReturnValue("win32");
      execStub.mockImplementation((_cmd: string, _opts: any, cb: (...args: unknown[]) => void) => {
        cb(null, "  TCP    0.0.0.0:3978    0.0.0.0:0    LISTENING    12345\n");
      });
      const pids = await processUtil.getProcessIdsByPort(3978);
      assert.deepEqual(pids, [12345]);
      platformStub.restore();
    });

    it("should not match similar port numbers on Windows", async () => {
      const execStub = vi.spyOn(processAdapter, "execWithOptions") as ReturnType<typeof vi.spyOn>;
      const platformStub = vi.spyOn(processAdapter, "platform").mockReturnValue("win32");
      execStub.mockImplementation((_cmd: string, _opts: any, cb: (...args: unknown[]) => void) => {
        cb(
          null,
          "  TCP    0.0.0.0:39780    0.0.0.0:0    LISTENING    99999\n  TCP    0.0.0.0:3978    0.0.0.0:0    LISTENING    12345\n"
        );
      });
      const pids = await processUtil.getProcessIdsByPort(3978);
      assert.deepEqual(pids, [12345]);
      platformStub.restore();
    });

    it("should return PIDs from lsof output on macOS", async () => {
      const execStub = vi.spyOn(processAdapter, "execWithOptions") as ReturnType<typeof vi.spyOn>;
      const platformStub = vi.spyOn(processAdapter, "platform").mockReturnValue("darwin");
      execStub.mockImplementation((_cmd: string, _opts: any, cb: (...args: unknown[]) => void) => {
        cb(null, "12345\n67890\n");
      });
      const pids = await processUtil.getProcessIdsByPort(3978);
      assert.deepEqual(pids, [12345, 67890]);
      platformStub.restore();
    });

    it("should parse ss output on Linux when lsof is unavailable", async () => {
      const execStub = vi.spyOn(processAdapter, "execWithOptions") as ReturnType<typeof vi.spyOn>;
      const platformStub = vi.spyOn(processAdapter, "platform").mockReturnValue("linux");
      execStub.mockImplementation((_cmd: string, _opts: any, cb: (...args: unknown[]) => void) => {
        cb(null, 'LISTEN  0  128  0.0.0.0:3978  0.0.0.0:*  users:(("node",pid=12345,fd=18))\n');
      });
      const pids = await processUtil.getProcessIdsByPort(3978);
      assert.deepEqual(pids, [12345]);
      platformStub.restore();
    });

    it("should return empty array on error", async () => {
      const execStub = vi.spyOn(processAdapter, "execWithOptions") as ReturnType<typeof vi.spyOn>;
      execStub.mockImplementation((_cmd: string, _opts: any, cb: (...args: unknown[]) => void) => {
        cb(new Error("command failed"), "");
      });
      const pids = await processUtil.getProcessIdsByPort(3978);
      assert.deepEqual(pids, []);
    });

    it("should deduplicate PIDs on Windows", async () => {
      const execStub = vi.spyOn(processAdapter, "execWithOptions") as ReturnType<typeof vi.spyOn>;
      const platformStub = vi.spyOn(processAdapter, "platform").mockReturnValue("win32");
      execStub.mockImplementation((_cmd: string, _opts: any, cb: (...args: unknown[]) => void) => {
        cb(
          null,
          "  TCP    0.0.0.0:3978    0.0.0.0:0    LISTENING    12345\n  TCP    [::]:3978    [::]:0    LISTENING    12345\n"
        );
      });
      const pids = await processUtil.getProcessIdsByPort(3978);
      assert.deepEqual(pids, [12345]);
      platformStub.restore();
    });
  });
});

describe("timeoutPromise", () => {
  let clock: ReturnType<typeof vi.useFakeTimers>;

  beforeEach(() => {
    clock = vi.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  it("timeoutPromise", async () => {
    try {
      const timeout = 1000;
      const promise = timeoutPromise(timeout, false);
      clock.tick(timeout);
      await promise;
      assert.fail("Expected promise to reject, but it resolved.");
    } catch (error) {
      assert.isTrue(error instanceof Error);
      assert.equal(error.message, "Operation timeout");
    }
  });
  it("timeoutPromise - silent", async () => {
    try {
      const timeout = 1000;
      const promise = timeoutPromise(timeout, true);
      clock.tick(timeout);
      await promise;
    } catch (error) {
      assert.fail("Expected promise to resolve, but it rejected.");
    }
  });
});
