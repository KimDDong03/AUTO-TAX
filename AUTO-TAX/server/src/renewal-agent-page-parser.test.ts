import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRenewInfoComparison,
  buildRenewInfoPaymentPreviewRequest,
  parseRenewInfoFlow,
  parseRenewInfoSnapshot,
  parseRenewInfoPaymentPreview
} from "./services/renewal-page-parser.js";

const renewInfoHtml = `
<!doctype html>
<html lang="ko">
  <head>
    <title>한국정보인증 - 인증서발급 전자계약SignOK 인증솔루션 SSL </title>
    <script>
      document.title="갱신정보 입력 | 사업자(개인/법인) | 한국정보인증";
    </script>
  </head>
  <body>
    <form id="aplyInfForm" name="ordForms" data-sectionType="aply" class="kicaValidateTarget" method="post" style="display:none;">
      <input type="hidden" name="userSeCd" id="devUserSeCd" value="USM201" />
      <input type="password" id="ordPw" name="ordPw" />
      <input type="text" name="ordEntprsBizcnd" />
      <input type="text" name="ordEntprsIndstr" />
      <input type="text" name="ordrrBassAddr" />
      <input type="text" name="ordEntprsChargrNm" />
      <input type="text" name="ordEntprsChargrEmail" />
    </form>

    <form id="prodForm" data-sectionType="prod" data-kica-validateCandi="true">
      <input type="hidden" name="raId" value="signgate" />
      <input type="hidden" name="prodKey" value="certTax" />
      <input type="hidden" name="prodNm" value="전자세금계산서용" />
      <input type="hidden" name="amount" value="4400" />
    </form>

    <form id="payInfForm">
      <h3 class="typ2"><strong>1234567890</strong></h3>
    </form>

    <div id="pprsPrsntnSection">
      <label><input type="radio" name="pprsRecptMthdCd" value="EMAIL" checked /></label>
    </div>

    <form style="display:none;" method="post" id="applyForm" action='/renew/stepEntrpsRenewPaymentConfirm.sg'>
      <input type="hidden" class="mustHave" id="csrfToken" name="CSRF_TOKEN" value="-7124179303299332328" />
      <input type="hidden" class="mustHave" name="adiUseYN" value="Y" />
      <input type="hidden" class="mustHave" name="ordno" value="d0fa45dbcf0349e4a1cf026545161fe6" />
      <input type="hidden" class="mustHave" name="ordSeq" value="1" />
      <input type="hidden" class="mustHave" name="raId" value="signgate" />
      <input type="hidden" class="mustHave" name="inflwRaId" value="signgate" />
      <input type="hidden" class="mustHave" name="renewProdChangeYN" value="N" />
      <input type="hidden" id="finalNum" value="5" />
    </form>
  </body>
</html>
`;

test("parseRenewInfoFlow extracts submit metadata and form fields", () => {
  const parsed = parseRenewInfoFlow(
    renewInfoHtml,
    "https://www.signgate.com/renew/stepEntrpsApplyInfoInput.sg"
  );

  assert.deepEqual(parsed, {
    renewInfoPageTitle: "갱신정보 입력 | 사업자(개인/법인) | 한국정보인증",
    renewInfoSubmitUrl: "https://www.signgate.com/renew/stepEntrpsRenewPaymentConfirm.sg",
    renewInfoSubmitPathKind: "renew",
    renewInfoFormFieldNames: [
      "userSeCd",
      "ordPw",
      "ordEntprsBizcnd",
      "ordEntprsIndstr",
      "ordrrBassAddr",
      "ordEntprsChargrNm",
      "ordEntprsChargrEmail"
    ],
    renewInfoMustHaveFieldNames: [
      "CSRF_TOKEN",
      "adiUseYN",
      "ordno",
      "ordSeq",
      "raId",
      "inflwRaId",
      "renewProdChangeYN"
    ],
    renewInfoFinalNum: "5"
  });
});

test("buildRenewInfoPaymentPreviewRequest recreates payment preview payload", () => {
  const request = new URLSearchParams(
    buildRenewInfoPaymentPreviewRequest(
      renewInfoHtml,
      "https://www.signgate.com/renew/stepEntrpsApplyInfoInput.sg"
    )
  );

  const prodKeys = request.getAll("prodKey");
  assert.equal(prodKeys.length, 2);
  assert.deepEqual(JSON.parse(prodKeys[0] ?? "{}"), {
    raId: "signgate",
    prodKey: "certTax",
    prodNm: "전자세금계산서용",
    amount: "4400"
  });
  assert.equal(prodKeys[0], prodKeys[1]);
  assert.equal(request.get("serialNo"), "1234567890");
  assert.equal(request.get("certJobPrgrsSeCd"), "RENW");
  assert.equal(request.get("pprsRecptMthdCd"), "EMAIL");
  assert.equal(request.get("CSRF_TOKEN"), "-7124179303299332328");
  assert.equal(request.get("ordno"), "d0fa45dbcf0349e4a1cf026545161fe6");
  assert.equal(request.get("renewProdChangeYN"), "N");
});

