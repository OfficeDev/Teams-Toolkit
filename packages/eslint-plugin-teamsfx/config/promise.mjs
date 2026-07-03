// When ESLINT_FAST is set (e.g. by the pre-commit hook) skip these type-aware
// promise rules; they require `parserOptions.project`, which forces
// typescript-eslint to build a full TypeScript program. CI still runs them.
const fast = !!process.env.ESLINT_FAST;

export default fast
  ? {}
  : {
      languageOptions: {
        parserOptions: {
          project: ["./tsconfig.eslint.json"],
        },
      },
      rules: {
        "@typescript-eslint/await-thenable": "error",
        "@typescript-eslint/no-floating-promises": "warn",
        "@typescript-eslint/no-misused-promises": [
          "error",
          { checksVoidReturn: { arguments: false } },
        ],
        "@typescript-eslint/require-await": "error",
      },
    };
