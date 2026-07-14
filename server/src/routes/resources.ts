import { Router } from 'express';
import type { RequestHandler } from 'express';
import { getResourceById } from '../resources/config.js';
import { fetchRssDocument } from '../services/rss.js';

const router = Router();

export const getResourceArticles: RequestHandler = async (req, res, next) => {
  try {
    const resource = getResourceById(req.params.resourceId);

    if (!resource) {
      res.status(404).json({ error: 'Resource not found' });
      return;
    }

    const document = await fetchRssDocument(resource);
    res.json(document);
  } catch (error) {
    next(error);
  }
};

router.get('/:resourceId/articles', getResourceArticles);

export default router;
