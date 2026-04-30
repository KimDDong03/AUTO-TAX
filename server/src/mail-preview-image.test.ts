import assert from "node:assert/strict";
import test from "node:test";
import { findKepcoAmountTextWindow } from "./mail-preview-image.js";

test("KEPCO amount window detection finds the amount section in HTML mail", () => {
  const sampleHtml = `
    <html>
      <body>
        <p>한국전력공사 전력거래 정산 안내</p>
        <table>
          <tr><th>구입전력금액</th><th>공급가액</th><th>VAT</th></tr>
          <tr><td>합계</td><td>1,234,000원</td><td>123,400원</td></tr>
        </table>
      </body>
    </html>
  `;

  const window = findKepcoAmountTextWindow(sampleHtml);

  assert.notEqual(window, null);
  assert.deepEqual(window?.matchedKeywords.sort(), ["VAT", "공급가액", "구입전력금액"].sort());
  assert.ok((window?.endLine ?? 0) >= (window?.startLine ?? 0));
});

test("KEPCO amount window detection finds the amount section in text mail", () => {
  const sampleText = [
    "한국전력공사 전력거래 정산 안내",
    "발전소명: 테스트 태양광",
    "정산월: 2026-04",
    "구입전력금액",
    "공급가액 1,234,000원",
    "VAT 123,400원",
    "합계 1,357,400원",
    "문의: kepco@example.com"
  ].join("\n");

  const window = findKepcoAmountTextWindow(sampleText, 1);

  assert.deepEqual(window, {
    startLine: 2,
    endLine: 6,
    matchedKeywords: ["구입전력금액", "공급가액", "VAT"]
  });
});
