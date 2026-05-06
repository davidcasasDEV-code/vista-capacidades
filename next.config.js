/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: [
    "@aws-sdk/client-dynamodb",
    "@aws-sdk/client-lambda",
    "@aws-sdk/lib-dynamodb"
  ]
};

module.exports = nextConfig;
