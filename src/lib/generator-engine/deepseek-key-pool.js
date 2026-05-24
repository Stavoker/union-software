/**
 * Claude-only пул ключів: CLAUDE_API_KEY_XX (або ANTHROPIC_API_KEY_XX).
 * Назва файла збережена для зворотної сумісності імпортів.
 */

import { getAnthropicBaseUrl, isAcceptableClaudeApiKey } from "@/lib/generator-llm-endpoint";

function maskKeyHint(key) {
  const s = String(key || "").trim();
  if (!s) return "(пусто)";
  if (s.length <= 12) return `${s.slice(0, 4)}…`;
  return `${s.slice(0, 10)}…${s.slice(-4)}`;
}

/** Скинути кеш після оновлення Settings / process.env. */
export function resetPairedLlmPool() {
  delete globalThis.__auroraPairedLlmPoolState;
  const lease = globalThis.__auroraPairedLlmLeaseState;
  if (lease && typeof lease === "object") {
    lease.active = 0;
  }
}

function parsePairedKeysFromEnv() {
  const claudeRows = Object.entries(process.env)
    .filter(([k]) =>
      /^(CLAUDE_API_KEY_\d+|ANTHROPIC_API_KEY_\d+)$/i.test(String(k || ""))
    )
    .map(([k, v]) => {
      const m = String(k).match(/_(\d+)$/i);
      const suffix = m ? m[1] : "";
      const slotNum = suffix ? parseInt(suffix, 10) || 0 : 0;
      return { suffix, slotNum, key: String(v || "").trim(), envKey: k };
    })
    .filter((x) => x.suffix && x.key)
    .sort((a, b) => a.slotNum - b.slotNum || a.suffix.localeCompare(b.suffix));

  if (!claudeRows.length) {
    throw new Error(
      "Не найдено Claude-ключей. Добавьте CLAUDE_API_KEY_01 (или ANTHROPIC_API_KEY_01) и далее по номерам в env."
    );
  }

  const pairs = [];
  for (const row of claudeRows) {
    if (!isAcceptableClaudeApiKey(row.key)) {
      const base = getAnthropicBaseUrl();
      throw new Error(
        `${row.envKey}: недопустимый ключ (${maskKeyHint(row.key)}). ` +
          (base.includes("api.anthropic.com")
            ? `Для прямого Anthropic нужен sk-ant-api03-… (console.anthropic.com). ` +
              `Для локального прокси (sk-3ea6a6b4…) задайте ANTHROPIC_BASE_URL=http://localhost:3001 в Settings → Генератор.`
            : `Проверьте ключ прокси и ANTHROPIC_BASE_URL=${base}.`)
      );
    }
    pairs.push({
      slot: row.slotNum || 0,
      suffix: row.suffix,
      deepseekKey: "",
      claudeKey: row.key,
    });
  }

  if (!pairs.length) {
    throw new Error("Не удалось собрать пул CLAUDE_API_KEY_* / ANTHROPIC_API_KEY_*.");
  }

  return pairs;
}

function getPoolState() {
  const g = globalThis;
  if (!g.__auroraPairedLlmPoolState) {
    g.__auroraPairedLlmPoolState = {
      index: 0,
      pairs: parsePairedKeysFromEnv(),
    };
  }
  return g.__auroraPairedLlmPoolState;
}

/** @deprecated используйте takeNextPairedLlmLease */
export function takeNextDeepseekApiKey() {
  const lease = takeNextPairedLlmLease();
  return lease.deepseekKey;
}

/**
 * Следующий Claude-ключ для одной генерации сайта.
 * @returns {{ deepseekKey: string, claudeKey: string, slot: number, poolSize: number }}
 */
export function takeNextPairedLlmLease() {
  const state = getPoolState();
  if (!Array.isArray(state.pairs) || !state.pairs.length) {
    state.pairs = parsePairedKeysFromEnv();
    state.index = 0;
  }
  const idx = state.index % state.pairs.length;
  const row = state.pairs[idx];
  state.index = (state.index + 1) % state.pairs.length;
  return {
    deepseekKey: row.deepseekKey,
    claudeKey: row.claudeKey,
    slot: row.slot || 0,
    slotSuffix: row.suffix,
    poolSize: state.pairs.length,
  };
}

/** Обратная совместимость: раньше возвращался только DeepSeek. */
export function takeNextDeepseekLease() {
  const p = takeNextPairedLlmLease();
  return {
    key: p.deepseekKey,
    slot: p.slot,
    poolSize: p.poolSize,
    claudeKey: p.claudeKey,
    deepseekKey: p.deepseekKey,
    slotSuffix: p.slotSuffix,
  };
}

export function getDeepseekPoolSize() {
  const state = getPoolState();
  return Array.isArray(state.pairs) ? state.pairs.length : 0;
}

function getLeaseState() {
  const g = globalThis;
  if (!g.__auroraPairedLlmLeaseState) {
    g.__auroraPairedLlmLeaseState = { active: 0 };
  }
  return g.__auroraPairedLlmLeaseState;
}

const ACQUIRE_POLL_MS = 280;

/**
 * Чекає, поки кількість активних збірок &lt; розміру пулу, потім видає наступну пару (round-robin).
 * Одночасно не більше N збірок, де N = число Claude-ключів у env.
 * @param {() => boolean} [isCancelled]
 */
export async function acquirePairedLlmLease(isCancelled) {
  const poolState = getPoolState();
  const cap = Array.isArray(poolState.pairs) ? poolState.pairs.length : 0;
  if (!cap) {
    throw new Error(
      "Не найдено Claude-ключей. Добавьте CLAUDE_API_KEY_01 (или ANTHROPIC_API_KEY_01) и далее по номерам в env."
    );
  }
  const st = getLeaseState();
  for (;;) {
    if (typeof isCancelled === "function" && isCancelled()) {
      throw new Error("Генерация остановлена пользователем.");
    }
    if (st.active < cap) {
      st.active += 1;
      return takeNextPairedLlmLease();
    }
    await new Promise((r) => {
      setTimeout(r, ACQUIRE_POLL_MS);
    });
  }
}

/** Викликати в `finally` після збірки, якщо був успішний `acquirePairedLlmLease`. */
export function releasePairedLlmLease() {
  const st = globalThis.__auroraPairedLlmLeaseState;
  if (!st) return;
  st.active = Math.max(0, Math.trunc(Number(st.active) || 0) - 1);
}
