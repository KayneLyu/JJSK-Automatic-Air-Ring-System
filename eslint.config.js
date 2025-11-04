import eslint from '@eslint/js'
import tsEslint from 'typescript-eslint'
import { defineConfig } from 'eslint/config'
import { fixupPluginRules } from '@eslint/compat'

import eslintConfigPrettier from 'eslint-config-prettier/flat'
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended'
import neverthrow from 'eslint-plugin-neverthrow'

export default defineConfig([
  eslint.configs.recommended,
  tsEslint.configs.recommended,
  eslintConfigPrettier,
  eslintPluginPrettierRecommended,
  {
    plugins: {
      neverthrow: fixupPluginRules(neverthrow),
    },
  },
])