test("parseRenewInfoSnapshot extracts company and contact defaults", () => {
  const parsed = parseRenewInfoSnapshot(`
    <form name="disableWhenPrePro">
      <input type="text" name="ordrrEntprsNm" value="정혜원 발전소" />
      <input type="text" name="secOrdrrBizrno" value="123" />
      <input type="hidden" name="secOrdrrBizrno" value="-" />
      <input type="password" name="secOrdrrBizrno" value="45" />
      <input type="hidden" name="secOrdrrBizrno" value="-" />
      <input type="password" name="secOrdrrBizrno" value="67890" />
    </form>
    <form id="aplyInfForm">
      <input type="text" name="ordEntprsBizcnd" value="전기업" />
      <input type="text" name="ordEntprsIndstr" value="태양광발전" />
      <select name="ordEntprsBsnsRelmCd">
        <option value="">- 선택 -</option>
        <option value="D00000" selected>전기가스증기및수도사업</option>
      </select>
      <input type="text" name="ordEntprsRprsntvNm" value="정혜원" />
      <input type="text" name="ordrrZip" value="12575" />
      <input type="text" name="ordrrBassAddr" value="경기도 광명시 새빛로 152-0" />
      <input type="text" name="ordrrDtlAddr" value="A동 201호" />
      <input type="text" name="ordEntprsChargrNm" value="정혜원" />
      <input type="text" name="ordEntprsChargrDeptNm" value="세무팀" />
      <select name="ordEntprsChargrTel"><option value="054" selected>054</option></select>
      <input type="text" name="ordEntprsChargrTel1" value="123" />
      <input type="text" name="ordEntprsChargrTel2" value="4567" />
      <select name="ordEntprsChargrFax"><option value="054" selected>054</option></select>
      <input type="text" name="ordEntprsChargrFax1" value="111" />
      <input type="text" name="ordEntprsChargrFax2" value="2222" />
      <select name="ordEntprsChargrHpno"><option value="010" selected>010</option></select>
      <input type="text" name="ordEntprsChargrHpno1" value="9876" />
      <input type="text" name="ordEntprsChargrHpno2" value="5432" />
      <input type="text" name="ordEntprsChargrEmail1" value="renewal" />
      <input type="text" name="ordEntprsChargrEmail3" value="example.com" />
    </form>
  `);

  assert.deepEqual(parsed, {
    renewInfoSnapshot: {
      companyName: "정혜원 발전소",
      businessNumber: "123-45-67890",
      ceoName: "정혜원",
      bizType: "전기업",
      bizClass: "태양광발전",
      businessFieldCode: "D00000",
      postalCode: "12575",
      baseAddress: "경기도 광명시 새빛로 152-0",
      detailAddress: "A동 201호",
      contactName: "정혜원",
      contactDepartment: "세무팀",
      contactEmail: "renewal@example.com",
      contactTel: "054-123-4567",
      contactFax: "054-111-2222",
      contactMobile: "010-9876-5432"
    }
  });
});

test("parseRenewInfoSnapshot falls back to prodDetailJSON defaults when form values are blank", () => {
  const parsed = parseRenewInfoSnapshot(`
    <form name="disableWhenPrePro">
      <input type="text" name="ordrrEntprsNm" />
      <input type="text" name="secOrdrrBizrno" />
    </form>
    <form id="aplyInfForm">
      <input type="text" name="ordEntprsBizcnd" />
      <input type="text" name="ordEntprsIndstr" />
      <input type="text" name="ordEntprsRprsntvNm" />
      <input type="text" name="ordrrZip" />
      <input type="text" name="ordrrBassAddr" />
      <input type="text" name="ordrrDtlAddr" />
      <input type="text" name="ordEntprsChargrNm" />
      <input type="text" name="ordEntprsChargrDeptNm" />
      <input type="text" name="ordEntprsChargrEmail" />
    </form>
    <script>
      prodDetailJSON = [{"secOrdrrBizrno":"7311402870","ordrrEntprsNm":"정혜원 발전소","ordEntprsBizcnd":"전기업","ordEntprsIndstr":"태양광","ordEntprsBsnsRelmCd":"C00000","ordrrZip":"12575","ordrrBassAddr":"경기도 양평군 사호1길 152-0","ordEntprsRprsntvNm":"정혜원","ordEntprsChargrNm":"정혜원","ordEntprsChargrDeptNm":"대표","ordEntprsChargrEmail":"t7114@naver.com","ordEntprsChargrTel":"031-0000-0000","ordEntprsChargrFax":"0504-422-6816","ordEntprsChargrHpno":"010-5283-6506"}][0];
    </script>
  `);

  assert.deepEqual(parsed, {
    renewInfoSnapshot: {
      companyName: "정혜원 발전소",
      businessNumber: "7311402870",
      ceoName: "정혜원",
      bizType: "전기업",
      bizClass: "태양광",
      businessFieldCode: "C00000",
      postalCode: "12575",
      baseAddress: "경기도 양평군 사호1길 152-0",
      detailAddress: null,
      contactName: "정혜원",
      contactDepartment: "대표",
      contactEmail: "t7114@naver.com",
      contactTel: "031-0000-0000",
      contactFax: "0504-422-6816",
      contactMobile: "010-5283-6506"
    }
  });
});

