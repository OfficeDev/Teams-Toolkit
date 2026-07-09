// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import * as crypto from "crypto";
import * as path from "path";
import { getResourceFolder } from "../../folder";
import AdmZip from "adm-zip";

/**
 * Bloom Filter is used to check whether a word is in the dictionary with less memory usage than normal hash map.
 */
export class BloomFilter {
  private size = 100000000;
  private bitArray: Uint8Array;
  private numHashFunctions = 7;

  constructor() {
    this.bitArray = new Uint8Array(this.size);
  }

  private hash(word: string, seed: number): number {
    const hash = crypto.createHash("sha256");
    hash.update(`${word}${seed}`);
    return parseInt(hash.digest("hex").slice(0, 8), 16) % this.size;
  }

  public add(word: string): void {
    for (let i = 0; i < this.numHashFunctions; i++) {
      const index = this.hash(word, i);
      this.bitArray[index] = 1;
    }
  }

  public contains(word: string): boolean {
    for (let i = 0; i < this.numHashFunctions; i++) {
      const index = this.hash(word, i);
      if (this.bitArray[index] === 0) {
        return false;
      }
    }
    return true;
  }

  //   public saveToFile(filename: string): void {
  //     fs.writeFileSync(filename, this.bitArray);
  //   }

  //   public static loadFromFile(filename: string): BloomFilter {
  //     const bitArray = new Uint8Array(fs.readFileSync(filename));
  //     const bloomFilter = new BloomFilter();
  //     bloomFilter.bitArray = bitArray;
  //     return bloomFilter;
  //   }

  public static loadFromZipFile(zipFilename: string): BloomFilter {
    // Read the zip file into memory
    const zip = new AdmZip(zipFilename);

    // Get the entries in the zip file
    const zipEntries = zip.getEntries();

    // Assuming the first file in the zip is the bit array file
    const bitArrayFile = zipEntries[0];

    // Read the content of the file as a buffer
    const fileContents = bitArrayFile.getData();

    // Create a new BloomFilter instance and populate it
    const bloomFilter = new BloomFilter();
    bloomFilter.bitArray = new Uint8Array(fileContents);

    return bloomFilter;
  }
}

class DictionaryMatcher {
  bloomFilter: BloomFilter;
  constructor() {
    this.bloomFilter = BloomFilter.loadFromZipFile(path.join(getResourceFolder(), "dict.zip"));
  }
  match(text: string): "exact" | "contains" | "none" {
    const input = trimNonAlphabetChars(text);
    if (this.bloomFilter.contains(input)) {
      return "exact";
    }
    return "none";
  }
}

export function trimNonAlphabetChars(token: string): string {
  // Regular expression to match non-alphabet characters at the beginning and end.
  // The positive lookbehind (?<=[a-zA-Z]) pins the trailing match to start right after
  // an alphabet char, removing the start-position ambiguity that caused quadratic
  // backtracking (ReDoS) on long runs of trailing non-alphabet characters.
  return token.replace(/^[^a-zA-Z]+|(?<=[a-zA-Z])[^a-zA-Z]+$/g, "");
}

export const dictMatcher = new DictionaryMatcher();
