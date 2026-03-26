import { issueDraftNow } from "./automation.js";
import { syncMailbox } from "./mail-sync.js";
import { sendNotification } from "./notifier.js";
import type { AppStore } from "./store-contract.js";

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;
  private lastMailSyncAt = 0;

  constructor(private readonly store: AppStore) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, 60_000);
    void this.tick();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const settings = await this.store.getSettings();
      if (!settings.schedulerEnabled) {
        return;
      }

      const now = Date.now();
      if (now - this.lastMailSyncAt >= settings.mailPollMinutes * 60_000) {
        try {
          await syncMailbox(this.store);
          this.lastMailSyncAt = now;
        } catch (error) {
          const message = error instanceof Error ? error.message : "메일 동기화 실패";
          await this.store.createLog("error", "scheduler", "자동 메일 동기화에 실패했습니다.", { error: message });
          await sendNotification(settings, "[AUTO-TAX] 메일 동기화 실패", message);
        }
      }

      const dueDrafts = await this.store.getDueAutoDrafts(new Date());
      for (const draft of dueDrafts) {
        const customer = await this.store.getCustomer(draft.customerId);
        if (!customer) {
          await this.store.updateDraftStatus(draft.id, "failed", "고객 정보를 찾지 못했습니다.");
          continue;
        }

        try {
          await issueDraftNow(this.store, settings, customer, draft);
          await this.store.createLog("info", "scheduler", "자동 발행을 완료했습니다.", {
            draftId: draft.id,
            customerId: customer.id
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "자동 발행 실패";
          await this.store.updateDraftStatus(draft.id, "failed", message);
          await this.store.createLog("error", "scheduler", "자동 발행에 실패했습니다.", {
            draftId: draft.id,
            error: message
          });
          await sendNotification(
            settings,
            "[AUTO-TAX] 자동 발행 실패",
            `고객: ${customer.customerName}\n초안ID: ${draft.id}\n오류: ${message}`
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}
