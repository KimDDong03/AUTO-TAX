import test from "node:test";
import assert from "node:assert/strict";

process.env.AUTO_TAX_RENEWAL_AGENT_DISABLE_AUTO_START = "1";

const {
  decodeLocalBridgeResponseBody,
  mergeCertificateLists,
} = await import("./renewal-agent.ts");
const {
  buildHomeTaxPublicLoginRequest,
  parseHomeTaxTaxpayerBasicBusinessInfo,
} = await import("./hometax-business-info.ts");

test("local bridge response decoder preserves CP949 Korean certificate names", () => {
  const body = Buffer.concat([
    Buffer.from('{"ResultCode":0,"ResultMessage":"'),
    Buffer.from([197, 215, 189, 186, 198, 174]),
    Buffer.from('","reply":{"cn":"'),
    Buffer.from([190, 200, 181, 191, 195, 182]),
    Buffer.from('"}}'),
  ]);
  const decoded = decodeLocalBridgeResponseBody(body);

  assert.match(decoded, /테스트/);
  assert.match(decoded, /안동철/);
  assert.doesNotMatch(decoded, /\uFFFD/);
});

test("local bridge response decoder keeps UTF-8 responses unchanged", () => {
  const body = Buffer.from(
    '{"ResultCode":0,"ResultMessage":"테스트","reply":{"cn":"안동철"}}',
    "utf8",
  );

  assert.equal(decodeLocalBridgeResponseBody(body), body.toString("utf8"));
});

test("certificate list merge keeps display fields while upgrading to preflight index", () => {
  const merged = mergeCertificateLists({
    primaryCertificates: [
      {
        index: "d7005e0152811e28b4424c953fa3d02f5f4a3901",
        cn: "유학현",
        issuerToName: "cn=yessignCA Class 3,ou=AccreditedCA,o=yessign,c=kr",
        usageToName: "전자세금용",
        todate: "2027-03-02",
        oid: "1.2.410.200005.1.1.6.8",
        serial: "36c895b5",
        userDN: "cn=유학현()001168920230227111003787,ou=l,ou=NACF,ou=xUse4Esero,o=yessign,c=kr",
        validateFrom: "2026-02-03",
        detailValidateTo: "2027-03-02",
        certDirPath: null,
        listSource: "ml4web-hdd",
        supportsPreflight: false,
      },
    ],
    secondaryCertificates: [
      {
        index: "10",
        cn: "유학현()001168920230227111003787",
        issuerToName: "금융결제원",
        usageToName: "용도제한용",
        todate: "2027-03-02",
        oid: "1.2.410.200005.1.1.6.8",
        serial: "919115189",
        userDN: "cn=유학현()001168920230227111003787,ou=l,ou=NACF,ou=xUse4Esero,o=yessign,c=kr",
        validateFrom: "2026-02-03 00:00:00",
        detailValidateTo: "2027-03-02 23:59:59",
        certDirPath: "C:\\Users\\User\\AppData\\LocalLow\\NPKI\\yessign\\USER",
        listSource: "bridge-hdd",
        supportsPreflight: true,
      },
    ],
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.cn, "유학현");
  assert.equal(merged[0]?.index, "10");
  assert.equal(merged[0]?.serial, "919115189");
  assert.equal(merged[0]?.supportsPreflight, true);
});

test("HomeTax taxpayer-basic parser reads common road and legal-dong address fields", () => {
  const roadAddress = parseHomeTaxTaxpayerBasicBusinessInfo({
    result: {
      bmanBscInfrInqrDVO: {
        bmanRegNo: "123-45-67890",
        txprNm: "한빛태양광",
        rprsFnm: "홍길동",
        roadAdr: "전라남도 나주시 빛가람로 1",
        dtlAdr: "101호",
        zpcd: "58217",
      },
    },
  });
  const legalDongAddress = parseHomeTaxTaxpayerBasicBusinessInfo({
    result: {
      bmanBscInfrInqrDVO: {
        txprDscmNo: "1234567890",
        txprNm: "한빛태양광",
        ldAdr: "전라남도 나주시 빛가람동 1",
      },
    },
  });

  assert.equal(roadAddress?.businessNumber, "1234567890");
  assert.equal(roadAddress?.baseAddress, "전라남도 나주시 빛가람로 1");
  assert.equal(roadAddress?.detailAddress, "101호");
  assert.equal(roadAddress?.postalCode, "58217");
  assert.equal(legalDongAddress?.baseAddress, "전라남도 나주시 빛가람동 1");
});

test("HomeTax portal public login posts the main-system certificate request", () => {
  const request = buildHomeTaxPublicLoginRequest({
    material: {
      logSgnt: "signed",
      cert: "certificate",
      randomEnc: "random",
      storageName: "hdd",
    },
  });
  const requestUrl = new URL(request.url);
  const body = new URLSearchParams(request.body);

  assert.equal(requestUrl.origin, "https://hometax.go.kr");
  assert.equal(requestUrl.pathname, "/pubcLogin.do");
  assert.equal(requestUrl.searchParams.get("domain"), "hometax.go.kr");
  assert.equal(requestUrl.searchParams.get("mainSys"), "Y");
  assert.equal(body.get("scrnId"), "index3");
  assert.equal(body.get("pkcLgnClCd"), "05");
});
