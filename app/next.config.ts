import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // wagmi pulls in a few optional connectors we don't use
  webpack: (cfg) => {
    cfg.externals.push("pino-pretty", "lokijs", "encoding");
    return cfg;
  },
};

export default config;
