/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
    qualities: [25, 50, 75, 100],
  },
};

export default nextConfig;
