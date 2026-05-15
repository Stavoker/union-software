import { NextResponse } from "next/server";
import {
  fetchYandexTopData,
  findDomainPosition,
  normalizeDomain,
} from "@/lib/admin-seo/yandex";

function asArray(value) {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export async function POST(request) {
  const body = await request.json();
  const keywords = asArray(body?.keywords)
    .map((value) => String(value).trim())
    .filter(Boolean);
  const domains = asArray(body?.domains)
    .map((value) => normalizeDomain(String(value)))
    .filter(Boolean);

  if (!keywords.length || !domains.length) {
    return NextResponse.json(
      { error: "keywords and domains arrays are required" },
      { status: 400 }
    );
  }

  try {
    const rows = [];
    const errors = [];

    for (const keyword of keywords) {
      const row = {
        keyword,
        totalResultsChecked: 0,
        searchFrequency: null,
        domains: {},
      };

      try {
        const { results, searchFrequency, resultsChecked } = await fetchYandexTopData(keyword);
        row.totalResultsChecked = resultsChecked;
        row.searchFrequency = searchFrequency;

        for (const domain of domains) {
          const position = findDomainPosition(results, domain);
          row.domains[domain] = {
            position,
            indexed: position !== null,
          };
        }
      } catch (error) {
        errors.push({
          keyword,
          message: error.message || "Unknown error",
        });

        for (const domain of domains) {
          row.domains[domain] = {
            position: null,
            indexed: false,
          };
        }
      }

      rows.push(row);
    }

    return NextResponse.json({
      keywords,
      domains,
      rows,
      errors,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to check positions",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
