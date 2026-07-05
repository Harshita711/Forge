import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { searchService } from '../services/search.service';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

const SearchQuerySchema = z.object({ q: z.string().min(1).max(200) });

export const searchRoutes = Router();
searchRoutes.use(requireAuth);
searchRoutes.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const { q } = SearchQuerySchema.parse(req.query);
    const results = await searchService.search(q, req.user!.sub);
    res.status(200).json({ data: results, meta: {} });
  })
);
