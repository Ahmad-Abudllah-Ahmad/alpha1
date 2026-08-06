import type { NextConfig } from "next";

const TAKEOFF_ORIGIN = process.env.OPENTAKEOFF_ORIGIN || "http://127.0.0.1:5173";

const nextConfig: NextConfig = {
  // Allow LAN devices (e.g. a colleague on the same Wi-Fi) to load /_next/*
  // dev assets without the cross-origin warning. Dev-only; ignored in prod.
  allowedDevOrigins: ["192.168.1.40", "192.168.1.*"],

  // Proxy OpenTakeoff (Vite base `/takeoff/`) so the Estimation iframe is same-origin.
  async rewrites() {
    return [
      {
        source: "/takeoff",
        destination: `${TAKEOFF_ORIGIN}/takeoff/`,
      },
      {
        source: "/takeoff/:path*",
        destination: `${TAKEOFF_ORIGIN}/takeoff/:path*`,
      },
    ];
  },
};

export default nextConfig;
