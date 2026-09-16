import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const isStaticPages = process.env.CF_PAGES_STATIC === "1";

const nextConfig: NextConfig = {
  ...(isStaticPages ? { output: "export" as const } : {}),
  typescript: {
    ignoreBuildErrors: isStaticPages,
  },
  images: {
    dangerouslyAllowSVG: true,
    unoptimized: true,
  },
  serverExternalPackages: ["sharp", "@img/sharp-win32-x64", "@img/sharp-linux-x64"],
};

export default nextConfig;

if (!isStaticPages) {
  initOpenNextCloudflareForDev();
}
