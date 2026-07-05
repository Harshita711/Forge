import { Request, Response } from 'express';
import { DlqRetrySchema } from '../../domain/schemas';
import { dlqService } from '../services/dlq.service';
import { aiSummaryService } from '../services/aiSummary.service';

function toDto(e: {
  id: string;
  type: string;
  payload: unknown;
  failureReason: string;
  attemptCount: number;
  resolved: boolean;
  resolvedAction: string | null;
  retriedAsJobId: string | null;
  createdAt: Date;
}) {
  return {
    id: e.id,
    type: e.type,
    payload: e.payload,
    failureReason: e.failureReason,
    attemptCount: e.attemptCount,
    resolved: e.resolved,
    resolvedAction: e.resolvedAction,
    retriedAsJobId: e.retriedAsJobId,
    createdAt: e.createdAt,
  };
}

export const dlqController = {
  async listForQueue(req: Request, res: Response) {
    const entries = await dlqService.listForUser(req.params.id, req.user!.sub);
    res.status(200).json({ data: entries.map(toDto), meta: {} });
  },

  async get(req: Request, res: Response) {
    const { entry } = await dlqService.getForUser(req.params.id, req.user!.sub);
    res.status(200).json({
      data: {
        ...toDto(entry),
        aiSummaries: entry.aiSummaries.map((s: { id: string; summary: string; likelyCause: string; suggestedAction: string; confidenceScore: number; generatedAt: Date }) => ({
          id: s.id,
          summary: s.summary,
          likelyCause: s.likelyCause,
          suggestedAction: s.suggestedAction,
          confidenceScore: s.confidenceScore,
          generatedAt: s.generatedAt,
        })),
      },
      meta: {},
    });
  },

  async retry(req: Request, res: Response) {
    const input = DlqRetrySchema.parse(req.body ?? {});
    const job = await dlqService.retry(req.params.id, req.user!.sub, input.payload);
    res.status(201).json({ data: { newJobId: job.id }, meta: {} });
  },

  async dismiss(req: Request, res: Response) {
    await dlqService.dismiss(req.params.id, req.user!.sub);
    res.status(204).send();
  },

  // Section 11.11 — AI-generated failure summary. Read-adjacent diagnostic
  // action; getForUser already enforces org membership (dlq:view bar).
  async summarize(req: Request, res: Response) {
    await dlqService.getForUser(req.params.id, req.user!.sub);
    const summary = await aiSummaryService.generate(req.params.id, req.user!.sub);
    res.status(201).json({
      data: {
        id: summary.id,
        summary: summary.summary,
        likelyCause: summary.likelyCause,
        suggestedAction: summary.suggestedAction,
        confidenceScore: summary.confidenceScore,
        modelVersion: summary.modelVersion,
        generatedAt: summary.generatedAt,
      },
      meta: {},
    });
  },
};
