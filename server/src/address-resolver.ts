import { toRoadAddress } from "./utils.js";

type ZipSearchCandidate = {
  address: string;
  postalCode: string;
  isRoadAddress: boolean;
  oldAddress: string | null;
};

type ResolvedRoadAddress = {
  input: string;
  resolvedAddress: string;
  postalCode: string;
  isRoadAddress: boolean;
  score: number;
};

const ZIP_SEARCH_CONFIDENCE_THRESHOLD = 300;
const responseCache = new Map<string, string>();

function normalizeWhitespace(value: string) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForSearch(value: string) {
  return normalizeWhitespace(value).replace(/[()[\],]/g, "").replace(/\s+/g, "").toLowerCase();
}

function normalizeAddressSpacing(value: string) {
  return normalizeWhitespace(
    String(value ?? "")
      .replace(/([0-9A-Za-z가-힣]+(?:대로|로|길|거리))(?=\d)/gu, "$1 ")
      .replace(/(\d(?:-\d+)?)(?=\()/gu, "$1 ")
  );
}

function digitsOnly(value: string) {
  return String(value ?? "").replace(/\D/g, "");
}

function decodeHtmlEntities(value: string) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)));
}

function extractRoadKey(value: string) {
  const match = normalizeWhitespace(value).match(/([0-9A-Za-z가-힣]+(?:대로|로|길|거리)\s*\d+(?:-\d+)?)/u);
  return match ? normalizeForSearch(match[1]) : "";
}

function getQueryTokens(value: string) {
  return normalizeWhitespace(value)
    .split(/\s+/)
    .map((token) => normalizeForSearch(token))
    .filter((token) => token.length >= 2);
}

async function postSigngateText(endpoint: string, payload: Record<string, string>) {
  const cacheKey = `${endpoint}?${new URLSearchParams(payload).toString()}`;
  const cached = responseCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  const response = await fetch(`https://www.signgate.com${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
    },
    body: new URLSearchParams(payload)
  });

  if (!response.ok) {
    throw new Error(`주소 검색 조회에 실패했습니다. (${response.status})`);
  }

  const text = await response.text();
  responseCache.set(cacheKey, text);
  return text;
}

function parseZipSearchCandidates(html: string): ZipSearchCandidate[] {
  const candidates: ZipSearchCandidate[] = [];
  const seen = new Set<string>();

  const rowPattern =
    /<tr>[\s\S]*?<a data-addr="([^"]*)" data-zip="([^"]*)"[^>]*>구주소\s*:\s*([^<]*)<\/a>[\s\S]*?<a data-addr="([^"]*)" data-zip="([^"]*)"[^>]*><b>신주소\s*:\s*([^<]*)<\/b><\/a>[\s\S]*?<\/tr>/gi;

  for (const match of html.matchAll(rowPattern)) {
    const oldAddress = normalizeWhitespace(decodeHtmlEntities(match[1] || match[3] || ""));
    const postalCode = digitsOnly(decodeHtmlEntities(match[2] || match[5] || ""));
    const address = normalizeWhitespace(decodeHtmlEntities(match[4] || match[6] || ""));

    if (!address || !postalCode) {
      continue;
    }

    const dedupeKey = `${postalCode}|${address}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    candidates.push({
      address,
      postalCode,
      isRoadAddress: true,
      oldAddress: oldAddress || null
    });
  }

  if (candidates.length > 0) {
    return candidates;
  }

  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const tag = match[0];
    const addressMatch = tag.match(/\bdata-addr="([^"]*)"/i);
    const postalCodeMatch = tag.match(/\bdata-zip="([^"]*)"/i);

    if (!addressMatch || !postalCodeMatch) {
      continue;
    }

    const address = normalizeWhitespace(decodeHtmlEntities(addressMatch[1]));
    const postalCode = digitsOnly(decodeHtmlEntities(postalCodeMatch[1]));

    if (!address || !postalCode) {
      continue;
    }

    const context = html.slice(Math.max(0, (match.index ?? 0) - 80), Math.min(html.length, (match.index ?? 0) + tag.length + 80));
    const isRoadAddress = /신주소/i.test(context);
    const dedupeKey = `${postalCode}|${address}`;

    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    candidates.push({
      address,
      postalCode,
      isRoadAddress,
      oldAddress: null
    });
  }

  return candidates;
}

function getZipSearchCandidateScore(query: string, candidate: ZipSearchCandidate) {
  const normalizedQuery = normalizeForSearch(query);
  const normalizedAddress = normalizeForSearch(candidate.address);
  const queryRoadKey = extractRoadKey(query);
  const candidateRoadKey = extractRoadKey(candidate.address);

  let score = 0;

  if (queryRoadKey && candidateRoadKey && queryRoadKey === candidateRoadKey) {
    score += 1000;
  }

  if (normalizedQuery && normalizedAddress.includes(normalizedQuery)) {
    score += 300;
  }

  for (const token of getQueryTokens(query)) {
    if (normalizedAddress.includes(token)) {
      score += 20;
    }
  }

  if (candidate.isRoadAddress) {
    score += 5;
  }

  return score;
}

function pickBestZipSearchCandidate(query: string, candidates: ZipSearchCandidate[]) {
  if (!normalizeWhitespace(query) || candidates.length === 0) {
    return null;
  }

  const rankedCandidates = candidates
    .map((candidate, index) => ({
      ...candidate,
      score: getZipSearchCandidateScore(query, candidate),
      index
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        Number(right.isRoadAddress) - Number(left.isRoadAddress) ||
        left.address.length - right.address.length ||
        left.index - right.index
    );

  const bestCandidate = rankedCandidates[0];
  if (!bestCandidate || bestCandidate.score < ZIP_SEARCH_CONFIDENCE_THRESHOLD) {
    return null;
  }

  const equallyRankedCandidates = rankedCandidates.filter((candidate) => candidate.score === bestCandidate.score);
  if (equallyRankedCandidates.length > 1) {
    return null;
  }

  return bestCandidate;
}

async function searchZipAddressCandidates(keyword: string) {
  const trimmedKeyword = normalizeWhitespace(keyword);
  if (!trimmedKeyword) {
    return [];
  }

  const variants = [trimmedKeyword, normalizeAddressSpacing(trimmedKeyword)].filter(
    (value, index, values) => value && values.indexOf(value) === index
  );

  const candidates: ZipSearchCandidate[] = [];
  const seen = new Set<string>();

  for (const currentKeyword of variants) {
    const html = await postSigngateText("/common/search/zipCodeSearchDBList.sg", {
      addrKeyWord: currentKeyword,
      currentPage: "1"
    });

    for (const candidate of parseZipSearchCandidates(html)) {
      const dedupeKey = `${candidate.postalCode}|${candidate.address}`;
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      candidates.push(candidate);
    }
  }

  return candidates;
}

export async function resolveRoadAddress(keyword: string): Promise<ResolvedRoadAddress | null> {
  const input = normalizeWhitespace(keyword);
  if (!input) {
    return null;
  }

  const bestCandidate = pickBestZipSearchCandidate(input, await searchZipAddressCandidates(input));
  if (!bestCandidate) {
    return null;
  }

  return {
    input,
    resolvedAddress: toRoadAddress(bestCandidate.address),
    postalCode: bestCandidate.postalCode,
    isRoadAddress: bestCandidate.isRoadAddress,
    score: bestCandidate.score
  };
}
