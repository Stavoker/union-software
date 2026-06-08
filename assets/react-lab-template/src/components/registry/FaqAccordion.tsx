import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { BRAND_NAME } from "../../lib/site-routes";

type Item = { q: string; a: string };
type Props = { title?: string; items?: Item[] };

function isFilledFaqItem(item: Item | undefined): item is Item {
  const q = String(item?.q || "").trim();
  const a = String(item?.a || "").trim();
  if (q.length < 5 || a.length < 20) return false;
  if (/^(вопрос|ответ|текст|описание|\.{3}|todo|tbd)$/i.test(q)) return false;
  if (/^(ответ|текст|описание|\.{3}|todo|tbd)$/i.test(a)) return false;
  return true;
}

function defaultFaqItems(brand: string): Item[] {
  return [
    {
      q: `Как зарегистрироваться на ${brand}?`,
      a: `Нажмите «Регистрация» в шапке или боковом меню, укажите email и пароль, примите правила платформы. После подтверждения почты войдите в личный кабинет ${brand} — станут доступны депозит, бонусы и полный каталог игр.`,
    },
    {
      q: `Какие бонусы доступны в ${brand}?`,
      a: `Новые игроки ${brand} могут активировать приветственный пакет после первого депозита. В описании акции указаны размер бонуса, вейджер и срок отыгрыша. Также доступны еженедельный кэшбэк и персональные предложения для активных пользователей.`,
    },
    {
      q: `Как пополнить счёт в ${brand}?`,
      a: `${brand} принимает карты Visa, Mastercard, МИР, СБП, электронные кошельки и криптовалюты. Минимальная сумма и срок зачисления указаны в кассе для каждого метода. Депозиты обычно зачисляются в течение нескольких минут.`,
    },
    {
      q: `Сколько ждать вывод средств с ${brand}?`,
      a: `Срок зависит от метода: кошельки и криптовалюта часто обрабатываются быстрее, карты — до нескольких рабочих дней. Первый вывод на ${brand} может занять дольше из-за верификации. Статус заявки отображается в истории транзакций.`,
    },
    {
      q: `Есть ли мобильная версия ${brand}?`,
      a: `Да, сайт ${brand} адаптирован под смартфоны и планшеты. Каталог слотов, live-игры и касса работают в мобильном браузере без установки приложения. Для стабильной игры используйте надёжное интернет-соединение.`,
    },
    {
      q: `Как связаться с поддержкой ${brand}?`,
      a: `Служба поддержки ${brand} работает круглосуточно через онлайн-чат и email. Операторы помогают с регистрацией, депозитами, бонусами и верификацией. Укажите логин и время операции для быстрого решения вопроса.`,
    },
  ];
}

function resolveFaqList(items: Item[] | undefined): Item[] {
  const filtered = (Array.isArray(items) ? items : []).filter(isFilledFaqItem);
  if (filtered.length >= 4) return filtered;
  const brand = String(BRAND_NAME || "казино").trim() || "казино";
  const defaults = defaultFaqItems(brand);
  const seen = new Set(filtered.map((i) => i.q.toLowerCase()));
  for (const item of defaults) {
    if (filtered.length >= 8) break;
    if (!seen.has(item.q.toLowerCase())) {
      filtered.push(item);
      seen.add(item.q.toLowerCase());
    }
  }
  return filtered.length ? filtered : defaults;
}

export function FaqAccordion({ title = "Частые вопросы", items = [] }: Props) {
  const list = resolveFaqList(items);
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold text-brand-text">{title}</h2>
      <div className="space-y-2">
        {list.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={`${item.q.slice(0, 32)}-${i}`} className="rounded-xl border border-brand-accent/15 bg-brand-block">
              <button
                type="button"
                className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left text-brand-text"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
              >
                <span className="font-medium">{item.q}</span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-brand-accent transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              <AnimatePresence initial={false}>
                {isOpen ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden px-4 pb-4 text-sm leading-relaxed text-brand-muted"
                  >
                    {item.a}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