test("buildRenewInfoComparison blocks auto submit when company fields differ", () => {
  const comparison = buildRenewInfoComparison(
    {
      companyName: "정혜원 발전소",
      businessNumber: "123-45-67890",
      ceoName: "정혜원",
      bizType: "전기업",
      bizClass: "태양광발전",
      businessFieldCode: "D00000",
      postalCode: "12575",
      baseAddress: "경기도 광명시 새빛로 152-0",
      detailAddress: "A동 201호",
      contactName: "정혜원",
      contactDepartment: "세무팀",
      contactEmail: "renewal@example.com",
      contactTel: "054-123-4567",
      contactFax: "054-111-2222",
      contactMobile: "010-9876-5432"
    },
    {
      corpName: "다른 회사",
      businessNumber: "1234567890",
      ceoName: "정혜원",
      addr: "서울특별시 강남구 테헤란로 1",
      bizType: "전기업",
      bizClass: "태양광발전"
    }
  );

  assert.deepEqual(comparison, {
    renewInfoBlockingMismatchFields: ["업체명", "사업장주소"],
    renewInfoAutoSubmitReady: false,
    renewInfoAutoSubmitSummary: "자동 제출 차단 · 업체명, 사업장주소 불일치"
  });
});

test("buildRenewInfoComparison normalizes trailing -0 in address values", () => {
  const comparison = buildRenewInfoComparison(
    {
      companyName: "정혜원 발전소",
      businessNumber: "7311402870",
      ceoName: "정혜원",
      bizType: "전기업",
      bizClass: "태양광",
      businessFieldCode: "C00000",
      postalCode: "12575",
      baseAddress: "경기도 양평군 사호1길 152-0",
      detailAddress: null,
      contactName: "정혜원",
      contactDepartment: "대표",
      contactEmail: "t7114@naver.com",
      contactTel: "031-0000-0000",
      contactFax: "0504-422-6816",
      contactMobile: "010-5283-6506"
    },
    {
      corpName: "정혜원 발전소",
      businessNumber: "7311402870",
      ceoName: "정혜원",
      addr: "경기도 양평군 사호1길 152",
      bizType: "전기업",
      bizClass: "태양광"
    }
  );

  assert.deepEqual(comparison, {
    renewInfoBlockingMismatchFields: [],
    renewInfoAutoSubmitReady: true,
    renewInfoAutoSubmitSummary: "고객 기본정보 일치"
  });
});

test("buildRenewInfoComparison defers when renew-info defaults are not exposed in html", () => {
  const comparison = buildRenewInfoComparison(
    null,
    {
      corpName: "정혜원 발전소",
      businessNumber: "7311402870",
      ceoName: "정혜원",
      addr: "경기도 양평군 사호1길 152",
      bizType: "전기업",
      bizClass: "태양광발전(자가용PPA)"
    }
  );

  assert.deepEqual(comparison, {
    renewInfoBlockingMismatchFields: [],
    renewInfoAutoSubmitReady: null,
    renewInfoAutoSubmitSummary: "비교 보류 · renew-info 기본값 미노출"
  });
});

test("parseRenewInfoPaymentPreview extracts items and total", () => {
  const parsed = parseRenewInfoPaymentPreview(`
    <div id="devSubPayInfForm">
      <table>
        <tbody>
          <tr>
            <th>전자세금계산서용</th>
            <td>1개</td>
            <td><strong>4,400 원</strong></td>
          </tr>
        </tbody>
      </table>
      <dl class="total-price">
        <dt>총 결제금액</dt>
        <dd>4,400 원</dd>
      </dl>
    </div>
  `);

  assert.deepEqual(parsed, {
    renewInfoPaymentPreviewLoaded: true,
    renewInfoPaymentPreviewItems: ["전자세금계산서용 / 1개 / 4,400 원"],
    renewInfoPaymentPreviewTotalAmount: "4,400 원",
    renewInfoPaymentPreviewHasAdditionalAgreement: false
  });
});
