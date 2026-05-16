import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMailSyncMonthRange,
  buildMailSyncSearchQuery,
  isMessageInReceivedMonthRange,
  resolveMailSyncReceivedMonth
} from "./mail-sync.js";

test("mail sync resolves Seoul current month and validates explicit receivedMonth", () => {
  assert.equal(
    resolveMailSyncReceivedMonth(null, new Date("2026-04-29T12:00:00.000Z")),
    "2026-04"
  );
  assert.equal(
    resolveMailSyncReceivedMonth(null, new Date("2026-03-31T14:59:59.999Z")),
    "2026-03"
  );
  assert.equal(
    resolveMailSyncReceivedMonth(null, new Date("2026-03-31T15:00:00.000Z")),
    "2026-04"
  );
  assert.equal(resolveMailSyncReceivedMonth("2026-03"), "2026-03");
  assert.throws(
    () => resolveMailSyncReceivedMonth("2026-13"),
    /수신월은 YYYY-MM 형식이어야 합니다/
  );
});

test("mail sync builds month-bounded IMAP search with optional UID checkpoint", () => {
  const range = buildMailSyncMonthRange("2026-04");
  assert.equal(range.since.toISOString(), "2026-03-31T15:00:00.000Z");
  assert.equal(range.before.toISOString(), "2026-04-30T15:00:00.000Z");

  assert.deepEqual(buildMailSyncSearchQuery({
    receivedMonth: "2026-04",
    lastSyncedUid: 100,
    useCheckpoint: true
  }), {
    since: range.since,
    before: range.before,
    subject: "신재생에너지 요금안내",
    uid: "101:*"
  });

  assert.deepEqual(buildMailSyncSearchQuery({
    receivedMonth: "2026-04",
    lastSyncedUid: 100,
    useCheckpoint: false
  }), {
    since: range.since,
    before: range.before,
    subject: "신재생에너지 요금안내"
  });
});

test("mail sync filters internalDate by Seoul month boundaries", () => {
  const range = buildMailSyncMonthRange("2026-04");

  assert.equal(
    isMessageInReceivedMonthRange(new Date("2026-03-31T23:59:59.999+09:00"), range),
    false
  );
  assert.equal(
    isMessageInReceivedMonthRange(new Date("2026-04-01T00:00:00+09:00"), range),
    true
  );
  assert.equal(
    isMessageInReceivedMonthRange(new Date("2026-04-30T23:59:59+09:00"), range),
    true
  );
  assert.equal(
    isMessageInReceivedMonthRange(new Date("2026-05-01T00:00:00+09:00"), range),
    false
  );
});
