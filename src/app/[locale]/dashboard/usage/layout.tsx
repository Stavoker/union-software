import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function DashboardUsageLayout({ children }: Props) {
  return <div className="mx-auto w-full max-w-6xl py-10">{children}</div>;
}
