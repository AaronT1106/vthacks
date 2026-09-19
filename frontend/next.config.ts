import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
    const normalizedBackendUrl = backendUrl.replace(/\/$/, "");
    return [
      {
        source: "/api/analyze-route",
        destination: `${normalizedBackendUrl}/api/analyze-route`,
      },
      {
        source: "/api/satellite-imagery",
        destination: `${normalizedBackendUrl}/api/satellite-imagery`,
      },
      {
        source: "/api/analyze-damage",
        destination: `${normalizedBackendUrl}/analyze-damage`,
      },
    ];
  },
};

export default nextConfig;
