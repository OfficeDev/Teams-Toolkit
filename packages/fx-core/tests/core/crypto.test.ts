// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import { SystemError } from "@microsoft/teamsfx-api";
import Cryptr from "cryptr";
import { assert, vi } from "vitest";
import { LocalCrypto } from "../../src/core/crypto";

describe("LocalCrypto", () => {
  const testProjectId = "test-project-123";
  const testPlaintext = "sensitive-data-to-encrypt";
  const prefix = "crypto_";

  let localCrypto: LocalCrypto;
  let fixedCryptr: Cryptr;
  let projectCryptr: Cryptr;

  beforeEach(() => {
    localCrypto = new LocalCrypto(testProjectId);
    fixedCryptr = new Cryptr("teamsfx_global_key");
    projectCryptr = new Cryptr(testProjectId + "_teamsfx");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("encrypt", () => {
    it("should encrypt plaintext with fixed global key and add prefix", () => {
      const result = localCrypto.encrypt(testPlaintext);

      assert.isTrue(result.isOk());
      if (result.isOk()) {
        const encrypted = result.value;
        assert.isTrue(encrypted.startsWith(prefix));

        const encryptedData = encrypted.substr(prefix.length);
        const decrypted = fixedCryptr.decrypt(encryptedData);
        assert.equal(decrypted, testPlaintext);
      }
    });
  });

  describe("decrypt", () => {
    it("should decrypt strings encrypted with fixed global key (new encryption)", () => {
      const encrypted = fixedCryptr.encrypt(testPlaintext);
      const ciphertext = prefix + encrypted;

      const result = localCrypto.decrypt(ciphertext);

      assert.isTrue(result.isOk());
      if (result.isOk()) {
        assert.equal(result.value, testPlaintext);
      }
    });

    it("should decrypt strings encrypted with project-specific key (old encryption fallback)", () => {
      const encrypted = projectCryptr.encrypt(testPlaintext);
      const ciphertext = prefix + encrypted;

      const result = localCrypto.decrypt(ciphertext);

      assert.isTrue(result.isOk());
      if (result.isOk()) {
        assert.equal(result.value, testPlaintext);
      }
    });

    it("should return error when both fixed and project cryptr fail to decrypt", () => {
      const invalidCiphertext = prefix + "invalid-cipher-text-that-cannot-be-decrypted";

      const result = localCrypto.decrypt(invalidCiphertext);

      assert.isTrue(result.isErr());
      if (result.isErr()) {
        assert.instanceOf(result.error, SystemError);
        assert.equal(result.error.source, "Core");
        assert.equal(result.error.name, "DecryptionError");
        assert.equal(result.error.message, "Cipher text is broken");
      }
    });

    it("should successfully encrypt and decrypt data (round trip)", () => {
      const encryptResult = localCrypto.encrypt(testPlaintext);
      assert.isTrue(encryptResult.isOk());

      if (encryptResult.isOk()) {
        const decryptResult = localCrypto.decrypt(encryptResult.value);
        assert.isTrue(decryptResult.isOk());

        if (decryptResult.isOk()) {
          assert.equal(decryptResult.value, testPlaintext);
        }
      }
    });

    it("should handle cross-project compatibility for new encryption", () => {
      const crypto1 = new LocalCrypto("project1");
      const crypto2 = new LocalCrypto("project2");

      // New encryption uses fixed global key, so it works across different project IDs
      const encryptResult = crypto1.encrypt(testPlaintext);
      assert.isTrue(encryptResult.isOk());

      if (encryptResult.isOk()) {
        const decryptResult = crypto2.decrypt(encryptResult.value);
        assert.isTrue(decryptResult.isOk());

        if (decryptResult.isOk()) {
          assert.equal(decryptResult.value, testPlaintext);
        }
      }
    });

    it("should not decrypt legacy data from different project IDs", () => {
      const project1Crypto = new LocalCrypto("project1");
      const project2Crypto = new LocalCrypto("project2");
      assert.isFunction(project1Crypto.decrypt);
      assert.isFunction(project2Crypto.decrypt);
    });
  });
});
