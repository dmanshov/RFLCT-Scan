/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.immoweb.be' },
      { protocol: 'https', hostname: '**.immoweb-cdn.be' },
      { protocol: 'https', hostname: 'picture.immoweb.be' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@react-pdf/renderer'],
  },
};

module.exports = nextConfig;
