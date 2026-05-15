import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/** Ті самі відступи та ширина, що на /dashboard/seo. */
export default function DashboardDomainLayout({ children }: Props) {
  return <div className="mx-auto w-full max-w-6xl py-10">{children}</div>;
}
