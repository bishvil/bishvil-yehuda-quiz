type RequiredEnvironmentVariableName =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "CRON_SECRET";

export function getRequiredEnvironmentVariable(
  name: RequiredEnvironmentVariableName,
): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function getOptionalEnvironmentVariable(
  name: RequiredEnvironmentVariableName,
): string | null {
  return process.env[name] ?? null;
}
