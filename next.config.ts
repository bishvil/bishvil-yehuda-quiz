import type { NextConfig } from "next";

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
};

export default nextConfig;
