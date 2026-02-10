// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
    {
        ignores: ["dist/"]
    },
  ...tseslint.configs.stylistic,
    {
        ignores: ["dist/"]
    },
    {
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
        }
    }
);
