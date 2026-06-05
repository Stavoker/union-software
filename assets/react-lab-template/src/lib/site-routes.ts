import type { ComponentType } from "react";
import { HomePage } from "../pages/HomePage";

export const GATEWAY_URL = "https://example.com/gateway";
export const BRAND_NAME = "Brand";

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
