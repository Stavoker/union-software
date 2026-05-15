/** Спільні класи для SEO-підрозділу в стилі Union (dark + lime accent). */

export const seoCard =
  "rounded-2xl border border-union-border bg-union-surface/50 p-5 backdrop-blur-md md:p-6";

export const seoInput =
  "w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 text-sm text-union-text outline-none ring-union-ring placeholder:text-union-muted focus:ring-2 disabled:opacity-50";

export const seoSelect = seoInput;

export const seoTextarea =
  "min-h-[120px] w-full rounded-xl border border-union-border bg-union-bg/80 px-3 py-2 font-mono text-xs text-union-text outline-none ring-union-ring focus:ring-2 disabled:opacity-50";

export const seoLabel = "mb-1.5 block text-xs font-medium text-union-muted";

export const seoBtnPrimary =
  "inline-flex cursor-pointer items-center justify-center rounded-full bg-union-accent px-5 py-2.5 text-sm font-medium text-union-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

export const seoBtnGhost =
  "inline-flex cursor-pointer items-center justify-center rounded-full border border-union-border px-4 py-2 text-sm text-union-muted transition-colors hover:border-white/20 hover:text-union-text disabled:cursor-not-allowed disabled:opacity-40";

/** Пагінація «Назад» / «Далі» на SEO positions. */
export const seoBtnQuiet =
  "inline-flex cursor-pointer items-center justify-center rounded-full px-4 py-2 text-sm text-union-muted transition-colors hover:bg-white/[0.06] hover:text-union-text disabled:cursor-not-allowed disabled:opacity-40";

/** Лаймова обводка та текст (#d1fe17) — активна дія (Import CSV, Next). У disabled — як seoBtnLimeOutlineMuted. */
export const seoBtnLimeOutline =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#d1fe17] px-4 py-2 text-sm font-medium text-[#d1fe17] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-[#6d7f42] disabled:text-[#8fa04a] disabled:opacity-40 disabled:hover:border-[#6d7f42] disabled:hover:text-[#8fa04a] disabled:hover:opacity-40 [&_svg]:text-[#d1fe17] disabled:[&_svg]:text-[#8fa04a]";

/** Приглушений лайм — вторинна дія (Export CSV, Previous). */
export const seoBtnLimeOutlineMuted =
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-[#6d7f42] px-4 py-2 text-sm font-medium text-[#8fa04a] transition-colors hover:border-[#d1fe17]/55 hover:text-[#b8d65c] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[#6d7f42] disabled:hover:text-[#8fa04a] [&_svg]:text-current";

/** Лаймова замітка — як status toast на SEO (border + blur + #d1fe17). */
export const seoNoteLime =
  "min-w-0 flex-1 rounded-xl border border-[#d1fe17] bg-[#d1fe17]/[0.09] px-4 py-2.5 text-xs leading-relaxed text-[#d1fe17] shadow-lg backdrop-blur-md [&_code]:text-[#d1fe17]/90";

export const seoBtnDanger =
  "inline-flex cursor-pointer items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-40";

export const seoLinkBack = "text-sm font-medium text-union-accent hover:underline";

/** Для великих форм (domain-automation): стилі нащадків без окремого class на кожному полі. */
export const seoFormDescendantControls =
  "[&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-union-border [&_input]:bg-union-bg/80 [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:text-union-text [&_input]:outline-none [&_input]:placeholder:text-union-muted [&_input]:focus:ring-2 [&_input]:focus:ring-union-ring [&_input]:disabled:opacity-50 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-union-border [&_select]:bg-union-bg/80 [&_select]:px-3 [&_select]:py-2 [&_select]:text-sm [&_select]:text-union-text [&_select]:outline-none [&_select]:focus:ring-2 [&_select]:focus:ring-union-ring [&_select]:disabled:opacity-50 [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-union-border [&_textarea]:bg-union-bg/80 [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:font-mono [&_textarea]:text-xs [&_textarea]:text-union-text [&_textarea]:outline-none [&_textarea]:focus:ring-2 [&_textarea]:focus:ring-union-ring [&_textarea]:disabled:opacity-50 [&_label]:mb-1.5 [&_label]:block [&_label]:text-xs [&_label]:font-medium [&_label]:text-union-muted";
