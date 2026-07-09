// When ESLINT_FAST is set (e.g. by the pre-commit hook) skip type-aware linting:
// omit `parserOptions.project` so typescript-eslint does not build a full
// TypeScript program per package, which is the dominant lint cost. The five
// type-requiring rules below are dropped in this mode; CI still runs them.
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
        "@typescript-eslint/no-unnecessary-type-assertion": "error",
        "@typescript-eslint/no-for-in-array": "error",
        "@typescript-eslint/no-implied-eval": "error",
        "@typescript-eslint/restrict-plus-operands": "error",
        "@typescript-eslint/restrict-template-expressions": "error",
      },
    };
