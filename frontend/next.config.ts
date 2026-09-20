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
        source: "/api/satellite-imagery/preview/:path*",
        destination: `${normalizedBackendUrl}/api/satellite-imagery/preview/:path*`,
      },
      {
        source: "/api/analyze-damage/satellite",
        destination: `${normalizedBackendUrl}/analyze-damage/satellite`,
      },
      {
        source: "/api/analyze-damage",
        destination: `${normalizedBackendUrl}/analyze-damage`,
      },
      {
        source: "/api/analyze-flood",
        destination: `${normalizedBackendUrl}/api/analyze-flood`,
      },
      {
        source: "/api/flood-analysis/mask/:path*",
        destination: `${normalizedBackendUrl}/api/flood-analysis/mask/:path*`,
      },
      {
        source: "/api/fire-hotspots",
        destination: `${normalizedBackendUrl}/api/fire-hotspots`,
      },
    ];
  },
};

export default nextConfig;
