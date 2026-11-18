import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@atll/types"],
  turbopack: {
    // Monorepo root, so workspace packages resolve.
    root: path.join(__dirname, "..", ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
