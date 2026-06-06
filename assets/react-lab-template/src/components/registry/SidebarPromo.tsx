type Props = {
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function SidebarPromo({ title, body, ctaLabel = "Подробнее", ctaHref = "#" }: Props) {
  return (
    <div className="rounded-xl border border-brand-accent/20 bg-brand-block p-4">
      <p className="text-sm font-semibold text-brand-accent">{title}</p>
      {body ? <p className="mt-2 text-xs text-brand-muted">{body}</p> : null}
      <a href={ctaHref} className="mt-3 inline-block text-xs font-medium text-brand-accent hover:underline">
        {ctaLabel}
      </a>
    </div>
  );
}
