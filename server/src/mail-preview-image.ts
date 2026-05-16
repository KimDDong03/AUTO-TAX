import { simpleParser } from "mailparser";
import { chromium, type Browser, type Page } from "playwright";
import type { InboxMessage } from "./domain.js";

export const KEPCO_AMOUNT_SECTION_KEYWORDS = ["구입전력금액", "공급가액", "VAT", "부가세"] as const;

export type MailPreviewGeneratedFrom = "raw-source-html" | "raw-source-text" | "stored-text-body";
export type MailPreviewCropKind = "kepco-amount-section" | "keyword-window" | "text-keyword-window" | "body-fallback";

export interface MailPreviewImageResponse {
  imageDataUrl: string;
  width: number;
  height: number;
  sourceMessageId: number;
  generatedFrom: MailPreviewGeneratedFrom;
  cropKind: MailPreviewCropKind;
}

export interface KepcoAmountTextWindow {
  startLine: number;
  endLine: number;
  matchedKeywords: string[];
}

type SourceMessageForPreview = Pick<InboxMessage, "id" | "rawSource" | "textBody">;

type RenderedCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
  cropKind: MailPreviewCropKind;
};

const MAIL_PREVIEW_VIEWPORT = {
  width: 980,
  height: 1400
};
const MAX_PREVIEW_WIDTH = 1200;
const MAX_PREVIEW_HEIGHT = 900;
const MIN_PREVIEW_WIDTH = 360;
const MIN_PREVIEW_HEIGHT = 160;
const LOCKED_PREVIEW_HEAD = `
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none';" />
  <style>
    *,
    *::before,
    *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
    }

    html,
    body {
      background: #ffffff !important;
    }

    img {
      max-width: 100%;
    }
  </style>
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeKeywordText(value: string): string {
  return value.replace(/\s+/g, "");
}

function collectMatchedKeywords(value: string): string[] {
  const normalizedValue = normalizeKeywordText(value);
  return KEPCO_AMOUNT_SECTION_KEYWORDS.filter((keyword) => normalizedValue.includes(normalizeKeywordText(keyword)));
}

export function findKepcoAmountTextWindow(sourceText: string, contextLines = 4): KepcoAmountTextWindow | null {
  const lines = sourceText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const matches: Array<{ index: number; keywords: string[] }> = [];

  lines.forEach((line, index) => {
    const keywords = collectMatchedKeywords(line);
    if (keywords.length > 0) {
      matches.push({ index, keywords });
    }
  });

  if (matches.length === 0) {
    return null;
  }

  const allMatchedKeywords = Array.from(new Set(matches.flatMap((match) => match.keywords)));
  const startLine = Math.max(0, matches[0].index - contextLines);
  const endLine = Math.min(lines.length - 1, matches[matches.length - 1].index + contextLines);

  return {
    startLine,
    endLine,
    matchedKeywords: allMatchedKeywords
  };
}

function buildTextPreviewHtml(textBody: string): string {
  return `<!doctype html>
