import { prisma } from '../../lib/prisma';
import { AppError } from '../../domain/errors';
import { logger } from '../../lib/logger';
import { organizationsRepository } from '../repositories/organizations.repository';

const MODEL = 'claude-sonnet-4-6';

interface SummaryResult {
  summary: string;
  likelyCause: string;
  suggestedAction: string;
  confidenceScore: number;
}

function buildPrompt(entry: {
  type: string;
  payload: unknown;
  failureReason: string;
  attemptCount: number;
}): string {
  return [
    'You are diagnosing a failed background job in a job-scheduling platform.',
    `Job type: ${entry.type}`,
    `Attempts made: ${entry.attemptCount}`,
    `Final error message: ${entry.failureReason}`,
    `Payload (JSON): ${JSON.stringify(entry.payload).slice(0, 2000)}`,
    '',
    'Respond with ONLY a JSON object (no markdown fences, no prose outside the JSON) with exactly these keys:',
    '{"summary": string (1-2 sentences), "likelyCause": string (short phrase), "suggestedAction": string (concrete next step for an operator), "confidenceScore": number between 0 and 1}',
  ].join('\n');
}

// Rule-based fallback so the feature is fully exercisable without an
// Anthropic API key configured (Section 11.11 doesn't mandate a specific
// provider — this keeps the DLQ inbox useful in an offline/CI environment).
function stubSummary(entry: { type: string; failureReason: string; attemptCount: number }): SummaryResult {
  const timeoutLike = /timeout|ETIMEDOUT|ECONNRESET/i.test(entry.failureReason);
  const authLike = /401|403|unauthorized|forbidden/i.test(entry.failureReason);
  return {
    summary: `Job '${entry.type}' failed after ${entry.attemptCount} attempt(s): ${entry.failureReason.slice(0, 200)}`,
    likelyCause: timeoutLike ? 'Downstream dependency timeout' : authLike ? 'Authentication/authorization failure' : 'Unclassified handler error',
    suggestedAction: timeoutLike
      ? 'Check the downstream service health and consider raising the visibility timeout for this queue'
      : authLike
        ? 'Verify the credentials/secrets this handler depends on have not expired or rotated'
        : 'Inspect the handler logs around this job.id for a stack trace',
    confidenceScore: 0.3, // low confidence — no model, pattern-matched only
  };
}

async function callAnthropic(prompt: string): Promise<SummaryResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Anthropic API call failed, falling back to stub summary');
      return null;
    }

    const data = (await response.json()) as { content: { type: string; text?: string }[] };
    const text = data.content.find((c) => c.type === 'text')?.text;
    if (!text) return null;

    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned) as SummaryResult;
    return parsed;
  } catch (err) {
    logger.warn({ err }, 'Anthropic API call threw, falling back to stub summary');
    return null;
  }
}

export const aiSummaryService = {
  async generate(dlqEntryId: string, userId: string) {
    const entry = await prisma.deadLetterQueueEntry.findUnique({ where: { id: dlqEntryId } });
    if (!entry) throw AppError.notFound();
    const queue = await prisma.queue.findUnique({ where: { id: entry.queueId }, include: { project: true } });
    if (!queue) throw AppError.notFound();
    const membership = await organizationsRepository.getMembership(queue.project.organizationId, userId);
    if (!membership) throw AppError.notFound();

    const prompt = buildPrompt(entry);
    const result = (await callAnthropic(prompt)) ?? stubSummary(entry);

    return prisma.aiFailureSummary.create({
      data: {
        deadLetterQueueId: dlqEntryId,
        summary: result.summary,
        likelyCause: result.likelyCause,
        suggestedAction: result.suggestedAction,
        confidenceScore: result.confidenceScore,
        modelVersion: process.env.ANTHROPIC_API_KEY ? MODEL : 'stub-v1',
      },
    });
  },
};
