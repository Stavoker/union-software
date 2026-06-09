import { BRAND_NAME } from "../../lib/site-routes";

export type FaqItem = { q: string; a: string };

export function isFilledFaqItem(item: FaqItem | undefined): item is FaqItem {
  const q = String(item?.q || "").trim();
  const a = String(item?.a || "").trim();
  if (q.length < 5 || a.length < 20) return false;
  if (/^(вопрос|ответ|текст|описание|\.{3}|todo|tbd)$/i.test(q)) return false;
  if (/^(ответ|текст|описание|\.{3}|todo|tbd)$/i.test(a)) return false;
  return true;
}

export function defaultFaqItems(brand: string): FaqItem[] {
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

export function resolveFaqList(items: FaqItem[] | undefined): FaqItem[] {
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
