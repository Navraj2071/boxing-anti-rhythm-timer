import type { NextConfig } from "next";

// Fully static, client-side app: `next build` emits plain files to ./out.
const nextConfig: NextConfig = {
  output: "export",
  reactStrictMode: true,
};

export default nextConfig;
