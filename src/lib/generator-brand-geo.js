/**
 * Target geo regions for generator brand / SEO prompts.
 * @typedef {{ code: string, flag: string, label: { uk: string, en: string, ru: string }, search: string }} GeoRegion
 */

/** @type {GeoRegion[]} */
export const GENERATOR_GEO_REGIONS = [
  { code: "ru", flag: "🇷🇺", label: { uk: "Росія", en: "Russia", ru: "Россия" }, search: "russia россия рф ru" },
  { code: "ua", flag: "🇺🇦", label: { uk: "Україна", en: "Ukraine", ru: "Украина" }, search: "ukraine украина ua укр" },
  { code: "kz", flag: "🇰🇿", label: { uk: "Казахстан", en: "Kazakhstan", ru: "Казахстан" }, search: "kazakhstan казахстан kz" },
  { code: "by", flag: "🇧🇾", label: { uk: "Білорусь", en: "Belarus", ru: "Беларусь" }, search: "belarus беларусь by" },
  { code: "uz", flag: "🇺🇿", label: { uk: "Узбекистан", en: "Uzbekistan", ru: "Узбекистан" }, search: "uzbekistan узбекистан uz" },
  { code: "az", flag: "🇦🇿", label: { uk: "Азербайджан", en: "Azerbaijan", ru: "Азербайджан" }, search: "azerbaijan азербайджан az" },
  { code: "ge", flag: "🇬🇪", label: { uk: "Грузія", en: "Georgia", ru: "Грузия" }, search: "georgia грузия ge" },
  { code: "am", flag: "🇦🇲", label: { uk: "Вірменія", en: "Armenia", ru: "Армения" }, search: "armenia армения am" },
  { code: "md", flag: "🇲🇩", label: { uk: "Молдова", en: "Moldova", ru: "Молдова" }, search: "moldova молдова md" },
  { code: "kg", flag: "🇰🇬", label: { uk: "Киргизстан", en: "Kyrgyzstan", ru: "Киргизстан" }, search: "kyrgyzstan киргизстан kg" },
  { code: "tj", flag: "🇹🇯", label: { uk: "Таджикистан", en: "Tajikistan", ru: "Таджикистан" }, search: "tajikistan таджикистан tj" },
  { code: "tm", flag: "🇹🇲", label: { uk: "Туркменістан", en: "Turkmenistan", ru: "Туркменистан" }, search: "turkmenistan туркменистан tm" },
  { code: "de", flag: "🇩🇪", label: { uk: "Німеччина", en: "Germany", ru: "Германия" }, search: "germany германия de deutschland" },
  { code: "pl", flag: "🇵🇱", label: { uk: "Польща", en: "Poland", ru: "Польша" }, search: "poland польша pl" },
  { code: "tr", flag: "🇹🇷", label: { uk: "Туреччина", en: "Turkey", ru: "Турция" }, search: "turkey турция tr" },
  { code: "in", flag: "🇮🇳", label: { uk: "Індія", en: "India", ru: "Индия" }, search: "india индия in" },
  { code: "br", flag: "🇧🇷", label: { uk: "Бразилія", en: "Brazil", ru: "Бразилия" }, search: "brazil бразилия br" },
  { code: "mx", flag: "🇲🇽", label: { uk: "Мексика", en: "Mexico", ru: "Мексика" }, search: "mexico мексика mx" },
  { code: "ca", flag: "🇨🇦", label: { uk: "Канада", en: "Canada", ru: "Канада" }, search: "canada канада ca" },
  { code: "au", flag: "🇦🇺", label: { uk: "Австралія", en: "Australia", ru: "Австралия" }, search: "australia австралия au" },
];

const GEO_BY_CODE = new Map(GENERATOR_GEO_REGIONS.map((g) => [g.code, g]));

/**
 * @param {string} code
 * @param {"uk"|"en"|"ru"} [locale]
 */
export function getGeoRegionByCode(code, locale = "ru") {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return null;
  const row = GEO_BY_CODE.get(c);
  if (!row) return null;
  const loc = ["uk", "en", "ru"].includes(locale) ? locale : "ru";
  return {
    code: row.code,
    flag: row.flag,
    label: row.label[loc],
    search: row.search,
  };
}

/**
 * @param {string} query
 * @param {"uk"|"en"|"ru"} [locale]
 */
export function filterGeoRegions(query, locale = "ru") {
  const q = String(query || "").trim().toLowerCase();
  const loc = ["uk", "en", "ru"].includes(locale) ? locale : "ru";
  if (!q) return GENERATOR_GEO_REGIONS.map((g) => ({ ...g, displayLabel: g.label[loc] }));
  return GENERATOR_GEO_REGIONS.filter((g) => {
    const label = g.label[loc].toLowerCase();
    return (
      label.includes(q) ||
      g.code.includes(q) ||
      g.search.toLowerCase().includes(q) ||
      Object.values(g.label).some((l) => l.toLowerCase().includes(q))
    );
  }).map((g) => ({ ...g, displayLabel: g.label[loc] }));
}

/**
 * Label for SEO prompts (Russian by default for content).
 * @param {string} code
 */
export function geoLabelForSeoPrompt(code) {
  const g = getGeoRegionByCode(code, "ru");
  return g ? `${g.label} (${g.code.toUpperCase()})` : "";
}