<html>
  <head>
    ${LOCKED_PREVIEW_HEAD}
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
      }

      pre {
        box-sizing: border-box;
        min-width: 100%;
        margin: 0;
        padding: 24px;
        color: #111111;
        font: 14px/1.55 Consolas, "Courier New", monospace;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
    </style>
  </head>
  <body>
    <pre data-mail-preview-text="true">${escapeHtml(textBody)}</pre>
  </body>
</html>`;
}

function buildHtmlPreviewDocument(htmlBody: string): string {
  if (/<head[\s>]/i.test(htmlBody)) {
    return htmlBody.replace(/<head([^>]*)>/i, `<head$1>${LOCKED_PREVIEW_HEAD}`);
  }

  if (/<html[\s>]/i.test(htmlBody)) {
    return htmlBody.replace(/<html([^>]*)>/i, `<html$1><head>${LOCKED_PREVIEW_HEAD}</head>`);
  }

  return `<!doctype html><html><head>${LOCKED_PREVIEW_HEAD}</head><body>${htmlBody}</body></html>`;
}

async function createLockedDownPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    viewport: MAIL_PREVIEW_VIEWPORT,
    deviceScaleFactor: 1,
    javaScriptEnabled: false,
    offline: true
  });

  return await context.newPage();
}

async function preparePageForScreenshot(page: Page): Promise<{ width: number; height: number }> {
  await page.evaluate("globalThis.__name = (fn) => fn");

  const size = await page.evaluate(() => {
    const globalRef = globalThis as unknown as {
      document: {
        body: { scrollWidth: number; scrollHeight: number };
        documentElement: { scrollWidth: number; scrollHeight: number };
      };
    };
    const body = globalRef.document.body;
    const documentElement = globalRef.document.documentElement;
    return {
      width: Math.ceil(Math.max(body.scrollWidth, documentElement.scrollWidth, 640)),
      height: Math.ceil(Math.max(body.scrollHeight, documentElement.scrollHeight, 480))
    };
  });

  await page.setViewportSize({
    width: Math.min(Math.max(size.width, MAIL_PREVIEW_VIEWPORT.width), MAX_PREVIEW_WIDTH),
    height: Math.min(Math.max(size.height, MAIL_PREVIEW_VIEWPORT.height), 3200)
  });

  return size;
}

function clampCrop(rawCrop: RenderedCrop, pageSize: { width: number; height: number }): RenderedCrop {
  const padding = 28;
  const pageWidth = Math.max(pageSize.width, MAIL_PREVIEW_VIEWPORT.width);
  const pageHeight = Math.max(pageSize.height, MAIL_PREVIEW_VIEWPORT.height);
  const x = Math.max(0, Math.floor(rawCrop.x - padding));
  const y = Math.max(0, Math.floor(rawCrop.y - padding));
  const right = Math.min(pageWidth, Math.ceil(rawCrop.x + rawCrop.width + padding));
  const bottom = Math.min(pageHeight, Math.ceil(rawCrop.y + rawCrop.height + padding));
  const width = Math.min(Math.max(right - x, MIN_PREVIEW_WIDTH), MAX_PREVIEW_WIDTH);
  const height = Math.min(Math.max(bottom - y, MIN_PREVIEW_HEIGHT), MAX_PREVIEW_HEIGHT);

  return {
    x,
    y,
    width,
    height,
    cropKind: rawCrop.cropKind
  };
}

async function detectRenderedAmountCrop(page: Page, pageSize: { width: number; height: number }): Promise<RenderedCrop> {
  const detectedCrop = await page.evaluate((keywords: string[]) => {
    type BrowserRect = { x: number; y: number; width: number; height: number; right: number; bottom: number };
    type BrowserCandidate = {
      rect: BrowserRect;
      area: number;
      keywordCount: number;
      exactAmountHint: boolean;
    };
    const globalRef = globalThis as unknown as {
      document: {
        body: {
          querySelectorAll: (selector: string) => unknown[];
          getBoundingClientRect: () => BrowserRect;
          textContent: string | null;
        };
        createRange: () => {
          selectNodeContents: (node: unknown) => void;
          getBoundingClientRect: () => BrowserRect;
          detach?: () => void;
        };
        createTreeWalker: (root: unknown, whatToShow: number) => {
          nextNode: () => unknown | null;
        };
      };
      getComputedStyle: (element: unknown) => { display: string; visibility: string; opacity: string };
      NodeFilter: { SHOW_TEXT: number };
    };
    const documentRef = globalRef.document;
    const normalize = (value: string) => value.replace(/\s+/g, "");
    const normalizedKeywords = keywords.map(normalize);
    const body = documentRef.body;
    const bodyRect = body.getBoundingClientRect();
    const bodyArea = Math.max(1, bodyRect.width * bodyRect.height);
    const isVisible = (element: unknown, rect: BrowserRect) => {
      const style = globalRef.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    };
    const candidates: BrowserCandidate[] = [];

    for (const element of Array.from(body.querySelectorAll("*"))) {
      const typedElement = element as {
        tagName?: string;
        textContent?: string | null;
        getBoundingClientRect?: () => BrowserRect;
      };
      if (!typedElement.getBoundingClientRect) {
        continue;
      }

      const tagName = typedElement.tagName ?? "";
      if (["SCRIPT", "STYLE", "NOSCRIPT", "META", "LINK"].includes(tagName)) {
        continue;
      }

      const textContent = typedElement.textContent ?? "";
      const normalizedText = normalize(textContent);
      const matchedKeywordCount = normalizedKeywords.filter((keyword) => normalizedText.includes(keyword)).length;
      if (matchedKeywordCount < 2 || !/[\d원]/.test(textContent)) {
        continue;
      }

      const rect = typedElement.getBoundingClientRect();
      if (!isVisible(element, rect)) {
        continue;
      }

      const area = rect.width * rect.height;
      if (area <= 80 || area > bodyArea * 0.96) {
        continue;
      }

      candidates.push({
        rect,
        area,
        keywordCount: matchedKeywordCount,
        exactAmountHint: normalize(textContent).includes("구입전력금액")
      });
    }

    candidates.sort((left, right) => {
      if (left.exactAmountHint !== right.exactAmountHint) {
        return left.exactAmountHint ? -1 : 1;
      }
      if (left.keywordCount !== right.keywordCount) {
        return right.keywordCount - left.keywordCount;
      }
      return left.area - right.area;
    });

    const bestCandidate = candidates[0];
    if (bestCandidate) {
      return {
        x: bestCandidate.rect.x,
        y: bestCandidate.rect.y,
        width: bestCandidate.rect.width,
        height: bestCandidate.rect.height,
        cropKind: "kepco-amount-section" as MailPreviewCropKind
      };
    }

    const keywordRects: BrowserRect[] = [];
    const walker = documentRef.createTreeWalker(body, globalRef.NodeFilter.SHOW_TEXT);
    let nextNode = walker.nextNode();
    while (nextNode) {
      const nodeText = (nextNode as { textContent?: string | null }).textContent ?? "";
      if (normalizedKeywords.some((keyword) => normalize(nodeText).includes(keyword))) {
        const range = documentRef.createRange();
        range.selectNodeContents(nextNode);
        const rect = range.getBoundingClientRect();
        range.detach?.();
        if (rect.width > 0 && rect.height > 0) {
          keywordRects.push(rect);
        }
      }
      nextNode = walker.nextNode();
    }

    if (keywordRects.length > 0) {
      const left = Math.min(...keywordRects.map((rect) => rect.x));
      const top = Math.min(...keywordRects.map((rect) => rect.y));
      const right = Math.max(...keywordRects.map((rect) => rect.right));
      const bottom = Math.max(...keywordRects.map((rect) => rect.bottom));
      return {
        x: Math.max(0, left - 80),
        y: Math.max(0, top - 80),
        width: Math.max(420, right - left + 420),
        height: Math.max(180, bottom - top + 180),
        cropKind: "keyword-window" as MailPreviewCropKind
      };
    }

    return {
      x: 0,
      y: 0,
      width: Math.max(640, Math.min(bodyRect.width, 980)),
      height: Math.max(320, Math.min(bodyRect.height, 700)),
      cropKind: "body-fallback" as MailPreviewCropKind
    };
  }, [...KEPCO_AMOUNT_SECTION_KEYWORDS]);

  return clampCrop(detectedCrop, pageSize);
}

async function renderCurrentPagePreview(page: Page, generatedFrom: MailPreviewGeneratedFrom): Promise<Omit<MailPreviewImageResponse, "sourceMessageId" | "generatedFrom">> {
  const pageSize = await preparePageForScreenshot(page);
  const crop = await detectRenderedAmountCrop(page, pageSize);
  const normalizedCrop = generatedFrom === "raw-source-text" || generatedFrom === "stored-text-body"
    ? { ...crop, cropKind: crop.cropKind === "body-fallback" ? "body-fallback" : "text-keyword-window" as MailPreviewCropKind }
    : crop;
  const imageBuffer = await page.screenshot({
    type: "png",
    clip: {
      x: normalizedCrop.x,
      y: normalizedCrop.y,
      width: normalizedCrop.width,
      height: normalizedCrop.height
    }
  });

  return {
    imageDataUrl: `data:image/png;base64,${imageBuffer.toString("base64")}`,
    width: normalizedCrop.width,
    height: normalizedCrop.height,
    cropKind: normalizedCrop.cropKind
  };
}

function buildTextFallbackImage(
  bodyForRendering: string,
  generatedFrom: MailPreviewGeneratedFrom,
  sourceMessageId: number
): MailPreviewImageResponse {
  const lines = bodyForRendering
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .split("\n")
    .filter((line) => line.trim() !== "");
  const previewLines = lines.length > 0 ? lines.slice(0, 24) : ["미리보기 텍스트가 없습니다."];
  const lineHeight = 30;
  const width = 980;
  const height = Math.max(260, previewLines.length * lineHeight + 100);
  const yOffset = 50;
  const lineElements = previewLines
    .map(
      (line, index) =>
        `<text x="30" y="${yOffset + index * lineHeight}" font-size="20" font-family="Consolas, 'Courier New', monospace">${escapeXml(line)}</text>`
    )
    .join("\n");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
  <rect width="${width}" height="${height}" fill="#ffffff" />
  <text x="26" y="30" font-size="17" font-family="Arial, sans-serif" fill="#444444">메일 원문 미리보기</text>
  <line x1="26" y1="40" x2="${width - 26}" y2="40" stroke="#d0d0d0" />
  ${lineElements}
</svg>`;

  return {
    imageDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    width,
    height,
    sourceMessageId,
    generatedFrom,
    cropKind: generatedFrom === "raw-source-html" ? "body-fallback" : "text-keyword-window"
  };
}

