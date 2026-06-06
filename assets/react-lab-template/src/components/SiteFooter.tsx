import { GATEWAY_URL, BRAND_NAME, LOGO_SRC, siteRoutes } from "../lib/site-routes";

const PAYMENT_METHODS = [
  { name: "Visa", label: "Visa" },
  { name: "Mastercard", label: "Mastercard" },
  { name: "МИР", label: "МИР" },
  { name: "СБП", label: "СБП" },
  { name: "Bitcoin", label: "BTC" },
  { name: "USDT", label: "USDT" },
  { name: "Ethereum", label: "ETH" },
  { name: "Skrill", label: "Skrill" },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  const multiPage = siteRoutes.length > 1;
  const navLinks = siteRoutes.slice(0, 8);

  return (
    <>
      <section className="mx-4 mb-0 mt-12 rounded-2xl border border-brand-accent/15 bg-brand-block px-5 py-6 lg:mx-8 lg:px-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-brand-accent">Правила и условия</h2>
        <div className="mt-3 space-y-2 text-xs leading-relaxed text-brand-muted">
          <p>
            Информация на сайте {BRAND_NAME} носит ознакомительный характер и не является публичной офертой.
            Условия бонусов, лимиты ставок, сроки верификации и перечень доступных платёжных методов уточняются в
            личном кабинете после регистрации.
          </p>
          <p>
            Участие в азартных играх разрешено только совершеннолетним пользователям (18+). Играйте ответственно.
          </p>
        </div>
      </section>

      <footer className="mt-8 border-t border-brand-accent/15 bg-brand-card">
        <div className="px-4 py-10 lg:px-8">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] lg:grid-cols-[1.2fr_1fr_1fr]">
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <img src={LOGO_SRC} alt={BRAND_NAME} className="h-10 w-auto" width={120} height={40} />
                  <span className="text-sm font-semibold tracking-wide">{BRAND_NAME}</span>
                </div>
                <p className="max-w-md text-sm leading-relaxed text-brand-muted">
                  {BRAND_NAME} — игровая платформа с быстрыми выплатами, защищёнными транзакциями и круглосуточной
                  поддержкой.
                </p>
                <a href={GATEWAY_URL} className="btn-brand px-5 py-2 text-sm">
                  Регистрация
                </a>
              </div>

              {multiPage ? (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Разделы сайта</h3>
                  <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                    {navLinks.map((r) => (
                      <li key={r.path}>
                        <a
                          href={r.path === "/" ? "./" : `.${r.path}`}
                          className="text-sm text-brand-text transition-colors hover:text-brand-accent"
                        >
                          {r.navLabel}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Сервис</h3>
                  <ul className="mt-4 space-y-2 text-sm text-brand-muted">
                    <li>Игровой каталог и слоты</li>
                    <li>Бонусы и акции</li>
                    <li>Платежи и вывод средств</li>
                    <li>Поддержка 24/7</li>
                  </ul>
                </div>
              )}

              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-brand-muted">Способы оплаты</h3>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <span
                      key={m.name}
                      className="rounded-lg border border-brand-accent/20 bg-brand-block px-2.5 py-1.5 text-xs font-medium text-brand-text"
                      title={m.name}
                    >
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-10 space-y-3 border-t border-brand-accent/15 pt-6 text-xs leading-relaxed text-brand-muted">
              <p>
                <strong className="text-brand-text">18+.</strong> Азартные игры могут вызывать зависимость. Играйте
                ответственно.
              </p>
              <p>© {year} {BRAND_NAME}. Все права защищены.</p>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
