import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev server is also reached over 127.0.0.1 (end-to-end runs, local
  // tooling); without this its client assets are refused and pages never hydrate.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
