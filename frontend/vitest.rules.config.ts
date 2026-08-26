import { defineConfig, mergeConfig } from "vitest/config"

import baseConfig from "./vitest.config"

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["src/__tests__/firestore.rules.test.ts"],
      exclude: [],
    },
  }),
)
