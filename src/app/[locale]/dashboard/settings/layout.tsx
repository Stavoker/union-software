import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/** Ті самі відступи та ширина, що на /dashboard/seo та /dashboard/domain. */
export default function DashboardSettingsLayout({ children }: Props) {
  return <div className="mx-auto w-full max-w-6xl py-10">{children}</div>;
}
