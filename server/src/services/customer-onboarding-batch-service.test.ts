import assert from "node:assert/strict";
import test from "node:test";
import {
  sanitizeCustomerOnboardingPreparedEntriesForStorage,
  sanitizeCustomerOnboardingWorkbookForStorage
} from "./customer-onboarding-batch-service.js";

test("customer onboarding preview persistence strips certificate passwords from workbook and prepared entries", () => {
  const workbook = {
    customers: [],
    plants: [],
    certificates: [
      {
        rowIndex: 2,
        businessNumber: "1234567890",
        certificateKind: "electronic_tax" as const,
        certificateIndex: "1",
        certificateName: "전자세금용",
        certificateUsageName: "",
        issuerName: "",
        serial: "SERIAL-1",
        userDN: "USER-DN-1",
        certificatePassword: "pw-1",
        isPrimary: true
      }
    ]
  };
  const entries = [
    {
      rowIndex: 2,
      existingCustomerId: null,
      businessNumber: "1234567890",
      customerName: "한빛발전소",
      corpName: "한빛발전소",
      addr: "서울",
      bizType: "전기업",
      bizClass: "태양광",
      renewalContactMobile: "",
      memo: "",
      plantNames: [],
      matchAddresses: [],
      certificates: [
        {
          rowIndex: 2,
          certificateKind: "electronic_tax" as const,
          certificateIndex: "1",
          certificateName: "전자세금용",
          certificateUsageName: "",
          issuerName: "",
          serial: "SERIAL-1",
          userDN: "USER-DN-1",
          certificatePassword: "pw-1",
          isPrimary: true
        }
      ],
      errors: [],
      warnings: [],
      canImport: true
    }
  ];

  assert.equal(workbook.certificates[0]?.certificatePassword, "pw-1");
  assert.equal(entries[0]?.certificates[0]?.certificatePassword, "pw-1");

  const sanitizedWorkbook = sanitizeCustomerOnboardingWorkbookForStorage(workbook);
  const sanitizedEntries = sanitizeCustomerOnboardingPreparedEntriesForStorage(entries);

  assert.equal(sanitizedWorkbook.certificates[0]?.certificatePassword, "");
  assert.equal(sanitizedEntries[0]?.certificates[0]?.certificatePassword, "");
  assert.equal(workbook.certificates[0]?.certificatePassword, "pw-1");
  assert.equal(entries[0]?.certificates[0]?.certificatePassword, "pw-1");
});
