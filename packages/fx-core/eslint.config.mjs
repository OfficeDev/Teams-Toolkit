import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { createNodeResolver } from "eslint-plugin-import-x";
import header from "../eslint-plugin-teamsfx/config/header.mjs";
import promise from "../eslint-plugin-teamsfx/config/promise.mjs";
import shared from "../eslint-plugin-teamsfx/config/shared.mjs";
import typeConfig from "../eslint-plugin-teamsfx/config/type.mjs";

export default [
  {
    ignores: ["templates/plugins/resource/spfx/**", "src/plugins/resource/spfx/authCode.ts"],
  },
  ...shared,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({ project: "./tsconfig.eslint.json" }),
        createNodeResolver(),
      ],
    },
  },
  {
    rules: {
      "import-x/default": "off",
      "import-x/namespace": "off",
    },
  },
  {
    files: ["src/**/index.ts"],
    rules: {
      "import-x/export": "off",
    },
  },
  { files: ["src/**/*.ts"], ...header },
  { files: ["src/**/*.ts"], ...promise },
  { files: ["src/**/*.ts"], ...typeConfig },
];
