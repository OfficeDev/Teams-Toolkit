import eslintConfigPrettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import-x";
import noSecrets from "eslint-plugin-no-secrets";
import globals from "globals";
import tseslint from "typescript-eslint";

// When ESLINT_FAST is set (e.g. by the pre-commit hook) skip the whole-graph
// cyclic-import check, which traverses the entire import graph and is expensive.
// CI still runs it.
const fast = !!process.env.ESLINT_FAST;

export default [
  {
    ignores: ["build/**", "lib/**", "dist/**", "out/**", "coverage/**"],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
  },
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    ...importPlugin.flatConfigs.typescript,
    settings: {
      ...importPlugin.flatConfigs.typescript.settings,
      "import-x/resolver": { node: true },
    },
  },
  {
    plugins: {
      "no-secrets": noSecrets,
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unused-expressions": "off",
      "@typescript-eslint/no-duplicate-enum-values": "warn",
      "@typescript-eslint/no-unsafe-declaration-merging": "warn",
      "import-x/no-cycle": fast
        ? "off"
        : [
            "error",
            {
              maxDepth: Infinity,
              ignoreExternal: true,
            },
          ],
      "import-x/no-unresolved": ["warn"],
      "no-secrets/no-secrets": [
        "warn",
        {
          additionalRegexes: {
            "Basic Auth": "Authorization: Basic [A-Za-z0-9+/=]*",
            "Common Pattern":
              "^(?=.*[A-Za-z])(?=.*[0-9])(?=.*[@$!%*#?&])[A-Za-z0-9@$!%*#?&~-]{8,}$",
          },
        },
      ],
    },
  },
  // Keep last: turns off all ESLint rules that conflict with Prettier so Prettier is
  // the single source of truth for formatting (approach B: eslint = quality, prettier =
  // formatting, run as separate tools).
  eslintConfigPrettier,
];
