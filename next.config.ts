import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.1.11", "127.0.0.1"],
  // hide the Next.js dev badge in the corner while running `npm run dev`
  devIndicators: false,
};

export default nextConfig;