async function renderMailPreviewWithBrowser(bodyForRendering: string, generatedFrom: MailPreviewGeneratedFrom): Promise<
  Omit<MailPreviewImageResponse, "sourceMessageId" | "generatedFrom"> | null
> {
  let browser: Browser | null = null;
  let page: Page | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    page = await createLockedDownPage(browser);

    if (generatedFrom === "raw-source-html") {
      await page.setContent(buildHtmlPreviewDocument(bodyForRendering), { waitUntil: "domcontentloaded", timeout: 10000 });
    } else {
      await page.setContent(buildTextPreviewHtml(bodyForRendering), { waitUntil: "domcontentloaded", timeout: 10000 });
    }

    return await renderCurrentPagePreview(page, generatedFrom);
  } catch {
    return null;
  } finally {
    if (page) {
      try {
        await page.context().close();
      } catch {
        // ignore browser cleanup failure on serverless environments
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore browser cleanup failure on serverless environments
      }
    }
  }
}

export async function renderMailPreviewImage(message: SourceMessageForPreview): Promise<MailPreviewImageResponse> {
  const rawSource = message.rawSource.trim();
  const storedTextBody = message.textBody.trim();
  if (!rawSource && !storedTextBody) {
    throw new Error("원본 메일 본문을 찾지 못했습니다.");
  }

  let htmlBody = "";
  let parsedTextBody = "";
  if (rawSource) {
    try {
      const parsedMime = await simpleParser(Buffer.from(rawSource, "utf8"));
      htmlBody = typeof parsedMime.html === "string" ? parsedMime.html : "";
      parsedTextBody = parsedMime.text?.trim() ?? "";
    } catch {
      parsedTextBody = "";
      htmlBody = "";
    }
  }

  const generatedFrom: MailPreviewGeneratedFrom = htmlBody.trim()
    ? "raw-source-html"
    : parsedTextBody
      ? "raw-source-text"
      : "stored-text-body";
  const bodyForRendering = generatedFrom === "raw-source-html" ? htmlBody : parsedTextBody || storedTextBody || rawSource;

  const preview = await renderMailPreviewWithBrowser(bodyForRendering, generatedFrom);
  if (preview) {
    return {
      ...preview,
      sourceMessageId: message.id,
      generatedFrom
    };
  }

  return buildTextFallbackImage(bodyForRendering, generatedFrom, message.id);
}
