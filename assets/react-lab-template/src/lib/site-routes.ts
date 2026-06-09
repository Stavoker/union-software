import type { ComponentType } from "react";
import { HomePage } from "../pages/HomePage";

export const GATEWAY_URL = "https://example.com/gateway";
export const BRAND_NAME = "Brand";
export const LOGO_SRC = "./img/logo.png";
export const GAME_IMAGE_PATHS: string[] = [];
export const BANNER_IMAGE_PATHS: string[] = [];
export const PAYMENT_IMAGE_PATHS: string[] = [];
/** sidebar-left | sidebar-right | top-nav | top-nav-inline */
export const SITE_LAYOUT = "sidebar-left";
export const HOME_TEMPLATE_ID = "classic";
export const LAYOUT_CHROME_TEMPLATE_ID = "sidebar-01";
export const LAYOUT_CHROME_STYLE: Record<string, unknown> = {};
export const SEO_KEYWORDS: string[] = [];

export type SiteRoute = {
  path: string;
  navLabel: string;
  title: string;
  description: string;
  Component: ComponentType;
};

export const siteRoutes: SiteRoute[] = [
  {
    path: "/",
    navLabel: "Главная",
    title: "Главная",
    description: "Добро пожаловать",
    Component: HomePage,
  },
];
