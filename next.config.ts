import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.PE_BUILD_DIR || ".next",
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  poweredByHeader: false,
  devIndicators: process.env.PE_BUILD_DIR === ".next-e2e" ? false : undefined,
  async redirects() {
    const value = process.env.APP_ORIGIN;
    if (!value) return [];
    const canonical = new URL(value);
    if (
      canonical.protocol !== "https:" ||
      canonical.username ||
      canonical.password ||
      canonical.pathname !== "/" ||
      canonical.search ||
      canonical.hash
    )
      return [];
    // Both public aliases belong to this project. Navigate to the configured
    // origin before login, keeping cookies, CSRF checks and Google OAuth on
    // one host. Do not widen the origins accepted by authenticated mutations.
    return [
      "personal-endurance-app.vercel.app",
      "personal-endurance-app-elfazas-projects.vercel.app",
    ]
      .filter((host) => host !== canonical.hostname)
      .map((host) => ({
        source: "/:path*",
        has: [{ type: "host" as const, value: host.replaceAll(".", "\\.") }],
        destination: `${canonical.origin}/:path*`,
        permanent: false,
      }));
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
};
export default config;
