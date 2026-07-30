/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: true,
    qualities: [25, 50, 75, 100],
  },
  async redirects() {
    return [
      {
        source: "/rewards/fulfilment",
        destination: "/fulfilment/queue",
        permanent: true,
      },
      {
        source: "/rewards/fulfilment/:id",
        destination: "/fulfilment/queue/:id",
        permanent: true,
      },
      {
        source: "/rewards/resource-pools",
        destination: "/fulfilment/resource-pools",
        permanent: true,
      },
      {
        source: "/rewards/partners",
        destination: "/fulfilment/partners",
        permanent: true,
      },
      {
        source: "/rewards/partners/create",
        destination: "/fulfilment/partners/create",
        permanent: true,
      },
      {
        source: "/rewards/partners/:id",
        destination: "/fulfilment/partners/:id",
        permanent: true,
      },
      {
        source: "/rewards/organisations",
        destination: "/fulfilment/organisations",
        permanent: true,
      },
      {
        source: "/settings/authorization",
        destination: "/authorization",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
