import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // The parent "AI Engineering" folder has its own package-lock.json,
  // so tell Next.js that this folder is the project root.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
