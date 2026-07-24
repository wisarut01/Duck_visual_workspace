import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  allowedDevOrigins: ["192.168.1.41"],
};

export default nextConfig;
