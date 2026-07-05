import { AppError } from '../../domain/errors';
import { CreateScheduledDefinitionInput, UpdateScheduledDefinitionInput } from '../../domain/schemas';
import { scheduledDefinitionsRepository } from '../repositories/scheduledDefinitions.repository';
import { organizationsRepository } from '../repositories/organizations.repository';
import { cronNextFireTime, isValidCronExpression, isValidTimezone } from '../../domain/cron';

export const scheduledDefinitionsService = {
  async create(queueId: string, input: CreateScheduledDefinitionInput, createdBy: string) {
    if (!isValidTimezone(input.timezone)) {
      throw AppError.validation(`'${input.timezone}' is not a recognized IANA timezone`);
    }

    let nextRunAt: Date;
    if (input.scheduleType === 'cron') {
      if (!input.cronExpression || !isValidCronExpression(input.cronExpression)) {
        throw AppError.validation('cronExpression is missing or not a valid 5-field cron expression');
      }
      nextRunAt = cronNextFireTime(input.cronExpression, input.timezone);
    } else {
      nextRunAt = new Date(input.runAt!);
    }

    return scheduledDefinitionsRepository.create({
      queueId,
      jobType: input.jobType,
      payloadTemplate: input.payloadTemplate,
      scheduleType: input.scheduleType,
      cronExpression: input.cronExpression,
      timezone: input.timezone,
      runAt: input.runAt ? new Date(input.runAt) : undefined,
      nextRunAt,
      createdBy,
    });
  },

  list(queueId: string) {
    return scheduledDefinitionsRepository.listForQueue(queueId);
  },

  async getForUser(id: string, userId: string) {
    const def = await scheduledDefinitionsRepository.findById(id);
    if (!def) throw AppError.notFound();
    const membership = await organizationsRepository.getMembership(def.queue.project.organizationId, userId);
    if (!membership) throw AppError.notFound();
    return { def, membership };
  },

  async update(id: string, input: UpdateScheduledDefinitionInput) {
    const patch: Partial<{ cronExpression: string; timezone: string; isActive: boolean; nextRunAt: Date }> = {};
    if (input.cronExpression !== undefined) patch.cronExpression = input.cronExpression;
    if (input.timezone !== undefined) patch.timezone = input.timezone;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    if (input.cronExpression || input.timezone) {
      const def = await scheduledDefinitionsRepository.findById(id);
      if (!def) throw AppError.notFound();
      const cron = input.cronExpression ?? def.cronExpression;
      const tz = input.timezone ?? def.timezone;
      if (cron) patch.nextRunAt = cronNextFireTime(cron, tz);
    }
    return scheduledDefinitionsRepository.update(id, patch);
  },

  delete(id: string) {
    return scheduledDefinitionsRepository.delete(id);
  },
};
