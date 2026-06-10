# Supabase

SQL-міграції та політики **не виконуються автоматично** цим репозиторієм — застосовуйте через Supabase CLI або SQL Editor.

## Структура

- `migrations/` — послідовні скрипти `*.sql` (існуючі таблиці з ваших проєктів + нові для Union: профілі, нотифікації, usage-токени тощо).

### Профілі (`public.profiles`)

Файл `migrations/20260509230000_profiles.sql` створює профілі, синхронізовані з `auth.users` (тригер після INSERT), RLS для читання списку автентифікованими користувачами та оновлення власного рядка.

Перевірки цілісності — окремий скрипт `validate_profiles.sql` у корені `supabase/` (не міграція, запускати вручну в SQL Editor).

### Порядковий номер (`seq_no`)

Файл `migrations/20260510120000_profiles_seq_no.sql` додає колонку **seq_no** (1, 2, 3…) для відображення; первинний ключ і звʼязок із Auth залишаються **uuid**.

## Існуючі таблиці (референс)

У проді вони вже можуть існувати; тут зберігаємо **джерело правди** для відтворення схеми на новому середовищі:

- `generation_reference_sites` — для Union generation **варіант B** не використовується як вхід верстки; залишається в БД для сумісності/статистики.
- `generation_site_templates` + `generation_site_template_assets` — эталони **u-bet162** (`bet162`) та **u-spot064** (`spot064`): PHP/CSS/JS окремими рядками; генератор і `GET /api/generator/site-templates/[slug]` читають через Supabase. Сид: `node scripts/seed-generation-site-templates.mjs` (після міграції `20260525120000_generation_site_templates.sql`).
- `source_articles` — глобальний корпус текстів для Copy Engine (read: усі `authenticated`, write: `admin`). Міграція: `migrations/20260528160000_source_articles.sql` (потрібен `vector`, embedding 1536). Сид/редагування — `admin-text-gen`.
- `generation_prompt_profiles` — універсальні профілі промптів (`brand_scope=any`); генератор: weighted random + `full_generation_prompt` у architect/page.
- `source_articles` — корпус прикладів текстів; генератор підставляє фрагменти в промпт (стиль, не копіпаст). Референси можуть бути **en**, вихідний текст сайту — **ru/uk** (`SOFTGEN_SITE_CONTENT_LANGUAGE`). Налаштування: **Dashboard → Settings** (`SOFTGEN_SOURCE_ARTICLES_*`, `SOFTGEN_SITE_CONTENT_LANGUAGE` per-account).
- `generator_site_skeletons` — структурний скелет кожної збірки (chrome, frameworks, section orders) для admin similarity analytics. Міграція: `20260616120000_generator_site_skeletons.sql`. UI: **Dashboard → Аналітика AI** (`/dashboard/generator-analytics`, admin only).
- `hosts` — SSH/VPS для `/dashboard/domain`; **по одному набору на користувача** (`user_id`, RLS). Міграція: `migrations/20260527120000_user_hosts.sql`. Глобальні рядки без `user_id` видаляються при застосуванні.
- `telegram_subscribers`, `telegram_link_codes`, `telegram_bot_messages` — бот і персональні сповіщення (`20260528120000_telegram_user_notifications.sql`).
- `seo_*` — перенесені з поточних сервісів за потреби.

Додайте файли міграцій у цю папку й документуйте порядок застосування.
