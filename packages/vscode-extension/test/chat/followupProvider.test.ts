import { ChatFollowup } from "vscode";
import { DefaultNextStep } from "../../src/chat/consts";
import { TeamsFollowupProvider } from "../../src/chat/followupProvider";
import { CancellationToken } from "../mocks/vsc";
import { vi, expect } from "vitest";

describe("chat followup provider", () => {
  describe("getInstance()", () => {
    afterEach(async () => {
      vi.restoreAllMocks();
    });

    it("create instance if not existed", async () => {
      const instance = TeamsFollowupProvider.getInstance();
      expect(instance).to.be.an.instanceof(TeamsFollowupProvider);
    });
  });

  describe("clearFollowups()", () => {
    afterEach(async () => {
      vi.restoreAllMocks();
    });

    it("clear followups", async () => {
      const instance = TeamsFollowupProvider.getInstance();
      instance["followups"] = [{ prompt: "fakePrompt" }];
      instance.clearFollowups();
      expect(instance["followups"]).to.be.empty;
    });
  });

  describe("addFollowups()", () => {
    afterEach(async () => {
      vi.restoreAllMocks();
    });

    it("add followups", async () => {
      const instance = TeamsFollowupProvider.getInstance();
      const testFollowupCommands: ChatFollowup[] = [
        { prompt: "fakePrompt" },
        { prompt: "fakePrompt2" },
      ];
      instance.addFollowups(testFollowupCommands);
      expect(instance["followups"]).to.deep.equal(testFollowupCommands);
    });
  });

  describe("provideFollowups()", () => {
    afterEach(async () => {
      vi.restoreAllMocks();
    });

    it("provide default followup if empty", async () => {
      const instance = TeamsFollowupProvider.getInstance();
      instance["followups"] = [];
      const result = instance.provideFollowups({}, { history: [] }, new CancellationToken());
      expect(result).to.deep.equal([DefaultNextStep]);
    });

    it("provide followups", async () => {
      const instance = TeamsFollowupProvider.getInstance();
      const testFollowupCommands: ChatFollowup[] = [
        { prompt: "fakePrompt" },
        { prompt: "fakePrompt2" },
      ];
      instance["followups"] = testFollowupCommands;
      const result = instance.provideFollowups({}, { history: [] }, new CancellationToken());
      expect(result).to.deep.equal(testFollowupCommands);
    });
  });
});
