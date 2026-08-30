import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["xlsx"],
  outputFileTracingRoot: path.join(__dirname),
  devIndicators: false,
};

export default nextConfig;
