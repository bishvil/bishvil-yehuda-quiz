import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  devIndicators: {
    appIsrStatus: true,
  },
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
  },
  experimental: {
    allowedHosts: ['instance-neo'],
  },
};

export default nextConfig;
