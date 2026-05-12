# Union

Єдина веб-платформа (Next.js 16, React 19, TypeScript): генерація сайтів, SEO-інструменти, облік AI-токенів, інтеграція з інфраструктурою.

**Окремий деплой на Render:** worker **auto-script-v2** не входить у цей репозиторій; зв’язок через черги / webhooks / спільний Supabase.

**Розподіл з доменами та хостом:** у **Union** — закупівля домену та верифікація **SSL**. У **auto-script-v2** — лише деплой домену в **Yandex Вебмайстер** і верифікація його сертифіката, коли на хості з’являються нові домени (без дублювання купівлі домену / SSL у скрипті).

## Локальний запуск

```bash
npm install
cp .env.example .env.local
npm run dev
```

Відкрийте [http://localhost:3000/uk](http://localhost:3000/uk) (локалі: `uk`, `en`, `ru`).

## Стек

- **UI:** Tailwind CSS v4, Framer Motion, дизайн-токени в `src/app/globals.css`.
- **i18n:** `next-intl` — інтерфейс UA/EN/RU; мова **контенту сайту** при генерації окремо (RU/EN) задається в майбутньому модулем генерації.
- **Дані:** Supabase (Auth email/password — наступний крок), TanStack Query.
- **Стан UI:** Zustand (за потреби).

## Структура

```
src/
  app/              App Router, `[locale]` для перекладів
  i18n/             routing, request, navigation helpers
  modules/          майбутні feature-модулі
  shared/           компоненти, providers, lib (Supabase)
messages/           uk.json, en.json, ru.json
supabase/migrations SQL для таблиць
```

## Деплой (Render)

- Build: `npm run build`
- Start: `npm run start`
- Змінні середовища — з `.env.example`; секрети лише в Render dashboard.

## Ліцензія

Приватний проєкт.
