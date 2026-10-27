/** @type {import('next').NextConfig} */
const nextConfig = {
  // The coach UI is a static page in /public. Serve it at the site root.
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }];
  },
};

export default nextConfig;
