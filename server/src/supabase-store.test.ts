import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseStore } from "./supabase-store.js";

test("updateCertificateCheckMetadata updates only organization_settings cert metadata columns", async () => {
  const calls: Array<{
    table: string;
    payload: Record<string, unknown>;
    filters: Array<[string, unknown]>;
  }> = [];

  const fakeClient = {
    from(table: string) {
      return {
        update(payload: Record<string, unknown>) {
          const call = {
            table,
            payload,
            filters: [] as Array<[string, unknown]>
          };
          calls.push(call);
          return {
            eq(column: string, value: unknown) {
              call.filters.push([column, value]);
              return Promise.resolve({ data: null, error: null });
            }
          };
        }
      };
    }
  };

  const store = Object.create(SupabaseStore.prototype) as SupabaseStore;
  Object.assign(store as object, {
    client: fakeClient,
    initialized: true,
    organizationId: "org-1"
  });

  await store.updateCertificateCheckMetadata({
    certLastCheckedAt: "2026-04-14T00:00:00.000Z",
    certAlertLastSentAt: "2026-04-14T01:00:00.000Z"
  });

  assert.deepEqual(calls, [
    {
      table: "organization_settings",
      payload: {
        cert_last_checked_at: "2026-04-14T00:00:00.000Z",
        cert_alert_last_sent_at: "2026-04-14T01:00:00.000Z"
      },
      filters: [["organization_id", "org-1"]]
    }
  ]);
  assert.equal(calls.some((call) => call.table === "organization_integrations"), false);
});
