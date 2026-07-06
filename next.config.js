/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "i.namu.wiki" },
    ],
  },
  allowedDevOrigins: ["172.30.1.*", "192.168.0.*"],
};

module.exports = nextConfig;
