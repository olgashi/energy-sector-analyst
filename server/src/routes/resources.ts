import { Router } from 'express';
import type { RequestHandler } from 'express';
import { getResourceById } from '../resources/config.js';
import {
  fetchAndPersistRssDocument,
  type PersistedFeedDocument,
} from '../services/rssPersistence.js';

const router = Router();

type FetchDocument = (resource: {
  id: string;
  name: string;
  type: 'rss';
  url: string;
}) => Promise<PersistedFeedDocument>;

export function createGetResourceArticles(
  fetchDocument: FetchDocument = fetchAndPersistRssDocument,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const resource = getResourceById(req.params.resourceId);

      if (!resource) {
        res.status(404).json({ error: 'Resource not found' });
        return;
      }

      const document = await fetchDocument(resource);
      res.json(document);
    } catch (error) {
      next(error);
    }
  };
}

export const getResourceArticles = createGetResourceArticles();

router.get('/:resourceId/articles', getResourceArticles);

export default router;
