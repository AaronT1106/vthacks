import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
    return [{
      source: "/api/analyze-route",
      destination: `${backendUrl.replace(/\/$/, "")}/api/analyze-route`,
    }];
  },
};

export default nextConfig;
