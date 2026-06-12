/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export — pre-rendered HTML served from CDN, zero Workers CPU.
  output: "export",

  // Trailing slash helps with static asset resolution
  trailingSlash: true,

  // Image optimization disabled (served from Cloudflare cache)
  images: {
    unoptimized: true,
  },

  // Strict mode for better development
  reactStrictMode: true,

  // Disable x-powered-by header
  poweredByHeader: false,

  // Memory optimization for development
  onDemandEntries: {
    maxInactiveAge: 15 * 1000,
    pagesBufferLength: 3,
  },

  // Env variables
  env: {
    SITE_URL: process.env.SITE_URL || "https://n8n-library.com",
    SITE_NAME: "n8n Library",
  },
};

export default nextConfig;
