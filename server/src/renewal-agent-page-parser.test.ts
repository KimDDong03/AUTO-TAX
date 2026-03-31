import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEffectiveRenewInfoSubmissionProfile,
  buildRenewInfoComparison,
  buildRenewInfoPaymentPreviewRequest,
  buildRenewInfoSubmitProfileReadiness,
  buildRenewInfoSubmitRequest,
  parseRenewInfoSnapshotFromData,
  parseRenewInfoSubmitResult,
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
      prodDetailJSON = [{"secOrdrrBizrno":"7311402870","ordrrEntprsNm":"정혜원 발전소","ordEntprsBizcnd":"전기업","ordEntprsIndstr":"태양광","ordEntprsBsnsRelmCd":"C00000","ordrrZip":"12575","ordrrBassAddr":"경기도 양평군 사호1길 152-0","ordEntprsRprsntvNm":"정혜원","ordEntprsChargrNm":"정혜원","ordEntprsChargrDeptNm":"대표","ordEntprsChargrEmail":"t7114@naver.com","ordEntprsChargrTel":"031-0000-0000","ordEntprsChargrFax":"0504-422-6816","ordEntprsChargrHpno":"010-5283-6506"}][0];
    </script>
  </head>
  <body>
    <form name="disableWhenPrePro" class="kicaValidateTarget" method="post">
      <input type="text" name="ordrrEntprsNm" />
      <input type="text" name="secOrdrrBizrno" />
    </form>

    <form id="aplyInfForm" name="ordForms" data-sectionType="aply" class="kicaValidateTarget" method="post" style="display:none;">
      <input type="hidden" name="userSeCd" id="devUserSeCd" value="USM201" />
      <input type="password" id="ordPw" name="ordPw" />
      <input type="text" name="ordEntprsBizcnd" />
      <input type="text" name="ordEntprsIndstr" />
      <input type="text" name="ordrrBassAddr" />
      <input type="text" name="ordEntprsChargrNm" />
      <input type="text" name="ordEntprsChargrDeptNm" />
      <input type="text" name="ordEntprsChargrEmail" />
      <input type="text" name="ordEntprsChargrTel" />
      <input type="text" name="ordEntprsChargrFax" />
      <input type="text" name="ordEntprsChargrHpno" />
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

