import { Router } from 'express';
import healthHandler from './health.js';
import articlesRouter from './articles.js';
import resourcesRouter from './resources.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

router.get('/api/health', healthHandler);
router.use('/api/articles', articlesRouter);
router.use('/api/resources', resourcesRouter);

export default router;
