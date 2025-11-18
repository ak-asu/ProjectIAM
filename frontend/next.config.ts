import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
