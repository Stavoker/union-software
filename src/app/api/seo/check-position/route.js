import { NextResponse } from "next/server";
import {
  fetchYandexTopData,
  findDomainPosition,
  normalizeDomain,
} from "@/lib/admin-seo/yandex";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("query") || "").trim();
  const domainRaw = (searchParams.get("domain") || "").trim();

  if (!query || !domainRaw) {
    return NextResponse.json(
      { error: "Both 'query' and 'domain' are required" },
      { status: 400 }
    );
  }

  const domain = normalizeDomain(domainRaw);

  try {
    const { results, resultsChecked } = await fetchYandexTopData(query);
    const position = findDomainPosition(results, domain);

    return NextResponse.json({
      query,
      domain,
      position,
      indexed: position !== null,
      resultsChecked,
    });
  } catch (error) {
    const details = error?.message || "Unknown error";
    const notFoundMessages = [
      "Искомая комбинация слов нигде не встречается",
      "Ничего не нашлось",
    ];
    if (notFoundMessages.some((message) => details.includes(message))) {
      return NextResponse.json({
        query,
        domain,
        position: null,
        indexed: false,
        resultsChecked: 0,
      });
    }

    return NextResponse.json(
      {
        error: "Failed to check position",
        details,
        query,
        domain,
      },
      { status: 500 }
    );
  }
}
