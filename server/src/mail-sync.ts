import { ImapFlow, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { ParsedMail } from "./domain.js";
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
  deletedDrafts?: number;
  deletedInboxMessages?: number;
  keptDrafts?: number;
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

function normalizeFingerprintText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function buildParsedMailFingerprint(parsedMail: ParsedMail): string {
  return [
    "parsed",
    parsedMail.billingMonth,
    normalizeFingerprintText(parsedMail.plantName),
    normalizeFingerprintText(parsedMail.plantAddress),
    normalizeFingerprintText(parsedMail.itemName),
    parsedMail.supplyCost,
    parsedMail.taxTotal,
    parsedMail.totalAmount,
    normalizeFingerprintText(parsedMail.kepcoBranchId)
  ].join("|");
}

export function extractContractNumberFromSubject(subject: string): string | null {
  const match = subject.match(/계약번호\s*[:：]\s*([0-9]+)/);
  return match?.[1] ?? null;
}

export function buildMailContentFingerprint(subject: string, parsedMail: ParsedMail): string {
  const contractNumber = extractContractNumberFromSubject(subject);
  if (!contractNumber) {
    return buildParsedMailFingerprint(parsedMail);
  }

  return [
    "contract",
    parsedMail.billingMonth,
    contractNumber,
    parsedMail.supplyCost,
    parsedMail.taxTotal,
    parsedMail.totalAmount
  ].join("|");
}

function buildMailboxSyncKey(imapHost: string, imapUser: string, imapMailbox: string): string {
  const host = imapHost.trim().toLowerCase();
  const user = imapUser.trim().toLowerCase();
  const mailbox = imapMailbox.trim() || "*";
  return `${host}|${user}|${mailbox}`;
}

function getSyncMailboxList(imapMailbox: string | null | undefined): string[] {
  const trimmed = imapMailbox?.trim() ?? "";
  if (!trimmed) {
    return ["*"];
  }

  const normalizedRaw = trimmed.toUpperCase();
  if (normalizedRaw === "ALL" || normalizedRaw === "*" || normalizedRaw === "INBOX") {
    return ["*"];
  }

  const mailboxSet = new Set(
    trimmed
      .split(",")
      .map((mailbox) => mailbox.trim())
      .filter(Boolean)
  );
  return mailboxSet.size > 0 ? Array.from(mailboxSet) : ["*"];
}

function normalizeMailboxFlags(flags: unknown): string[] {
  if (Array.isArray(flags)) {
    return flags.filter((flag): flag is string => typeof flag === "string");
  }

  if (flags instanceof Set) {
    return Array.from(flags).filter((flag): flag is string => typeof flag === "string");
  }

  return [];
}

function shouldSyncWildcardMailbox(path: string, flags: string[]): boolean {
  const normalizedPath = path.trim().toUpperCase();
  const normalizedFlags = flags.map((flag) => flag.toUpperCase());

  if (normalizedFlags.includes("\\NOSELECT")) {
    return false;
  }

  if (
    normalizedFlags.some((flag) => ["\\TRASH", "\\JUNK", "\\SENT", "\\DRAFTS"].includes(flag)) ||
    ["DELETED MESSAGES", "JUNK", "SENT MESSAGES", "DRAFTS"].includes(normalizedPath)
  ) {
    return false;
  }

  return true;
}

export async function resolveMailboxList(client: ImapFlow, configuredMailboxes: string[]): Promise<string[]> {
  if (configuredMailboxes.length === 1 && configuredMailboxes[0] === "*") {
    const allMailboxSet = new Set<string>();

    try {
      const mailboxes = await client.list();
      for (const mailbox of mailboxes) {
        const rawPath = (mailbox as { path?: unknown }).path;
        const rawFlags = (mailbox as { flags?: unknown }).flags;
        const mailboxPath = typeof rawPath === "string" ? rawPath.trim() : "";
        if (!mailboxPath) {
          continue;
        }

        const mailboxFlags = normalizeMailboxFlags(rawFlags);
        if (shouldSyncWildcardMailbox(mailboxPath, mailboxFlags)) {
          allMailboxSet.add(mailboxPath);
        }
      }
    } catch {
      return ["INBOX"];
    }

    if (allMailboxSet.size > 0) {
      return Array.from(allMailboxSet);
    }

    return ["INBOX"];
  }

  return configuredMailboxes;
}

function toIso(value: Date | string | undefined): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function formatMonthPart(value: number): string {
  return String(value).padStart(2, "0");
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
  const monthStart = new Date(
    `${year}-${monthText}-01T00:00:00+09:00`
  );
  const nextMonthStart = new Date(
    `${nextYear}-${formatMonthPart(nextMonth)}-01T00:00:00+09:00`
  );

  return {
    since: monthStart,
    before: nextMonthStart
  };
}

export function isMessageInReceivedMonthRange(
  internalDate: Date | string | undefined,
  range: { since: Date; before: Date }
): boolean {
  if (!internalDate) {
    return false;
  }
  const parsedDate = internalDate instanceof Date ? internalDate : new Date(internalDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  return parsedDate >= range.since && parsedDate < range.before;
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
  const receivedMonth = resolveMailSyncReceivedMonth(options.receivedMonth, now);
  const currentReceivedMonth = getSeoulYearMonth(now);
  const useCheckpoint = mode === "scheduled" && receivedMonth === currentReceivedMonth && !options.receivedMonth;
  const completedBillingMonthSet = new Set((await store.listCompletedBillingMonths()).map((item) => item.billingMonth));
  const existingParsedMailFingerprints = new Set(
    (await store.listInbox())
      .filter((message) => Boolean(message.parsedData))
      .map((message) => buildMailContentFingerprint(message.subject, message.parsedData as ParsedMail))
  );
  const monthRange = buildMailSyncMonthRange(receivedMonth);
  const mailSyncWindow = {
    since: monthRange.since.toISOString(),
    before: monthRange.before.toISOString()
  };
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
  const activeMessageUids = new Set<string>();

  try {
    await client.connect();
    connected = true;
    const configuredSyncMailboxNames = getSyncMailboxList(settings.imapMailbox);
    const syncMailboxNames = await resolveMailboxList(client, configuredSyncMailboxNames);
    let anyMailboxOpened = false;
    for (const syncMailboxName of syncMailboxNames) {
      const syncMailboxKey = buildMailboxSyncKey(settings.imapHost, settings.imapUser, syncMailboxName);
      try {
        syncStage = "mailbox-open";
        await client.mailboxOpen(syncMailboxName);
        anyMailboxOpened = true;
        const lastSyncedUid = await store.getMailSyncCheckpoint(syncMailboxKey);
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
          if (!isMessageInReceivedMonthRange(message.internalDate, monthRange)) {
            continue;
          }

          const subject = message.envelope?.subject ?? "";
          if (!isRelevantSubject(subject)) {
            continue;
          }

          const messageUid = `${syncMailboxKey}:${message.uid}`;
          const legacyMessageUid = `${syncMailboxName}:${message.uid}`;
          activeMessageUids.add(messageUid);
          activeMessageUids.add(legacyMessageUid);
          const existingMessage = await store.getMessageByUid(messageUid);
          const existingLegacyMessage = legacyMessageUid === messageUid ? null : await store.getMessageByUid(legacyMessageUid);
          if (existingMessage || existingLegacyMessage) {
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
              mailbox: syncMailboxKey,
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
            result.failures += 1;
            continue;
          }

          if (completedBillingMonthSet.has(parsedMail.billingMonth)) {
            await store.saveInboxMessage({
              messageUid,
              mailbox: syncMailboxKey,
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
            existingParsedMailFingerprints.add(buildMailContentFingerprint(subject, parsedMail));
            continue;
          }

          const parsedMailFingerprint = buildMailContentFingerprint(subject, parsedMail);
          if (existingParsedMailFingerprints.has(parsedMailFingerprint)) {
            await store.createLog("info", "mail-sync", "같은 내용의 메일을 중복으로 판단해 건너뛰었습니다.", {
              subject,
              billingMonth: parsedMail.billingMonth,
              plantName: parsedMail.plantName,
              plantAddress: parsedMail.plantAddress,
              totalAmount: parsedMail.totalAmount
            });
            continue;
          }

          const customer = await store.findCustomerByMatchAddress(parsedMail.plantAddress);
          if (!customer) {
            await store.saveInboxMessage({
              messageUid,
              mailbox: syncMailboxKey,
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
            result.unmatched += 1;
            existingParsedMailFingerprints.add(parsedMailFingerprint);
            continue;
          }

          const existingDraft = await store.findDraftByCustomerAndBillingMonth(customer.id, parsedMail.billingMonth);
          if (existingDraft) {
            await store.saveInboxMessage({
              messageUid,
              mailbox: syncMailboxKey,
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
            existingParsedMailFingerprints.add(parsedMailFingerprint);
            continue;
          }

          const inbox = await store.saveInboxMessage({
            messageUid,
            mailbox: syncMailboxKey,
            fromAddress: parsedMail.originalFrom || parsedMime.from?.text || "",
            subject,
            receivedAt: receivedAtIso,
            rawSource: sourceText,
            textBody: bodyText,
            parseStatus: "parsed",
            parsedData: parsedMail,
            customerId: customer.id
          });

          try {
            await store.createDraft({
              customer,
              sourceMessageId: inbox.id,
              status: "review",
              scheduledFor: null,
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
            result.failures += 1;
            continue;
          }

          result.createdDrafts += 1;
          result.imported += 1;
          existingParsedMailFingerprints.add(parsedMailFingerprint);
        }

        syncStage = "checkpoint";
        if (useCheckpoint && maxSeenUid > (lastSyncedUid ?? 0)) {
          await store.updateMailSyncCheckpoint(syncMailboxKey, maxSeenUid);
        }
      } catch (error) {
        const messageText = error instanceof Error ? error.message : "메일함 동기화 중 오류가 발생했습니다.";
        result.failures += 1;
        await store.createLog(
          "warn",
          "mail-sync",
          "메일함 동기화 중 오류가 발생했습니다.",
          buildPilotLogContext(
            {
              mailbox: syncMailboxName,
              receivedMonth,
              mailSyncWindow,
              error: messageText
            },
            {
              pipeline: "mail-sync",
              errorCategory: "mail-sync",
              syncStage
            }
          )
        );
      }
    }
    if (!anyMailboxOpened && syncMailboxNames.length > 0) {
      await store.createLog("warn", "mail-sync", "열 수 있는 메일함이 없습니다.", {
        receivedMonth,
        mailboxes: syncMailboxNames,
        mailSyncWindow
      });
    }
    if (mode === "manual" && result.failures === 0 && store.pruneMailSyncArtifacts) {
      const pruneResult = await store.pruneMailSyncArtifacts({
        activeMessageUids: Array.from(activeMessageUids),
        receivedAtSince: mailSyncWindow.since,
        receivedAtBefore: mailSyncWindow.before,
        relevantSubject: RELEVANT_SUBJECT,
        deletableDraftStatuses: ["review", "failed"]
      });
      result.deletedDrafts = pruneResult.deletedDrafts;
      result.deletedInboxMessages = pruneResult.deletedInboxMessages;
      result.keptDrafts = pruneResult.keptDrafts;
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
          mailSyncWindow,
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
    receivedMonth,
    mailSyncWindow
  });
  return result;
}
