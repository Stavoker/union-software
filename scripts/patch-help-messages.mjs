import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesDir = path.join(__dirname, "..", "messages");

const content = {
  uk: {
    faqPage: {
      back: "Назад",
      title: "Часті питання",
      lead: "Відповіді про доступ, модулі Union, налаштування Settings та підтримку. Скористайтесь пошуком або змістом зліва.",
      searchPlaceholder: "Пошук по питаннях…",
      navTitle: "Зміст",
      noResults: "Нічого не знайдено. Спробуйте інший запит.",
      sections: {
        whatIsUnion: {
          title: "Що таке Union?",
          body: "Union — єдина панель для генерації багатосторінкових сайтів (SoftGen), SEO-моніторингу (Yandex XML), автоматизації доменів (Spaceship + Zomro + SSL + деплой на хост) та обліку токенів AI.\n\nПісля входу відкривається Dashboard з модулями. Кожен користувач має власні інтеграційні ключі в Settings — вони не спільні між акаунтами.",
        },
        access: {
          title: "Як отримати доступ?",
          body: "Увійдіть на головній сторінці з email і паролем, які видав адміністратор. Після успішного входу вас перенаправить на /dashboard.\n\nЯкщо пароль не підходить — зверніться до адміністратора або в Telegram (посилання у футері). Самостійна реєстрація в Union не передбачена.",
        },
        frozenAccount: {
          title: "Акаунт заморожено — що робити?",
          body: "Якщо профіль позначено як frozen, після входу сесію буде завершено, а на сторінці логіну зʼявиться повідомлення про заморожений акаунт.\n\nНапишіть @rostyslav_sikora в Telegram — адміністратор зніме блокування або пояснить причину.",
        },
        settingsBasics: {
          title: "Що таке Settings і навіщо змінні?",
          body: "Settings (Dashboard → Settings) — це інтеграційні змінні вашого акаунта у форматі .env. Вони підставляються в генератор, SEO, домени, SSL, Telegram та auto-script під час роботи від вашого імені.\n\nRedis, Supabase URL і серверні секрети задаються лише в .env на сервері Union — їх немає в UI Settings.",
        },
        settingsSecrets: {
          title: "Як зберігаються секрети?",
          body: "Поля з типом secret (API keys, паролі, токени) у відповіді API не повертаються повторно — лише мітка «збережено».\n\n- Порожнє secret-поле при збереженні не змінює вже збережене значення.\n- Несекретні поля (host, port, email) показуються як текст.\n- Булеві поля: 1 — увімкнено, 0 — вимкнено, порожньо — не задано.\n\nПісля змін натисніть «Зберегти» внизу форми.",
        },
        settingsSections: {
          title: "Розділи на сторінці Settings",
          body: "Форма згрупована за блоками (як у .env):\n\n- Генератор сайтів — Claude API (до 10 слотів CLAUDE_API_KEY_01…10), модель, температуру, шляхи soft-subfolder.\n- Spaceship — реєстрація домену (API key, secret, contact id).\n- Zomro — DNS, Billmgr, dnsmgr, TXT для SSL challenge.\n- SSL — Let's Encrypt (email, staging, таймаути делегування).\n- Хост / деплой — SSH, nginx, каталог проєктів.\n- SEO — Yandex XML для позицій.\n- Telegram — бот і chat id для звітів.\n- auto-script-v2 — webhook після генерації.\n\nДетальний опис кожної змінної — у Документації.",
        },
        generator: {
          title: "Генератор: типові питання",
          body: "Мінімум для старту: хоча б один CLAUDE_API_KEY_01 (sk-ant-…) у Settings → Генератор.\n\n- Кілька ключів (02…10) дозволяють паралельні збірки.\n- ANTHROPIC_MODEL — модель Claude; ANTHROPIC_MAX_TOKENS_* — ліміти токенів.\n- SOFT_SUBFOLDER_* — де лежать шаблони та зібрані проєкти на сервері.\n- Прапорці SOFTGEN_* керують референсами, регенерацією промптів і суворістю placeholder.\n\nПомилки з бюджетом токенів дивіться на Usage.",
        },
        seo: {
          title: "SEO: типові питання",
          body: "У модулі SEO додайте домен і ключові слова, запускайте перевірку позицій, експортуйте CSV.\n\nДля Yandex XML потрібен YANDEX_XML_STOCK_BASE_URL у Settings → SEO (базовий URL сервісу позицій). Без нього запити позицій не працюватимуть.\n\nДомени для SEO привʼязуються до вашого акаунта окремо від генератора.",
        },
        domains: {
          title: "Домени та SSL",
          body: "Модуль купівлі/автоматизації домену використовує Spaceship (реєстрація), Zomro (DNS/VPS), SSL (Let's Encrypt) і опційно SSH-деплой на хост.\n\nПеред автоматизацією заповніть відповідні блоки в Settings. ZOMRO_DNSMGR_ENABLED=1 увімкне панель dnsmgr; SSL_LETSENCRYPT_EMAIL обовʼязковий для сертифіката.\n\nТаймаути SSL (SSL_DELEGATION_WAIT_* тощо) змінюйте лише якщо розумієте затримки DNS.",
        },
        usage: {
          title: "Usage та токени AI",
          body: "Сторінка Usage показує витрати Claude/DeepSeek по job генерації: модель, вхідні/вихідні токени, вартість, статус.\n\nЄ пошук за slug/моделлю та фільтр за статусом, пагінація по 30 записів. Якщо генерація впала через ліміт API — перевірте ключі в Settings і ліміти Anthropic.",
        },
        support: {
          title: "Підтримка",
          body: "Telegram: @rostyslav_sikora (посилання в футері на всіх сторінках кабінету, FAQ і документації).\n\nУ зверненні вкажіть email акаунта, модуль (генератор / SEO / домен) і час помилки — так швидше знайдемо job або лог.",
        },
      },
    },
    docsPage: {
      back: "Назад",
      title: "Документація",
      lead: "Покроковий опис модулів Union і змінних Settings. Пошук і зміст зліва допоможуть швидко перейти до потрібної теми.",
      searchPlaceholder: "Пошук по документації…",
      navTitle: "Зміст",
      noResults: "Нічого не знайдено. Спробуйте інший запит.",
      sections: {
        overview: {
          title: "Огляд платформи",
          body: "Union обʼєднує:\n\n- Генератор — багатосторінкові сайти з брифу (тема, кількість сторінок, slug).\n- SEO — ключові слова, позиції Yandex, експорт.\n- Домени — реєстрація, DNS, SSL, деплой на VPS.\n- Usage — облік токенів AI по генераціях.\n- Settings — персональні .env-змінні.\n\nРекомендований порядок: Settings → тест генератора → SEO/домени за потреби.",
        },
        dashboard: {
          title: "Dashboard",
          body: "Після входу /{locale}/dashboard показує картки модулів. Доступ залежить від ролі (звичайний користувач / admin).\n\nУ шапці — email, перемикач мови UI (uk/en/ru), вихід. Адміністратор бачить додаткові пункти керування користувачами (якщо увімкнено в проєкті).",
        },
        generator: {
          title: "Модуль генератора",
          body: "Відкрийте модуль «Генератор» з Dashboard. Заповніть:\n\n- Папка сайту (slug) — імʼя каталогу проєкту.\n- Тема / семантика — ніша та стиль контенту.\n- Кількість сторінок і сайтів у пакеті.\n- Базовий URL (опційно) для canonical/посилань.\n\nНатисніть «Запустити збірку», стежте за статусом job. Після завершення — «Завантажити ZIP». Скасування зупиняє поточний пайплайн.\n\nПотрібні ключі Claude в Settings (розділ нижче).",
        },
        seo: {
          title: "Модуль SEO",
          body: "Додайте домен, імпортуйте або введіть ключові слова, запустіть перевірку позицій. Результати можна експортувати в CSV.\n\nНалаштуйте YANDEX_XML_STOCK_BASE_URL у Settings → SEO. URL залежить від вашого провайдера Yandex XML Stock — уточніть у адміністратора.\n\nSEO-домени ізольовані по user_id; інший користувач їх не бачить.",
        },
        domains: {
          title: "Домени та автоматизація",
          body: "Модуль купівлі/прогону домену (Domain) приймає імʼя домену, contact id Spaceship (якщо не в Settings), опції DNS/SSL.\n\nТиповий ланцюжок:\n\n- Реєстрація в Spaceship (SPACESHIP_*).\n- DNS у Zomro (A-запис на SUBDOMAIN_HOST_IP, TXT для ACME).\n- Випуск SSL (SSL_LETSENCRYPT_*).\n- Деплой на хост (SUBDOMAIN_HOST_*), якщо SUBDOMAIN_HOST_SSL_DEPLOY=1.\n\nTelegram-звіти потребують TELEGRAM_BOT_TOKEN і TELEGRAM_CHAT_ID.",
        },
        usage: {
          title: "Usage (токени AI)",
          body: "Dashboard → Usage: таблиця генерацій з токенами та вартістю.\n\n- Пошук — за slug, моделлю або фрагментом id job.\n- Фільтр статусу — success / error / in progress.\n- Пагінація — 30 записів на сторінку.\n\nКорисно для контролю витрат Claude після зміни ANTHROPIC_MODEL або кількості сторінок у брифі.",
        },
        settingsOverview: {
          title: "Settings — загальні правила",
          body: "Шлях: Dashboard → Settings (/dashboard/settings).\n\n- Кожне поле відповідає змінній process.env з тим самим імʼям (моноширинний label).\n- Збереження — PUT на /api/settings/integration; дані в таблиці account_integration_settings.\n- Секрети не показуються повторно; порожнє secret-поле = «не чіпати».\n- Булеві: 1 / 0 / порожньо.\n- Якщо бачите попередження про міграцію — виконайте SQL з підказки в Supabase, потім оновіть сторінку.\n\nНижче — змінні по розділах форми.",
        },
        settingsGenerator: {
          title: "Settings — генератор (Claude / SoftGen)",
          body: "Розділ «Генератор сайтів»:\n\n- CLAUDE_API_KEY_01 … CLAUDE_API_KEY_10 — ключі Anthropic (sk-ant-…); мінімум один; кілька слотів для паралелізму.\n- ANTHROPIC_MODEL — модель (напр. claude-sonnet-4-6).\n- AURORA_GENERATION_TEMPERATURE — температура 0–1.\n- ANTHROPIC_MAX_TOKENS_PAGE / _ARCHITECT / _JSFIX — ліміти відповіді.\n- AURORA_CLAUDE_SITE_OUTPUT_BUDGET — бюджет output-токенів на 1 сайт.\n- ANTHROPIC_FETCH_TIMEOUT_MS — таймаут HTTP до API.\n- AURORA_GATEWAY_URL, AURORA_GATEWAY_DIVERSIFY — опційний gateway.\n- SOFT_SUBFOLDER_ROOT_DIR, SOFT_SUBFOLDER_TEMPLATES_DIR, SOFT_SUBFOLDER_PROJECTS_DIR — шляхи на сервері.\n- PHP_BINARY, SOFT_SUBFOLDER_PHP — PHP для subfolder-скриптів.\n- SOFTGEN_REQUIRE_REFERENCE_STRUCTURE, SOFTGEN_REFERENCE_TEMPLATE_MODE — робота з референс-сайтами.\n- SOFTGEN_PROMPT_REGEN_*, SOFTGEN_PROMPT_REWRITE_* — регенерація/перепис промптів.\n- SOFTGEN_REFERENCE_SIMILARITY_THRESHOLD та інші SOFTGEN_REFERENCE_* — пороги схожості та ліміти символів.\n- SOFTGEN_TEXT_FILL_MAX_ATTEMPTS, SOFTGEN_STRICT_PLACEHOLDER_FILL — якість заповнення тексту.",
        },
        settingsSpaceshipZomro: {
          title: "Settings — Spaceship та Zomro",
          body: "Spaceship (реєстрація домену):\n\n- SPACESHIP_API_KEY, SPACESHIP_API_SECRET — API доступ.\n- SPACESHIP_CONTACT_ID — contact для реєстрації.\n\nZomro (DNS / панель):\n\n- ZOMRO_AUTH_TOKEN або пара ZOMRO_USERNAME + ZOMRO_PASSWORD — авторизація API.\n- ZOMRO_AUTH_THROUGH_KEY, ZOMRO_AUTHINFO — альтернативні методи auth.\n- ZOMRO_BILLMGR_URL / HOST / PORT / ZOMRO_BILLMGR_USE_HTTP — Billmgr.\n- ZOMRO_DNSMGR_URL, ZOMRO_DNSMGR_DOMAIN_EMAIL — dnsmgr для TXT challenge.\n- ZOMRO_DNSMGR_ENABLED=1 — викликати dnsmgr; ZOMRO_API_DNS_ENABLED — API DNS на api.zomro.com.\n- ZOMRO_DNSMGR_TXT_CREATE_FUNC / TXT_DELETE_FUNC — імена func для TXT записів.",
        },
        settingsSslHost: {
          title: "Settings — SSL та хост (деплой)",
          body: "SSL (Let's Encrypt):\n\n- SSL_LETSENCRYPT_EMAIL — email для ACME (обовʼязково для прод).\n- SSL_LETSENCRYPT_STAGING=1 — тестовий ACME.\n- SSL_LETSENCRYPT_SKIP_VERIFY=1 — не перевіряти TLS (лише діагностика).\n- SSL_ASYNC_RETRY_MS, SSL_MIN_AUTHORITATIVE_NS_READY — повтори та NS.\n- SSL_DNS_CHALLENGE_REMOVE_DELAY_MS — пауза перед видаленням TXT.\n- SSL_DELEGATION_WAIT_TIMEOUT_MS / SSL_DELEGATION_WAIT_POLL_MS — очікування делегування.\n- SSL_ZOMRO_DNS_POST_DELAY_MS — пауза після змін DNS у Zomro.\n\nХост:\n\n- SUBDOMAIN_HOST_IP — IP для A-запису та SSH.\n- SUBDOMAIN_HOST_USER, SUBDOMAIN_HOST_PASSWORD, SUBDOMAIN_HOST_PORT — SSH.\n- SUBDOMAIN_HOST_SSL_DEPLOY=1 — nginx + сертифікат на сервері.\n- SUBDOMAIN_HOST_PROJECTS_DIR — корінь сайтів (напр. /var/www).\n- SUBDOMAIN_HOST_NGINX_* — шляхи sites-available/enabled, reload cmd, PHP-FPM socket.\n- SUBDOMAIN_HOST_NGINX_PHP=1 — увімкнути PHP у vhost.",
        },
        settingsSeoTelegram: {
          title: "Settings — SEO та Telegram",
          body: "SEO:\n\n- YANDEX_XML_STOCK_BASE_URL — базовий URL API перевірки позицій (Yandex XML Stock).\n\nTelegram:\n\n- TELEGRAM_BOT_TOKEN — токен @BotFather.\n- TELEGRAM_CHAT_ID — чат для звітів (число або @channel).\n- TELEGRAM_WEBHOOK_SECRET — секрет вебхука бота.\n- TELEGRAM_BOT_USERNAME — @username бота.\n- TELEGRAM_BOT_MESSAGES_MAX_AGE_HOURS, TELEGRAM_BOT_MESSAGES_CLEANUP_BATCH — cleanup повідомлень.\n- TELEGRAM_DELETE_COMMAND_MAX_MESSAGES, TELEGRAM_DELETE_TRY_BULK_IN_GROUPS — команда /delete.\n- CRON_SECRET або TELEGRAM_BOT_CLEANUP_CRON_SECRET — захист cron API cleanup.",
        },
        settingsAutoscript: {
          title: "Settings — auto-script-v2",
          body: "Після успішної генерації Union може викликати зовнішній auto-script-v2:\n\n- AUTOSCRIPT_WEBHOOK_URL — повний URL webhook (POST).\n- AUTOSCRIPT_WEBHOOK_SECRET — спільний секрет у заголовку запиту.\n\nЯкщо webhook не потрібен — залиште поля порожніми.",
        },
        workflow: {
          title: "Рекомендований workflow",
          body: "1. Отримайте логін від адміністратора, увійдіть.\n2. Settings: Claude ключ + мінімум Spaceship/Zomro/SSL/host за ваш сценарій.\n3. Запустіть тестову генерацію (1 сайт, 3–5 сторінок), завантажте ZIP.\n4. Перевірте Usage — токени в межах очікувань.\n5. Підключіть SEO (домен + Yandex URL) або Domain automation.\n6. За потреби — Telegram і AUTOSCRIPT webhook.\n\nПри помилках зніміть час, slug job і напишіть у підтримку @rostyslav_sikora.",
        },
      },
    },
  },
  en: {
    faqPage: {
      back: "Back",
      title: "Frequently asked questions",
      lead: "Answers about access, Union modules, Settings variables, and support. Use search or the table of contents on the left.",
      searchPlaceholder: "Search questions…",
      navTitle: "Contents",
      noResults: "Nothing found. Try another query.",
      sections: {
        whatIsUnion: {
          title: "What is Union?",
          body: "Union is a single panel for multi-page site generation (SoftGen), SEO monitoring (Yandex XML), domain automation (Spaceship + Zomro + SSL + host deploy), and AI token usage.\n\nAfter sign-in you land on the Dashboard. Each user has private integration keys in Settings — they are not shared between accounts.",
        },
        access: {
          title: "How do I get access?",
          body: "Sign in on the home page with the email and password from your administrator. You will be redirected to /dashboard.\n\nIf the password does not work, contact your admin or Telegram support (footer link). Self-registration is not available.",
        },
        frozenAccount: {
          title: "My account is frozen",
          body: "If the profile is marked frozen, the session ends after login and the login page shows a frozen-account message.\n\nContact @rostyslav_sikora on Telegram — an admin can unfreeze or explain the reason.",
        },
        settingsBasics: {
          title: "What is Settings?",
          body: "Settings (Dashboard → Settings) stores per-account .env-style variables used by the generator, SEO, domains, SSL, Telegram, and auto-script.\n\nRedis, Supabase URL, and server-only secrets live in the server .env only — not in the Settings UI.",
        },
        settingsSecrets: {
          title: "How are secrets stored?",
          body: "Secret fields (API keys, passwords, tokens) are never returned in API responses — only a “saved” marker.\n\n- Leaving a secret field empty on save keeps the previous value.\n- Non-secret fields (host, port, email) are shown as plain text.\n- Booleans: 1 = on, 0 = off, empty = unset.\n\nClick Save at the bottom after changes.",
        },
        settingsSections: {
          title: "Settings form sections",
          body: "The form is grouped like .env blocks:\n\n- Site generator — Claude API (CLAUDE_API_KEY_01…10), model, temperature, soft-subfolder paths.\n- Spaceship — domain registration.\n- Zomro — DNS, Billmgr, dnsmgr, SSL TXT records.\n- SSL — Let's Encrypt and timing options.\n- Host / deploy — SSH, nginx, project directory.\n- SEO — Yandex XML positions.\n- Telegram — bot reports.\n- auto-script-v2 — post-generation webhook.\n\nSee Documentation for each variable.",
        },
        generator: {
          title: "Generator FAQ",
          body: "Minimum to start: at least CLAUDE_API_KEY_01 (sk-ant-…) under Settings → Generator.\n\n- Extra keys (02…10) enable parallel builds.\n- ANTHROPIC_MODEL and ANTHROPIC_MAX_TOKENS_* control model and limits.\n- SOFT_SUBFOLDER_* paths must exist on the server.\n- SOFTGEN_* flags control references and prompt regeneration.\n\nCheck Usage if jobs fail on token budget.",
        },
        seo: {
          title: "SEO FAQ",
          body: "In SEO, add a domain and keywords, run position checks, export CSV.\n\nSet YANDEX_XML_STOCK_BASE_URL under Settings → SEO. Without it, position checks will not work.\n\nSEO domains are scoped per user account.",
        },
        domains: {
          title: "Domains and SSL",
          body: "Domain automation uses Spaceship, Zomro, SSL (Let's Encrypt), and optional SSH deploy.\n\nFill the matching Settings blocks first. ZOMRO_DNSMGR_ENABLED=1 enables dnsmgr; SSL_LETSENCRYPT_EMAIL is required for production certificates.\n\nChange SSL timing variables only if you understand DNS delays.",
        },
        usage: {
          title: "Usage and AI tokens",
          body: "Usage lists Claude/DeepSeek spend per generation job with search and status filter (30 rows per page).\n\nIf generation fails on API limits, verify Claude keys in Settings and your Anthropic quota.",
        },
        support: {
          title: "Support",
          body: "Telegram: @rostyslav_sikora (footer link on dashboard, FAQ, and docs).\n\nInclude your account email, module name, and error time for faster troubleshooting.",
        },
      },
    },
    docsPage: {
      back: "Back",
      title: "Documentation",
      lead: "Step-by-step Union modules and Settings variables. Search and the left contents jump to each topic.",
      searchPlaceholder: "Search documentation…",
      navTitle: "Contents",
      noResults: "Nothing found. Try another query.",
      sections: {
        overview: {
          title: "Platform overview",
          body: "Union includes:\n\n- Generator — multi-page sites from a brief.\n- SEO — keywords, Yandex positions, CSV export.\n- Domains — registration, DNS, SSL, VPS deploy.\n- Usage — AI token accounting.\n- Settings — personal .env variables.\n\nRecommended order: Settings → test generator → SEO/domains as needed.",
        },
        dashboard: {
          title: "Dashboard",
          body: "/{locale}/dashboard shows module cards. Access depends on role (user / admin).\n\nThe header has email, UI language (uk/en/ru), and sign out. Admins may see extra user management when enabled.",
        },
        generator: {
          title: "Generator module",
          body: "Open Generator from the Dashboard. Set site folder (slug), theme/semantics, page count, optional base URL, then Start build.\n\nTrack job status and download ZIP when finished. Cancel stops the pipeline.\n\nClaude keys in Settings are required (see below).",
        },
        seo: {
          title: "SEO module",
          body: "Add a domain, manage keywords, run position checks, export CSV.\n\nConfigure YANDEX_XML_STOCK_BASE_URL in Settings → SEO. The URL depends on your Yandex XML Stock provider.\n\nDomains are isolated per user_id.",
        },
        domains: {
          title: "Domains and automation",
          body: "The Domain module runs registration (Spaceship), DNS (Zomro), SSL, and optional host deploy.\n\nTypical chain: Spaceship → DNS A record to SUBDOMAIN_HOST_IP → ACME TXT → SSL → nginx deploy if SUBDOMAIN_HOST_SSL_DEPLOY=1.\n\nTelegram reports need TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID.",
        },
        usage: {
          title: "Usage (AI tokens)",
          body: "Dashboard → Usage: generations table with tokens and cost. Search by slug/model, filter by status, 30 rows per page.\n\nUseful after changing ANTHROPIC_MODEL or page count in the brief.",
        },
        settingsOverview: {
          title: "Settings — general rules",
          body: "Path: Dashboard → Settings (/dashboard/settings).\n\n- Field names match process.env keys.\n- Save calls PUT /api/settings/integration → account_integration_settings.\n- Secrets are write-only in UI; empty secret field means “keep existing”.\n- Booleans: 1 / 0 / empty.\n- If you see a migration warning, run the SQL in Supabase and reload.\n\nSections below list variables by form group.",
        },
        settingsGenerator: {
          title: "Settings — generator (Claude / SoftGen)",
          body: "Site generator section:\n\n- CLAUDE_API_KEY_01 … 10 — Anthropic keys; at least one required.\n- ANTHROPIC_MODEL, AURORA_GENERATION_TEMPERATURE, ANTHROPIC_MAX_TOKENS_* — model and limits.\n- AURORA_CLAUDE_SITE_OUTPUT_BUDGET, ANTHROPIC_FETCH_TIMEOUT_MS — budget and timeout.\n- AURORA_GATEWAY_URL, AURORA_GATEWAY_DIVERSIFY — optional gateway.\n- SOFT_SUBFOLDER_* — server paths for templates and builds.\n- PHP_BINARY, SOFT_SUBFOLDER_PHP — PHP binary paths.\n- SOFTGEN_* — reference sites, prompt regen/rewrite, similarity thresholds, placeholder fill.",
        },
        settingsSpaceshipZomro: {
          title: "Settings — Spaceship and Zomro",
          body: "Spaceship: SPACESHIP_API_KEY, SPACESHIP_API_SECRET, SPACESHIP_CONTACT_ID.\n\nZomro: ZOMRO_AUTH_TOKEN or ZOMRO_USERNAME + ZOMRO_PASSWORD; ZOMRO_AUTH_THROUGH_KEY, ZOMRO_AUTHINFO; ZOMRO_BILLMGR_*; ZOMRO_DNSMGR_URL, ZOMRO_DNSMGR_DOMAIN_EMAIL; ZOMRO_DNSMGR_ENABLED, ZOMRO_API_DNS_ENABLED; ZOMRO_DNSMGR_TXT_CREATE_FUNC / TXT_DELETE_FUNC.",
        },
        settingsSslHost: {
          title: "Settings — SSL and host",
          body: "SSL: SSL_LETSENCRYPT_EMAIL (required for prod), SSL_LETSENCRYPT_STAGING, SSL_LETSENCRYPT_SKIP_VERIFY, SSL_ASYNC_RETRY_MS, SSL_MIN_AUTHORITATIVE_NS_READY, SSL_DNS_CHALLENGE_REMOVE_DELAY_MS, SSL_DELEGATION_WAIT_TIMEOUT_MS, SSL_DELEGATION_WAIT_POLL_MS, SSL_ZOMRO_DNS_POST_DELAY_MS.\n\nHost: SUBDOMAIN_HOST_IP, SUBDOMAIN_HOST_USER, SUBDOMAIN_HOST_PASSWORD, SUBDOMAIN_HOST_PORT, SUBDOMAIN_HOST_SSL_DEPLOY, SUBDOMAIN_HOST_PROJECTS_DIR, SUBDOMAIN_HOST_NGINX_*, SUBDOMAIN_HOST_NGINX_PHP.",
        },
        settingsSeoTelegram: {
          title: "Settings — SEO and Telegram",
          body: "SEO: YANDEX_XML_STOCK_BASE_URL.\n\nTelegram: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_USERNAME, cleanup-related TELEGRAM_* vars, CRON_SECRET / TELEGRAM_BOT_CLEANUP_CRON_SECRET.",
        },
        settingsAutoscript: {
          title: "Settings — auto-script-v2",
          body: "AUTOSCRIPT_WEBHOOK_URL — POST URL after a successful generation.\nAUTOSCRIPT_WEBHOOK_SECRET — shared header secret.\n\nLeave empty if you do not use the webhook.",
        },
        workflow: {
          title: "Recommended workflow",
          body: "1. Sign in with admin-provided credentials.\n2. Settings: Claude key + Spaceship/Zomro/SSL/host as needed.\n3. Test build (1 site, few pages), download ZIP.\n4. Check Usage for token spend.\n5. Enable SEO or Domain automation.\n6. Optional: Telegram and AUTOSCRIPT webhook.\n\nFor errors, note time, job slug, and contact @rostyslav_sikora.",
        },
      },
    },
  },
  ru: {
    faqPage: {
      back: "Назад",
      title: "Частые вопросы",
      lead: "Ответы о доступе, модулях Union, настройках Settings и поддержке. Используйте поиск или содержание слева.",
      searchPlaceholder: "Поиск по вопросам…",
      navTitle: "Содержание",
      noResults: "Ничего не найдено. Попробуйте другой запрос.",
      sections: {
        whatIsUnion: {
          title: "Что такое Union?",
          body: "Union — единая панель для генерации многостраничных сайтов (SoftGen), SEO-мониторинга (Yandex XML), автоматизации доменов (Spaceship + Zomro + SSL + деплой на хост) и учёта токенов AI.\n\nПосле входа открывается Dashboard. У каждого пользователя свои ключи в Settings — они не общие между аккаунтами.",
        },
        access: {
          title: "Как получить доступ?",
          body: "Войдите на главной с email и паролем от администратора. После успешного входа — редирект на /dashboard.\n\nЕсли пароль не подходит — обратитесь к админу или в Telegram (ссылка в футере). Самостоятельная регистрация недоступна.",
        },
        frozenAccount: {
          title: "Аккаунт заморожен",
          body: "При frozen профиле сессия завершается после входа, на странице логина — сообщение о заморозке.\n\nНапишите @rostyslav_sikora в Telegram.",
        },
        settingsBasics: {
          title: "Что такое Settings?",
          body: "Settings (Dashboard → Settings) — переменные аккаунта в формате .env для генератора, SEO, доменов, SSL, Telegram и auto-script.\n\nRedis, Supabase и серверные секреты задаются только в .env на сервере Union.",
        },
        settingsSecrets: {
          title: "Как хранятся секреты?",
          body: "Секретные поля не возвращаются в API — только метка «сохранено».\n\n- Пустое secret-поле при сохранении не меняет значение.\n- Несекретные поля показываются текстом.\n- Булевы: 1 / 0 / пусто.\n\nНажмите «Сохранить» после изменений.",
        },
        settingsSections: {
          title: "Разделы формы Settings",
          body: "Блоки формы:\n\n- Генератор — Claude (CLAUDE_API_KEY_01…10), модель, soft-subfolder.\n- Spaceship — регистрация домена.\n- Zomro — DNS, Billmgr, dnsmgr.\n- SSL — Let's Encrypt.\n- Хост — SSH, nginx.\n- SEO — Yandex XML.\n- Telegram — бот.\n- auto-script-v2 — webhook.\n\nПодробности переменных — в Документации.",
        },
        generator: {
          title: "Генератор: FAQ",
          body: "Минимум: CLAUDE_API_KEY_01 (sk-ant-…) в Settings → Генератор.\n\n- Ключи 02…10 — параллельные сборки.\n- ANTHROPIC_MODEL, ANTHROPIC_MAX_TOKENS_* — модель и лимиты.\n- SOFT_SUBFOLDER_* — пути на сервере.\n- SOFTGEN_* — референсы и промпты.\n\nОшибки по токенам — страница Usage.",
        },
        seo: {
          title: "SEO: FAQ",
          body: "Добавьте домен и ключевые слова, запустите проверку позиций, экспорт CSV.\n\nНужен YANDEX_XML_STOCK_BASE_URL в Settings → SEO.\n\nДомены SEO изолированы по user_id.",
        },
        domains: {
          title: "Домены и SSL",
          body: "Автоматизация использует Spaceship, Zomro, SSL и опционально SSH-деплой.\n\nЗаполните блоки Settings. ZOMRO_DNSMGR_ENABLED=1, SSL_LETSENCRYPT_EMAIL для прод-сертификата.",
        },
        usage: {
          title: "Usage и токены AI",
          body: "Usage показывает расход Claude/DeepSeek по job с поиском и фильтром статуса (30 на страницу).",
        },
        support: {
          title: "Поддержка",
          body: "Telegram: @rostyslav_sikora (ссылка в футере).\n\nУкажите email аккаунта, модуль и время ошибки.",
        },
      },
    },
    docsPage: {
      back: "Назад",
      title: "Документация",
      lead: "Описание модулей Union и переменных Settings. Поиск и содержание слева для быстрого перехода.",
      searchPlaceholder: "Поиск по документации…",
      navTitle: "Содержание",
      noResults: "Ничего не найдено. Попробуйте другой запрос.",
      sections: {
        overview: {
          title: "Обзор платформы",
          body: "Union включает генератор, SEO, домены, Usage и Settings.\n\nПорядок: Settings → тест генератора → SEO/домены по необходимости.",
        },
        dashboard: {
          title: "Dashboard",
          body: "/{locale}/dashboard — карточки модулей. В шапке email, язык UI, выход.",
        },
        generator: {
          title: "Модуль генератора",
          body: "Slug, тема, число страниц, запуск сборки, статус job, ZIP по завершении. Нужны ключи Claude в Settings.",
        },
        seo: {
          title: "Модуль SEO",
          body: "Домен, ключевые слова, позиции, CSV. YANDEX_XML_STOCK_BASE_URL в Settings → SEO.",
        },
        domains: {
          title: "Домены",
          body: "Spaceship → DNS Zomro → SSL → деплой при SUBDOMAIN_HOST_SSL_DEPLOY=1. Telegram: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.",
        },
        usage: {
          title: "Usage",
          body: "Таблица генераций с токенами, поиск, фильтр статуса, пагинация 30.",
        },
        settingsOverview: {
          title: "Settings — общие правила",
          body: "Путь: /dashboard/settings. Имена полей = process.env. Секреты не показываются повторно; пустое secret = не менять. Булевы 1/0/пусто. При предупреждении о миграции — SQL в Supabase.",
        },
        settingsGenerator: {
          title: "Settings — генератор",
          body: "CLAUDE_API_KEY_01…10, ANTHROPIC_MODEL, AURORA_GENERATION_TEMPERATURE, ANTHROPIC_MAX_TOKENS_*, AURORA_*, SOFT_SUBFOLDER_*, PHP_*, SOFTGEN_* — см. подсказки в форме Settings.",
        },
        settingsSpaceshipZomro: {
          title: "Settings — Spaceship и Zomro",
          body: "SPACESHIP_API_KEY, SPACESHIP_API_SECRET, SPACESHIP_CONTACT_ID; ZOMRO_AUTH_*, ZOMRO_BILLMGR_*, ZOMRO_DNSMGR_*, ZOMRO_DNSMGR_ENABLED, ZOMRO_API_DNS_ENABLED, TXT func.",
        },
        settingsSslHost: {
          title: "Settings — SSL и хост",
          body: "SSL_LETSENCRYPT_*, SSL_ASYNC_*, SSL_DELEGATION_*, SSL_ZOMRO_DNS_POST_DELAY_MS; SUBDOMAIN_HOST_IP, USER, PASSWORD, PORT, SSL_DEPLOY, PROJECTS_DIR, NGINX_*, PHP.",
        },
        settingsSeoTelegram: {
          title: "Settings — SEO и Telegram",
          body: "YANDEX_XML_STOCK_BASE_URL; TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_BOT_USERNAME, cleanup и CRON_SECRET.",
        },
        settingsAutoscript: {
          title: "Settings — auto-script-v2",
          body: "AUTOSCRIPT_WEBHOOK_URL, AUTOSCRIPT_WEBHOOK_SECRET — webhook после генерации.",
        },
        workflow: {
          title: "Рекомендуемый workflow",
          body: "1. Вход. 2. Settings. 3. Тестовая сборка. 4. Usage. 5. SEO/домены. 6. Telegram/webhook. Поддержка: @rostyslav_sikora.",
        },
      },
    },
  },
};

for (const locale of ["uk", "en", "ru"]) {
  const filePath = path.join(messagesDir, `${locale}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  data.faqPage = content[locale].faqPage;
  data.docsPage = content[locale].docsPage;
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`Patched ${locale}.json`);
}
