import assert from "node:assert/strict";
import test from "node:test";
import type { AppSettings, Customer, RenewalBridgeCertificateSummary } from "../domain.js";
import { buildRenewalComparisonProfile, buildRenewalSubmissionProfile, selectAutoRenewalCertificate } from "./renewal-customer-sync.js";

const baseCustomer: Customer = {
  id: 1,
  customerName: "정혜원",
  businessNumber: "7311402870",
  corpName: "정혜원 발전소",
  ceoName: "정혜원",
  addr: "경기도 양평군 사호1길 152",
  bizType: "전기업",
  bizClass: "태양광발전(자가용PPA)",
  popbillUserId: "C1",
  popbillPassword: "secret",
  popbillState: "joined",
  popbillCertRegistered: true,
  popbillCertExpireDate: "2026-04-11",
  issueMode: "review",
  issueDay: null,
  issueHour: null,
  issueMinute: null,
  renewalContactMobile: "01052836506",
  memo: "",
  plantNames: [],
  matchAddresses: [],
  createdAt: "2026-03-29T00:00:00.000Z",
  updatedAt: "2026-03-29T00:00:00.000Z"
};

const baseSettings: AppSettings = {
  id: 1,
  imapHost: "",
  imapPort: 993,
  imapSecure: true,
  imapUser: "",
  imapPass: "",
  imapMailbox: "INBOX",
  smtpHost: "",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "",
  smtpPass: "",
  smtpFromName: "AUTO-TAX",
  smtpFromEmail: "",
  mailConnectionVerifiedAt: null,
  notificationEmails: [],
  defaultIssueDay: 20,
  defaultIssueHour: 9,
  defaultIssueMinute: 0,
  mailPollMinutes: 1440,
  mailSyncStartAt: null,
  timezone: "Asia/Seoul",
  popbillLinkId: "",
  popbillSecretKey: "",
  popbillIsTest: false,
  popbillPartnerCorpNum: "",
  popbillUserIdPrefix: "TEST_",
  popbillSharedPassword: "",
  operatorContactName: "정혜원",
  operatorContactEmail: "t7114@naver.com",
  operatorContactTel: "031-0000-0000",
  renewalContactDepartment: "",
  renewalContactFax: "",
  renewalCertificatePassword: "",
  renewalIssuePassword: "123456",
  schedulerEnabled: true,
  certLastCheckedAt: null,
  certAlertLastSentAt: null,
  createdAt: "2026-03-29T00:00:00.000Z",
  updatedAt: "2026-03-29T00:00:00.000Z"
};

function cert(partial: Partial<RenewalBridgeCertificateSummary>): RenewalBridgeCertificateSummary {
  return {
    index: "1",
    cn: "",
    issuerToName: "issuer",
    usageToName: "전자세금용",
    todate: null,
    oid: null,
    serial: null,
    userDN: null,
    validateFrom: null,
    detailValidateTo: null,
    certDirPath: null,
    ...partial
  };
}

test("buildRenewalComparisonProfile copies customer tax identity fields", () => {
  assert.deepEqual(buildRenewalComparisonProfile(baseCustomer), {
    corpName: "정혜원 발전소",
    businessNumber: "7311402870",
    ceoName: "정혜원",
    addr: "경기도 양평군 사호1길 152",
    bizType: "전기업",
    bizClass: "태양광발전(자가용PPA)"
  });
});

test("buildRenewalSubmissionProfile keeps only shared renewal essentials plus customer mobile", () => {
  assert.deepEqual(buildRenewalSubmissionProfile(baseSettings, baseCustomer), {
    contactName: "정혜원",
    contactDepartment: "",
    contactEmail: "t7114@naver.com",
    contactTel: "031-0000-0000",
    contactFax: "",
    contactMobile: "01052836506",
    issuePassword: "123456"
  });
});

test("selectAutoRenewalCertificate prefers exact tax certificate match", () => {
  const selected = selectAutoRenewalCertificate(
    [
      cert({ index: "1", cn: "정혜원 발전소", usageToName: "전자세금용" }),
      cert({ index: "2", cn: "정혜원 발전소", usageToName: "개인범용" })
    ],
    baseCustomer
  );

  assert.equal(selected?.index, "1");
});

test("selectAutoRenewalCertificate returns null when multiple tax matches are ambiguous", () => {
  const selected = selectAutoRenewalCertificate(
    [
      cert({ index: "1", cn: "정혜원 발전소", usageToName: "전자세금용" }),
      cert({ index: "2", cn: "정혜원 발전소", usageToName: "전자세금용" })
    ],
    baseCustomer
  );

  assert.equal(selected, null);
});
