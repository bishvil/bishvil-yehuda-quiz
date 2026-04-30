import { createRequire } from "node:module";
import eslintConfigPrettier from "eslint-config-prettier";

const require = createRequire(import.meta.url);
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");
const nextTypeScript = require("eslint-config-next/typescript");

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "coverage/**",
      "playwright-report/**",
      "test-results/**",
      "next-env.d.ts",
      // Pre-existing handoff folders from earlier project phases. They are
      // reference material, not app source, and live under their own tooling.
      "_design-system/**",
      "_prototype/**",
      ".agendo/**",
      "logs/**",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypeScript,
  eslintConfigPrettier,
];

export default eslintConfig;
