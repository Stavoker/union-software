import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** Каталог з `next.config.ts` = корінь застосунку (важливо, якщо є lockfile «вище» по дереву). */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  /** Native addons — не бандлити (admin-seo SFTP / SSL deploy). */
  serverExternalPackages: ["ssh2", "ssh2-sftp-client"],
  turbopack: {
    root: appRoot,
  },
};

export default withNextIntl(nextConfig);
