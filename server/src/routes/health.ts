import type { RequestHandler } from 'express';
import { checkDatabaseConnection } from '../db/pool.js';

type DatabaseCheck = () => Promise<void>;

export function createHealthHandler(
  databaseCheck: DatabaseCheck = checkDatabaseConnection,
): RequestHandler {
  return async (_req, res) => {
    try {
      await databaseCheck();
      res.json({
        status: 'ok',
        database: 'ok',
      });
    } catch {
      res.status(503).json({
        status: 'error',
        database: 'unavailable',
      });
    }
  };
}

const healthHandler = createHealthHandler();

export default healthHandler;
