import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // El panel canjea premios en efectivo: sin esto, cualquier sitio
        // podía enmarcarlo en un iframe invisible y usar clickjacking para
        // que el personal, ya con sesión, hiciera clic sin darse cuenta.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
