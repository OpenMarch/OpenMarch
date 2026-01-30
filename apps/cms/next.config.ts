import { withPayload } from "@payloadcms/next/withPayload";

/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ["jose", "pg-cloudflare"],
    webpack: (webpackConfig: import("webpack").Configuration) => {
        if (webpackConfig.resolve) {
            webpackConfig.resolve.extensionAlias = {
                ".cjs": [".cts", ".cjs"],
                ".js": [".ts", ".tsx", ".js", ".jsx"],
                ".mjs": [".mts", ".mjs"],
            };
        }
        return webpackConfig;
    },
};

export default withPayload(nextConfig, { devBundleServerPackages: false });
