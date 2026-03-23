import test from "node:test";
import assert from "node:assert/strict";
import { parseKepcoMail } from "./parser.js";

const sampleMail = `
-----Original Message-----
From: "한국전력공사"<kepco@kepco.co.kr>
To: "richsky73@naver.com"<richsky73@naver.com>;
Cc:
Sent: 2026-03-17 (화) 13:55:10 (GMT+09:00)
Subject: 신재생에너지 요금안내 (계약번호 : 5001046107)

이상택태양광발전소 2026.02월분 구입전력금액은 공급가액 기준 121,867원 입니다.

[공급가액 : 121,867원     VAT : 12,186원(일반사업자)]

 □ 기본사항
   ○ 발전소명 : 이상택태양광

   ○ 주 소 : 경상북도 의성군 중하길 397-3 (안사면 중하리522-0)

 □ 전자세금계산서 발행정보
   ○ 한전 메일 주소
      - 국세청 홈택스에서 발행 : kepcoppa@kepco.co.kr
      - 그 외 : ppa0194@kepco.co.kr
      - 종사업장번호 : 194 [필수입력]

 ※ 추가 당부사항
  [한전/경북본부]
★ 전자세금계산서 메일주소
kepcoppa@kepco.co.kr(홈택스 이용 시)
ppa0194@kepco.co.kr(타 기관 이용 시)
로 발송하여 주시기 바랍니다.
○ 등록번호: 120-82-00052
○ 종사업장: 194 (필수입력)
○ 상호: 한국전력공사
○ 성명: 김동철
○ 사업장 주소: 전라남도 나주시 전력로 55 (빛가람동, 한국전력공사)
○ 업태: 전기가스 / 종목: 전기공급

※문의사항은 054-850-2246으로 전화주시면 감사하겠습니다.
`;

test("parseKepcoMail extracts scoped KEPCO recipient fields", () => {
  const parsed = parseKepcoMail(sampleMail);

  assert.equal(parsed.plantName, "이상택태양광");
  assert.equal(parsed.plantAddress, "경상북도 의성군 중하길 397-3");
  assert.equal(parsed.kepcoCorpNum, "120-82-00052");
  assert.equal(parsed.kepcoBranchId, "0194");
  assert.equal(parsed.kepcoCorpName, "한국전력공사");
  assert.equal(parsed.kepcoCeoName, "김동철");
  assert.equal(parsed.kepcoAddr, "전라남도 나주시 전력로 55 (빛가람동, 한국전력공사)");
  assert.equal(parsed.kepcoBizType, "전기가스");
  assert.equal(parsed.kepcoBizClass, "전기공급");
  assert.equal(parsed.recipientEmail, "ppa0194@kepco.co.kr");
});
