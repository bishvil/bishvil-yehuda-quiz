import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Force NODE_ENV=test before Vite/plugins evaluate. React 19's package
// entry (`react/index.js`) selects the production CJS bundle when
// `process.env.NODE_ENV === "production"`, and the production bundle
// omits `act`. RTL v16 then crashes with "React.act is not a function"
// on first `render()`. The previous workaround was to set `NODE_ENV=test`
// in the npm test script, but contributors invoking `pnpm exec vitest run`
// directly would inherit whatever NODE_ENV the shell exposed (this server's
// shell exports `NODE_ENV=production` for PM2). The unconditional override
// here, plus the `define` substitution below, guarantees the React 19
// resolver picks the development build that exports `act` regardless of
// how vitest is invoked. Cast away the readonly NODE_ENV literal type from
// Node's typings so the assignment compiles.
(process.env as Record<string, string>).NODE_ENV = "test";

export default defineConfig({
  plugins: [react()],
  // Mirror the env into Vite's text-substitution so the React resolver
  // branch picks the development build that exports `act`.
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
  },
  test: {
    maxWorkers: '50%',
    minWorkers: 1,
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    exclude: [
      "node_modules/**",
      ".next/**",
      "tests/e2e/**",
      "playwright-report/**",
      "test-results/**",
    ],
    css: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
