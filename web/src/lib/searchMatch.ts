const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const HANGUL_INITIAL_INTERVAL = 588;
const HANGUL_INITIAL_CONSONANTS = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ"
] as const;
const HANGUL_INITIAL_CONSONANT_SET = new Set<string>(HANGUL_INITIAL_CONSONANTS);
const HANGUL_COMPAT_CONSONANT_CLUSTERS: Record<string, string> = {
  ㄳ: "ㄱㅅ",
  ㄵ: "ㄴㅈ",
  ㄶ: "ㄴㅎ",
  ㄺ: "ㄹㄱ",
  ㄻ: "ㄹㅁ",
  ㄼ: "ㄹㅂ",
  ㄽ: "ㄹㅅ",
  ㄾ: "ㄹㅌ",
  ㄿ: "ㄹㅍ",
  ㅀ: "ㄹㅎ",
  ㅄ: "ㅂㅅ"
};

export function normalizeSearchValue(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function compactSearchValue(value: string): string {
  return normalizeSearchValue(value).replace(/[\s-]+/g, "");
}

export function isInitialConsonantQuery(value: string): boolean {
  const compactValue = normalizeInitialConsonantQuery(value);
  return compactValue.length > 0 && [...compactValue].every((character) => HANGUL_INITIAL_CONSONANT_SET.has(character));
}

export function normalizeInitialConsonantQuery(value: string): string {
  return [...value.replace(/\s+/g, "")]
    .map((character) => HANGUL_COMPAT_CONSONANT_CLUSTERS[character] ?? character)
    .join("");
}

export function extractInitialConsonants(value: string): string {
  let result = "";

  for (const character of value.replace(/\s+/g, "")) {
    const codePoint = character.charCodeAt(0);

    if (codePoint >= HANGUL_SYLLABLE_START && codePoint <= HANGUL_SYLLABLE_END) {
      const syllableIndex = codePoint - HANGUL_SYLLABLE_START;
      result += HANGUL_INITIAL_CONSONANTS[Math.floor(syllableIndex / HANGUL_INITIAL_INTERVAL)];
      continue;
    }

    if (HANGUL_INITIAL_CONSONANT_SET.has(character)) {
      result += character;
    }
  }

  return result;
}

export function matchesSearchText(value: string | number | null | undefined, query: string): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  if (normalizedQuery === "") {
    return true;
  }

  const text = String(value ?? "");
  if (normalizeSearchValue(text).includes(normalizedQuery)) {
    return true;
  }

  const compactQuery = compactSearchValue(query);
  if (compactQuery.length > 0 && compactSearchValue(text).includes(compactQuery)) {
    return true;
  }

  return isInitialConsonantQuery(query) && extractInitialConsonants(text).includes(normalizeInitialConsonantQuery(query));
}

export function matchesAnySearchText(query: string, values: Array<string | number | null | undefined>): boolean {
  const normalizedQuery = normalizeSearchValue(query);
  return normalizedQuery === "" || values.some((value) => matchesSearchText(value, query));
}
