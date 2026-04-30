import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { AppSettings, InvoiceDraft } from "./domain.js";
import { sendNotification } from "./notifier.js";
import { parseKepcoMail } from "./parser.js";
import { buildPilotLogContext } from "./pilot-issuance.js";
import type { AppStore } from "./store-contract.js";

export interface MailSyncResult {
  scanned: number;
  imported: number;
  createdDrafts: number;
  scheduledDrafts: number;
  unmatched: number;
  failures: number;
  receivedMonth: string;
}

export type MailSyncMode = "manual" | "scheduled";

export interface MailSyncOptions {
  mode?: MailSyncMode;
  now?: Date;
  receivedMonth?: string | null;
}

const RELEVANT_SUBJECT = "신재생에너지 요금안내";

function isRelevantSubject(subject: string): boolean {
  return subject.includes(RELEVANT_SUBJECT);
}

function toIso(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function getSeoulYearMonth(now: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit"
  });
  const parts = formatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  return `${year}-${month}`;
}

export function resolveMailSyncReceivedMonth(
  receivedMonth: string | null | undefined,
  now: Date = new Date()
): string {
  const normalized = receivedMonth?.trim();
  if (!normalized) {
    return getSeoulYearMonth(now);
  }

  if (!/^\d{4}-\d{2}$/.test(normalized)) {
    throw new Error("수신월은 YYYY-MM 형식이어야 합니다.");
  }

  const month = Number(normalized.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new Error("수신월은 YYYY-MM 형식이어야 합니다.");
  }

  return normalized;
}

export function buildMailSyncMonthRange(receivedMonth: string): { since: Date; before: Date } {
  const [yearText, monthText] = receivedMonth.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    since: new Date(Date.UTC(year, month - 1, 1)),
    before: new Date(Date.UTC(nextYear, nextMonth - 1, 1))
  };
}

export function buildMailSyncSearchQuery(options: {
  receivedMonth: string;
  lastSyncedUid: number | null;
  useCheckpoint: boolean;
}): SearchObject {
  const range = buildMailSyncMonthRange(options.receivedMonth);
  const query: SearchObject = {
    since: range.since,
    before: range.before,
    subject: RELEVANT_SUBJECT
  };

  if (options.useCheckpoint && options.lastSyncedUid !== null && options.lastSyncedUid > 0) {
    query.uid = `${options.lastSyncedUid + 1}:*`;
  }

  return query;
}

