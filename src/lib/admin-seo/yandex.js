import { XMLParser } from "fast-xml-parser";

/** Override via env (full base URL including user/key query params). */
const YANDEX_XML_BASE =
  process.env.YANDEX_XML_STOCK_BASE_URL?.trim() ||
  "https://xmlstock.com/yandex/xml/?user=13764&key=253e0a72da2cb48f674e083b0fcdb023";
export const YANDEX_TOP_LIMIT = 100;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  parseTagValue: true,
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export function normalizeDomain(domain) {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function getHostname(urlString) {
  try {
    const withProtocol = /^https?:\/\//i.test(urlString) ? urlString : `https://${urlString}`;
    return new URL(withProtocol).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function matchesDomain(resultUrl, targetDomain) {
  const host = getHostname(resultUrl);
  return host === targetDomain || host.endsWith(`.${targetDomain}`);
}

export async function fetchYandexXml(query, page = 0) {
  const params = new URLSearchParams({
    query,
    lr: "213",
    l10n: "ru",
    sortby: "rlv",
    filter: "none",
    maxpassages: "1",
    groupby: "attr=d.mode=flat.groups-on-page=100.docs-in-group=1",
    page: String(page),
  });

  const maxAttempts = 5;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(`${YANDEX_XML_BASE}&${params.toString()}`, {
      cache: "no-store",
    });
    const xml = await response.text();

    if (!response.ok) {
      throw new Error(`Yandex XML request failed: ${response.status}`);
    }

    const parsed = parser.parse(xml);
    const apiError = parsed?.yandexsearch?.response?.error;

    if (!apiError) {
      return parsed;
    }

    const message = typeof apiError === "string" ? apiError : apiError["#text"];
    const isPending = (message || "").toLowerCase().includes("запрос еще не обработан");
    lastError = new Error(message || "Yandex XML returned an error");

    if (!isPending || attempt === maxAttempts) {
      throw lastError;
    }

    await sleep(600 * attempt);
  }

  throw lastError || new Error("Yandex XML request failed");
}

export async function fetchYandexTopData(query, topLimit = YANDEX_TOP_LIMIT) {
  const groupsPerPage = 100;
  const pagesToLoad = Math.max(1, Math.ceil(topLimit / groupsPerPage));
  const allResults = [];
  let searchFrequency = null;

  for (let page = 0; page < pagesToLoad; page += 1) {
    const parsedXml = await fetchYandexXml(query, page);
    if (page === 0) {
      searchFrequency = extractKeywordFrequency(parsedXml);
    }

    const pageResults = extractResults(parsedXml);
    allResults.push(...pageResults);

    if (pageResults.length < groupsPerPage) {
      break;
    }
  }

  return {
    results: allResults.slice(0, topLimit),
    searchFrequency,
    resultsChecked: Math.min(allResults.length, topLimit),
  };
}

export function extractResults(parsedXml) {
  const grouping = parsedXml?.yandexsearch?.response?.results?.grouping;
  const groups = asArray(grouping?.group);

  return groups
    .map((group) => {
      const doc = asArray(group?.doc)[0];
      return {
        url: doc?.url || "",
        title: doc?.title || "",
      };
    })
    .filter((item) => item.url);
}

export function findDomainPosition(results, domain) {
  const index = results.findIndex((result) => matchesDomain(result.url, domain));
  return index >= 0 ? index + 1 : null;
}

export function extractKeywordFrequency(parsedXml) {
  const found = parsedXml?.yandexsearch?.response?.found;
  const list = asArray(found);
  const phraseItem =
    list.find((item) => item?.priority === "phrase") ||
    list.find((item) => item?.priority === "strict") ||
    list[0];

  if (typeof phraseItem === "number") {
    return phraseItem;
  }
  if (typeof phraseItem === "string") {
    const parsed = Number(phraseItem);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (phraseItem && typeof phraseItem["#text"] !== "undefined") {
    const parsed = Number(phraseItem["#text"]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
