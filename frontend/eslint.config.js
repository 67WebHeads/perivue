import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig } from "eslint/config";

export default defineConfig([
  js.configs.recommended,

  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      // disable base rule
      "no-unused-vars": "off",

      // use react-aware version instead
      "react/jsx-uses-vars": "error",

      // keep your existing rules
      "no-undef": "error",
      "no-redeclare": "error",
      "no-unreachable": "error",
      "no-dupe-keys": "error",

      "react/react-in-jsx-scope": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      "no-console": "warn",
      "semi": ["warn", "always"],
      "quotes": ["warn", "double"],
    }
  },
]);