export async function syncMailbox(store: AppStore, options: MailSyncOptions = {}): Promise<MailSyncResult> {
  const settings = await store.getSettings();
  if (!settings.imapHost || !settings.imapUser || !settings.imapPass) {
    throw new Error("IMAP 설정이 완성되지 않았습니다.");
  }

  const mode = options.mode ?? "manual";
  const now = options.now ?? new Date();
  const scheduledAt = toIso(now);
  const receivedMonth = resolveMailSyncReceivedMonth(options.receivedMonth, now);
  const currentReceivedMonth = getSeoulYearMonth(now);
  const useCheckpoint = receivedMonth === currentReceivedMonth && !options.receivedMonth;
  const completedBillingMonthSet = new Set((await store.listCompletedBillingMonths()).map((item) => item.billingMonth));
  const result: MailSyncResult = {
    scanned: 0,
    imported: 0,
    createdDrafts: 0,
    scheduledDrafts: 0,
    unmatched: 0,
    failures: 0,
    receivedMonth
  };

  const client = new ImapFlow({
    host: settings.imapHost,
    port: settings.imapPort,
    secure: settings.imapSecure,
    auth: {
      user: settings.imapUser,
      pass: settings.imapPass
    }
  });

  let syncStage: "connect" | "mailbox-open" | "fetch-loop" | "checkpoint" = "connect";
  let connected = false;

  try {
    await client.connect();
    connected = true;
    const syncMailboxName = settings.imapMailbox || "INBOX";
    syncStage = "mailbox-open";
    await client.mailboxOpen(syncMailboxName);
    const lastSyncedUid = await store.getMailSyncCheckpoint(syncMailboxName);
    const fetchRange = buildMailSyncSearchQuery({
      receivedMonth,
      lastSyncedUid,
      useCheckpoint
    });
    let maxSeenUid = lastSyncedUid ?? 0;

    syncStage = "fetch-loop";
    for await (const message of client.fetch(fetchRange, {
      uid: true,
      envelope: true,
      source: true,
      internalDate: true
    }, { uid: true })) {
      maxSeenUid = Math.max(maxSeenUid, message.uid ?? 0);
      result.scanned += 1;
      const subject = message.envelope?.subject ?? "";
      if (!isRelevantSubject(subject)) {
        continue;
      }

      const messageUid = `${syncMailboxName}:${message.uid}`;
      if (await store.getMessageByUid(messageUid)) {
        continue;
      }

      if (!message.source) {
        continue;
      }

      const receivedAtIso = toIso(message.internalDate);

      const sourceText = message.source.toString("utf8");
      const parsedMime = await simpleParser(message.source);
      const bodyText = parsedMime.text ?? parsedMime.html?.toString() ?? sourceText;

      let parsedMail;
      try {
        parsedMail = parseKepcoMail(bodyText);
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "파싱 실패";
        await store.saveInboxMessage({
          messageUid,
          mailbox: syncMailboxName,
          fromAddress: parsedMime.from?.text || "",
          subject,
          receivedAt: receivedAtIso,
          rawSource: sourceText,
          textBody: bodyText,
          parseStatus: "failed",
          parseError: messageText
        });
        await store.createLog(
          "error",
          "mail-sync",
          "메일 파싱에 실패했습니다.",
          buildPilotLogContext(
            {
              subject,
              error: messageText
            },
            {
              pipeline: "mail-sync",
              errorCategory: "parse",
              messageUid
            }
          )
        );
        await sendNotification(
          settings,
          "[AUTO-TAX] 메일 파싱 실패",
          `메일 제목: ${subject}\n오류: ${messageText}\n검수가 필요합니다.`
        );
        result.failures += 1;
        continue;
      }

      if (completedBillingMonthSet.has(parsedMail.billingMonth)) {
        await store.saveInboxMessage({
          messageUid,
          mailbox: syncMailboxName,
          fromAddress: parsedMail.originalFrom || parsedMime.from?.text || "",
          subject,
          receivedAt: receivedAtIso,
          rawSource: sourceText,
          textBody: bodyText,
          parseStatus: "ignored",
          parseError: "초기 등록에서 완료 처리한 정산월입니다.",
          parsedData: parsedMail
        });
        await store.createLog("info", "mail-sync", "완료 처리한 정산월 메일을 검토 대상에서 제외했습니다.", {
          subject,
          billingMonth: parsedMail.billingMonth
        });
        result.imported += 1;
        continue;
      }

      const customer = await store.findCustomerByMatchAddress(parsedMail.plantAddress);
      if (!customer) {
        await store.saveInboxMessage({
          messageUid,
          mailbox: syncMailboxName,
          fromAddress: parsedMail.originalFrom || parsedMime.from?.text || "",
          subject,
          receivedAt: receivedAtIso,
          rawSource: sourceText,
          textBody: bodyText,
          parseStatus: "unmatched",
          parsedData: parsedMail
        });
        await store.createLog(
          "warn",
          "mail-sync",
          "발전소 주소와 고객을 매칭하지 못했습니다.",
          buildPilotLogContext(
            {
              subject,
              plantName: parsedMail.plantName,
              plantAddress: parsedMail.plantAddress
            },
            {
              pipeline: "mail-sync",
              errorCategory: "customer-match",
              messageUid
            }
          )
        );
        await sendNotification(
          settings,
          "[AUTO-TAX] 고객 매칭 실패",
          `메일 제목: ${subject}\n발전소명: ${parsedMail.plantName}\n발전소 주소: ${parsedMail.plantAddress}\n고객 매칭에 실패하여 검수가 필요합니다.`
        );
        result.unmatched += 1;
        continue;
      }

      const existingDraft = await store.findDraftByCustomerAndBillingMonth(customer.id, parsedMail.billingMonth);
      if (existingDraft) {
        await store.saveInboxMessage({
          messageUid,
          mailbox: syncMailboxName,
          fromAddress: parsedMail.originalFrom || parsedMime.from?.text || "",
          subject,
          receivedAt: receivedAtIso,
          rawSource: sourceText,
          textBody: bodyText,
          parseStatus: "duplicate",
          parseError: `이미 ${parsedMail.billingMonth} 건이 있습니다. 기존 상태: ${existingDraft.status}`,
          parsedData: parsedMail,
          customerId: customer.id,
          draftId: existingDraft.id
        });
        await store.createLog("warn", "mail-sync", "같은 고객/정산월 메일이 다시 들어와 중복 의심으로 보관했습니다.", {
          subject,
          customerId: customer.id,
          billingMonth: parsedMail.billingMonth,
          existingDraftId: existingDraft.id,
          existingDraftStatus: existingDraft.status
        });
        continue;
      }

      const inbox = await store.saveInboxMessage({
        messageUid,
        mailbox: syncMailboxName,
        fromAddress: parsedMail.originalFrom || parsedMime.from?.text || "",
        subject,
        receivedAt: receivedAtIso,
        rawSource: sourceText,
        textBody: bodyText,
        parseStatus: "parsed",
        parsedData: parsedMail,
        customerId: customer.id
      });

      const shouldAutoSchedule = mode === "scheduled" && customer.issueMode === "auto";
      const status: InvoiceDraft["status"] = shouldAutoSchedule ? "scheduled" : "review";

      try {
        await store.createDraft({
          customer,
          sourceMessageId: inbox.id,
          status,
          scheduledFor: shouldAutoSchedule ? scheduledAt : null,
          parsedMail,
          draftSource: "mail-sync"
        });
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "초안 생성 실패";
        await store.updateInboxMatchResult({
          messageId: inbox.id,
          parseStatus: "failed",
          parseError: messageText,
          parsedMail,
          customerId: customer.id,
          draftId: null
        });
        await store.createLog(
          "error",
          "mail-sync",
          "초안 생성에 실패했습니다.",
          buildPilotLogContext(
            {
              subject,
              customerId: customer.id,
              issueMode: customer.issueMode,
              billingMonth: parsedMail.billingMonth,
              error: messageText
            },
            {
              pipeline: "mail-sync",
              errorCategory: "draft-create",
              messageUid
            }
          )
        );
        await sendNotification(
          settings,
          "[AUTO-TAX] 초안 생성 실패",
          `메일 제목: ${subject}\n고객: ${customer.customerName}\n오류: ${messageText}\n검수가 필요합니다.`
        );
        result.failures += 1;
        continue;
      }

      result.createdDrafts += 1;
      if (shouldAutoSchedule) {
        result.scheduledDrafts += 1;
      }
      result.imported += 1;
    }

    syncStage = "checkpoint";
    if (useCheckpoint && maxSeenUid > (lastSyncedUid ?? 0)) {
      await store.updateMailSyncCheckpoint(syncMailboxName, maxSeenUid);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "메일 동기화 실패";
    await store.createLog(
      "error",
      "mail-sync",
      "메일 동기화가 중단되었습니다.",
      buildPilotLogContext(
        {
          mode,
          receivedMonth,
          error: messageText
        },
        {
          pipeline: "mail-sync",
          errorCategory: "mail-sync",
          syncStage
        }
      )
    );
    throw error;
  } finally {
    if (connected) {
      await client.logout().catch(() => undefined);
    }
  }

  await store.createLog("info", "mail-sync", "메일 동기화를 완료했습니다.", {
    ...result,
    mode,
    receivedMonth
  });
  return result;
}
