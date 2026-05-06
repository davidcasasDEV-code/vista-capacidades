const path = require("node:path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.resolve(__dirname),
  serverExternalPackages: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/client-lambda",
    "@aws-sdk/lib-dynamodb"
  ]
};

module.exports = nextConfig;
