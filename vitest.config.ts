import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Test-only secrets: production code has no hardcoded fallbacks and requires these.
    env: {
      JWT_SECRET: "vitest-only-jwt-secret-000000000000000000",
      BUS_ROLLING_SECRET_KEY: "vitest-only-rolling-secret-00000",
      STUDENT_PASS_SECRET: "vitest-only-student-pass-secret-000000000",
      PAYROLL_ENCRYPTION_KEY: "vitest-only-payroll-encryption-key",
      CRON_SECRET: "vitest-only-cron-secret",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
