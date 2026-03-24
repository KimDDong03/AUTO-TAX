import path from "node:path";
import Database from "better-sqlite3";
import { Store } from "../server/src/store.js";
import { formatItemName } from "../server/src/utils.js";

type Command = "seed" | "clear";

const command = (process.argv[2] as Command | undefined) ?? "seed";
const cwd = process.cwd();
const dbArgIndex = process.argv.findIndex((value) => value === "--db");
const dbFile =
  dbArgIndex >= 0 && process.argv[dbArgIndex + 1]
    ? path.resolve(cwd, process.argv[dbArgIndex + 1]!)
    : path.resolve(cwd, "data", "mock-preview.db");

const MOCK_PREFIX = "[목업]";

function resetMockDatabase(targetFile: string) {
  const db = new Database(targetFile);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = OFF");

  const tables = [
    "invoice_drafts",
    "inbox_messages",
    "customer_match_addresses",
    "customer_plants",
    "customers",
    "logs"
  ];

  const tx = db.transaction(() => {
    for (const table of tables) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    db.prepare(
      `DELETE FROM sqlite_sequence WHERE name IN (${tables.map(() => "?").join(",")})`
    ).run(...tables);
  });

  tx();
  db.pragma("foreign_keys = ON");
  db.close();
}

function writeDate(offsetDays = 0): string {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function isoOffsetDays(offsetDays = 0): string {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return value.toISOString();
}

function buildBusinessNumber(index: number): string {
  return `910${String(index).padStart(2, "0")}00${String(1000 + index).slice(-4)}`;
}

function buildAddress(index: number): string {
  const cities = [
    "경상북도 의성군 중하길",
    "전라남도 해남군 해남로",
    "충청북도 음성군 태양로",
    "강원특별자치도 홍천군 늘솔길",
    "전북특별자치도 김제시 들녘로"
  ];
  const base = cities[index % cities.length];
  return `${base} ${120 + index}`;
}

function buildPlantName(index: number): string {
  return `${MOCK_PREFIX}청솔태양광${String(index).padStart(2, "0")}`;
}

function buildCustomerName(index: number): string {
  return `${MOCK_PREFIX}고객${String(index).padStart(2, "0")}`;
}

function buildCorpName(index: number): string {
  return `${MOCK_PREFIX}발전소${String(index).padStart(2, "0")}`;
}

function buildParsedMail(index: number, plantName: string, plantAddress: string) {
  const month = ((index % 12) + 1).toString().padStart(2, "0");
  const billingMonth = `2026-${month}`;
  const supplyCost = 85000 + index * 9137;
  const taxTotal = Math.floor(supplyCost * 0.1);

  return {
    originalFrom: "kepco@kepco.co.kr",
    plantName,
    plantAddress,
    billingMonth,
    supplyCost,
    taxTotal,
    totalAmount: supplyCost + taxTotal,
    itemName: formatItemName(billingMonth),
    kepcoCorpNum: "120-82-00052",
    kepcoBranchId: String(190 + (index % 10)),
    kepcoCorpName: "한국전력공사",
    kepcoCeoName: "김동철",
    kepcoAddr: "전라남도 나주시 전력로 55",
    kepcoBizType: "전기가스",
    kepcoBizClass: "전기공급",
    recipientEmail: "ppa0194@kepco.co.kr",
    rawText: `${plantName} ${billingMonth} 공급가액 ${supplyCost}원`
  };
}

function seed() {
  const store = new Store(dbFile);
  store.close();
  resetMockDatabase(dbFile);
  const seededStore = new Store(dbFile);

  seededStore.updateSettings({
    imapUser: "preview.auto.tax@gmail.com",
    imapPass: "app-password",
    smtpUser: "preview.auto.tax@gmail.com",
    smtpPass: "app-password",
    smtpFromName: "AUTO-TAX",
    smtpFromEmail: "preview.auto.tax@gmail.com",
    notificationEmails: ["ops@auto-tax.local"],
    popbillLinkId: "MOCKPREVIEW",
    popbillSecretKey: "mock-secret",
    popbillIsTest: true,
    popbillPartnerCorpNum: "290-42-01164",
    operatorContactName: "목업 운영자",
    operatorContactEmail: "ops@auto-tax.local",
    operatorContactTel: "010-0000-0000"
  });

  const customers = [];
  for (let index = 1; index <= 20; index += 1) {
    const customer = seededStore.saveCustomer({
      customerName: buildCustomerName(index),
      businessNumber: buildBusinessNumber(index),
      corpName: buildCorpName(index),
      ceoName: `대표${index}`,
      addr: buildAddress(index),
      bizType: "전기업",
      bizClass: "태양광발전(자가용PPA)",
      issueMode: "review",
      issueDay: null,
      issueHour: null,
      issueMinute: null,
      memo: index % 4 === 0 ? "분기 점검 필요" : "",
      plantNames: [buildPlantName(index)],
      matchAddresses: [buildAddress(index)]
    });

    if (index <= 8) {
      customers.push(seededStore.updateCustomerPopbillState(customer.id, "joined", true, isoOffsetDays(120)));
    } else if (index <= 12) {
      customers.push(seededStore.updateCustomerPopbillState(customer.id, "joined", true, isoOffsetDays(12 - index)));
    } else if (index <= 16) {
      customers.push(seededStore.updateCustomerPopbillState(customer.id, "pending", false, null));
    } else if (index <= 18) {
      customers.push(seededStore.updateCustomerPopbillState(customer.id, "failed", false, null));
    } else {
      customers.push(seededStore.updateCustomerPopbillState(customer.id, "joined", true, isoOffsetDays(-index)));
    }
  }

  customers.forEach((customer, customerIndex) => {
    const plantName = customer.plantNames[0];
    const plantAddress = customer.addr;

    if (customerIndex < 12) {
      const parsedMail = buildParsedMail(customerIndex + 1, plantName, plantAddress);
      const inbox = seededStore.saveInboxMessage({
        messageUid: `mock-parsed-${customerIndex + 1}`,
        mailbox: "INBOX",
        fromAddress: "kepco@kepco.co.kr",
        subject: `${MOCK_PREFIX} 신재생에너지 요금안내 ${customer.customerName}`,
        receivedAt: isoOffsetDays(-(customerIndex + 1)),
        rawSource: parsedMail.rawText,
        textBody: parsedMail.rawText,
        parseStatus: "parsed",
        parsedData: parsedMail,
        customerId: customer.id
      });

      const draft = seededStore.createDraft({
        customer,
        sourceMessageId: inbox.id,
        status: "review",
        scheduledFor: null,
        parsedMail
      });

      if (customerIndex >= 4 && customerIndex < 7) {
        seededStore.updateDraftStatus(draft.id, "failed", "목업 발행 실패: 포인트 부족");
      } else if (customerIndex >= 7 && customerIndex < 10) {
        seededStore.updateDraftStatus(draft.id, "issued", "", writeDate(-(customerIndex + 1)), { code: 1, message: "목업 발행 완료" });
      }
    }
  });

  for (let index = 13; index <= 17; index += 1) {
    const parsedMail = buildParsedMail(index, `${MOCK_PREFIX}미매칭태양광${index}`, buildAddress(index + 10));
    seededStore.saveInboxMessage({
      messageUid: `mock-unmatched-${index}`,
      mailbox: "INBOX",
      fromAddress: "kepco@kepco.co.kr",
      subject: `${MOCK_PREFIX} 미매칭 메일 ${index}`,
      receivedAt: isoOffsetDays(-index),
      rawSource: parsedMail.rawText,
      textBody: parsedMail.rawText,
      parseStatus: index % 2 === 0 ? "failed" : "unmatched",
      parseError: index % 2 === 0 ? "목업 파싱 실패" : "고객을 찾지 못했습니다.",
      parsedData: parsedMail,
      customerId: null
    });
  }

  for (let index = 1; index <= 18; index += 1) {
    const scope = index % 3 === 0 ? "mail-sync" : index % 3 === 1 ? "drafts" : "popbill";
    const level = index % 5 === 0 ? "warn" : "info";
    seededStore.createLog(level, "mock", `${scope} 목업 로그 ${index}`, {
      scope,
      mock: true,
      order: index
    });
  }

  seededStore.createLog("info", "mock", "목업 데이터 20건을 생성했습니다.", {
    databaseFile: dbFile,
    customers: 20
  });
  seededStore.close();
  console.log(`Mock preview data seeded: ${dbFile}`);
}

function clear() {
  const store = new Store(dbFile);
  store.close();
  resetMockDatabase(dbFile);
  console.log(`Mock preview data cleared: ${dbFile}`);
}

if (command === "clear") {
  clear();
} else if (command === "seed") {
  seed();
} else {
  console.error(`Unknown command: ${command}`);
  process.exit(1);
}
