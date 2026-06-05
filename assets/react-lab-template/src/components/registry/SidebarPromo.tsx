type Props = {
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export function SidebarPromo({ title, body, ctaLabel = "Подробнее", ctaHref = "#" }: Props) {
  return (
    <div className="rounded-xl border border-lime-400/25 bg-lime-400/5 p-4">
      <p className="text-sm font-semibold text-lime-200">{title}</p>
      {body ? <p className="mt-2 text-xs text-zinc-400">{body}</p> : null}
      <a href={ctaHref} className="mt-3 inline-block text-xs font-medium text-lime-300 hover:underline">
        {ctaLabel}
      </a>
    </div>
  );
}
