import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";
import prettierRecommended from "eslint-plugin-prettier/recommended";

const config = defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  prettierRecommended,
  globalIgnores([
    ".next/**",
    ".next-check/**",
    ".next-*/**",
    "node_modules/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "src/data/*.generated.json",
  ]),
]);

export default config;
