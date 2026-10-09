import type { NextConfig } from "next";

// A fully static app: `next build` writes plain files to ./out. There is no server, no API and no environment variables.
const config: NextConfig = {
  output: "export",
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
  allowedDevOrigins: ["127.0.0.1"],
  images: { unoptimized: true },
};

export default config;
