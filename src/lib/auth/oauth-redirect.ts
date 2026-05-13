const UNSAFE_LOCAL_HOSTS = new Set(["0.0.0.0", "::", "[::]"]);

export function buildOAuthCallbackUrl(
  path: string,
  params: Record<string, string>,
): string {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const base =
    configuredOrigin && configuredOrigin.length > 0
      ? configuredOrigin
      : normalizeBrowserOrigin(window.location.origin);
  const url = new URL(path, base);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function normalizeBrowserOrigin(origin: string): string {
  const url = new URL(origin);
  if (UNSAFE_LOCAL_HOSTS.has(url.hostname)) {
    url.hostname = "localhost";
  }
  return url.toString();
}
