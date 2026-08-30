import type { NextConfig } from "next";
import path from "path";

const pages = process.env.GITHUB_PAGES === "true";
const repo = "Monday.com-Business-Intelligence-Agent-E-Tharun-";

const nextConfig: NextConfig = {
  serverExternalPackages: ["xlsx"],
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    "/api/chat": ["./data/monday-snapshot.json"],
    "/api/briefing": ["./data/monday-snapshot.json"],
    "/api/status": ["./data/monday-snapshot.json"],
  },
  devIndicators: false,
  ...(pages
    ? {
        output: "export" as const,
        trailingSlash: true,
        images: { unoptimized: true },
        basePath: `/${repo}`,
        assetPrefix: `/${repo}`,
      }
    : {}),
};

export default nextConfig;
