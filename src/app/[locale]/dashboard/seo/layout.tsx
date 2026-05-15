import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/** Обмеження ширини як у генератора; стилі Union з кореневого layout / globals.css. */
export default function DashboardSeoLayout({ children }: Props) {
  return <div className="mx-auto w-full max-w-6xl py-10">{children}</div>;
}
