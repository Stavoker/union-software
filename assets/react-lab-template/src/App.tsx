import { Routes, Route } from "react-router-dom";
import { SiteLayout } from "./components/SiteLayout";
import { siteRoutes } from "./lib/site-routes";

export default function App() {
  return (
    <SiteLayout>
      <Routes>
        {siteRoutes.map((r) => (
          <Route key={r.path} path={r.path} element={<r.Component />} />
        ))}
      </Routes>
    </SiteLayout>
  );
}
