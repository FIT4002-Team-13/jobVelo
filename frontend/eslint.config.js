import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,jsx}"], plugins: { js }, extends: ["js/recommended"], languageOptions: { globals: globals.browser } },
  { files: ["src/test/**"], languageOptions: { globals: { ...globals.node, ...globals.browser, test: true, expect: true, describe: true, it: true, beforeEach: true, afterEach: true, beforeAll: true, afterAll: true } } },
  {
    ...pluginReact.configs.flat.recommended,
    settings: { react: { version: "detect" } },
    rules: {
      ...pluginReact.configs.flat.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
  },
  reactHooks.configs.flat.recommended,
  {
    // React Compiler rules (new in react-hooks v7). The app doesn't use the
    // compiler and these flag long-standing patterns, so warn instead of fail.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
]);
