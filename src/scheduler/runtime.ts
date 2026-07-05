import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { LeaderElector } from './leaderElection';
import { runPromotionTick } from './promotion';
import { runReaperTick } from './reaper';
import { runMetricsTick } from './metrics';
import { SCHEDULER_CONFIG } from './config';

export class SchedulerRuntime {
  private elector = new LeaderElector();
  private promotionTimer?: NodeJS.Timeout;
  private reaperTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private stopping = false;

  start(): void {
    this.elector.start();
    this.schedulePromotion();
    this.scheduleReaper();
    this.scheduleMetrics();

    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
    logger.info('Scheduler process started (standby until leadership acquired)');
  }

  private schedulePromotion(): void {
    if (this.stopping) return;
    this.promotionTimer = setTimeout(async () => {
      if (this.elector.isLeader()) {
        try {
          await runPromotionTick();
        } catch (err) {
          logger.error({ err }, 'Promotion tick failed');
        }
      }
      this.schedulePromotion();
    }, SCHEDULER_CONFIG.promotionTickMs);
  }

  private scheduleReaper(): void {
    if (this.stopping) return;
    this.reaperTimer = setTimeout(async () => {
      if (this.elector.isLeader()) {
        try {
          await runReaperTick();
        } catch (err) {
          logger.error({ err }, 'Reaper tick failed');
        }
      }
      this.scheduleReaper();
    }, SCHEDULER_CONFIG.reaperTickMs);
  }

  private scheduleMetrics(): void {
    if (this.stopping) return;
    this.metricsTimer = setTimeout(async () => {
      if (this.elector.isLeader()) {
        try {
          await runMetricsTick();
        } catch (err) {
          logger.error({ err }, 'Metrics tick failed');
        }
      }
      this.scheduleMetrics();
    }, SCHEDULER_CONFIG.metricsTickMs);
  }

  private async shutdown(signal: string): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    logger.info({ signal }, 'Scheduler shutting down');
    if (this.promotionTimer) clearTimeout(this.promotionTimer);
    if (this.reaperTimer) clearTimeout(this.reaperTimer);
    if (this.metricsTimer) clearTimeout(this.metricsTimer);
    await this.elector.stop();
    await prisma.$disconnect();
    process.exit(0);
  }
}
