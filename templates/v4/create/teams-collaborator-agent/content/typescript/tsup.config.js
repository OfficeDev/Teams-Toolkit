/** @type {import('tsup').Options} */
module.exports = {
  dts: true,
  minify: false,
  bundle: true,
  sourcemap: true,
  treeshake: true,
  splitting: false,
  clean: true,
  outDir: "dist",
  entry: ["src/index.ts"],
  format: ["cjs"],
};
