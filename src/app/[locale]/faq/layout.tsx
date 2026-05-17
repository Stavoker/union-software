import type { ReactNode } from "react";

import { AppFooter } from "@/shared/components/app-footer";

type Props = {
  children: ReactNode;
};

export default function FaqLayout({ children }: Props) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {children}
      <div className="mt-20 md:mt-28">
        <AppFooter />
      </div>
    </div>
  );
}
