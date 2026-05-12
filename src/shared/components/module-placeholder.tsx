import type { ReactNode } from "react";

type Props = {
  title: string;
  description: string;
  children?: ReactNode;
};

export function ModulePlaceholder({ title, description, children }: Props) {
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-union-border bg-union-surface/50 p-8 shadow-[0_24px_80px_-40px_rgb(0_0_0_/_0.75)] backdrop-blur-xl">
      <p className="text-xs font-medium uppercase tracking-wider text-union-accent">
        Union
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-union-text">
        {title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-union-muted">
        {description}
      </p>
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
