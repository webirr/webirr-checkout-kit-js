/** @type {import('next').NextConfig} */
const path = require("path");

const clientSdksRoot = path.resolve(__dirname, "../../..");

const nextConfig = {
  experimental: {
    externalDir: true
  },
  outputFileTracingRoot: clientSdksRoot,
  turbopack: {
    root: clientSdksRoot
  }
};

module.exports = nextConfig;
