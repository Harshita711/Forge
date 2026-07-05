import { DistributedLock, acquireLock, releaseLock, renewLock } from '../lib/redisLock';
import { logger } from '../lib/logger';
import { SCHEDULER_CONFIG } from './config';

// Section 7: "The Scheduler is a single logical process (leader-elected
// across N replicas) with two independent responsibilities running on
// separate tick intervals." One lock, one election; promotion (500ms) and
// reaping (5000ms) are two separate setIntervals elsewhere that both just
// check isLeader() before doing anything, rather than each running its own
// separate election — that would risk two different locks disagreeing about
// who's leader, which defeats the point.
export class LeaderElector {
  private lock: DistributedLock | null = null;
  private stopped = false;
  private maintenanceTimer?: NodeJS.Timeout;

  isLeader(): boolean {
    return this.lock !== null;
  }

  start(): void {
    this.tick();
  }

  private tick(): void {
    if (this.stopped) return;
    this.maintain()
      .catch((err) => logger.error({ err }, 'Leader-election maintenance tick failed'))
      .finally(() => {
        const delay = this.isLeader()
          ? Math.floor(SCHEDULER_CONFIG.leaderLockTtlMs / 3)
          : SCHEDULER_CONFIG.leaderRetryIntervalMs;
        this.maintenanceTimer = setTimeout(() => this.tick(), delay);
      });
  }

  private async maintain(): Promise<void> {
    if (!this.lock) {
      this.lock = await acquireLock(SCHEDULER_CONFIG.leaderLockKey, SCHEDULER_CONFIG.leaderLockTtlMs);
      if (this.lock) logger.info('Acquired scheduler leadership');
      return;
    }
    const renewed = await renewLock(this.lock, SCHEDULER_CONFIG.leaderLockTtlMs);
    if (!renewed) {
      logger.warn('Lost scheduler leadership (lock renewal failed) — reverting to standby');
      this.lock = null;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.maintenanceTimer) clearTimeout(this.maintenanceTimer);
    if (this.lock) {
      await releaseLock(this.lock);
      this.lock = null;
    }
  }
}
