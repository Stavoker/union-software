import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/shared/components/locale-switcher";
import { UnionLogo } from "@/shared/components/union-logo";

type Props = {
  metaTitle: string;
};

export function HelpPageTopBar({ metaTitle }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-union-border bg-union-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between px-4 py-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <UnionLogo />
          <span className="text-sm font-semibold tracking-tight text-union-text">
            {metaTitle}
          </span>
        </Link>
        <LocaleSwitcher />
      </div>
    </header>
  );
}

type IntroProps = {
  backHref?: string;
  backLabel: string;
  title: string;
  lead: string;
};

export function HelpPageIntro({ backHref = "/", backLabel, title, lead }: IntroProps) {
  return (
    <>
      <Link
        href={backHref}
        className="text-sm font-medium text-[#d1fe17] transition-opacity hover:opacity-85"
      >
        ← {backLabel}
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-union-text">{title}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-union-muted">{lead}</p>
    </>
  );
}
