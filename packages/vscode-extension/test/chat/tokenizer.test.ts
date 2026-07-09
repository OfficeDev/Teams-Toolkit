import { Tokenizer } from "../../src/chat/tokenizer";
import { vi, assert } from "vitest";

describe("Tokenizer", () => {
  it("getInstance", () => {
    const instance = Tokenizer.getInstance();
    assert.isDefined(instance);
  });

  it("tokenize", () => {
    const tokenizer = new Tokenizer();
    const initStub = vi.spyOn(tokenizer as any, "initTokenize").mockReturnValue({
      encode: () => [1, 2, 3],
    } as any);

    const result = tokenizer.tokenize("Hello world!");
    assert.deepStrictEqual(result, [1, 2, 3]);
    assert.isTrue(initStub.calledOnce);
  });

  describe("tokenLength", () => {
    it("empty content", () => {
      const tokenizer = new Tokenizer();
      const result = tokenizer.tokenLength("");
      assert.equal(result, 0);
    });

    it("non-empty content", () => {
      const tokenizer = new Tokenizer();
      const initStub = vi.spyOn(tokenizer as any, "initTokenize").mockReturnValue({
        encode: () => [4, 5, 6],
      } as any);

      const result = tokenizer.tokenLength("Hello world!");
      assert.equal(result, 3);
      assert.isTrue(initStub.calledOnce);
    });
  });
});
