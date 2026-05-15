import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "uk", "ru"],
  defaultLocale: "en",
  localePrefix: "always",
  /** Після виходу та при заході на / — памʼятати останню мову (UA/EN/RU). */
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});
