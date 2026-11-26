import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mqtt", "sharp"],
  // Photos et plan envoyés par formulaire : la limite par défaut (1 Mo, 10 Mo avec le proxy) est trop basse pour une photo de téléphone
  experimental: {
    serverActions: { bodySizeLimit: "30mb" },
    proxyClientMaxBodySize: "30mb",
    // Cache client des pages visitées/préchargées : revenir sur un onglet est instantané (30 s max ; les actions et AutoRefresh rafraîchissent)
    staleTimes: { dynamic: 30, static: 30 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