const renewInfoSubmitHtml = `
<!doctype html>
<html lang="ko">
  <head>
    <title>한국정보인증 - 인증서발급 전자계약SignOK 인증솔루션 SSL </title>
    <script>
      document.title="갱신정보 입력 | 사업자(개인/법인) | 한국정보인증";
      prodDetailJSON = [{"secOrdrrBizrno":"7311402870","ordrrEntprsNm":"정혜원 발전소","ordEntprsBizcnd":"전기업","ordEntprsIndstr":"태양광","ordEntprsBsnsRelmCd":"C00000","ordrrZip":"12575","ordrrBassAddr":"경기도 양평군 사호1길 152-0","ordEntprsRprsntvNm":"정혜원","ordEntprsChargrNm":"정혜원","ordEntprsChargrDeptNm":"대표","ordEntprsChargrEmail":"t7114@naver.com","ordEntprsChargrTel":"031-0000-0000","ordEntprsChargrFax":"0504-422-6816","ordEntprsChargrHpno":"010-5283-6506","certUsePurps":"세금계산서발행"}][0];
    </script>
  </head>
  <body>
    <form id="initActsAgreFrm" data-sectionType="agre" data-kica-validateCandi="true">
      <input type="hidden" name="advrEmail" value="" />
      <input type="hidden" name="advrHp" value="" />
      <input type="radio" name="prodAlliAgree" />
      <input type="radio" name="prodAlliAgree" />
      <input type="radio" name="REQ1" value="Y" kica_forceToSelect_method="#REQ1_Y" />
      <input type="radio" name="REQ1" value="N" kica_forceToSelect_method="#REQ1_Y" />
      <input type="radio" name="OPT1" value="Y" />
      <input type="radio" name="OPT1" value="N" />
      <input type="radio" name="REQ2" value="Y" kica_forceToSelect_method="#REQ2_Y" />
      <input type="radio" name="REQ2" value="N" kica_forceToSelect_method="#REQ2_Y" />
    </form>

    <form id="aplyInfForm" name="ordForms" data-sectionType="aply" class="kicaValidateTarget" method="post" style="display:none;">
      <input type="hidden" name="userSeCd" id="devUserSeCd" value="USM201" />
      <input type="password" id="ordPw" name="ordPw" />
      <input type="text" name="ordEntprsBizcnd" />
      <input type="text" name="ordEntprsIndstr" />
      <select name="ordEntprsBsnsRelmCd">
        <option value="">선택</option>
        <option value="C00000">C00000</option>
      </select>
      <input type="text" name="ordEntprsRprsntvNm" />
      <input type="text" name="ordrrZip" />
      <input type="text" name="ordrrBassAddr" />
      <input type="text" name="ordrrDtlAddr" />
      <input type="text" name="ordEntprsChargrNm" />
      <input type="text" name="ordEntprsChargrDeptNm" />
      <select name="ordEntprsChargrTel">
        <option value="">선택</option>
        <option value="031">031</option>
      </select>
      <input type="hidden" name="ordEntprsChargrTel" value="" />
      <input name="ordEntprsChargrTel1" type="text" />
      <input name="ordEntprsChargrTel2" type="text" />
      <select name="ordEntprsChargrFax">
        <option value="">선택</option>
        <option value="0504">0504</option>
      </select>
      <input type="hidden" name="ordEntprsChargrFax" value="" />
      <input name="ordEntprsChargrFax1" type="text" />
      <input name="ordEntprsChargrFax2" type="text" />
      <select name="ordEntprsChargrHpno">
        <option value="">선택</option>
        <option value="010">010</option>
      </select>
      <input type="hidden" name="ordEntprsChargrHpno" value="" />
      <input name="ordEntprsChargrHpno1" type="text" />
      <input name="ordEntprsChargrHpno2" type="text" />
      <input type="hidden" name="ordEntprsChargrEmail" value="" />
      <input type="text" name="ordEntprsChargrEmail1" />
      <input type="hidden" name="ordEntprsChargrEmail2" value="@" />
      <input type="text" name="ordEntprsChargrEmail3" />
      <input type="text" name="certUsePurps" />
    </form>

    <form id="prodForm" data-sectionType="prod" data-kica-validateCandi="true">
      <input type="hidden" name="prodId" value="437ef2210fd3d002e6473b38282965ba" />
      <input type="hidden" name="certPolicyId" value="특법인(e세금계산서)" />
      <input type="hidden" name="prodLclCd" value="PROD_LCL_CD_CERT" />
      <input type="hidden" name="prodMclCd" value="PROD_MCL_CD_ENTPRS" />
      <input type="hidden" name="raProdNm" value="전자세금계산서용" />
      <input type="hidden" name="prodAplyTrgtCd" value="PAT001" />
      <input type="hidden" name="qy" value="1" />
    </form>

    <form style="display:none;" method="post" id="applyForm" action='/renew/stepEntrpsRenewPaymentConfirm.sg'>
      <input type="hidden" class="mustHave" id="csrfToken" name="CSRF_TOKEN" value="-7124179303299332328" />
      <input type="hidden" class="mustHave" name="adiUseYN" value="Y" />
      <input type="hidden" class="mustHave" name="ordno" value="d0fa45dbcf0349e4a1cf026545161fe6" />
      <input type="hidden" class="mustHave" name="ordSeq" value="1" />
      <input type="hidden" class="mustHave" name="raId" value="signgate" />
      <input type="hidden" class="mustHave" name="inflwRaId" value="signgate" />
      <input type="hidden" class="mustHave" name="renewProdChangeYN" value="N" />
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
      "ordEntprsChargrDeptNm",
      "ordEntprsChargrEmail",
      "ordEntprsChargrTel",
      "ordEntprsChargrFax",
      "ordEntprsChargrHpno"
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
  assert.equal(request.get("serialNo"), "1234567890");
  assert.equal(request.get("certJobPrgrsSeCd"), "RENW");
  assert.equal(request.get("pprsRecptMthdCd"), "EMAIL");
  assert.equal(request.get("CSRF_TOKEN"), "-7124179303299332328");
  assert.equal(request.get("ordno"), "d0fa45dbcf0349e4a1cf026545161fe6");
  assert.equal(request.get("renewProdChangeYN"), "N");
});

test("parseRenewInfoSnapshot falls back to prodDetailJSON defaults when form values are blank", () => {
  const parsed = parseRenewInfoSnapshot(renewInfoHtml);

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

test("parseRenewInfoSnapshotFromData extracts customer draft defaults from renew ajax payload", () => {
  const parsed = parseRenewInfoSnapshotFromData({
    ordrrEntprsNm: "정혜원 발전소",
    secOrdrrBizrno: "7311402870",
    ordEntprsRprsntvNm: "정혜원",
    ordEntprsBizcnd: "전기업",
    ordEntprsIndstr: "태양광",
    ordEntprsBsnsRelmCd: "C00000",
    ordrrZip: "12575",
    ordrrBassAddr: "경기도 양평군 사호1길 152-0",
    ordrrDtlAddr: "상세주소 없음",
    ordEntprsChargrNm: "정혜원",
    ordEntprsChargrDeptNm: "대표",
    ordEntprsChargrEmail: "t7114@naver.com",
    ordEntprsChargrTel: "031",
    ordEntprsChargrFax: "0504",
    ordEntprsChargrHpno: "010"
  });

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
      detailAddress: "상세주소 없음",
      contactName: "정혜원",
      contactDepartment: "대표",
      contactEmail: "t7114@naver.com",
      contactTel: null,
      contactFax: null,
      contactMobile: null
    }
  });
});

test("buildRenewInfoComparison blocks only identity mismatches", () => {
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
      bizClass: "태양광발전(자가용PPA)"
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

test("buildRenewInfoSubmitProfileReadiness flags missing contact inputs", () => {
  const readiness = buildRenewInfoSubmitProfileReadiness(
    ["ordPw", "ordEntprsChargrNm", "ordEntprsChargrDeptNm", "ordEntprsChargrHpno"],
    {
      contactName: "정혜원",
      contactDepartment: "",
      contactEmail: "t7114@naver.com",
      contactTel: "031-0000-0000",
      contactFax: "0504-422-6816",
      contactMobile: "",
      issuePassword: "1234"
    }
  );

  assert.deepEqual(readiness, {
    renewInfoSubmitMissingFields: ["담당부서", "휴대폰 번호"],
    renewInfoSubmitReady: false,
    renewInfoSubmitSummary: "자동 제출 차단 · 담당부서, 휴대폰 번호 미입력"
  });
});

test("buildEffectiveRenewInfoSubmissionProfile prefers renew-info defaults over stored contact settings", () => {
  assert.deepEqual(
    buildEffectiveRenewInfoSubmissionProfile(parseRenewInfoSnapshot(renewInfoHtml).renewInfoSnapshot, {
      contactName: "김동건",
      contactDepartment: "",
      contactEmail: "other@example.com",
      contactTel: "",
      contactFax: "",
      contactMobile: "",
      issuePassword: "1234"
    }),
    {
      contactName: "정혜원",
      contactDepartment: "대표",
      contactEmail: "t7114@naver.com",
      contactTel: "031-0000-0000",
      contactFax: "0504-422-6816",
      contactMobile: "010-5283-6506",
      issuePassword: "1234"
    }
  );
});

test("buildRenewInfoSubmitRequest applies stored contact overrides", () => {
  const request = new URLSearchParams(
    buildRenewInfoSubmitRequest(renewInfoSubmitHtml, "https://www.signgate.com/renew/stepEntrpsApplyInfoInput.sg", {
      contactName: "정혜원",
      contactDepartment: "대표",
      contactEmail: "t7114@naver.com",
      contactTel: "031-0000-0000",
      contactFax: "0504-422-6816",
      contactMobile: "010-5283-6506",
      issuePassword: "1234"
    })
  );

  assert.equal(request.get("CSRF_TOKEN"), "-7124179303299332328");
  assert.equal(request.get("ordno"), "d0fa45dbcf0349e4a1cf026545161fe6");

  const aplySections = request.getAll("aply");
  const agreSections = request.getAll("agre");
  const prodSections = request.getAll("prod");

  assert.equal(aplySections.length, 2);
  assert.equal(agreSections.length, 2);
  assert.equal(prodSections.length, 2);
  assert.equal(aplySections[1], "");
  assert.equal(agreSections[1], "");
  assert.equal(prodSections[1], "");

  assert.deepEqual(JSON.parse(aplySections[0] ?? "{}"), {
    userSeCd: "USM201",
    ordPw: "1234",
    ordEntprsBizcnd: "전기업",
    ordEntprsIndstr: "태양광",
    ordEntprsBsnsRelmCd: "C00000",
    ordEntprsRprsntvNm: "정혜원",
    ordrrZip: "12575",
    ordrrBassAddr: "경기도 양평군 사호1길 152-0",
    ordrrDtlAddr: "상세주소 없음",
    ordEntprsChargrNm: "정혜원",
    ordEntprsChargrDeptNm: "대표",
    ordEntprsChargrTel: "031",
    ordEntprsChargrTel1: "0000",
    ordEntprsChargrTel2: "0000",
    ordEntprsChargrFax: "0504",
    ordEntprsChargrFax1: "422",
    ordEntprsChargrFax2: "6816",
    ordEntprsChargrHpno: "010",
    ordEntprsChargrHpno1: "5283",
    ordEntprsChargrHpno2: "6506",
    ordEntprsChargrEmail: "",
    ordEntprsChargrEmail1: "t7114",
    ordEntprsChargrEmail2: "@",
    ordEntprsChargrEmail3: "naver.com",
    certUsePurps: "세금계산서발행"
  });

  assert.deepEqual(JSON.parse(agreSections[0] ?? "{}"), {
    advrEmail: "N",
    advrHp: "N",
    REQ1: "Y",
    OPT1: "N",
    REQ2: "Y"
  });

  assert.deepEqual(JSON.parse(prodSections[0] ?? "{}"), {
    prodId: "437ef2210fd3d002e6473b38282965ba",
    certPolicyId: "특법인(e세금계산서)",
    prodLclCd: "PROD_LCL_CD_CERT",
    prodMclCd: "PROD_MCL_CD_ENTPRS",
    raProdNm: "전자세금계산서용",
    prodAplyTrgtCd: "PAT001",
    qy: "1"
  });
});

test("parseRenewInfoSubmitResult detects payment-confirm stage", () => {
  const parsed = parseRenewInfoSubmitResult(
    `
      <html>
        <head><title>결제정보 확인 | 사업자(개인/법인) | 한국정보인증</title></head>
        <body>
          <form id="applyForm" action="/renew/stepEntrpsRenewPayment.sg"></form>
        </body>
      </html>
    `,
    "https://www.signgate.com/renew/stepEntrpsRenewPaymentConfirm.sg"
  );

  assert.deepEqual(parsed, {
    renewInfoSubmitAttempted: true,
    renewInfoSubmitResultBranch: "renew-payment",
    renewInfoSubmitResultUrl: "https://www.signgate.com/renew/stepEntrpsRenewPayment.sg",
    renewInfoSubmitResultPageTitle: "결제정보 확인 | 사업자(개인/법인) | 한국정보인증",
    renewInfoSubmitResultSummary: "신청정보 제출 성공 · 결제 단계 진입",
    renewInfoSubmitResultError: null
  });
});
