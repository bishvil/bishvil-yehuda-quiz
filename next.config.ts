import type { NextConfig } from "next";

// Derive the Supabase Storage origin from the public URL env var.
// Falls back to a placeholder and emits a warning so builds don't fail when
// the var is absent (e.g. CI without secrets), but images won't be optimised
// until a real host is configured.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseHostname: string;
let supabaseProtocol: "http" | "https";
let supabasePort: string;

if (supabaseUrl) {
  const parsed = new URL(supabaseUrl);
  supabaseHostname = parsed.hostname;
  supabaseProtocol = parsed.protocol === "https:" ? "https" : "http";
  supabasePort = parsed.port;
} else {
  console.warn(
    "[next.config] NEXT_PUBLIC_SUPABASE_URL is not set — " +
      "falling back to placeholder hostname for images.remotePatterns. " +
      "Image optimization will not work until the env var is configured.",
  );
  supabaseHostname = "placeholder.supabase.co";
  supabaseProtocol = "https";
  supabasePort = "";
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Allow HMR (hot-module reload) WebSocket from the Tailscale hostname.
  // Without this Next.js blocks /_next/webpack-hmr for cross-origin hosts
  // and the mobile browser never receives JS updates after a code change.
  allowedDevOrigins: ["instance-neo"],
  // Extended in-memory page lifetime — helpful for long-lived PM2 dev sessions
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
  },
  images: {
    remotePatterns: [
      {
        // Supabase Storage public bucket — scope to storage paths only so we
        // don't open the wildcard to non-Storage Supabase routes.
        protocol: supabaseProtocol,
        hostname: supabaseHostname,
        port: supabasePort,
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
