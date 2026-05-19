import type { ReactNode } from "react";

import { HelpPageTopBar } from "@/shared/components/help/help-page-header";

type Props = {
  metaTitle: string;
  children: ReactNode;
};

/** Horizontal padding and content width aligned with /dashboard layouts. */
export function HelpPageFrame({ metaTitle, children }: Props) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <HelpPageTopBar metaTitle={metaTitle} />
      <main className="flex-1 px-4 md:px-8">
        <div className="mx-auto w-full max-w-6xl py-10">{children}</div>
      </main>
    </div>
  );
}
