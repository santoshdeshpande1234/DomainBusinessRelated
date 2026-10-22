import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // CSV prospect imports are capped at 1 MB in the action; leave room for form overhead.
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
};

export default nextConfig;
