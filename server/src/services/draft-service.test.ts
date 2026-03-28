import assert from "node:assert/strict";
import test from "node:test";
import type { AppSettings } from "../domain.js";
import type { AppStore } from "../store-contract.js";
import {
  assertDraftPopbillEnvironment,
  backfillDraftPopbillEnvironmentIfMissing,
  resolveCurrentPopbillEnvironment
} from "./draft-service.js";

const baseSettings = {
  popbillIsTest: false
} as AppSettings;

test("resolveCurrentPopbillEnvironment maps test flag to environment", () => {
  assert.equal(resolveCurrentPopbillEnvironment({ popbillIsTest: true }), "test");
  assert.equal(resolveCurrentPopbillEnvironment({ popbillIsTest: false }), "production");
});

test("assertDraftPopbillEnvironment allows empty or matching environment", async () => {
  await assert.doesNotReject(() => assertDraftPopbillEnvironment(baseSettings, { popbillEnvironment: null }));
  await assert.doesNotReject(() => assertDraftPopbillEnvironment(baseSettings, { popbillEnvironment: "production" }));
});

test("assertDraftPopbillEnvironment blocks mismatched environment with 409", async () => {
  await assert.rejects(
    () => assertDraftPopbillEnvironment(baseSettings, { popbillEnvironment: "test" }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error & { status?: number }).status, 409);
      assert.match(error.message, /테스트 환경/);
      return true;
    }
  );
});

test("backfillDraftPopbillEnvironmentIfMissing updates only missing values", async () => {
  const calls: Array<{ draftId: number; environment: "test" | "production" }> = [];
  const requestStore = {
    updateDraftPopbillEnvironment: async (draftId: number, environment: "test" | "production") => {
      calls.push({ draftId, environment });
      return null as never;
    }
  } as Pick<AppStore, "updateDraftPopbillEnvironment"> as AppStore;

  await backfillDraftPopbillEnvironmentIfMissing(requestStore, { ...baseSettings, popbillIsTest: true }, { id: 7, popbillEnvironment: null });
  await backfillDraftPopbillEnvironmentIfMissing(requestStore, baseSettings, { id: 8, popbillEnvironment: "production" });

  assert.deepEqual(calls, [{ draftId: 7, environment: "test" }]);
});
