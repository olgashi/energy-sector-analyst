import { Router } from 'express';
import resourcesRouter from './resources.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/api/resources', resourcesRouter);

export default router;
