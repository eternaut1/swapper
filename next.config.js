/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@stylexjs/stylex'],

  // Next.js 16+ optimizations
  experimental: {
    // Enable React Server Actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Enable Partial Prerendering (replaces experimental.ppr in Next.js 16)
  cacheComponents: true,

  // Production optimizations
  compiler: {
    // Remove console logs in production
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? {
            exclude: ['error', 'warn'],
          }
        : false,
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
};

module.exports = nextConfig;
