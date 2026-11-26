import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["mqtt", "sharp"],
  // Photos et plan envoyés par formulaire : la limite par défaut (1 Mo, 10 Mo avec le proxy) est trop basse pour une photo de téléphone
  experimental: {
    serverActions: { bodySizeLimit: "30mb" },
    proxyClientMaxBodySize: "30mb",
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
