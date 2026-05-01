import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // Extended in-memory page lifetime — helpful for long-lived PM2 dev sessions
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
  },
};

export default nextConfig;
