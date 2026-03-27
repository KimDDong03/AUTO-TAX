import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { AppSettings, InvoiceDraft } from "./domain.js";
import { sendNotification } from "./notifier.js";
import { parseKepcoMail } from "./parser.js";
import type { AppStore } from "./store-contract.js";

export interface MailSyncResult {
  scanned: number;
  imported: number;
  createdDrafts: number;
  scheduledDrafts: number;
  unmatched: number;
  failures: number;
}

export type MailSyncMode = "manual" | "scheduled";

export interface MailSyncOptions {
  mode?: MailSyncMode;
  now?: Date;
}

function isRelevantSubject(subject: string): boolean {
  return subject.includes("신재생에너지 요금안내");
}

function toIso(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export async function syncMailbox(store: AppStore, options: MailSyncOptions = {}): Promise<MailSyncResult> {
  const settings = await store.getSettings();
  if (!settings.imapHost || !settings.imapUser || !settings.imapPass) {
    throw new Error("IMAP 설정이 완성되지 않았습니다.");
  }

  const mode = options.mode ?? "manual";
  const scheduledAt = toIso(options.now);
  const result: MailSyncResult = {
    scanned: 0,
    imported: 0,
    createdDrafts: 0,
    scheduledDrafts: 0,
    unmatched: 0,
    failures: 0
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

  await client.connect();

  try {
    const mailbox = await client.mailboxOpen(settings.imapMailbox || "INBOX");
    const fromSeq = Math.max(1, mailbox.exists - 99);
    const syncStartAt = settings.mailSyncStartAt ? Date.parse(settings.mailSyncStartAt) : null;
    for await (const message of client.fetch(`${fromSeq}:*`, {
      uid: true,
      envelope: true,
      source: true,
      internalDate: true
    })) {
      result.scanned += 1;
      const subject = message.envelope?.subject ?? "";
      if (!isRelevantSubject(subject)) {
        continue;
      }

      const messageUid = `${settings.imapMailbox}:${message.uid}`;
      if (await store.getMessageByUid(messageUid)) {
        continue;
      }

      if (!message.source) {
        continue;
      }

       const receivedAtIso = toIso(message.internalDate);
       if (syncStartAt !== null && Number.isFinite(syncStartAt) && Date.parse(receivedAtIso) <= syncStartAt) {
        continue;
      }

      const sourceText = message.source.toString("utf8");
      const parsedMime = await simpleParser(message.source);
      const bodyText = parsedMime.text ?? parsedMime.html?.toString() ?? sourceText;

      try {
        const parsedMail = parseKepcoMail(bodyText);
        const customer = await store.findCustomerByPlantAndAddress(parsedMail.plantName, parsedMail.plantAddress);
        if (!customer) {
          await store.saveInboxMessage({
            messageUid,
            mailbox: settings.imapMailbox,
            fromAddress: parsedMail.originalFrom || parsedMime.from?.text || "",
            subject,
            receivedAt: receivedAtIso,
            rawSource: sourceText,
            textBody: bodyText,
            parseStatus: "unmatched",
            parsedData: parsedMail
          });
          await store.createLog("warn", "mail-sync", "발전소명과 고객을 매칭하지 못했습니다.", {
            subject,
            plantName: parsedMail.plantName,
            plantAddress: parsedMail.plantAddress
          });
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
            mailbox: settings.imapMailbox,
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
          mailbox: settings.imapMailbox,
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
        await store.createDraft({
          customer,
          sourceMessageId: inbox.id,
          status,
          scheduledFor: shouldAutoSchedule ? scheduledAt : null,
          parsedMail
        });
        result.createdDrafts += 1;
        if (shouldAutoSchedule) {
          result.scheduledDrafts += 1;
        }
        result.imported += 1;
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "파싱 실패";
        await store.saveInboxMessage({
          messageUid,
          mailbox: settings.imapMailbox,
          fromAddress: parsedMime.from?.text || "",
          subject,
          receivedAt: receivedAtIso,
          rawSource: sourceText,
          textBody: bodyText,
          parseStatus: "failed",
          parseError: messageText
        });
        await store.createLog("error", "mail-sync", "메일 파싱에 실패했습니다.", { subject, error: messageText });
        await sendNotification(
          settings,
          "[AUTO-TAX] 메일 파싱 실패",
          `메일 제목: ${subject}\n오류: ${messageText}\n검수가 필요합니다.`
        );
        result.failures += 1;
      }
    }
  } finally {
    await client.logout();
  }

  await store.createLog("info", "mail-sync", "메일 동기화를 완료했습니다.", {
    ...result,
    mode
  });
  return result;
}
