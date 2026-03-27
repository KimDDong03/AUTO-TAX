import { dispatchRecurringJobs, runDueJobs } from "./job-queue.js";
import type { AppStore } from "./store-contract.js";

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunning = false;

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
      const dispatchResult = await dispatchRecurringJobs();
      const runResult = await runDueJobs({
        limit: 10,
        claimedBy: "local-scheduler"
      });

      await this.store.createLog("info", "scheduler", "로컬 스케줄러 tick을 완료했습니다.", {
        dispatched: dispatchResult.dispatched,
        skipped: dispatchResult.skipped,
        claimed: runResult.claimed,
        completed: runResult.completed,
        failed: runResult.failed
      });
    } finally {
      this.isRunning = false;
    }
  }
}
