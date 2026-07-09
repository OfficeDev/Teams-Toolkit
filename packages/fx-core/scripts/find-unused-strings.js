const fs = require("fs");
const path = require("path");
const AhoCorasick = require("ahocorasick");
const jsonFilePath = process.argv[2];
const dirPaths = process.argv.slice(3);
const json = require(path.resolve(jsonFilePath));
const patterns = [];
const allKeys = Object.keys(json).filter((key) => !key.startsWith("_"));
const allKeySet = new Set(allKeys);
for (const key of allKeys) {
  patterns.push(`'${key}'`);
  patterns.push(`"${key}"`);
  patterns.push(`\`${key}\``);
}
const ac = new AhoCorasick(patterns);
function traverseDirectory(dirPath) {
  fs.readdirSync(dirPath).forEach(function (file) {
    const filePath = path.join(dirPath, file);
    if (file.endsWith(".ts") || file.endsWith(".json")) {
      const content = fs.readFileSync(filePath, "utf8");
      const results = ac.search(content);
      for (const result of results) {
        const key = result[1][0];
        foundKeySet.add(key.substring(1, key.length - 1));
      }
    }
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      traverseDirectory(filePath);
    }
  });
}
const foundKeySet = new Set();
for (const dirPath of dirPaths) {
  traverseDirectory(dirPath);
}
const unusedKeys = [];
for (const key of allKeySet.values()) {
  if (!foundKeySet.has(key)) {
    unusedKeys.push(key);
  }
}
if (unusedKeys.length > 0) {
  console.log("found unused keys: " + unusedKeys.join(","));
  process.exit(1);
}
