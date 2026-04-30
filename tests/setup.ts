import "@testing-library/jest-dom/vitest";

// Ensure server-only env vars used by route handlers exist when tests
// import them. Values match the local Supabase stack and the .env.local
// CRON_SECRET — they are NOT secrets in any meaningful sense.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??=
  "<redacted-local-anon-jwt>";
process.env.SUPABASE_SERVICE_ROLE_KEY ??=
  "<redacted-local-service-role-jwt>";
process.env.CRON_SECRET ??= "local-test-cron-secret-bishvil";
